use axum::{extract::State, http::HeaderMap, Json};
use serde::Serialize;
use sqlx::Row;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    models::sync::{PullSnapshotResponse, PushSnapshotRequest, SyncLog},
    services::auth_service,
    state::AppState,
    utils::time,
};

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatusResponse {
    pub email_verified: bool,
    pub can_sync: bool,
    pub remote_version: Option<i64>,
    pub last_sync_at: Option<chrono::NaiveDateTime>,
}

#[utoipa::path(
    get,
    path = "/api/sync/status",
    tag = "Sync",
    security(("bearerAuth" = [])),
    responses((status = 200, description = "Cloud sync status", body = SyncStatusResponse))
)]
pub async fn status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<SyncStatusResponse>> {
    let ctx = auth_service::authenticate(&headers, &state).await?;
    let row = sqlx::query("SELECT version, updated_at FROM sync_snapshots WHERE user_id = ?")
        .bind(&ctx.user_id)
        .fetch_optional(&state.db)
        .await?;
    Ok(Json(SyncStatusResponse {
        email_verified: ctx.email_verified,
        can_sync: ctx.email_verified,
        remote_version: row.as_ref().map(|r| r.get("version")),
        last_sync_at: row.as_ref().map(|r| r.get("updated_at")),
    }))
}

#[utoipa::path(
    post,
    path = "/api/sync/push-snapshot",
    tag = "Sync",
    security(("bearerAuth" = [])),
    request_body = PushSnapshotRequest,
    responses((status = 200, description = "Snapshot uploaded", body = SyncStatusResponse))
)]
pub async fn push_snapshot(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<PushSnapshotRequest>,
) -> AppResult<Json<SyncStatusResponse>> {
    let ctx = auth_service::authenticate(&headers, &state).await?;
    auth_service::ensure_verified(&ctx)?;
    let now = time::now();
    let payload_size = serde_json::to_vec(&input.snapshot)
        .map(|v| v.len() as i64)
        .ok();
    let remote_version = now.and_utc().timestamp_millis();
    let exists = sqlx::query("SELECT id, version FROM sync_snapshots WHERE user_id = ?")
        .bind(&ctx.user_id)
        .fetch_optional(&state.db)
        .await?;
    if let Some(row) = &exists {
        let current_version: i64 = row.get("version");
        if let Some(base_remote_version) = input.base_remote_version {
            if base_remote_version != current_version {
                write_sync_log(
                    &state,
                    &ctx.user_id,
                    Some(&ctx.device_id),
                    "push",
                    "failed",
                    input.local_version,
                    Some(current_version),
                    Some("remote snapshot changed before push"),
                    payload_size,
                )
                .await?;
                return Err(AppError::Conflict(
                    "remote snapshot changed before push; pull or merge before uploading".into(),
                ));
            }
        }
    }
    if exists.is_some() {
        sqlx::query("UPDATE sync_snapshots SET snapshot_json = ?, version = ?, client_version = ?, device_id = ?, updated_at = ? WHERE user_id = ?")
            .bind(&input.snapshot)
            .bind(remote_version)
            .bind(&input.client_version)
            .bind(&ctx.device_id)
            .bind(now)
            .bind(&ctx.user_id)
            .execute(&state.db)
            .await?;
    } else {
        sqlx::query("INSERT INTO sync_snapshots (id, user_id, snapshot_json, version, client_version, device_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(Uuid::new_v4().to_string())
            .bind(&ctx.user_id)
            .bind(&input.snapshot)
            .bind(remote_version)
            .bind(&input.client_version)
            .bind(&ctx.device_id)
            .bind(now)
            .bind(now)
            .execute(&state.db)
            .await?;
    }
    write_sync_log(
        &state,
        &ctx.user_id,
        Some(&ctx.device_id),
        "push",
        "success",
        input.local_version,
        Some(remote_version),
        None,
        payload_size,
    )
    .await?;
    sqlx::query("UPDATE user_devices SET last_sync_at = ?, updated_at = ? WHERE id = ?")
        .bind(now)
        .bind(now)
        .bind(&ctx.device_id)
        .execute(&state.db)
        .await?;
    Ok(Json(SyncStatusResponse {
        email_verified: true,
        can_sync: true,
        remote_version: Some(remote_version),
        last_sync_at: Some(now),
    }))
}

#[utoipa::path(
    get,
    path = "/api/sync/pull-snapshot",
    tag = "Sync",
    security(("bearerAuth" = [])),
    responses((status = 200, description = "Cloud snapshot", body = PullSnapshotResponse))
)]
pub async fn pull_snapshot(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<PullSnapshotResponse>> {
    let ctx = auth_service::authenticate(&headers, &state).await?;
    auth_service::ensure_verified(&ctx)?;
    let row = sqlx::query(
        "SELECT snapshot_json, version, updated_at FROM sync_snapshots WHERE user_id = ?",
    )
    .bind(&ctx.user_id)
    .fetch_optional(&state.db)
    .await?;
    write_sync_log(
        &state,
        &ctx.user_id,
        Some(&ctx.device_id),
        "pull",
        "success",
        None,
        row.as_ref().map(|r| r.get("version")),
        None,
        None,
    )
    .await?;
    Ok(Json(PullSnapshotResponse {
        snapshot: row.as_ref().map(|r| r.get("snapshot_json")),
        version: row.as_ref().map(|r| r.get("version")),
        updated_at: row.as_ref().map(|r| r.get("updated_at")),
    }))
}

#[utoipa::path(
    get,
    path = "/api/sync/logs",
    tag = "Sync",
    security(("bearerAuth" = [])),
    responses((status = 200, description = "Recent sync logs", body = Vec<SyncLog>))
)]
pub async fn logs(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<Vec<SyncLog>>> {
    let ctx = auth_service::authenticate(&headers, &state).await?;
    let rows = sqlx::query_as::<_, SyncLog>(
        "SELECT * FROM sync_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
    )
    .bind(ctx.user_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

async fn write_sync_log(
    state: &AppState,
    user_id: &str,
    device_id: Option<&str>,
    action: &str,
    status: &str,
    local_version: Option<i64>,
    remote_version: Option<i64>,
    error_message: Option<&str>,
    payload_size: Option<i64>,
) -> AppResult<()> {
    sqlx::query("INSERT INTO sync_logs (id, user_id, device_id, action, status, local_version, remote_version, error_message, payload_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind(user_id)
        .bind(device_id)
        .bind(action)
        .bind(status)
        .bind(local_version)
        .bind(remote_version)
        .bind(error_message)
        .bind(payload_size)
        .bind(time::now())
        .execute(&state.db)
        .await?;
    Ok(())
}
