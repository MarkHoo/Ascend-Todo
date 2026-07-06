use axum::{extract::State, http::HeaderMap, Json};
use chrono::Duration;
use serde::Serialize;
use sqlx::Row;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    models::auth::{SendEmailCodeRequest, VerifyEmailRequest},
    services::{auth_service, mail_service},
    state::AppState,
    utils::{crypto, time},
};

#[derive(Serialize, ToSchema)]
#[schema(as = EmailSimpleResponse)]
pub struct SimpleResponse {
    pub ok: bool,
}

fn request_ip(headers: &HeaderMap) -> String {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .or_else(|| headers.get("x-real-ip").and_then(|v| v.to_str().ok()))
        .unwrap_or("unknown")
        .to_string()
}

async fn ensure_send_rate_limit(
    state: &AppState,
    user_id: &str,
    email: &str,
    ip: &str,
) -> AppResult<()> {
    let recent_email_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM email_verification_codes
         WHERE user_id = ? AND email = ? AND created_at > ?",
    )
    .bind(user_id)
    .bind(email)
    .bind(time::now() - Duration::minutes(1))
    .fetch_one(&state.db)
    .await?;
    if recent_email_count > 0 {
        return Err(AppError::BadRequest(
            "verification code was sent recently, please wait before trying again".into(),
        ));
    }

    let hourly_email_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM email_verification_codes
         WHERE email = ? AND created_at > ?",
    )
    .bind(email)
    .bind(time::now() - Duration::hours(1))
    .fetch_one(&state.db)
    .await?;
    if hourly_email_count >= 5 {
        return Err(AppError::BadRequest(
            "too many verification requests for this email, please try later".into(),
        ));
    }

    let hourly_ip_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM email_verification_codes
         WHERE send_ip = ? AND created_at > ?",
    )
    .bind(ip)
    .bind(time::now() - Duration::hours(1))
    .fetch_one(&state.db)
    .await?;
    if hourly_ip_count >= 20 {
        return Err(AppError::BadRequest(
            "too many verification requests from this network, please try later".into(),
        ));
    }
    Ok(())
}

#[utoipa::path(
    post,
    path = "/api/email/send-verification-code",
    tag = "Email",
    security(("bearerAuth" = [])),
    request_body = SendEmailCodeRequest,
    responses((status = 200, description = "Verification code sent", body = SimpleResponse))
)]
pub async fn send_verification_code(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<SendEmailCodeRequest>,
) -> AppResult<Json<SimpleResponse>> {
    let ctx = auth_service::authenticate(&headers, &state).await?;
    let purpose = if input.purpose.trim().is_empty() {
        "verify_email"
    } else {
        input.purpose.trim()
    };
    if !matches!(purpose, "verify_email" | "reset_password" | "change_email") {
        return Err(AppError::BadRequest("invalid email code purpose".into()));
    }
    let row = sqlx::query("SELECT email FROM users WHERE id = ?")
        .bind(&ctx.user_id)
        .fetch_one(&state.db)
        .await?;
    let email: String = row.get("email");
    let ip = request_ip(&headers);
    ensure_send_rate_limit(&state, &ctx.user_id, &email, &ip).await?;
    let code = crypto::generate_code();
    sqlx::query(
        "INSERT INTO email_verification_codes (id, user_id, email, code_hash, purpose, expires_at, send_ip, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&ctx.user_id)
    .bind(&email)
    .bind(crypto::sha256_hex(&code))
    .bind(purpose)
    .bind(time::now() + Duration::minutes(state.config.email_code_minutes))
    .bind(ip)
    .bind(time::now())
    .execute(&state.db)
    .await?;
    mail_service::send_verification_code(&state.config, &email, &code).await?;
    Ok(Json(SimpleResponse { ok: true }))
}

#[utoipa::path(
    post,
    path = "/api/email/verify",
    tag = "Email",
    security(("bearerAuth" = [])),
    request_body = VerifyEmailRequest,
    responses((status = 200, description = "Email verified", body = SimpleResponse))
)]
pub async fn verify_email(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<VerifyEmailRequest>,
) -> AppResult<Json<SimpleResponse>> {
    let ctx = auth_service::authenticate(&headers, &state).await?;
    let now = time::now();
    let code_hash = crypto::sha256_hex(input.code.trim());
    let row = sqlx::query(
        "SELECT id FROM email_verification_codes
         WHERE user_id = ? AND code_hash = ? AND purpose = 'verify_email'
           AND consumed_at IS NULL AND expires_at > ?
         ORDER BY created_at DESC LIMIT 1",
    )
    .bind(&ctx.user_id)
    .bind(code_hash)
    .bind(now)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::BadRequest("invalid or expired verification code".into()))?;
    let code_id: String = row.get("id");
    sqlx::query("UPDATE email_verification_codes SET consumed_at = ? WHERE id = ?")
        .bind(now)
        .bind(code_id)
        .execute(&state.db)
        .await?;
    sqlx::query("UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?")
        .bind(now)
        .bind(now)
        .bind(&ctx.user_id)
        .execute(&state.db)
        .await?;
    Ok(Json(SimpleResponse { ok: true }))
}

#[utoipa::path(
    post,
    path = "/api/phone/send-verification-code",
    tag = "Phone",
    responses((status = 400, description = "Reserved endpoint", body = SimpleResponse))
)]
pub async fn phone_reserved() -> AppResult<Json<SimpleResponse>> {
    Err(AppError::BadRequest("手机验证码暂未开放".into()))
}
