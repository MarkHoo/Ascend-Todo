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
    models::{auth::AuthResponse, user::LoginRequest},
    services::auth_service,
    state::AppState,
};

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OverviewResponse {
    pub total_users: i64,
    pub verified_users: i64,
    pub total_devices: i64,
    pub sync_success_today: i64,
    pub sync_failed_today: i64,
    pub client_versions: Vec<ClientVersionStat>,
}

#[derive(Serialize, sqlx::FromRow, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ClientVersionStat {
    pub version: String,
    pub users: i64,
    pub devices: i64,
}

#[derive(Serialize, sqlx::FromRow, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminUser {
    pub id: String,
    pub email: String,
    pub email_verified_at: Option<chrono::NaiveDateTime>,
    pub nickname: Option<String>,
    pub status: String,
    pub role: String,
    pub current_client_version: Option<String>,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
    pub last_login_at: Option<chrono::NaiveDateTime>,
}

#[derive(Serialize, sqlx::FromRow, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminDevice {
    pub id: String,
    pub user_id: String,
    pub user_nickname: Option<String>,
    pub device_name: String,
    pub device_fingerprint: String,
    pub platform: Option<String>,
    pub app_version: Option<String>,
    pub last_login_at: Option<chrono::NaiveDateTime>,
    pub last_sync_at: Option<chrono::NaiveDateTime>,
    pub revoked_at: Option<chrono::NaiveDateTime>,
    pub wipe_requested_at: Option<chrono::NaiveDateTime>,
    pub wiped_at: Option<chrono::NaiveDateTime>,
    pub created_at: chrono::NaiveDateTime,
    pub updated_at: chrono::NaiveDateTime,
}

#[derive(Serialize, sqlx::FromRow, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminSyncLog {
    pub id: String,
    pub user_id: String,
    pub user_nickname: Option<String>,
    pub device_id: Option<String>,
    pub action: String,
    pub status: String,
    pub local_version: Option<i64>,
    pub remote_version: Option<i64>,
    pub error_message: Option<String>,
    pub payload_size: Option<i64>,
    pub created_at: chrono::NaiveDateTime,
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
    let client_versions = sqlx::query_as::<_, ClientVersionStat>(
        "SELECT
            COALESCE(NULLIF(app_version, ''), 'unknown') AS version,
            COUNT(DISTINCT user_id) AS users,
            COUNT(*) AS devices
         FROM user_devices
         GROUP BY COALESCE(NULLIF(app_version, ''), 'unknown')
         ORDER BY devices DESC, version DESC",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(OverviewResponse {
        total_users,
        verified_users,
        total_devices,
        sync_success_today,
        sync_failed_today,
        client_versions,
    }))
}

#[utoipa::path(
    get,
    path = "/api/admin/users",
    tag = "Admin",
    security(("bearerAuth" = [])),
    responses((status = 200, description = "Recent users", body = Vec<AdminUser>))
)]
pub async fn users(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<Vec<AdminUser>>> {
    let ctx = auth_service::authenticate(&headers, &state).await?;
    auth_service::ensure_admin(&ctx)?;
    let rows = sqlx::query_as::<_, AdminUser>(
        "SELECT
            u.id, u.email, u.email_verified_at,
            COALESCE(
                NULLIF(JSON_UNQUOTE(JSON_EXTRACT(s.snapshot_json, '$.userProfile.nickname')), 'null'),
                NULLIF(u.nickname, '')
            ) AS nickname,
            u.status, u.role,
            (
                SELECT d.app_version
                FROM user_devices d
                WHERE d.user_id = u.id AND d.app_version IS NOT NULL AND d.app_version <> ''
                ORDER BY COALESCE(d.last_login_at, d.updated_at) DESC
                LIMIT 1
            ) AS current_client_version,
            u.created_at, u.updated_at, u.last_login_at
         FROM users u
         LEFT JOIN sync_snapshots s ON s.user_id = u.id
         ORDER BY u.created_at DESC
         LIMIT 200",
    )
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
    responses((status = 200, description = "User detail", body = AdminUser))
)]
pub async fn user_detail(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Json<AdminUser>> {
    let ctx = auth_service::authenticate(&headers, &state).await?;
    auth_service::ensure_admin(&ctx)?;
    let row = sqlx::query_as::<_, AdminUser>(
        "SELECT
            u.id, u.email, u.email_verified_at,
            COALESCE(
                NULLIF(JSON_UNQUOTE(JSON_EXTRACT(s.snapshot_json, '$.userProfile.nickname')), 'null'),
                NULLIF(u.nickname, '')
            ) AS nickname,
            u.status, u.role,
            (
                SELECT d.app_version
                FROM user_devices d
                WHERE d.user_id = u.id AND d.app_version IS NOT NULL AND d.app_version <> ''
                ORDER BY COALESCE(d.last_login_at, d.updated_at) DESC
                LIMIT 1
            ) AS current_client_version,
            u.created_at, u.updated_at, u.last_login_at
         FROM users u
         LEFT JOIN sync_snapshots s ON s.user_id = u.id
         WHERE u.id = ?",
    )
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
    responses((status = 200, description = "Recent devices", body = Vec<AdminDevice>))
)]
pub async fn devices(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<Vec<AdminDevice>>> {
    let ctx = auth_service::authenticate(&headers, &state).await?;
    auth_service::ensure_admin(&ctx)?;
    let rows = sqlx::query_as::<_, AdminDevice>(
        "SELECT
            d.id, d.user_id,
            COALESCE(
                NULLIF(JSON_UNQUOTE(JSON_EXTRACT(s.snapshot_json, '$.userProfile.nickname')), 'null'),
                NULLIF(u.nickname, '')
            ) AS user_nickname,
            d.device_name, d.device_fingerprint,
            d.platform, d.app_version, d.last_login_at, d.last_sync_at, d.revoked_at,
            d.wipe_requested_at, d.wiped_at, d.created_at, d.updated_at
         FROM user_devices d
         JOIN users u ON u.id = d.user_id
         LEFT JOIN sync_snapshots s ON s.user_id = d.user_id
         ORDER BY d.updated_at DESC
         LIMIT 300",
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
    responses((status = 200, description = "Recent sync logs", body = Vec<AdminSyncLog>))
)]
pub async fn sync_logs(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<Vec<AdminSyncLog>>> {
    let ctx = auth_service::authenticate(&headers, &state).await?;
    auth_service::ensure_admin(&ctx)?;
    let rows = sqlx::query_as::<_, AdminSyncLog>(
        "SELECT
            l.id, l.user_id,
            COALESCE(
                NULLIF(JSON_UNQUOTE(JSON_EXTRACT(s.snapshot_json, '$.userProfile.nickname')), 'null'),
                NULLIF(u.nickname, '')
            ) AS user_nickname,
            l.device_id, l.action, l.status,
            l.local_version, l.remote_version, l.error_message, l.payload_size, l.created_at
         FROM sync_logs l
         JOIN users u ON u.id = l.user_id
         LEFT JOIN sync_snapshots s ON s.user_id = l.user_id
         ORDER BY l.created_at DESC
         LIMIT 300",
    )
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
