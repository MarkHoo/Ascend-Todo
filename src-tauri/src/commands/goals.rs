use rusqlite::{params, Connection};
use tauri::State;

use crate::db::{new_id, now, DbState};
use crate::error::{AppError, AppResult};
use crate::models::{Goal, GoalWithDetails, Milestone};

fn conn<'a>(state: &'a DbState) -> std::sync::MutexGuard<'a, Connection> {
    state.conn.lock().expect("db lock")
}

fn load_goal(c: &Connection, id: &str) -> AppResult<Goal> {
    Ok(c.query_row(
        "SELECT id, title, description, color, icon, due_at, parent_goal_id, position, created_at, updated_at,
                progress_mode, progress_value, progress_total,
                category, start_date, weight, status, review_score, review_note
         FROM goals WHERE id = ?",
        params![id],
        |r| {
            Ok(Goal {
                id: r.get(0)?,
                title: r.get(1)?,
                description: r.get(2)?,
                color: r.get(3)?,
                icon: r.get(4)?,
                due_at: r.get(5)?,
                parent_goal_id: r.get(6)?,
                position: r.get(7)?,
                created_at: r.get(8)?,
                updated_at: r.get(9)?,
                progress_mode: r.get(10)?,
                progress_value: r.get(11)?,
                progress_total: r.get(12)?,
                category: r.get(13)?,
                start_date: r.get(14)?,
                weight: r.get(15)?,
                status: r.get(16)?,
                review_score: r.get(17)?,
                review_note: r.get(18)?,
            })
        },
    )?)
}

