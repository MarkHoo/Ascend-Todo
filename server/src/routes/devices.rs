use axum::{
    extract::{Path, State},
    http::HeaderMap,
    Json,
};
use serde::Serialize;

use crate::{
    error::AppResult,
    models::device::{Device, RenameDeviceRequest},
    services::auth_service,
    state::AppState,
    utils::time,
};

#[derive(Serialize)]
pub struct SimpleResponse {
    pub ok: bool,
}

pub async fn list_devices(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<Vec<Device>>> {
    let ctx = auth_service::authenticate(&headers, &state).await?;
    let rows = sqlx::query_as::<_, Device>(
        "SELECT * FROM user_devices WHERE user_id = ? ORDER BY last_login_at DESC",
    )
    .bind(&ctx.user_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

pub async fn rename_device(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(input): Json<RenameDeviceRequest>,
) -> AppResult<Json<SimpleResponse>> {
    let ctx = auth_service::authenticate(&headers, &state).await?;
    sqlx::query(
        "UPDATE user_devices SET device_name = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    )
    .bind(input.device_name)
    .bind(time::now())
    .bind(id)
    .bind(ctx.user_id)
    .execute(&state.db)
    .await?;
    Ok(Json(SimpleResponse { ok: true }))
}

pub async fn revoke_device(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Json<SimpleResponse>> {
    let ctx = auth_service::authenticate(&headers, &state).await?;
    let now = time::now();
    sqlx::query(
        "UPDATE user_devices SET revoked_at = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    )
    .bind(now)
    .bind(now)
    .bind(&id)
    .bind(&ctx.user_id)
    .execute(&state.db)
    .await?;
    sqlx::query("UPDATE refresh_tokens SET revoked_at = ? WHERE device_id = ?")
        .bind(now)
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(SimpleResponse { ok: true }))
}

pub async fn revoke_others(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<SimpleResponse>> {
    let ctx = auth_service::authenticate(&headers, &state).await?;
    let now = time::now();
    sqlx::query(
        "UPDATE user_devices SET revoked_at = ?, updated_at = ? WHERE user_id = ? AND id <> ?",
    )
    .bind(now)
    .bind(now)
    .bind(&ctx.user_id)
    .bind(&ctx.device_id)
    .execute(&state.db)
    .await?;
    sqlx::query("UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND device_id <> ?")
        .bind(now)
        .bind(&ctx.user_id)
        .bind(&ctx.device_id)
        .execute(&state.db)
        .await?;
    Ok(Json(SimpleResponse { ok: true }))
}

pub async fn request_wipe(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Json<SimpleResponse>> {
    let ctx = auth_service::authenticate(&headers, &state).await?;
    let now = time::now();
    sqlx::query("UPDATE user_devices SET wipe_requested_at = ?, updated_at = ? WHERE id = ? AND user_id = ?")
        .bind(now)
        .bind(now)
        .bind(id)
        .bind(ctx.user_id)
        .execute(&state.db)
        .await?;
    Ok(Json(SimpleResponse { ok: true }))
}
