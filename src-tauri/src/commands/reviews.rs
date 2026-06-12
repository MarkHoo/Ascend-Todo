use rusqlite::{params, Connection};
use tauri::State;

use crate::db::{new_id, now, DbState};
use crate::error::AppResult;
use crate::models::ReviewReport;

fn conn<'a>(state: &'a DbState) -> std::sync::MutexGuard<'a, Connection> {
    state.conn.lock().expect("db lock")
}

fn row_to_review(row: &rusqlite::Row) -> rusqlite::Result<ReviewReport> {
    Ok(ReviewReport {
        id: row.get(0)?,
        period_type: row.get(1)?,
        period_start: row.get(2)?,
        period_end: row.get(3)?,
        highlights: row.get(4)?,
        blockers: row.get(5)?,
        lessons: row.get(6)?,
        next_actions: row.get(7)?,
        score: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

#[tauri::command]
pub fn get_review_report(
    state: State<DbState>,
    period_type: String,
    period_start: String,
    period_end: String,
) -> AppResult<Option<ReviewReport>> {
    let c = conn(&state);
    let mut stmt = c.prepare(
        "SELECT id, period_type, period_start, period_end, highlights, blockers,
                lessons, next_actions, score, created_at, updated_at
         FROM review_reports
         WHERE period_type = ? AND period_start = ? AND period_end = ?",
    )?;
    let mut rows = stmt.query(params![period_type, period_start, period_end])?;
    Ok(match rows.next()? {
        Some(row) => Some(row_to_review(row)?),
        None => None,
    })
}

#[tauri::command]
pub fn save_review_report(
    state: State<DbState>,
    period_type: String,
    period_start: String,
    period_end: String,
    highlights: String,
    blockers: String,
    lessons: String,
    next_actions: String,
    score: Option<i32>,
) -> AppResult<ReviewReport> {
    let c = conn(&state);
    let timestamp = now();
    let id = new_id();
    c.execute(
        "INSERT INTO review_reports
            (id, period_type, period_start, period_end, highlights, blockers,
             lessons, next_actions, score, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(period_type, period_start, period_end) DO UPDATE SET
            highlights = excluded.highlights,
            blockers = excluded.blockers,
            lessons = excluded.lessons,
            next_actions = excluded.next_actions,
            score = excluded.score,
            updated_at = excluded.updated_at",
        params![
            id,
            period_type,
            period_start,
            period_end,
            highlights,
            blockers,
            lessons,
            next_actions,
            score,
            timestamp,
            timestamp
        ],
    )?;

    c.query_row(
        "SELECT id, period_type, period_start, period_end, highlights, blockers,
                lessons, next_actions, score, created_at, updated_at
         FROM review_reports
         WHERE period_type = ? AND period_start = ? AND period_end = ?",
        params![period_type, period_start, period_end],
        row_to_review,
    )
    .map_err(Into::into)
}
