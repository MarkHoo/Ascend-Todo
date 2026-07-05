use axum::{
    extract::{Path, State},
    http::HeaderMap,
    Json,
};
use serde::Serialize;
use sqlx::Row;
use utoipa::ToSchema;

use crate::{
    error::{AppError, AppResult},
    models::{
        auth::AuthResponse,
        device::Device,
        sync::SyncLog,
        user::{LoginRequest, User},
    },
    services::auth_service,
    state::AppState,
};

#[derive(Serialize, ToSchema)]
pub struct OverviewResponse {
    pub total_users: i64,
    pub verified_users: i64,
    pub total_devices: i64,
    pub sync_success_today: i64,
    pub sync_failed_today: i64,
}

#[utoipa::path(
    post,
    path = "/api/admin/login",
    tag = "Admin",
    request_body = LoginRequest,
    responses((status = 200, description = "Admin session", body = AuthResponse))
)]
pub async fn login(
    State(state): State<AppState>,
    Json(input): Json<LoginRequest>,
) -> AppResult<Json<AuthResponse>> {
    let response = auth_service::login(&state.db, &state.config, input).await?;
    if matches!(
        response.user.role.as_str(),
        "admin" | "operator" | "readonly"
    ) {
        Ok(Json(response))
    } else {
        Err(AppError::Forbidden)
    }
}

#[utoipa::path(
    get,
    path = "/api/admin/overview",
    tag = "Admin",
    security(("bearerAuth" = [])),
    responses((status = 200, description = "Admin overview metrics", body = OverviewResponse))
)]
pub async fn overview(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<OverviewResponse>> {
    let ctx = auth_service::authenticate(&headers, &state).await?;
    auth_service::ensure_admin(&ctx)?;
    let total_users: i64 = scalar(&state, "SELECT COUNT(*) FROM users").await?;
    let verified_users: i64 = scalar(
        &state,
        "SELECT COUNT(*) FROM users WHERE email_verified_at IS NOT NULL",
    )
    .await?;
    let total_devices: i64 = scalar(&state, "SELECT COUNT(*) FROM user_devices").await?;
    let sync_success_today: i64 = scalar(
        &state,
        "SELECT COUNT(*) FROM sync_logs WHERE status = 'success' AND DATE(created_at) = UTC_DATE()",
    )
    .await?;
    let sync_failed_today: i64 = scalar(
        &state,
        "SELECT COUNT(*) FROM sync_logs WHERE status = 'failed' AND DATE(created_at) = UTC_DATE()",
    )
    .await?;
    Ok(Json(OverviewResponse {
        total_users,
        verified_users,
        total_devices,
        sync_success_today,
        sync_failed_today,
    }))
}

#[utoipa::path(
    get,
    path = "/api/admin/users",
    tag = "Admin",
    security(("bearerAuth" = [])),
    responses((status = 200, description = "Recent users", body = Vec<User>))
)]
pub async fn users(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<Vec<User>>> {
    let ctx = auth_service::authenticate(&headers, &state).await?;
    auth_service::ensure_admin(&ctx)?;
    let rows = sqlx::query_as::<_, User>("SELECT id, email, email_verified_at, nickname, status, role, created_at, updated_at, last_login_at FROM users ORDER BY created_at DESC LIMIT 200")
        .fetch_all(&state.db)
        .await?;
    Ok(Json(rows))
}

#[utoipa::path(
    get,
    path = "/api/admin/users/{id}",
    tag = "Admin",
    security(("bearerAuth" = [])),
    params(("id" = String, Path, description = "User id")),
    responses((status = 200, description = "User detail", body = User))
)]
pub async fn user_detail(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Json<User>> {
    let ctx = auth_service::authenticate(&headers, &state).await?;
    auth_service::ensure_admin(&ctx)?;
    let row = sqlx::query_as::<_, User>("SELECT id, email, email_verified_at, nickname, status, role, created_at, updated_at, last_login_at FROM users WHERE id = ?")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(row))
}

#[utoipa::path(
    get,
    path = "/api/admin/devices",
    tag = "Admin",
    security(("bearerAuth" = [])),
    responses((status = 200, description = "Recent devices", body = Vec<Device>))
)]
pub async fn devices(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<Vec<Device>>> {
    let ctx = auth_service::authenticate(&headers, &state).await?;
    auth_service::ensure_admin(&ctx)?;
    let rows = sqlx::query_as::<_, Device>(
        "SELECT * FROM user_devices ORDER BY updated_at DESC LIMIT 300",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

#[utoipa::path(
    get,
    path = "/api/admin/sync-logs",
    tag = "Admin",
    security(("bearerAuth" = [])),
    responses((status = 200, description = "Recent sync logs", body = Vec<SyncLog>))
)]
pub async fn sync_logs(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<Vec<SyncLog>>> {
    let ctx = auth_service::authenticate(&headers, &state).await?;
    auth_service::ensure_admin(&ctx)?;
    let rows =
        sqlx::query_as::<_, SyncLog>("SELECT * FROM sync_logs ORDER BY created_at DESC LIMIT 300")
            .fetch_all(&state.db)
            .await?;
    Ok(Json(rows))
}

#[derive(Serialize, ToSchema)]
pub struct SystemHealthResponse {
    pub ok: bool,
    pub database: bool,
    pub version: &'static str,
}

#[utoipa::path(
    get,
    path = "/api/admin/system-health",
    tag = "Admin",
    security(("bearerAuth" = [])),
    responses((status = 200, description = "Backend system health", body = SystemHealthResponse))
)]
pub async fn system_health(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<SystemHealthResponse>> {
    let ctx = auth_service::authenticate(&headers, &state).await?;
    auth_service::ensure_admin(&ctx)?;
    sqlx::query("SELECT 1").execute(&state.db).await?;
    Ok(Json(SystemHealthResponse {
        ok: true,
        database: true,
        version: env!("CARGO_PKG_VERSION"),
    }))
}

async fn scalar(state: &AppState, sql: &str) -> AppResult<i64> {
    let row = sqlx::query(sql).fetch_one(&state.db).await?;
    Ok(row.get::<i64, _>(0))
}
