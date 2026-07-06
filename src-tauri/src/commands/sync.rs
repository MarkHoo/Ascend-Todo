use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashMap;
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
    base_remote_version: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullSnapshotResponse {
    snapshot: Option<Snapshot>,
    version: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloudSyncStatusResponse {
    remote_version: Option<i64>,
}

fn get_setting(c: &Connection, key: &str) -> Option<String> {
    c.query_row("SELECT value FROM settings WHERE key = ?", [key], |r| {
        r.get(0)
    })
    .ok()
}

fn set_setting(c: &Connection, key: &str, value: &str) -> AppResult<()> {
    c.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

fn stored_remote_version(c: &Connection) -> Option<i64> {
    get_setting(c, "cloud_remote_version").and_then(|v| v.parse::<i64>().ok())
}

fn store_remote_version(c: &Connection, version: Option<i64>) -> AppResult<()> {
    if let Some(version) = version {
        set_setting(c, "cloud_remote_version", &version.to_string())?;
    }
    Ok(())
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
        remote_version: stored_remote_version(&c),
    })
}

#[tauri::command]
pub fn sync_push(state: State<DbState>) -> AppResult<SyncStatus> {
    let (snap, base, token, base_remote_version) = {
        let c = conn(&state);
        let snap = sync_engine::build_snapshot(&c)?;
        let (base, token) = auth_meta(&c)?;
        (snap, base, token, stored_remote_version(&c))
    };
    let response = reqwest::blocking::Client::new()
        .post(format!("{base}/api/sync/push-snapshot"))
        .bearer_auth(token)
        .json(&PushSnapshotRequest {
            snapshot: &snap,
            client_version: env!("CARGO_PKG_VERSION").to_string(),
            local_version: Some(chrono::Utc::now().timestamp_millis()),
            base_remote_version,
        })
        .send()
        .map_err(|e| AppError::Invalid(format!("cloud push failed: {e}")))?;
    if !response.status().is_success() {
        if response.status() == reqwest::StatusCode::CONFLICT {
            return Err(AppError::Invalid(
                "云端数据已变化，请先使用智能合并后再上传。".into(),
            ));
        }
        return Err(AppError::Invalid(
            response
                .text()
                .unwrap_or_else(|_| "cloud push failed".into()),
        ));
    }
    let cloud_status: CloudSyncStatusResponse = response
        .json()
        .map_err(|e| AppError::Invalid(format!("invalid cloud push response: {e}")))?;
    {
        let c = conn(&state);
        c.execute(
            "UPDATE sync_meta SET last_pushed_at = ? WHERE id = 1",
            params![now()],
        )?;
        store_remote_version(&c, cloud_status.remote_version)?;
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
        store_remote_version(&c, body.version)?;
        c.execute(
            "UPDATE sync_meta SET last_pulled_at = ? WHERE id = 1",
            params![now()],
        )?;
    }
    sync_status(state)
}

#[tauri::command]
pub fn sync_merge(state: State<DbState>) -> AppResult<SyncStatus> {
    let (base, token, local_snapshot) = {
        let c = conn(&state);
        let (base, token) = auth_meta(&c)?;
        (base, token, sync_engine::build_snapshot(&c)?)
    };
    let response = reqwest::blocking::Client::new()
        .get(format!("{base}/api/sync/pull-snapshot"))
        .bearer_auth(&token)
        .send()
        .map_err(|e| AppError::Invalid(format!("cloud merge pull failed: {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::Invalid(
            response
                .text()
                .unwrap_or_else(|_| "cloud merge pull failed".into()),
        ));
    }
    let body: PullSnapshotResponse = response
        .json()
        .map_err(|e| AppError::Invalid(format!("invalid cloud snapshot: {e}")))?;
    let Some(remote_snapshot) = body.snapshot else {
        return sync_push(state);
    };
    let merged = merge_snapshots(&remote_snapshot, &local_snapshot)?;
    {
        let c = conn(&state);
        sync_engine::apply_snapshot(&c, &merged)?;
        store_remote_version(&c, body.version)?;
        c.execute(
            "UPDATE sync_meta SET last_pulled_at = ? WHERE id = 1",
            params![now()],
        )?;
    }
    sync_push(state)
}

