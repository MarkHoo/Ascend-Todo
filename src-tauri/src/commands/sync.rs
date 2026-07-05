use rusqlite::{params, Connection};
use tauri::State;

use crate::db::{now, DbState};
use crate::error::AppResult;
use crate::models::{BackupEnvelope, Snapshot, SyncStatus};
use crate::sync_engine;

fn conn<'a>(state: &'a DbState) -> std::sync::MutexGuard<'a, Connection> {
    state.conn.lock().expect("db lock")
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

/// Push local snapshot to the (Mock) server.
#[tauri::command]
pub fn sync_push(state: State<DbState>) -> AppResult<SyncStatus> {
    let snap = {
        let c = conn(&state);
        let snap = sync_engine::build_snapshot(&c)?;
        c.execute(
            "UPDATE sync_meta SET last_pushed_at = ? WHERE id = 1",
            params![now()],
        )?;
        snap
    };
    sync_engine::mock_push(&snap)?;
    sync_status(state)
}

/// Pull from (Mock) server and overwrite local data.
#[tauri::command]
pub fn sync_pull(state: State<DbState>) -> AppResult<SyncStatus> {
    {
        let c = conn(&state);
        let snap = sync_engine::mock_pull()?;
        if let Some(s) = snap {
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
