use rusqlite::{params, Connection};
use tauri::State;

use crate::db::DbState;
use crate::error::AppResult;
use crate::models::AppSettings;

fn conn<'a>(state: &'a DbState) -> std::sync::MutexGuard<'a, Connection> {
    state.conn.lock().expect("db lock")
}

fn parse_settings(map: std::collections::HashMap<String, String>) -> AppSettings {
    let mut s = AppSettings::default();
    if let Some(v) = map.get("theme") {
        s.theme = v.clone();
    }
    if let Some(v) = map.get("display_size") {
        s.display_size = v.clone();
    }
    if let Some(v) = map.get("language") {
        s.language = v.clone();
    }
    if let Some(v) = map.get("week_start") {
        s.week_start = v.clone();
    }
    if let Some(v) = map.get("pomodoro_duration") {
        s.pomodoro_duration = v.parse().unwrap_or(s.pomodoro_duration);
    }
    if let Some(v) = map.get("pomodoro_long_break") {
        s.pomodoro_long_break = v.parse().unwrap_or(s.pomodoro_long_break);
    }
    if let Some(v) = map.get("auto_update") {
        s.auto_update = matches!(v.as_str(), "1" | "true");
    }
    if let Some(v) = map.get("sync_enabled") {
        s.sync_enabled = matches!(v.as_str(), "1" | "true");
    }
    if let Some(v) = map.get("sync_server_url") {
        s.sync_server_url = if v.is_empty() { None } else { Some(v.clone()) };
    }
    if let Some(v) = map.get("reminder_sound") {
        s.reminder_sound = v.clone();
    }
    if let Some(v) = map.get("notification_enabled") {
        s.notification_enabled = matches!(v.as_str(), "1" | "true");
    }
    if let Some(v) = map.get("motivational_quotes") {
        s.motivational_quotes = matches!(v.as_str(), "1" | "true");
    }
    if let Some(v) = map.get("auto_start") {
        s.auto_start = matches!(v.as_str(), "1" | "true");
    }
    if let Some(v) = map.get("minimize_to_tray") {
        s.minimize_to_tray = matches!(v.as_str(), "1" | "true");
    }
    if let Some(v) = map.get("calendar_default_timed_reminder_minutes") {
        s.calendar_default_timed_reminder_minutes = v.parse().unwrap_or(s.calendar_default_timed_reminder_minutes);
    }
    if let Some(v) = map.get("calendar_default_all_day_reminder") {
        s.calendar_default_all_day_reminder = v.clone();
    }
    if let Some(v) = map.get("calendar_default_duration_minutes") {
        s.calendar_default_duration_minutes = v.parse().unwrap_or(s.calendar_default_duration_minutes);
    }
    if let Some(v) = map.get("calendar_default_event_color") {
        s.calendar_default_event_color = v.clone();
    }
    if let Some(v) = map.get("calendar_event_density") {
        s.calendar_event_density = v.clone();
    }
    s
}

#[tauri::command]
pub fn get_settings(state: State<DbState>) -> AppResult<AppSettings> {
    let c = conn(&state);
    let mut stmt = c.prepare("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    })?;
    let mut map = std::collections::HashMap::new();
    for r in rows {
        let (k, v) = r?;
        map.insert(k, v);
    }
    Ok(parse_settings(map))
}

#[tauri::command]
pub fn set_setting(state: State<DbState>, key: String, value: String) -> AppResult<()> {
    let c = conn(&state);
    c.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

#[tauri::command]
pub fn has_setting(state: State<DbState>, key: String) -> AppResult<bool> {
    let c = conn(&state);
    let count: i32 = c
        .query_row(
            "SELECT COUNT(*) FROM settings WHERE key = ?",
            params![key],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(count > 0)
}

#[tauri::command]
pub fn save_settings(state: State<DbState>, settings: AppSettings) -> AppResult<()> {
    let pairs: Vec<(&str, String)> = vec![
        ("theme", settings.theme.clone()),
        ("display_size", settings.display_size.clone()),
        ("language", settings.language.clone()),
        ("week_start", settings.week_start.clone()),
        ("pomodoro_duration", settings.pomodoro_duration.to_string()),
        ("pomodoro_long_break", settings.pomodoro_long_break.to_string()),
        ("auto_update", (settings.auto_update as i32).to_string()),
        ("sync_enabled", (settings.sync_enabled as i32).to_string()),
        ("sync_server_url", settings.sync_server_url.clone().unwrap_or_default()),
        ("reminder_sound", settings.reminder_sound.clone()),
        ("notification_enabled", (settings.notification_enabled as i32).to_string()),
        ("motivational_quotes", (settings.motivational_quotes as i32).to_string()),
        ("auto_start", (settings.auto_start as i32).to_string()),
        ("minimize_to_tray", (settings.minimize_to_tray as i32).to_string()),
        ("calendar_default_timed_reminder_minutes", settings.calendar_default_timed_reminder_minutes.to_string()),
        ("calendar_default_all_day_reminder", settings.calendar_default_all_day_reminder.clone()),
        ("calendar_default_duration_minutes", settings.calendar_default_duration_minutes.to_string()),
        ("calendar_default_event_color", settings.calendar_default_event_color.clone()),
        ("calendar_event_density", settings.calendar_event_density.clone()),
    ];
    let c = conn(&state);
    let tx = c.unchecked_transaction()?;
    for (k, v) in pairs {
        tx.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![k, v],
        )?;
    }
    tx.commit()?;
    Ok(())
}
