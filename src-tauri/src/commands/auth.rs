use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use tauri::State;
use uuid::Uuid;

use crate::db::{now, DbState};
use crate::error::{AppError, AppResult};
use crate::models::AuthSession;

fn conn<'a>(state: &'a DbState) -> std::sync::MutexGuard<'a, Connection> {
    state.conn.lock().expect("db lock")
}

fn hash_pw(pw: &str) -> String {
    let mut h = Sha256::new();
    h.update(pw.as_bytes());
    hex::encode(h.finalize())
}

/// Register a local account (Mock). Persists password hash in sync_meta. Returns session.
#[tauri::command]
pub fn register(
    state: State<DbState>,
    nickname: String,
    password: String,
    server_url: Option<String>,
) -> AppResult<AuthSession> {
    if nickname.trim().is_empty() {
        return Err(AppError::Invalid("nickname required".into()));
    }
    if password.len() < 4 {
        return Err(AppError::Invalid("password too short".into()));
    }
    let c = conn(&state);
    let token = Uuid::new_v4().to_string();
    let pw_hash = hash_pw(&password);
    c.execute(
        "UPDATE sync_meta SET auth_token = ?, server_url = ? WHERE id = 1",
        params![&token, &server_url],
    )?;
    c.execute(
        "INSERT INTO settings (key, value) VALUES ('auth_nickname', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![&nickname],
    )?;
    c.execute(
        "INSERT INTO settings (key, value) VALUES ('auth_pw_hash', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![&pw_hash],
    )?;
    c.execute(
        "UPDATE user_profile SET nickname = ?, updated_at = ? WHERE id = 'me'",
        params![&nickname, now()],
    )?;
    Ok(AuthSession {
        token,
        nickname,
        server_url,
    })
}

/// Login a local account (Mock). Verifies password and returns session.
#[tauri::command]
pub fn login(
    state: State<DbState>,
    nickname: String,
    password: String,
    server_url: Option<String>,
) -> AppResult<AuthSession> {
    let c = conn(&state);
    let stored_nick: Option<String> = c
        .query_row(
            "SELECT value FROM settings WHERE key = 'auth_nickname'",
            [],
            |r| r.get(0),
        )
        .ok();
    let stored_pw: Option<String> = c
        .query_row(
            "SELECT value FROM settings WHERE key = 'auth_pw_hash'",
            [],
            |r| r.get(0),
        )
        .ok();
    match (stored_nick, stored_pw) {
        (Some(n), Some(p)) if n == nickname && p == hash_pw(&password) => {
            let token = Uuid::new_v4().to_string();
            c.execute(
                "UPDATE sync_meta SET auth_token = ?, server_url = ? WHERE id = 1",
                params![&token, &server_url],
            )?;
            Ok(AuthSession {
                token,
                nickname: n,
                server_url,
            })
        }
        (Some(n), Some(_)) if n != nickname => {
            Err(AppError::Auth("nickname not found".into()))
        }
        _ => Err(AppError::Auth("invalid credentials".into())),
    }
}

#[tauri::command]
pub fn logout(state: State<DbState>) -> AppResult<()> {
    let c = conn(&state);
    c.execute(
        "UPDATE sync_meta SET auth_token = NULL, server_url = NULL WHERE id = 1",
        [],
    )?;
    c.execute("DELETE FROM settings WHERE key IN ('auth_nickname', 'auth_pw_hash')", [])?;
    Ok(())
}

#[tauri::command]
pub fn current_session(state: State<DbState>) -> AppResult<Option<AuthSession>> {
    let c = conn(&state);
    let token: Option<String> = c
        .query_row("SELECT auth_token FROM sync_meta WHERE id = 1", [], |r| r.get(0))
        .ok()
        .flatten();
    let token = match token {
        Some(t) if !t.is_empty() => t,
        _ => return Ok(None),
    };
    let nickname: Option<String> = c
        .query_row(
            "SELECT value FROM settings WHERE key = 'auth_nickname'",
            [],
            |r| r.get(0),
        )
        .ok();
    let server_url: Option<String> = c
        .query_row(
            "SELECT server_url FROM sync_meta WHERE id = 1",
            [],
            |r| r.get(0),
        )
        .ok()
        .flatten();
    Ok(Some(AuthSession {
        token,
        nickname: nickname.unwrap_or_default(),
        server_url,
    }))
}
