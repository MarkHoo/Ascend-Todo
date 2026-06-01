use rusqlite::{params, Connection};
use tauri::State;

use crate::db::DbState;
use crate::error::AppResult;
use crate::models::CalendarEntry;

fn conn<'a>(state: &'a DbState) -> std::sync::MutexGuard<'a, Connection> {
    state.conn.lock().expect("db lock")
}

/// Returns calendar entries whose due date falls within [start, end] inclusive (YYYY-MM-DD).
#[tauri::command]
pub fn calendar_range(
    state: State<DbState>,
    start: String,
    end: String,
) -> AppResult<Vec<CalendarEntry>> {
    let c = conn(&state);
    let mut stmt = c.prepare(
        "SELECT t.id, t.title, substr(COALESCE(t.due_at, ''), 1, 10) as d,
                substr(COALESCE(t.due_at, ''), 12, 5) as tm,
                t.list_id, l.name as list_name, l.board_id, b.name as board_name, b.color,
                t.is_completed, t.color,
                (t.reminder_at IS NOT NULL OR t.reminder_time IS NOT NULL) as has_reminder
         FROM tasks t
         JOIN lists l ON l.id = t.list_id
         JOIN boards b ON b.id = l.board_id
         WHERE substr(COALESCE(t.due_at, ''), 1, 10) BETWEEN ? AND ?
         ORDER BY t.due_at ASC",
    )?;
    let rows = stmt.query_map(params![start, end], |r| {
        Ok(CalendarEntry {
            id: r.get(0)?,
            title: r.get(1)?,
            date: r.get(2)?,
            time: r.get::<_, Option<String>>(3)?,
            list_id: r.get(4)?,
            list_name: r.get(5)?,
            board_id: r.get(6)?,
            board_name: r.get(7)?,
            board_color: r.get(8)?,
            is_completed: r.get::<_, i64>(9)? != 0,
            color: r.get(10)?,
            has_reminder: r.get::<_, i64>(11)? != 0,
            has_subtasks: false,
            subtask_count: 0,
            subtask_done: 0,
        })
    })?;
    let mut out: Vec<CalendarEntry> = Vec::new();
    for r in rows {
        let mut e = r?;
        let (total, done): (i64, i64) = c.query_row(
            "SELECT COUNT(*), COALESCE(SUM(CASE WHEN is_completed THEN 1 ELSE 0 END), 0)
             FROM subtasks WHERE task_id = ?",
            params![e.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        e.has_subtasks = total > 0;
        e.subtask_count = total as i32;
        e.subtask_done = done as i32;
        out.push(e);
    }
    Ok(out)
}
