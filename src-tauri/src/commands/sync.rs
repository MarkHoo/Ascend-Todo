use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::{now, DbState};
use crate::error::{AppError, AppResult};
use crate::models::{BackupEnvelope, Snapshot, SyncStatus};
use crate::sync_engine;

fn conn<'a>(state: &'a DbState) -> std::sync::MutexGuard<'a, Connection> {
    state.conn.lock().expect("db lock")
}

fn api_base(server_url: Option<String>) -> String {
    server_url
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| "http://127.0.0.1:11911".to_string())
        .trim_end_matches('/')
        .to_string()
}

fn auth_meta(c: &Connection) -> AppResult<(String, String)> {
    let (server_url, token): (Option<String>, Option<String>) = c.query_row(
        "SELECT server_url, auth_token FROM sync_meta WHERE id = 1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let token = token
        .filter(|v| !v.is_empty())
        .ok_or_else(|| AppError::Auth("please login before syncing".into()))?;
    Ok((api_base(server_url), token))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PushSnapshotRequest<'a> {
    snapshot: &'a Snapshot,
    client_version: String,
    local_version: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullSnapshotResponse {
    snapshot: Option<Snapshot>,
}

#[tauri::command]
pub fn sync_status(state: State<DbState>) -> AppResult<SyncStatus> {
    let c = conn(&state);
    let (last_pushed, last_pulled, server_url, token): (
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
    ) = c.query_row(
        "SELECT last_pushed_at, last_pulled_at, server_url, auth_token FROM sync_meta WHERE id = 1",
        [],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
    )?;
    let enabled: bool = c
        .query_row(
            "SELECT value FROM settings WHERE key = 'sync_enabled'",
            [],
            |r| r.get::<_, String>(0),
        )
        .map(|v| matches!(v.as_str(), "1" | "true"))
        .unwrap_or(false);
    Ok(SyncStatus {
        enabled,
        logged_in: token.map(|t| !t.is_empty()).unwrap_or(false),
        last_pushed_at: last_pushed,
        last_pulled_at: last_pulled,
        pending_changes: 0,
        server_url,
    })
}

#[tauri::command]
pub fn sync_push(state: State<DbState>) -> AppResult<SyncStatus> {
    let (snap, base, token) = {
        let c = conn(&state);
        let snap = sync_engine::build_snapshot(&c)?;
        let (base, token) = auth_meta(&c)?;
        (snap, base, token)
    };
    let response = reqwest::blocking::Client::new()
        .post(format!("{base}/api/sync/push-snapshot"))
        .bearer_auth(token)
        .json(&PushSnapshotRequest {
            snapshot: &snap,
            client_version: env!("CARGO_PKG_VERSION").to_string(),
            local_version: Some(chrono::Utc::now().timestamp_millis()),
        })
        .send()
        .map_err(|e| AppError::Invalid(format!("cloud push failed: {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::Invalid(
            response
                .text()
                .unwrap_or_else(|_| "cloud push failed".into()),
        ));
    }
    {
        let c = conn(&state);
        c.execute(
            "UPDATE sync_meta SET last_pushed_at = ? WHERE id = 1",
            params![now()],
        )?;
    }
    sync_status(state)
}

#[tauri::command]
pub fn sync_pull(state: State<DbState>) -> AppResult<SyncStatus> {
    let (base, token) = {
        let c = conn(&state);
        auth_meta(&c)?
    };
    let response = reqwest::blocking::Client::new()
        .get(format!("{base}/api/sync/pull-snapshot"))
        .bearer_auth(token)
        .send()
        .map_err(|e| AppError::Invalid(format!("cloud pull failed: {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::Invalid(
            response
                .text()
                .unwrap_or_else(|_| "cloud pull failed".into()),
        ));
    }
    let body: PullSnapshotResponse = response
        .json()
        .map_err(|e| AppError::Invalid(format!("invalid cloud snapshot: {e}")))?;
    {
        let c = conn(&state);
        if let Some(s) = body.snapshot {
            sync_engine::apply_snapshot(&c, &s)?;
        }
        c.execute(
            "UPDATE sync_meta SET last_pulled_at = ? WHERE id = 1",
            params![now()],
        )?;
    }
    sync_status(state)
}

/// Get current local snapshot (for debug)
#[tauri::command]
pub fn sync_snapshot(state: State<DbState>) -> AppResult<Snapshot> {
    let c = conn(&state);
    sync_engine::build_snapshot(&c)
}

#[tauri::command]
pub fn export_data_backup(state: State<DbState>) -> AppResult<String> {
    let c = conn(&state);
    let snapshot = sync_engine::build_snapshot(&c)?;
    let envelope = BackupEnvelope {
        schema_version: 1,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        backup_kind: "ascend-todo-full".to_string(),
        generated_at: chrono::Utc::now().to_rfc3339(),
        snapshot,
    };
    serde_json::to_string_pretty(&envelope).map_err(Into::into)
}

#[tauri::command]
pub fn import_data_backup(state: State<DbState>, content: String) -> AppResult<SyncStatus> {
    let value: serde_json::Value = serde_json::from_str(&content)?;
    let snapshot: Snapshot = if value.get("snapshot").is_some() {
        serde_json::from_value(value["snapshot"].clone())?
    } else {
        serde_json::from_value(value)?
    };
    {
        let c = conn(&state);
        sync_engine::apply_snapshot(&c, &snapshot)?;
        c.execute(
            "UPDATE sync_meta SET last_pulled_at = ? WHERE id = 1",
            params![now()],
        )?;
    }
    sync_status(state)
}
