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
    c.execute(
        "UPDATE pomodoro_sessions SET ended_at = ?, duration_seconds = ?, completed = ? WHERE id = ?",
        params![now(), duration_seconds, completed as i64, id],
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
        "SELECT id, task_id, mode, duration_seconds, started_at, ended_at, completed
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
pub fn pomodoro_stats(
    state: State<DbState>,
    days: Option<i32>,
) -> AppResult<PomodoroStats> {
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
