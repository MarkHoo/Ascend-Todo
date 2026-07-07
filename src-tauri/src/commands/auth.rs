use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::models::AuthSession;

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

fn device_fingerprint(c: &Connection) -> AppResult<String> {
    if let Some(existing) = get_setting(c, "cloud_device_fingerprint") {
        if !existing.is_empty() {
            return Ok(existing);
        }
    }
    let id = Uuid::new_v4().to_string();
    set_setting(c, "cloud_device_fingerprint", &id)?;
    Ok(id)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerAuthRequest {
    email: String,
    password: String,
    device_name: String,
    device_fingerprint: String,
    platform: String,
    app_version: String,
}

#[derive(Serialize)]
struct ServerRegisterRequest {
    email: String,
    password: String,
    nickname: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServerUser {
    email: String,
    email_verified: bool,
    nickname: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServerAuthResponse {
    access_token: String,
    refresh_token: String,
    device_id: String,
    user: ServerUser,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RefreshRequest {
    refresh_token: String,
    device_id: String,
}

#[derive(Serialize)]
struct EmailCodeRequest {
    purpose: String,
}

#[derive(Serialize)]
struct VerifyEmailRequest {
    code: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudDevice {
    pub id: String,
    #[serde(alias = "device_name")]
    pub device_name: String,
    #[serde(alias = "platform")]
    pub platform: Option<String>,
    #[serde(alias = "app_version")]
    pub app_version: Option<String>,
    #[serde(alias = "last_login_at")]
    pub last_login_at: Option<String>,
    #[serde(alias = "last_sync_at")]
    pub last_sync_at: Option<String>,
    #[serde(alias = "revoked_at")]
    pub revoked_at: Option<String>,
    #[serde(alias = "wipe_requested_at")]
    pub wipe_requested_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RenameDeviceRequest {
    device_name: String,
}

fn request_auth(
    endpoint: &str,
    email: String,
    password: String,
    server_url: Option<String>,
    state: &DbState,
) -> AppResult<AuthSession> {
    let base = api_base(server_url);
    let device_fingerprint = {
        let c = conn(state);
        device_fingerprint(&c)?
    };
    let payload = ServerAuthRequest {
        email: email.trim().to_lowercase(),
        password,
        device_name: std::env::var("COMPUTERNAME")
            .unwrap_or_else(|_| "Ascend Todo Device".to_string()),
        device_fingerprint,
        platform: std::env::consts::OS.to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    };
    let url = format!("{base}/api/auth/{endpoint}");
    let response = reqwest::blocking::Client::new()
        .post(url)
        .json(&payload)
        .send()
        .map_err(|e| AppError::Auth(format!("request failed: {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::Auth(
            response.text().unwrap_or_else(|_| "auth failed".into()),
        ));
    }
    let body: ServerAuthResponse = response
        .json()
        .map_err(|e| AppError::Auth(format!("invalid auth response: {e}")))?;
    persist_session(state, &base, body)
}

fn persist_session(
    state: &DbState,
    base: &str,
    body: ServerAuthResponse,
) -> AppResult<AuthSession> {
    let nickname = body
        .user
        .nickname
        .clone()
        .unwrap_or_else(|| body.user.email.clone());
    let c = conn(state);
    c.execute(
        "UPDATE sync_meta SET auth_token = ?, server_url = ? WHERE id = 1",
        params![&body.access_token, base],
    )?;
    set_setting(&c, "cloud_refresh_token", &body.refresh_token)?;
    set_setting(&c, "cloud_device_id", &body.device_id)?;
    set_setting(&c, "auth_email", &body.user.email)?;
    set_setting(&c, "auth_nickname", &nickname)?;
    set_setting(
        &c,
        "auth_email_verified",
        if body.user.email_verified { "1" } else { "0" },
    )?;
    if body.user.email_verified {
        set_setting(&c, "sync_enabled", "1")?;
    }
    Ok(AuthSession {
        token: body.access_token,
        refresh_token: Some(body.refresh_token),
        device_id: Some(body.device_id),
        nickname,
        email: Some(body.user.email),
        email_verified: body.user.email_verified,
        server_url: Some(base.to_string()),
    })
}

#[tauri::command]
pub fn register(
    state: State<DbState>,
    email: String,
    password: String,
    server_url: Option<String>,
) -> AppResult<AuthSession> {
    let base = api_base(server_url.clone());
    let normalized_email = email.trim().to_lowercase();
    let nickname = normalized_email.split('@').next().map(|v| v.to_string());
    let response = reqwest::blocking::Client::new()
        .post(format!("{base}/api/auth/register"))
        .json(&ServerRegisterRequest {
            email: normalized_email.clone(),
            password: password.clone(),
            nickname,
        })
        .send()
        .map_err(|e| AppError::Auth(format!("register failed: {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::Auth(
            response.text().unwrap_or_else(|_| "register failed".into()),
        ));
    }
    request_auth("login", normalized_email, password, server_url, &state)
}

#[tauri::command]
pub fn login(
    state: State<DbState>,
    email: String,
    password: String,
    server_url: Option<String>,
) -> AppResult<AuthSession> {
    request_auth("login", email, password, server_url, &state)
}

#[tauri::command]
pub fn refresh_cloud_session(state: State<DbState>) -> AppResult<Option<AuthSession>> {
    let (base, refresh_token, device_id) = {
        let c = conn(&state);
        let base: Option<String> = c
            .query_row("SELECT server_url FROM sync_meta WHERE id = 1", [], |r| {
                r.get(0)
            })
            .ok()
            .flatten();
        (
            api_base(base),
            get_setting(&c, "cloud_refresh_token"),
            get_setting(&c, "cloud_device_id"),
        )
    };
    let (Some(refresh_token), Some(device_id)) = (refresh_token, device_id) else {
        return Ok(None);
    };
    let response = reqwest::blocking::Client::new()
        .post(format!("{base}/api/auth/refresh"))
        .json(&RefreshRequest {
            refresh_token,
            device_id,
        })
        .send()
        .map_err(|e| AppError::Auth(format!("refresh failed: {e}")))?;
    if !response.status().is_success() {
        return Ok(None);
    }
    let body: ServerAuthResponse = response
        .json()
        .map_err(|e| AppError::Auth(format!("invalid refresh response: {e}")))?;
    persist_session(&state, &base, body).map(Some)
}

#[tauri::command]
pub fn send_email_verification_code(state: State<DbState>) -> AppResult<()> {
    let session =
        current_session(state.clone())?.ok_or_else(|| AppError::Auth("not logged in".into()))?;
    let base = api_base(session.server_url.clone());
    let response = reqwest::blocking::Client::new()
        .post(format!("{base}/api/email/send-verification-code"))
        .bearer_auth(&session.token)
        .json(&EmailCodeRequest {
            purpose: "verify_email".into(),
        })
        .send()
        .map_err(|e| AppError::Auth(format!("send verification failed: {e}")))?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(AppError::Auth(
            response
                .text()
                .unwrap_or_else(|_| "send verification failed".into()),
        ))
    }
}

#[tauri::command]
pub fn verify_email_code(state: State<DbState>, code: String) -> AppResult<AuthSession> {
    let session =
        current_session(state.clone())?.ok_or_else(|| AppError::Auth("not logged in".into()))?;
    let base = api_base(session.server_url.clone());
    let response = reqwest::blocking::Client::new()
        .post(format!("{base}/api/email/verify"))
        .bearer_auth(&session.token)
        .json(&VerifyEmailRequest { code })
        .send()
        .map_err(|e| AppError::Auth(format!("verify email failed: {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::Auth(
            response
                .text()
                .unwrap_or_else(|_| "verify email failed".into()),
        ));
    }
    refresh_cloud_session(state)?
        .ok_or_else(|| AppError::Auth("email verified, please login again".into()))
}

#[tauri::command]
pub fn list_cloud_devices(state: State<DbState>) -> AppResult<Vec<CloudDevice>> {
    let session =
        current_session(state.clone())?.ok_or_else(|| AppError::Auth("not logged in".into()))?;
    let base = api_base(session.server_url.clone());
    let response = reqwest::blocking::Client::new()
        .get(format!("{base}/api/devices"))
        .bearer_auth(&session.token)
        .send()
        .map_err(|e| AppError::Auth(format!("load devices failed: {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::Auth(
            response
                .text()
                .unwrap_or_else(|_| "load devices failed".into()),
        ));
    }
    response
        .json()
        .map_err(|e| AppError::Auth(format!("invalid devices response: {e}")))
}

#[tauri::command]
pub fn rename_cloud_device(
    state: State<DbState>,
    device_id: String,
    device_name: String,
) -> AppResult<()> {
    let session =
        current_session(state.clone())?.ok_or_else(|| AppError::Auth("not logged in".into()))?;
    let base = api_base(session.server_url.clone());
    let response = reqwest::blocking::Client::new()
        .patch(format!("{base}/api/devices/{device_id}"))
        .bearer_auth(&session.token)
        .json(&RenameDeviceRequest { device_name })
        .send()
        .map_err(|e| AppError::Auth(format!("rename device failed: {e}")))?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(AppError::Auth(
            response
                .text()
                .unwrap_or_else(|_| "rename device failed".into()),
        ))
    }
}

#[tauri::command]
pub fn revoke_cloud_device(state: State<DbState>, device_id: String) -> AppResult<()> {
    let session =
        current_session(state.clone())?.ok_or_else(|| AppError::Auth("not logged in".into()))?;
    let base = api_base(session.server_url.clone());
    let response = reqwest::blocking::Client::new()
        .delete(format!("{base}/api/devices/{device_id}"))
        .bearer_auth(&session.token)
        .send()
        .map_err(|e| AppError::Auth(format!("remove device failed: {e}")))?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(AppError::Auth(
            response
                .text()
                .unwrap_or_else(|_| "remove device failed".into()),
        ))
    }
}

#[tauri::command]
pub fn revoke_other_cloud_devices(state: State<DbState>) -> AppResult<()> {
    let session =
        current_session(state.clone())?.ok_or_else(|| AppError::Auth("not logged in".into()))?;
    let base = api_base(session.server_url.clone());
    let response = reqwest::blocking::Client::new()
        .post(format!("{base}/api/devices/revoke-others"))
        .bearer_auth(&session.token)
        .send()
        .map_err(|e| AppError::Auth(format!("remove other devices failed: {e}")))?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(AppError::Auth(
            response
                .text()
                .unwrap_or_else(|_| "remove other devices failed".into()),
        ))
    }
}

#[tauri::command]
pub fn request_cloud_device_wipe(state: State<DbState>, device_id: String) -> AppResult<()> {
    let session =
        current_session(state.clone())?.ok_or_else(|| AppError::Auth("not logged in".into()))?;
    let base = api_base(session.server_url.clone());
    let response = reqwest::blocking::Client::new()
        .post(format!("{base}/api/devices/{device_id}/request-wipe"))
        .bearer_auth(&session.token)
        .send()
        .map_err(|e| AppError::Auth(format!("request device cleanup failed: {e}")))?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(AppError::Auth(
            response
                .text()
                .unwrap_or_else(|_| "request device cleanup failed".into()),
        ))
    }
}

#[tauri::command]
pub fn mark_cloud_device_wiped(state: State<DbState>, device_id: String) -> AppResult<()> {
    let session =
        current_session(state.clone())?.ok_or_else(|| AppError::Auth("not logged in".into()))?;
    let base = api_base(session.server_url.clone());
    let response = reqwest::blocking::Client::new()
        .post(format!("{base}/api/devices/{device_id}/mark-wiped"))
        .bearer_auth(&session.token)
        .send()
        .map_err(|e| AppError::Auth(format!("mark device cleanup failed: {e}")))?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(AppError::Auth(
            response
                .text()
                .unwrap_or_else(|_| "mark device cleanup failed".into()),
        ))
    }
}

