use rusqlite::{params, Connection};
use tauri::State;

use crate::db::{new_id, now, DbState};
use crate::error::AppResult;
use crate::models::{KeyResult, KeyResultWithLogs, ProgressLog};

fn conn<'a>(state: &'a DbState) -> std::sync::MutexGuard<'a, Connection> {
    state.conn.lock().expect("db lock")
}

pub fn load_kr_internal(c: &Connection, id: &str) -> AppResult<KeyResult> {
    Ok(c.query_row(
        "SELECT id, goal_id, title, type, start_value, target_value, current_value,
                unit, weight, is_completed, position, created_at
         FROM key_results WHERE id = ?",
        params![id],
        |r| {
            Ok(KeyResult {
                id: r.get(0)?,
                goal_id: r.get(1)?,
                title: r.get(2)?,
                kr_type: r.get(3)?,
                start_value: r.get(4)?,
                target_value: r.get(5)?,
                current_value: r.get(6)?,
                unit: r.get(7)?,
                weight: r.get(8)?,
                is_completed: r.get::<_, i64>(9)? != 0,
                position: r.get(10)?,
                created_at: r.get(11)?,
            })
        },
    )?)
}

fn calculate_kr_progress(kr: &KeyResult) -> f64 {
    match kr.kr_type.as_str() {
        "boolean" => {
            if kr.is_completed { 100.0 } else { 0.0 }
        }
        "task" => {
            // For task-type, current_value = completed count, target_value = total count
            let range = kr.target_value - kr.start_value;
            if range.abs() < f64::EPSILON { 0.0 }
            else { ((kr.current_value - kr.start_value) / range * 100.0).max(0.0).min(100.0) }
        }
        _ => {
            let range = kr.target_value - kr.start_value;
            if range.abs() < f64::EPSILON {
                return 0.0;
            }
            let progress = (kr.current_value - kr.start_value) / range * 100.0;
            progress.max(0.0).min(100.0)
        }
    }
}

