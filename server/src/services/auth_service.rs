use axum::http::HeaderMap;
use chrono::Duration;
use sqlx::{MySqlPool, Row};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    models::{
        auth::AuthResponse,
        user::{LoginRequest, RegisterRequest, UserProfile},
    },
    services::mail_service,
    state::AppState,
    utils::{crypto, jwt, time},
};

#[derive(Debug, Clone)]
pub struct AuthContext {
    pub user_id: String,
    pub device_id: String,
    pub role: String,
    pub email_verified: bool,
}

pub async fn authenticate(headers: &HeaderMap, state: &AppState) -> AppResult<AuthContext> {
    let token = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or(AppError::Unauthorized)?;
    let claims = jwt::verify_access_token(&state.config.jwt_secret, token)?;
    let row = sqlx::query(
        "SELECT u.email_verified_at, u.status, d.revoked_at
         FROM users u JOIN user_devices d ON d.user_id = u.id
         WHERE u.id = ? AND d.id = ?",
    )
    .bind(&claims.sub)
    .bind(&claims.device_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Unauthorized)?;
    let status: String = row.get("status");
    let revoked_at: Option<chrono::NaiveDateTime> = row.get("revoked_at");
    if status != "active" || revoked_at.is_some() {
        return Err(AppError::Forbidden);
    }
    let email_verified_at: Option<chrono::NaiveDateTime> = row.get("email_verified_at");
    Ok(AuthContext {
        user_id: claims.sub,
        device_id: claims.device_id,
        role: claims.role,
        email_verified: email_verified_at.is_some(),
    })
}

pub fn ensure_verified(ctx: &AuthContext) -> AppResult<()> {
    if ctx.email_verified {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

pub fn ensure_admin(ctx: &AuthContext) -> AppResult<()> {
    if matches!(ctx.role.as_str(), "admin" | "operator" | "readonly") {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

pub async fn register(state: &AppState, input: RegisterRequest) -> AppResult<UserProfile> {
    if input.password.len() < 8 {
        return Err(AppError::BadRequest(
            "password must be at least 8 characters".into(),
        ));
    }
    let pool = &state.db;
    let now = time::now();
    let user_id = Uuid::new_v4().to_string();
    let email = input.email.trim().to_lowercase();
    let password_hash = crypto::hash_password(&input.password)?;
    sqlx::query(
        "INSERT INTO users (id, email, password_hash, nickname, status, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', 'user', ?, ?)",
    )
    .bind(&user_id)
    .bind(&email)
    .bind(password_hash)
    .bind(input.nickname)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;

    let code = crypto::generate_code();
    sqlx::query(
        "INSERT INTO email_verification_codes (id, user_id, email, code_hash, purpose, expires_at, created_at)
         VALUES (?, ?, ?, ?, 'verify_email', ?, ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&user_id)
    .bind(&email)
    .bind(crypto::sha256_hex(&code))
    .bind(now + Duration::minutes(state.config.email_code_minutes))
    .bind(now)
    .execute(pool)
    .await?;
    mail_service::send_verification_code(&state.config, &email, &code).await?;

    Ok(UserProfile {
        id: user_id,
        email,
        email_verified: false,
        nickname: None,
        role: "user".into(),
    })
}

pub async fn login(
    pool: &MySqlPool,
    config: &crate::config::Config,
    input: LoginRequest,
) -> AppResult<AuthResponse> {
    let row = sqlx::query(
        "SELECT id, email, email_verified_at, password_hash, nickname, role, status
         FROM users WHERE email = ? LIMIT 1",
    )
    .bind(input.email.trim().to_lowercase())
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::Unauthorized)?;
    let status: String = row.get("status");
    if status != "active" {
        return Err(AppError::Forbidden);
    }
    let password_hash: String = row.get("password_hash");
    if !crypto::verify_password(&input.password, &password_hash) {
        return Err(AppError::Unauthorized);
    }

    let user_id: String = row.get("id");
    let role: String = row.get("role");
    let now = time::now();
    let device_id = upsert_device(pool, &user_id, &input, now).await?;
    sqlx::query("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?")
        .bind(now)
        .bind(now)
        .bind(&user_id)
        .execute(pool)
        .await?;

    let access_token = jwt::create_access_token(
        &config.jwt_secret,
        &user_id,
        &device_id,
        &role,
        config.access_token_minutes,
    )?;
    let refresh_token = crypto::generate_token();
    let refresh_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO refresh_tokens (id, user_id, device_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(refresh_id)
    .bind(&user_id)
    .bind(&device_id)
    .bind(crypto::sha256_hex(&refresh_token))
    .bind(now + Duration::days(config.refresh_token_days))
    .bind(now)
    .execute(pool)
    .await?;

    let email_verified_at: Option<chrono::NaiveDateTime> = row.get("email_verified_at");
    Ok(AuthResponse {
        access_token,
        refresh_token,
        device_id,
        user: UserProfile {
            id: user_id,
            email: row.get("email"),
            email_verified: email_verified_at.is_some(),
            nickname: row.get("nickname"),
            role,
        },
    })
}

async fn upsert_device(
    pool: &MySqlPool,
    user_id: &str,
    input: &LoginRequest,
    now: chrono::NaiveDateTime,
) -> AppResult<String> {
    let existing =
        sqlx::query("SELECT id FROM user_devices WHERE user_id = ? AND device_fingerprint = ?")
            .bind(user_id)
            .bind(&input.device_fingerprint)
            .fetch_optional(pool)
            .await?;
    if let Some(row) = existing {
        let id: String = row.get("id");
        sqlx::query(
            "UPDATE user_devices SET device_name = ?, platform = ?, app_version = ?, last_login_at = ?, revoked_at = NULL, updated_at = ? WHERE id = ?",
        )
        .bind(&input.device_name)
        .bind(&input.platform)
        .bind(&input.app_version)
        .bind(now)
        .bind(now)
        .bind(&id)
        .execute(pool)
        .await?;
        return Ok(id);
    }
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO user_devices (id, user_id, device_name, device_fingerprint, platform, app_version, last_login_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(user_id)
    .bind(&input.device_name)
    .bind(&input.device_fingerprint)
    .bind(&input.platform)
    .bind(&input.app_version)
    .bind(now)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;
    Ok(id)
}