#[tauri::command]
pub fn logout(state: State<DbState>) -> AppResult<()> {
    if let Some(session) = current_session(state.clone())? {
        let base = api_base(session.server_url.clone());
        let _ = reqwest::blocking::Client::new()
            .post(format!("{base}/api/auth/logout"))
            .bearer_auth(&session.token)
            .send();
    }
    let c = conn(&state);
    c.execute("UPDATE sync_meta SET auth_token = NULL WHERE id = 1", [])?;
    c.execute(
        "DELETE FROM settings WHERE key IN (
            'cloud_refresh_token', 'cloud_device_id', 'auth_email', 'auth_nickname', 'auth_email_verified'
        )",
        [],
    )?;
    Ok(())
}

#[tauri::command]
pub fn current_session(state: State<DbState>) -> AppResult<Option<AuthSession>> {
    let c = conn(&state);
    let token: Option<String> = c
        .query_row("SELECT auth_token FROM sync_meta WHERE id = 1", [], |r| {
            r.get(0)
        })
        .ok()
        .flatten();
    let token = match token {
        Some(t) if !t.is_empty() => t,
        _ => return Ok(None),
    };
    let server_url: Option<String> = c
        .query_row("SELECT server_url FROM sync_meta WHERE id = 1", [], |r| {
            r.get(0)
        })
        .ok()
        .flatten();
    let email = get_setting(&c, "auth_email");
    let nickname = get_setting(&c, "auth_nickname")
        .or_else(|| email.clone())
        .unwrap_or_default();
    let email_verified = get_setting(&c, "auth_email_verified")
        .map(|v| matches!(v.as_str(), "1" | "true"))
        .unwrap_or(false);
    Ok(Some(AuthSession {
        token,
        nickname,
        email,
        email_verified,
        refresh_token: get_setting(&c, "cloud_refresh_token"),
        device_id: get_setting(&c, "cloud_device_id"),
        server_url,
    }))
}