fn merge_snapshots(remote: &Snapshot, local: &Snapshot) -> AppResult<Snapshot> {
    let mut remote_value = serde_json::to_value(remote)?;
    let local_value = serde_json::to_value(local)?;
    let Some(remote_obj) = remote_value.as_object_mut() else {
        return Ok(local.clone());
    };
    let Some(local_obj) = local_value.as_object() else {
        return Ok(remote.clone());
    };
    for (key, local_entry) in local_obj {
        match (remote_obj.get_mut(key), local_entry) {
            (Some(Value::Array(remote_items)), Value::Array(local_items)) => {
                *remote_items = merge_arrays(remote_items.clone(), local_items.clone());
            }
            (Some(Value::Object(remote_profile)), Value::Object(local_profile))
                if key == "userProfile" =>
            {
                if is_newer(local_profile, remote_profile) {
                    remote_obj.insert(key.clone(), Value::Object(local_profile.clone()));
                }
            }
            (Some(Value::Object(remote_settings)), Value::Object(local_settings))
                if key == "settings" =>
            {
                for (setting_key, setting_value) in local_settings {
                    remote_settings.insert(setting_key.clone(), setting_value.clone());
                }
            }
            (None, value) => {
                remote_obj.insert(key.clone(), value.clone());
            }
            _ => {}
        }
    }
    serde_json::from_value(remote_value).map_err(Into::into)
}

fn merge_arrays(remote_items: Vec<Value>, local_items: Vec<Value>) -> Vec<Value> {
    let mut by_id: Map<String, Value> = Map::new();
    let mut anonymous = Vec::new();
    for item in remote_items.into_iter().chain(local_items) {
        let id = item
            .get("id")
            .and_then(Value::as_str)
            .map(ToString::to_string);
        if let Some(id) = id {
            match by_id.get(&id) {
                Some(existing) if !value_is_newer(&item, existing) => {}
                _ => {
                    by_id.insert(id, item);
                }
            }
        } else {
            anonymous.push(item);
        }
    }
    anonymous.extend(by_id.into_values());
    anonymous
}

fn value_is_newer(candidate: &Value, current: &Value) -> bool {
    let candidate_updated = candidate
        .get("updatedAt")
        .or_else(|| candidate.get("updated_at"))
        .and_then(Value::as_str);
    let current_updated = current
        .get("updatedAt")
        .or_else(|| current.get("updated_at"))
        .and_then(Value::as_str);
    match (candidate_updated, current_updated) {
        (Some(a), Some(b)) => a >= b,
        (Some(_), None) => true,
        _ => true,
    }
}

fn is_newer(candidate: &Map<String, Value>, current: &Map<String, Value>) -> bool {
    let candidate_updated = candidate
        .get("updatedAt")
        .or_else(|| candidate.get("updated_at"))
        .and_then(Value::as_str);
    let current_updated = current
        .get("updatedAt")
        .or_else(|| current.get("updated_at"))
        .and_then(Value::as_str);
    match (candidate_updated, current_updated) {
        (Some(a), Some(b)) => a >= b,
        (Some(_), None) => true,
        _ => true,
    }
}

/// Get current local snapshot (for debug)
#[tauri::command]
pub fn sync_snapshot(state: State<DbState>) -> AppResult<Snapshot> {
    let c = conn(&state);
    sync_engine::build_snapshot(&c)
}

#[tauri::command]
pub fn sync_clear_local_data(state: State<DbState>) -> AppResult<SyncStatus> {
    let empty = Snapshot {
        boards: Vec::new(),
        lists: Vec::new(),
        tasks: Vec::new(),
        goals: Vec::new(),
        key_results: Vec::new(),
        progress_logs: Vec::new(),
        goal_task_links: Vec::new(),
        milestones: Vec::new(),
        pomodoro_sessions: Vec::new(),
        check_ins: Vec::new(),
        review_reports: Vec::new(),
        calendar_events: Vec::new(),
        calendar_holiday_sources: Vec::new(),
        calendar_email_accounts: Vec::new(),
        holiday_sync_configs: Vec::new(),
        user_profile: None,
        settings: HashMap::new(),
        generated_at: chrono::Utc::now().to_rfc3339(),
    };
    {
        let c = conn(&state);
        sync_engine::apply_snapshot(&c, &empty)?;
        c.execute(
            "UPDATE sync_meta SET last_pushed_at = NULL, last_pulled_at = NULL, auth_token = NULL WHERE id = 1",
            [],
        )?;
        c.execute(
            "INSERT OR REPLACE INTO user_profile (id, nickname, avatar, phone, email, signature, updated_at)
             VALUES ('me', NULL, NULL, NULL, NULL, NULL, ?)",
            [now()],
        )?;
    }
    sync_status(state)
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
