use rusqlite::{params, Connection};
use tauri::State;

use crate::db::{now, DbState};
use crate::error::{AppError, AppResult};
use crate::models::UserProfile;

fn conn<'a>(state: &'a DbState) -> std::sync::MutexGuard<'a, Connection> {
    state.conn.lock().expect("db lock")
}

#[tauri::command]
pub fn get_profile(state: State<DbState>) -> AppResult<UserProfile> {
    let c = conn(&state);
    let row = c
        .query_row(
            "SELECT id, nickname, avatar, phone, email, signature, updated_at
             FROM user_profile WHERE id = 'me'",
            [],
            |r| {
                Ok(UserProfile {
                    id: r.get(0)?,
                    nickname: r.get(1)?,
                    avatar: r.get(2)?,
                    phone: r.get(3)?,
                    email: r.get(4)?,
                    signature: r.get(5)?,
                    updated_at: r.get(6)?,
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("profile".into()),
            other => AppError::Sqlite(other),
        })?;
    Ok(row)
}

#[tauri::command]
pub fn save_profile(
    state: State<DbState>,
    nickname: Option<String>,
    avatar: Option<Option<String>>,
    phone: Option<Option<String>>,
    email: Option<Option<String>>,
    signature: Option<Option<String>>,
) -> AppResult<()> {
    let c = conn(&state);
    let mut avatar_v = None::<Option<String>>;
    let mut phone_v = None::<Option<String>>;
    let mut email_v = None::<Option<String>>;
    let mut sig_v = None::<Option<String>>;
    if let Some(v) = avatar {
        avatar_v = Some(v);
    }
    if let Some(v) = phone {
        phone_v = Some(v);
    }
    if let Some(v) = email {
        email_v = Some(v);
    }
    if let Some(v) = signature {
        sig_v = Some(v);
    }
    c.execute(
        "UPDATE user_profile SET
            nickname = COALESCE(?, nickname),
            avatar = CASE WHEN ? THEN ? ELSE avatar END,
            phone = CASE WHEN ? THEN ? ELSE phone END,
            email = CASE WHEN ? THEN ? ELSE email END,
            signature = CASE WHEN ? THEN ? ELSE signature END,
            updated_at = ?
         WHERE id = 'me'",
        params![
            nickname,
            avatar_v.is_some() as i64, avatar_v.unwrap_or(None),
            phone_v.is_some() as i64, phone_v.unwrap_or(None),
            email_v.is_some() as i64, email_v.unwrap_or(None),
            sig_v.is_some() as i64, sig_v.unwrap_or(None),
            now(),
        ],
    )?;
    Ok(())
}
