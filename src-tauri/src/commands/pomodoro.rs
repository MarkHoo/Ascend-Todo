use rusqlite::{params, Connection};
use tauri::State;

use crate::db::{new_id, now, DbState};
use crate::error::AppResult;
use crate::models::{DailyPomodoroCount, PomodoroSession, PomodoroStats};

fn conn<'a>(state: &'a DbState) -> std::sync::MutexGuard<'a, Connection> {
    state.conn.lock().expect("db lock")
}

#[tauri::command]
pub fn start_pomodoro(
    state: State<DbState>,
    task_id: Option<String>,
    mode: String,
    duration_seconds: i32,
) -> AppResult<PomodoroSession> {
    let c = conn(&state);
    let id = new_id();
    let started_at = now();
    c.execute(
        "INSERT INTO pomodoro_sessions (id, task_id, mode, duration_seconds, started_at, completed)
         VALUES (?, ?, ?, ?, ?, 0)",
        params![id, task_id, mode, duration_seconds, started_at],
    )?;
    Ok(PomodoroSession {
        id,
        task_id,
        mode,
        duration_seconds,
        started_at,
        ended_at: None,
        completed: false,
        source_event_id: None,
        source_title: None,
    })
}

#[tauri::command]
pub fn end_pomodoro(
    state: State<DbState>,
    id: String,
    duration_seconds: i32,
    completed: bool,
) -> AppResult<()> {
    let c = conn(&state);
    let session: Option<(Option<String>, String, String, Option<String>)> = c
        .query_row(
            "SELECT task_id, mode, started_at, source_title FROM pomodoro_sessions WHERE id = ?",
            params![id.clone()],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .ok();
    let ended_at = session
        .as_ref()
        .and_then(|(_, _, started_at, _)| pomodoro_end_at(started_at, duration_seconds))
        .unwrap_or_else(now);
    c.execute(
        "UPDATE pomodoro_sessions SET ended_at = ?, duration_seconds = ?, completed = ? WHERE id = ?",
        params![ended_at, duration_seconds, completed as i64, id.clone()],
    )?;
    if completed {
        if let Some((Some(task_id), mode, started_at, source_title)) = session {
            insert_pomodoro_activity_log(
                &c,
                &task_id,
                &id,
                &mode,
                duration_seconds,
                &started_at,
                source_title.as_deref(),
            )?;
        }
    }
    Ok(())
}

fn pomodoro_end_at(started_at: &str, duration_seconds: i32) -> Option<String> {
    if duration_seconds <= 0 {
        return None;
    }
    chrono::DateTime::parse_from_rfc3339(started_at)
        .ok()
        .map(|start| (start + chrono::Duration::seconds(duration_seconds as i64)).to_rfc3339())
}

fn insert_pomodoro_activity_log(
    c: &Connection,
    task_id: &str,
    session_id: &str,
    mode: &str,
    duration_seconds: i32,
    started_at: &str,
    source_title: Option<&str>,
) -> AppResult<()> {
    let minutes = ((duration_seconds as f64) / 60.0).round().max(1.0) as i32;
    let detail = format!(
        "{} min · {}{}",
        minutes,
        if mode == "countup" {
            "count up"
        } else {
            "countdown"
        },
        source_title
            .map(|title| format!(" · {}", title))
            .unwrap_or_default()
    );
    c.execute(
        "INSERT OR IGNORE INTO task_activity_logs
            (id, task_id, kind, title, detail, source_id, duration_seconds, created_at)
         VALUES (?, ?, 'pomodoro', ?, ?, ?, ?, ?)",
        params![
            crate::db::new_id(),
            task_id,
            "Pomodoro focus completed",
            detail,
            session_id,
            duration_seconds,
            started_at,
        ],
    )?;
    Ok(())
}

#[tauri::command]
pub fn list_pomodoros(
    state: State<DbState>,
    limit: Option<i32>,
) -> AppResult<Vec<PomodoroSession>> {
    let c = conn(&state);
    let lim = limit.unwrap_or(200);
    let mut stmt = c.prepare(
        "SELECT id, task_id, mode, duration_seconds, started_at, ended_at, completed,
                source_event_id, source_title
         FROM pomodoro_sessions ORDER BY started_at DESC LIMIT ?",
    )?;
    let rows = stmt.query_map(params![lim], |r| {
        Ok(PomodoroSession {
            id: r.get(0)?,
            task_id: r.get(1)?,
            mode: r.get(2)?,
            duration_seconds: r.get(3)?,
            started_at: r.get(4)?,
            ended_at: r.get(5)?,
            completed: r.get::<_, i64>(6)? != 0,
            source_event_id: r.get(7)?,
            source_title: r.get(8)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

#[tauri::command]
pub fn delete_pomodoro(state: State<DbState>, id: String) -> AppResult<()> {
    let c = conn(&state);
    c.execute("DELETE FROM pomodoro_sessions WHERE id = ?", params![id])?;
    Ok(())
}

#[tauri::command]
pub fn pomodoro_stats(state: State<DbState>, days: Option<i32>) -> AppResult<PomodoroStats> {
    let c = conn(&state);
    let days = days.unwrap_or(14);

    let total_sessions: i32 = c
        .query_row("SELECT COUNT(*) FROM pomodoro_sessions", [], |r| r.get(0))
        .unwrap_or(0);
    let total_seconds: i32 = c
        .query_row(
            "SELECT COALESCE(SUM(duration_seconds), 0) FROM pomodoro_sessions",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let completed_sessions: i32 = c
        .query_row(
            "SELECT COUNT(*) FROM pomodoro_sessions WHERE completed = 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let mut stmt = c.prepare(
        "SELECT substr(started_at, 1, 10) as d, COUNT(*), COALESCE(SUM(duration_seconds), 0)
         FROM pomodoro_sessions
         WHERE started_at >= datetime('now', ?)
         GROUP BY d ORDER BY d ASC",
    )?;
    let interval = format!("-{} days", days);
    let rows = stmt.query_map(params![interval], |r| {
        Ok(DailyPomodoroCount {
            date: r.get(0)?,
            count: r.get(1)?,
            seconds: r.get(2)?,
        })
    })?;
    let mut by_day = Vec::new();
    for r in rows {
        by_day.push(r?);
    }
    Ok(PomodoroStats {
        total_sessions,
        total_seconds,
        completed_sessions,
        by_day,
    })
}
