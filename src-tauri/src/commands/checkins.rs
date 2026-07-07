use rusqlite::{params, Connection};
use tauri::State;

use crate::db::{new_id, today, DbState};
use crate::error::AppResult;
use crate::models::{CheckIn, CheckInSummary};

fn conn<'a>(state: &'a DbState) -> std::sync::MutexGuard<'a, Connection> {
    state.conn.lock().expect("db lock")
}

#[tauri::command]
pub fn check_in_today(state: State<DbState>) -> AppResult<CheckIn> {
    let c = conn(&state);
    let date = today();
    // Upsert: increment if exists, else insert
    c.execute(
        "INSERT INTO check_ins (id, date, count) VALUES (?, ?, 1)
         ON CONFLICT(date) DO UPDATE SET count = count + 1",
        params![new_id(), date],
    )?;
    let row: CheckIn = c.query_row(
        "SELECT id, date, count FROM check_ins WHERE date = ?",
        params![date],
        |r| {
            Ok(CheckIn {
                id: r.get(0)?,
                date: r.get(1)?,
                count: r.get(2)?,
            })
        },
    )?;
    Ok(row)
}

#[tauri::command]
pub fn list_check_ins(
    state: State<DbState>,
    start: Option<String>,
    end: Option<String>,
) -> AppResult<Vec<CheckIn>> {
    let c = conn(&state);
    let (s, e) = (
        start.unwrap_or_else(|| "0000-00-00".into()),
        end.unwrap_or_else(|| "9999-12-31".into()),
    );
    let mut stmt = c.prepare(
        "SELECT id, date, count FROM check_ins WHERE date BETWEEN ? AND ? ORDER BY date ASC",
    )?;
    let rows = stmt.query_map(params![s, e], |r| {
        Ok(CheckIn {
            id: r.get(0)?,
            date: r.get(1)?,
            count: r.get(2)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

#[tauri::command]
pub fn check_in_summary(state: State<DbState>) -> AppResult<CheckInSummary> {
    let c = conn(&state);
    let total: i32 = c
        .query_row("SELECT COALESCE(SUM(count), 0) FROM check_ins", [], |r| {
            r.get(0)
        })
        .unwrap_or(0);
    let today_date = today();
    let today_count: i32 = c
        .query_row(
            "SELECT count FROM check_ins WHERE date = ?",
            params![today_date],
            |r| r.get(0),
        )
        .unwrap_or(0);

    // Compute streak: count consecutive days from today backwards with count > 0
    let mut stmt = c.prepare("SELECT date, count FROM check_ins ORDER BY date DESC LIMIT 365")?;
    let rows: Vec<(String, i32)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .filter_map(|r| r.ok())
        .collect();

    let mut streak: i32 = 0;
    let today = chrono::Local::now().date_naive();
    for (d, c) in rows.iter() {
        let expected = today - chrono::Duration::days(streak as i64);
        if *d == expected.format("%Y-%m-%d").to_string() && *c > 0 {
            streak += 1;
        } else {
            break;
        }
    }

    let mut all_stmt = c.prepare(
        "SELECT id, date, count FROM check_ins WHERE date >= date('now', '-180 days') ORDER BY date ASC",
    )?;
    let all_rows = all_stmt.query_map([], |r| {
        Ok(CheckIn {
            id: r.get(0)?,
            date: r.get(1)?,
            count: r.get(2)?,
        })
    })?;
    let mut by_day = Vec::new();
    for r in all_rows {
        by_day.push(r?);
    }
    Ok(CheckInSummary {
        total,
        today_count,
        streak,
        by_day,
    })
}

#[tauri::command]
pub fn upsert_check_in(state: State<DbState>, date: String, count: i32) -> AppResult<CheckIn> {
    let c = conn(&state);
    c.execute(
        "INSERT INTO check_ins (id, date, count) VALUES (?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET count = excluded.count",
        params![new_id(), date, count],
    )?;
    let row: CheckIn = c.query_row(
        "SELECT id, date, count FROM check_ins WHERE date = ?",
        params![date],
        |r| {
            Ok(CheckIn {
                id: r.get(0)?,
                date: r.get(1)?,
                count: r.get(2)?,
            })
        },
    )?;
    Ok(row)
}
