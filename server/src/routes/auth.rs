use axum::{extract::State, http::HeaderMap, Json};
use serde::Serialize;
use sqlx::Row;

use crate::{
    error::{AppError, AppResult},
    models::{
        auth::RefreshTokenRequest,
        user::{LoginRequest, RegisterRequest, UserProfile},
    },
    services::auth_service,
    state::AppState,
    utils::{crypto, jwt, time},
};

pub async fn register(
    State(state): State<AppState>,
    Json(input): Json<RegisterRequest>,
) -> AppResult<Json<UserProfile>> {
    let user = auth_service::register(&state, input).await?;
    Ok(Json(user))
}

pub async fn login(
    State(state): State<AppState>,
    Json(input): Json<LoginRequest>,
) -> AppResult<Json<crate::models::auth::AuthResponse>> {
    Ok(Json(
        auth_service::login(&state.db, &state.config, input).await?,
    ))
}

pub async fn me(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Json<UserProfile>> {
    let ctx = auth_service::authenticate(&headers, &state).await?;
    let row =
        sqlx::query("SELECT id, email, email_verified_at, nickname, role FROM users WHERE id = ?")
            .bind(&ctx.user_id)
            .fetch_one(&state.db)
            .await?;
    let email_verified_at: Option<chrono::NaiveDateTime> = row.get("email_verified_at");
    Ok(Json(UserProfile {
        id: row.get("id"),
        email: row.get("email"),
        email_verified: email_verified_at.is_some(),
        nickname: row.get("nickname"),
        role: row.get("role"),
    }))
}

#[derive(Serialize)]
pub struct LogoutResponse {
    pub ok: bool,
}

pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<LogoutResponse>> {
    let ctx = auth_service::authenticate(&headers, &state).await?;
    sqlx::query("UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND device_id = ? AND revoked_at IS NULL")
        .bind(time::now())
        .bind(&ctx.user_id)
        .bind(&ctx.device_id)
        .execute(&state.db)
        .await
        .map_err(AppError::from)?;
    Ok(Json(LogoutResponse { ok: true }))
}

pub async fn refresh(
    State(state): State<AppState>,
    Json(input): Json<RefreshTokenRequest>,
) -> AppResult<Json<crate::models::auth::AuthResponse>> {
    let token_hash = crypto::sha256_hex(&input.refresh_token);
    let now = time::now();
    let row = sqlx::query(
        "SELECT rt.user_id, rt.device_id, u.email, u.email_verified_at, u.nickname, u.role
         FROM refresh_tokens rt
         JOIN users u ON u.id = rt.user_id
         JOIN user_devices d ON d.id = rt.device_id
         WHERE rt.token_hash = ? AND rt.device_id = ? AND rt.revoked_at IS NULL
           AND rt.expires_at > ? AND u.status = 'active' AND d.revoked_at IS NULL
         LIMIT 1",
    )
    .bind(token_hash)
    .bind(&input.device_id)
    .bind(now)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Unauthorized)?;
    let user_id: String = row.get("user_id");
    let device_id: String = row.get("device_id");
    let role: String = row.get("role");
    let access_token = jwt::create_access_token(
        &state.config.jwt_secret,
        &user_id,
        &device_id,
        &role,
        state.config.access_token_minutes,
    )?;
    sqlx::query("UPDATE refresh_tokens SET last_used_at = ? WHERE token_hash = ?")
        .bind(now)
        .bind(crypto::sha256_hex(&input.refresh_token))
        .execute(&state.db)
        .await?;
    let email_verified_at: Option<chrono::NaiveDateTime> = row.get("email_verified_at");
    Ok(Json(crate::models::auth::AuthResponse {
        access_token,
        refresh_token: input.refresh_token,
        device_id,
        user: UserProfile {
            id: user_id,
            email: row.get("email"),
            email_verified: email_verified_at.is_some(),
            nickname: row.get("nickname"),
            role,
        },
    }))
}