fn load_kr_with_logs(c: &Connection, kr_id: &str) -> AppResult<KeyResultWithLogs> {
    let kr = load_kr_internal(c, kr_id)?;
    let progress = calculate_kr_progress(&kr);

    let mut log_stmt = c.prepare(
        "SELECT id, kr_id, old_value, new_value, comment, created_at
         FROM progress_logs WHERE kr_id = ? ORDER BY created_at DESC LIMIT 20",
    )?;
    let logs: Vec<ProgressLog> = log_stmt
        .query_map(params![kr_id], |r| {
            Ok(ProgressLog {
                id: r.get(0)?,
                kr_id: r.get(1)?,
                old_value: r.get(2)?,
                new_value: r.get(3)?,
                comment: r.get(4)?,
                created_at: r.get(5)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    let mut ms_stmt = c.prepare(
        "SELECT id, goal_id, title, is_completed, completed_at, position, created_at
         FROM milestones WHERE goal_id = ? ORDER BY position ASC",
    )?;
    let milestones: Vec<crate::models::Milestone> = ms_stmt
        .query_map(params![kr.goal_id], |r| {
            Ok(crate::models::Milestone {
                id: r.get(0)?,
                goal_id: r.get(1)?,
                title: r.get(2)?,
                is_completed: r.get::<_, i64>(3)? != 0,
                completed_at: r.get(4)?,
                position: r.get(5)?,
                created_at: r.get(6)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(KeyResultWithLogs {
        kr,
        progress,
        logs,
        milestones,
    })
}

#[tauri::command]
pub fn list_key_results(state: State<DbState>, goal_id: String) -> AppResult<Vec<KeyResultWithLogs>> {
    let c = conn(&state);
    let mut stmt = c.prepare(
        "SELECT id FROM key_results WHERE goal_id = ? ORDER BY position ASC",
    )?;
    let ids: Vec<String> = stmt
        .query_map(params![goal_id], |r| r.get(0))?
        .filter_map(|r| r.ok())
        .collect();

    let mut out = Vec::new();
    for id in ids {
        out.push(load_kr_with_logs(&c, &id)?);
    }
    Ok(out)
}

#[tauri::command]
pub fn create_key_result(
    state: State<DbState>,
    goal_id: String,
    title: String,
    kr_type: String,
    start_value: Option<f64>,
    target_value: Option<f64>,
    unit: Option<String>,
    weight: Option<i32>,
) -> AppResult<KeyResult> {
    let c = conn(&state);
    let id = new_id();
    let n = now();
    let max_pos: i32 = c
        .query_row(
            "SELECT COALESCE(MAX(position), -1) FROM key_results WHERE goal_id = ?",
            params![goal_id],
            |r| r.get(0),
        )
        .unwrap_or(-1);

    let sv = start_value.unwrap_or(0.0);
    let tv = target_value.unwrap_or(1.0);
    let w = weight.unwrap_or(20);

    c.execute(
        "INSERT INTO key_results
            (id, goal_id, title, type, start_value, target_value, current_value,
             unit, weight, is_completed, position, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
        params![id, goal_id, title, kr_type, sv, tv, sv, unit, w, max_pos + 1, n],
    )?;
    Ok(KeyResult {
        id,
        goal_id,
        title,
        kr_type,
        start_value: sv,
        target_value: tv,
        current_value: sv,
        unit,
        weight: w,
        is_completed: false,
        position: max_pos + 1,
        created_at: n,
    })
}

#[tauri::command]
pub fn update_key_result(
    state: State<DbState>,
    id: String,
    title: Option<String>,
    kr_type: Option<String>,
    start_value: Option<f64>,
    target_value: Option<f64>,
    unit: Option<String>,
    weight: Option<i32>,
) -> AppResult<()> {
    let c = conn(&state);
    let goal_id: String = c.query_row(
        "SELECT goal_id FROM key_results WHERE id = ?",
        params![id],
        |r| r.get(0),
    )?;
    c.execute(
        "UPDATE key_results SET
            title = COALESCE(?, title),
            type = COALESCE(?, type),
            start_value = COALESCE(?, start_value),
            target_value = COALESCE(?, target_value),
            unit = COALESCE(?, unit),
            weight = COALESCE(?, weight)
         WHERE id = ?",
        params![title, kr_type, start_value, target_value, unit, weight, id],
    )?;
    recalc_goal_progress(&c, &goal_id)?;
    Ok(())
}

#[tauri::command]
pub fn check_in_kr(
    state: State<DbState>,
    kr_id: String,
    new_value: f64,
    comment: Option<String>,
) -> AppResult<KeyResultWithLogs> {
    let c = conn(&state);
    let kr = load_kr_internal(&c, &kr_id)?;
    let old_value = kr.current_value;
    let n = now();

    // Update current_value
    c.execute(
        "UPDATE key_results SET current_value = ?, is_completed = ? WHERE id = ?",
        params![new_value, (new_value >= kr.target_value) as i64, kr_id],
    )?;

    // Log progress
    c.execute(
        "INSERT INTO progress_logs (id, kr_id, old_value, new_value, comment, created_at)
         VALUES (?, ?, ?, ?, ?, ?)",
        params![new_id(), kr_id, old_value, new_value, comment, n],
    )?;

    // Recalculate goal progress
    recalc_goal_progress(&c, &kr.goal_id)?;

    load_kr_with_logs(&c, &kr_id)
}

#[tauri::command]
pub fn toggle_kr_completed(state: State<DbState>, id: String) -> AppResult<bool> {
    let c = conn(&state);
    let kr = load_kr_internal(&c, &id)?;
    let new_val = !kr.is_completed;
    let cv = if new_val { kr.target_value } else { kr.start_value };
    c.execute(
        "UPDATE key_results SET is_completed = ?, current_value = ? WHERE id = ?",
        params![new_val as i64, cv, id],
    )?;
    // Log
    c.execute(
        "INSERT INTO progress_logs (id, kr_id, old_value, new_value, comment, created_at)
         VALUES (?, ?, ?, ?, ?, ?)",
        params![new_id(), id, kr.current_value, cv, if new_val { Some("Marked completed".to_string()) } else { None }, now()],
    )?;
    recalc_goal_progress(&c, &kr.goal_id)?;
    Ok(new_val)
}

#[tauri::command]
pub fn delete_key_result(state: State<DbState>, id: String) -> AppResult<()> {
    let c = conn(&state);
    let goal_id: String = c.query_row(
        "SELECT goal_id FROM key_results WHERE id = ?",
        params![id],
        |r| r.get(0),
    )?;
    c.execute("DELETE FROM key_results WHERE id = ?", params![id])?;
    recalc_goal_progress(&c, &goal_id)?;
    Ok(())
}

#[tauri::command]
pub fn reorder_key_results(state: State<DbState>, ids: Vec<String>) -> AppResult<()> {
    let c = conn(&state);
    let tx = c.unchecked_transaction()?;
    for (i, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE key_results SET position = ? WHERE id = ?",
            params![i as i32, id],
        )?;
    }
    tx.commit()?;
    Ok(())
}

#[tauri::command]
pub fn kr_progress_history(state: State<DbState>, kr_id: String, limit: Option<i32>) -> AppResult<Vec<ProgressLog>> {
    let c = conn(&state);
    let lim = limit.unwrap_or(50);
    let mut stmt = c.prepare(
        "SELECT id, kr_id, old_value, new_value, comment, created_at
         FROM progress_logs WHERE kr_id = ? ORDER BY created_at DESC LIMIT ?",
    )?;
    let rows = stmt.query_map(params![kr_id, lim], |r| {
        Ok(ProgressLog {
            id: r.get(0)?,
            kr_id: r.get(1)?,
            old_value: r.get(2)?,
            new_value: r.get(3)?,
            comment: r.get(4)?,
            created_at: r.get(5)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn recalc_goal_progress(c: &Connection, goal_id: &str) -> AppResult<()> {
    // Calculate weighted average of all KR progress
    let mut stmt = c.prepare(
        "SELECT type, start_value, target_value, current_value, weight, is_completed
         FROM key_results WHERE goal_id = ?",
    )?;
    let rows: Vec<(String, f64, f64, f64, i32, bool)> = stmt
        .query_map(params![goal_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, f64>(1)?,
                r.get::<_, f64>(2)?,
                r.get::<_, f64>(3)?,
                r.get::<_, i32>(4)?,
                r.get::<_, i64>(5)? != 0,
            ))
        })?
        .filter_map(|r| r.ok())
        .collect();

    if rows.is_empty() {
        return Ok(());
    }

    let mut weighted_sum = 0.0;
    let mut total_weight = 0i32;
    for (kr_type, sv, tv, cv, w, completed) in &rows {
        let progress = match kr_type.as_str() {
            "boolean" => if *completed { 100.0 } else { 0.0 },
            "task" => {
                let range = tv - sv;
                if range.abs() < f64::EPSILON { 0.0 }
                else { ((cv - sv) / range * 100.0).max(0.0).min(100.0) }
            },
            _ => {
                let range = tv - sv;
                if range.abs() < f64::EPSILON { 0.0 }
                else { ((cv - sv) / range * 100.0).max(0.0).min(100.0) }
            }
        };
        weighted_sum += progress * (*w as f64);
        total_weight += w;
    }

    let goal_progress = if total_weight > 0 {
        (weighted_sum / total_weight as f64).round() / 100.0
    } else {
        0.0
    };

    c.execute(
        "UPDATE goals SET progress_value = ?, updated_at = ? WHERE id = ?",
        params![goal_progress, now(), goal_id],
    )?;
    Ok(())
}
