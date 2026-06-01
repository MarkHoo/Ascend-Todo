use rusqlite::{params, Connection};
use tauri::State;

use crate::db::DbState;
use crate::error::AppResult;
use crate::models::ReminderItem;

fn conn<'a>(state: &'a DbState) -> std::sync::MutexGuard<'a, Connection> {
    state.conn.lock().expect("db lock")
}

/// Returns all pending reminders (incomplete tasks with reminder_at or reminder_time set)
/// where the reminder time is now or in the past.
#[tauri::command]
pub fn pending_reminders(state: State<DbState>, now_iso: String) -> AppResult<Vec<ReminderItem>> {
    let c = conn(&state);
    let mut stmt = c.prepare(
        "SELECT t.id, t.title, t.due_at, t.reminder_at, t.reminder_time, t.is_completed, b.name, l.name
         FROM tasks t
         JOIN lists l ON l.id = t.list_id
         JOIN boards b ON b.id = l.board_id
         WHERE t.is_completed = 0
           AND (
                (t.reminder_at IS NOT NULL AND t.reminder_at <= ?)
             OR (t.reminder_time IS NOT NULL AND t.reminder_time <= substr(?, 12, 5))
           )
         ORDER BY t.reminder_at ASC",
    )?;
    let rows = stmt.query_map(params![&now_iso, &now_iso], |r| {
        Ok(ReminderItem {
            task_id: r.get(0)?,
            task_title: r.get(1)?,
            due_at: r.get(2)?,
            reminder_at: r.get(3)?,
            reminder_time: r.get(4)?,
            is_completed: r.get::<_, i64>(5)? != 0,
            board_name: r.get(6)?,
            list_name: r.get(7)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

/// All future reminders (for UI display)
#[tauri::command]
pub fn upcoming_reminders(state: State<DbState>, limit: Option<i32>) -> AppResult<Vec<ReminderItem>> {
    let c = conn(&state);
    let lim = limit.unwrap_or(50);
    let mut stmt = c.prepare(
        "SELECT t.id, t.title, t.due_at, t.reminder_at, t.reminder_time, t.is_completed, b.name, l.name
         FROM tasks t
         JOIN lists l ON l.id = t.list_id
         JOIN boards b ON b.id = l.board_id
         WHERE t.is_completed = 0
           AND (t.reminder_at IS NOT NULL OR t.reminder_time IS NOT NULL OR t.due_at IS NOT NULL)
         ORDER BY COALESCE(t.due_at, t.reminder_at) ASC
         LIMIT ?",
    )?;
    let rows = stmt.query_map(params![lim], |r| {
        Ok(ReminderItem {
            task_id: r.get(0)?,
            task_title: r.get(1)?,
            due_at: r.get(2)?,
            reminder_at: r.get(3)?,
            reminder_time: r.get(4)?,
            is_completed: r.get::<_, i64>(5)? != 0,
            board_name: r.get(6)?,
            list_name: r.get(7)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}