fn load_milestones(c: &Connection, goal_id: &str) -> AppResult<Vec<Milestone>> {
    let mut stmt = c.prepare(
        "SELECT id, goal_id, title, is_completed, completed_at, position, created_at
         FROM milestones WHERE goal_id = ? ORDER BY position ASC, created_at ASC",
    )?;
    let rows = stmt.query_map(params![goal_id], |r| {
        Ok(Milestone {
            id: r.get(0)?,
            goal_id: r.get(1)?,
            title: r.get(2)?,
            is_completed: r.get::<_, i64>(3)? != 0,
            completed_at: r.get(4)?,
            position: r.get(5)?,
            created_at: r.get(6)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

fn load_sub_goals(c: &Connection, parent_id: &str) -> AppResult<Vec<GoalWithDetails>> {
    let mut stmt = c.prepare(
        "SELECT id, title, description, color, icon, due_at, parent_goal_id, position, created_at, updated_at,
                progress_mode, progress_value, progress_total,
                category, start_date, weight, status, review_score, review_note
         FROM goals WHERE parent_goal_id = ? ORDER BY position ASC, created_at ASC",
    )?;
    let rows = stmt.query_map(params![parent_id], |r| {
        Ok(Goal {
            id: r.get(0)?,
            title: r.get(1)?,
            description: r.get(2)?,
            color: r.get(3)?,
            icon: r.get(4)?,
            due_at: r.get(5)?,
            parent_goal_id: r.get(6)?,
            position: r.get(7)?,
            created_at: r.get(8)?,
            updated_at: r.get(9)?,
            progress_mode: r.get(10)?,
            progress_value: r.get(11)?,
            progress_total: r.get(12)?,
            category: r.get(13)?,
            start_date: r.get(14)?,
            weight: r.get(15)?,
            status: r.get(16)?,
            review_score: r.get(17)?,
            review_note: r.get(18)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        let goal = row?;
        out.push(build_goal_with(c, goal)?);
    }
    Ok(out)
}

fn build_goal_with(c: &Connection, goal: Goal) -> AppResult<GoalWithDetails> {
    let milestones = load_milestones(c, &goal.id)?;
    let sub_goals = load_sub_goals(c, &goal.id)?;
    let key_results = load_key_results_for_goal(c, &goal.id).unwrap_or_default();
    let linked_tasks = load_linked_tasks(c, &goal.id).unwrap_or_default();
    let progress = if goal.progress_mode == "numeric" {
        if goal.progress_total > 0.0 {
            (goal.progress_value / goal.progress_total).min(1.0)
        } else {
            0.0
        }
    } else if !key_results.is_empty() {
        // Weighted average of KR progress
        let mut weighted_sum = 0.0;
        let mut total_weight = 0i32;
        for kr in &key_results {
            let kr_progress = calc_kr_progress(kr);
            weighted_sum += kr_progress * (kr.weight as f64);
            total_weight += kr.weight;
        }
        if total_weight > 0 { weighted_sum / (total_weight as f64 * 100.0) } else { 0.0 }
    } else {
        let total = milestones.len() + sub_goals.len();
        let done = milestones.iter().filter(|m| m.is_completed).count()
            + sub_goals.iter().filter(|g| g.progress >= 1.0).count();
        if total == 0 { 0.0 } else { done as f64 / total as f64 }
    };
    Ok(GoalWithDetails {
        goal,
        milestones,
        key_results,
        linked_tasks,
        sub_goals,
        progress,
    })
}

fn calc_kr_progress(kr: &crate::models::KeyResult) -> f64 {
    match kr.kr_type.as_str() {
        "boolean" => if kr.is_completed { 100.0 } else { 0.0 },
        _ => {
            let range = kr.target_value - kr.start_value;
            if range.abs() < f64::EPSILON { 0.0 }
            else { ((kr.current_value - kr.start_value) / range * 100.0).max(0.0).min(100.0) }
        }
    }
}

fn load_key_results_for_goal(c: &Connection, goal_id: &str) -> AppResult<Vec<crate::models::KeyResult>> {
    let mut stmt = c.prepare(
        "SELECT id, goal_id, title, type, start_value, target_value, current_value,
                unit, weight, is_completed, position, created_at
         FROM key_results WHERE goal_id = ? ORDER BY position ASC",
    )?;
    let rows = stmt.query_map(params![goal_id], |r| {
        Ok(crate::models::KeyResult {
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
    })?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

fn load_linked_tasks(c: &Connection, goal_id: &str) -> AppResult<Vec<crate::models::LinkedTask>> {
    let mut stmt = c.prepare(
        "SELECT t.id, t.title, t.is_completed, b.name, l.name
         FROM goal_tasks gt
         JOIN tasks t ON t.id = gt.task_id
         JOIN lists l ON l.id = t.list_id
         JOIN boards b ON b.id = l.board_id
         WHERE gt.goal_id = ?
         ORDER BY t.created_at DESC LIMIT 20",
    )?;
    let rows = stmt.query_map(params![goal_id], |r| {
        Ok(crate::models::LinkedTask {
            id: r.get(0)?,
            title: r.get(1)?,
            is_completed: r.get::<_, i64>(2)? != 0,
            board_name: r.get(3)?,
            list_name: r.get(4)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows { out.push(r?); }
    Ok(out)
}

#[tauri::command]
pub fn list_goals(state: State<DbState>) -> AppResult<Vec<GoalWithDetails>> {
    let c = conn(&state);
    let mut stmt = c.prepare(
        "SELECT id, title, description, color, icon, due_at, parent_goal_id, position, created_at, updated_at,
                progress_mode, progress_value, progress_total,
                category, start_date, weight, status, review_score, review_note
         FROM goals WHERE parent_goal_id IS NULL ORDER BY position ASC, created_at ASC",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(Goal {
            id: r.get(0)?,
            title: r.get(1)?,
            description: r.get(2)?,
            color: r.get(3)?,
            icon: r.get(4)?,
            due_at: r.get(5)?,
            parent_goal_id: r.get(6)?,
            position: r.get(7)?,
            created_at: r.get(8)?,
            updated_at: r.get(9)?,
            progress_mode: r.get(10)?,
            progress_value: r.get(11)?,
            progress_total: r.get(12)?,
            category: r.get(13)?,
            start_date: r.get(14)?,
            weight: r.get(15)?,
            status: r.get(16)?,
            review_score: r.get(17)?,
            review_note: r.get(18)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        let goal = row?;
        out.push(build_goal_with(&c, goal)?);
    }
    Ok(out)
}

#[tauri::command]
pub fn get_goal(state: State<DbState>, id: String) -> AppResult<GoalWithDetails> {
    let c = conn(&state);
    let goal = load_goal(&c, &id)?;
    build_goal_with(&c, goal)
}

#[tauri::command]
pub fn create_goal(
    state: State<DbState>,
    title: String,
    description: Option<String>,
    color: Option<String>,
    icon: Option<String>,
    due_at: Option<String>,
    parent_goal_id: Option<String>,
) -> AppResult<Goal> {
    let c = conn(&state);
    let id = new_id();
    let now = now();
    let max_pos: i32 = c
        .query_row(
            "SELECT COALESCE(MAX(position), -1) FROM goals WHERE COALESCE(parent_goal_id, '') = COALESCE(?, '')",
            params![parent_goal_id],
            |r| r.get(0),
        )
        .unwrap_or(-1);
    c.execute(
        "INSERT INTO goals
            (id, title, description, color, icon, due_at, parent_goal_id, position, created_at, updated_at,
             progress_mode, progress_value, progress_total, category, start_date, weight, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'percentage', 0, 100, NULL, NULL, 5, 'active')",
        params![id, title, description, color, icon, due_at, parent_goal_id, max_pos + 1, now, now],
    )?;
    Ok(Goal {
        id,
        title,
        description,
        color,
        icon,
        due_at,
        parent_goal_id,
        position: max_pos + 1,
        created_at: now.clone(),
        updated_at: now,
        progress_mode: "percentage".to_string(),
        progress_value: 0.0,
        progress_total: 100.0,
        category: None,
        start_date: None,
        weight: 5,
        status: "active".to_string(),
        review_score: None,
        review_note: None,
    })
}

#[tauri::command]
pub fn update_goal(
    state: State<DbState>,
    id: String,
    title: Option<String>,
    description: Option<Option<String>>,
    color: Option<Option<String>>,
    icon: Option<Option<String>>,
    due_at: Option<Option<String>>,
    progress_mode: Option<String>,
    progress_value: Option<f64>,
    progress_total: Option<f64>,
) -> AppResult<()> {
    let c = conn(&state);
    let mut desc_v = None::<Option<String>>;
    let mut color_v = None::<Option<String>>;
    let mut icon_v = None::<Option<String>>;
    let mut due_v = None::<Option<String>>;
    if let Some(d) = description {
        desc_v = Some(d);
    }
    if let Some(d) = color {
        color_v = Some(d);
    }
    if let Some(d) = icon {
        icon_v = Some(d);
    }
    if let Some(d) = due_at {
        due_v = Some(d);
    }
    c.execute(
        "UPDATE goals SET
            title = COALESCE(?, title),
            description = CASE WHEN ? THEN ? ELSE description END,
            color = CASE WHEN ? THEN ? ELSE color END,
            icon = CASE WHEN ? THEN ? ELSE icon END,
            due_at = CASE WHEN ? THEN ? ELSE due_at END,
            progress_mode = COALESCE(?, progress_mode),
            progress_value = COALESCE(?, progress_value),
            progress_total = COALESCE(?, progress_total),
            updated_at = ?
         WHERE id = ?",
        params![
            title,
            desc_v.is_some() as i64, desc_v.unwrap_or(None),
            color_v.is_some() as i64, color_v.unwrap_or(None),
            icon_v.is_some() as i64, icon_v.unwrap_or(None),
            due_v.is_some() as i64, due_v.unwrap_or(None),
            progress_mode, progress_value, progress_total,
            now(), id,
        ],
    )?;
    Ok(())
}

#[tauri::command]
pub fn delete_goal(state: State<DbState>, id: String) -> AppResult<()> {
    let c = conn(&state);
    // Recursive delete (sub_goals cascade by parent_goal_id)
    let mut to_delete = vec![id];
    let mut i = 0;
    while i < to_delete.len() {
        let mut stmt = c.prepare("SELECT id FROM goals WHERE parent_goal_id = ?")?;
        let rows = stmt.query_map(params![&to_delete[i]], |r| r.get::<_, String>(0))?;
        for row in rows {
            to_delete.push(row?);
        }
        i += 1;
    }
    for gid in &to_delete {
        c.execute("DELETE FROM goals WHERE id = ?", params![gid])?;
    }
    Ok(())
}

// =================== Milestone ===================

#[tauri::command]
pub fn list_milestones(state: State<DbState>, goal_id: String) -> AppResult<Vec<Milestone>> {
    let c = conn(&state);
    load_milestones(&c, &goal_id)
}

#[tauri::command]
pub fn create_milestone(
    state: State<DbState>,
    goal_id: String,
    title: String,
) -> AppResult<Milestone> {
    let c = conn(&state);
    let id = new_id();
    let now = now();
    let max_pos: i32 = c
        .query_row(
            "SELECT COALESCE(MAX(position), -1) FROM milestones WHERE goal_id = ?",
            params![goal_id],
            |r| r.get(0),
        )
        .unwrap_or(-1);
    c.execute(
        "INSERT INTO milestones (id, goal_id, title, is_completed, position, created_at)
         VALUES (?, ?, ?, 0, ?, ?)",
        params![id, goal_id, title, max_pos + 1, now],
    )?;
    Ok(Milestone {
        id,
        goal_id,
        title,
        is_completed: false,
        completed_at: None,
        position: max_pos + 1,
        created_at: now,
    })
}

#[tauri::command]
pub fn toggle_milestone(state: State<DbState>, id: String) -> AppResult<bool> {
    let c = conn(&state);
    let cur: bool = c
        .query_row(
            "SELECT is_completed FROM milestones WHERE id = ?",
            params![id],
            |r| r.get::<_, i64>(0).map(|v| v != 0),
        )
        .ok()
        .ok_or_else(|| AppError::NotFound(format!("milestone {id}")))?;
    let new_val = !cur;
    let completed_at = if new_val { Some(now()) } else { None };
    c.execute(
        "UPDATE milestones SET is_completed = ?, completed_at = ? WHERE id = ?",
        params![new_val as i64, completed_at, id],
    )?;
    Ok(new_val)
}

#[tauri::command]
pub fn delete_milestone(state: State<DbState>, id: String) -> AppResult<()> {
    let c = conn(&state);
    c.execute("DELETE FROM milestones WHERE id = ?", params![id])?;
    Ok(())
}

#[tauri::command]
pub fn reorder_milestones(state: State<DbState>, ids: Vec<String>) -> AppResult<()> {
    let c = conn(&state);
    let tx = c.unchecked_transaction()?;
    for (i, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE milestones SET position = ? WHERE id = ?",
            params![i as i32, id],
        )?;
    }
    tx.commit()?;
    Ok(())
}

#[tauri::command]
pub fn goal_progress(state: State<DbState>, goal_id: String) -> AppResult<f64> {
    let c = conn(&state);
    let g = build_goal_with(&c, load_goal(&c, &goal_id)?)?;
    Ok(g.progress)
}

#[tauri::command]
pub fn archive_goal(state: State<DbState>, id: String) -> AppResult<()> {
    let c = conn(&state);
    c.execute(
        "UPDATE goals SET status = 'archived', updated_at = ? WHERE id = ?",
        params![now(), id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn save_review(
    state: State<DbState>,
    id: String,
    score: Option<i32>,
    note: Option<String>,
) -> AppResult<()> {
    let c = conn(&state);
    c.execute(
        "UPDATE goals SET review_score = ?, review_note = ?, updated_at = ? WHERE id = ?",
        params![score, note, now(), id],
    )?;
    Ok(())
}
