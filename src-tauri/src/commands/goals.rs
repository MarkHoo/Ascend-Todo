use chrono::Datelike;
use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

use crate::commands::key_results::recalc_goal_progress;
use crate::db::{new_id, now, DbState};
use crate::error::{AppError, AppResult};
use crate::models::{Goal, GoalWithDetails, Milestone};

fn conn<'a>(state: &'a DbState) -> std::sync::MutexGuard<'a, Connection> {
    state.conn.lock().expect("db lock")
}

fn purge_expired_deleted_goals(c: &Connection) -> AppResult<()> {
    c.execute(
        "DELETE FROM goals
         WHERE deleted_at IS NOT NULL
           AND julianday(deleted_at) <= julianday('now', '-30 days')",
        [],
    )?;
    Ok(())
}

fn validate_parent_goal(
    c: &Connection,
    goal_id: Option<&str>,
    parent_goal_id: Option<&str>,
) -> AppResult<()> {
    let Some(parent_id) = parent_goal_id else {
        return Ok(());
    };

    if goal_id == Some(parent_id) {
        return Err(AppError::Invalid("目标不能关联自身为父目标".to_string()));
    }

    let parent_status = c
        .query_row(
            "SELECT status FROM goals WHERE id = ? AND deleted_at IS NULL",
            params![parent_id],
            |row| row.get::<_, String>(0),
        )
        .optional()?;

    match parent_status.as_deref() {
        None => return Err(AppError::Invalid("所选父目标不存在或已被删除".to_string())),
        Some("active") => {}
        Some(_) => {
            return Err(AppError::Invalid(
                "只能关联进行中的目标为父目标".to_string(),
            ))
        }
    }

    if let Some(current_id) = goal_id {
        let creates_cycle: bool = c.query_row(
            "WITH RECURSIVE descendants(id) AS (
                SELECT id FROM goals WHERE parent_goal_id = ?1
                UNION
                SELECT goals.id
                FROM goals
                JOIN descendants ON goals.parent_goal_id = descendants.id
             )
             SELECT EXISTS(SELECT 1 FROM descendants WHERE id = ?2)",
            params![current_id, parent_id],
            |row| row.get(0),
        )?;

        if creates_cycle {
            return Err(AppError::Invalid(
                "不能将子目标或孙级目标设置为父目标".to_string(),
            ));
        }
    }

    let parent_depth: i32 = c.query_row(
        "WITH RECURSIVE ancestors(id, parent_goal_id, depth) AS (
            SELECT id, parent_goal_id, 1 FROM goals WHERE id = ?1
            UNION
            SELECT goals.id, goals.parent_goal_id, ancestors.depth + 1
            FROM goals
            JOIN ancestors ON goals.id = ancestors.parent_goal_id
            WHERE goals.deleted_at IS NULL
         )
         SELECT COALESCE(MAX(depth), 0) FROM ancestors",
        params![parent_id],
        |row| row.get(0),
    )?;
    let subtree_height: i32 = if let Some(current_id) = goal_id {
        c.query_row(
            "WITH RECURSIVE descendants(id, depth) AS (
                SELECT id, 1 FROM goals WHERE id = ?1
                UNION
                SELECT goals.id, descendants.depth + 1
                FROM goals
                JOIN descendants ON goals.parent_goal_id = descendants.id
                WHERE goals.deleted_at IS NULL
             )
             SELECT COALESCE(MAX(depth), 1) FROM descendants",
            params![current_id],
            |row| row.get(0),
        )?
    } else {
        1
    };
    if parent_depth + subtree_height > 5 {
        return Err(AppError::Invalid("子目标最多支持5层".to_string()));
    }

    Ok(())
}

fn load_goal(c: &Connection, id: &str) -> AppResult<Goal> {
    Ok(c.query_row(
        "SELECT id, title, description, color, icon, due_at, parent_goal_id, position, created_at, updated_at,
                progress_mode, progress_value, progress_total,
                category, start_date, weight, status, review_score, review_note, period, deleted_at
         FROM goals WHERE id = ? AND deleted_at IS NULL",
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
                period: r.get(19)?,
                deleted_at: r.get(20)?,
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
                category, start_date, weight, status, review_score, review_note, period, deleted_at
         FROM goals WHERE parent_goal_id = ? AND deleted_at IS NULL ORDER BY position ASC, created_at ASC",
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
            period: r.get(19)?,
            deleted_at: r.get(20)?,
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
        if total_weight > 0 {
            weighted_sum / (total_weight as f64 * 100.0)
        } else {
            0.0
        }
    } else {
        let total = milestones.len() + sub_goals.len();
        let done = milestones.iter().filter(|m| m.is_completed).count()
            + sub_goals.iter().filter(|g| g.progress >= 1.0).count();
        if total == 0 {
            0.0
        } else {
            done as f64 / total as f64
        }
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
        "boolean" => {
            if kr.is_completed {
                100.0
            } else {
                0.0
            }
        }
        "task" => {
            // Task-type KR: progress = completed linked tasks / total linked tasks
            // This is computed dynamically in build_goal_with, so here we return current_value-based progress
            let range = kr.target_value - kr.start_value;
            if range.abs() < f64::EPSILON {
                0.0
            } else {
                ((kr.current_value - kr.start_value) / range * 100.0)
                    .max(0.0)
                    .min(100.0)
            }
        }
        _ => {
            let range = kr.target_value - kr.start_value;
            if range.abs() < f64::EPSILON {
                0.0
            } else {
                ((kr.current_value - kr.start_value) / range * 100.0)
                    .max(0.0)
                    .min(100.0)
            }
        }
    }
}

fn load_key_results_for_goal(
    c: &Connection,
    goal_id: &str,
) -> AppResult<Vec<crate::models::KeyResult>> {
    let mut stmt = c.prepare(
        "SELECT id, goal_id, title, type, start_value, target_value, current_value,
                unit, weight, health_status, check_date, is_completed, position, created_at
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
            health_status: r.get(9)?,
            check_date: r.get(10)?,
            is_completed: r.get::<_, i64>(11)? != 0,
            position: r.get(12)?,
            created_at: r.get(13)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

fn load_linked_tasks(c: &Connection, goal_id: &str) -> AppResult<Vec<crate::models::LinkedTask>> {
    let mut stmt = c.prepare(
        "SELECT gt.kr_id, t.id, t.title, t.is_completed, b.name, l.name, t.due_at, t.status, t.priority, t.start_at
         FROM goal_tasks gt
         JOIN tasks t ON t.id = gt.task_id
         JOIN lists l ON l.id = t.list_id
         JOIN boards b ON b.id = l.board_id
         WHERE gt.goal_id = ?
         ORDER BY t.created_at DESC LIMIT 20",
    )?;
    let rows = stmt.query_map(params![goal_id], |r| {
        Ok(crate::models::LinkedTask {
            kr_id: r.get(0)?,
            id: r.get(1)?,
            title: r.get(2)?,
            is_completed: r.get::<_, i64>(3)? != 0,
            board_name: r.get(4)?,
            list_name: r.get(5)?,
            due_at: r.get(6)?,
            status: r.get(7)?,
            priority: r.get(8)?,
            start_at: r.get(9)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

#[tauri::command]
pub fn list_goals(state: State<DbState>) -> AppResult<Vec<GoalWithDetails>> {
    let c = conn(&state);
    purge_expired_deleted_goals(&c)?;
    let mut stmt = c.prepare(
        "SELECT id, title, description, color, icon, due_at, parent_goal_id, position, created_at, updated_at,
                progress_mode, progress_value, progress_total,
                category, start_date, weight, status, review_score, review_note, period, deleted_at
         FROM goals WHERE parent_goal_id IS NULL AND deleted_at IS NULL ORDER BY position ASC, created_at ASC",
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
            period: r.get(19)?,
            deleted_at: r.get(20)?,
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

/// Compute start_date and due_at from period string.
/// Period can be: "Q1", "Q2", "Q3", "Q4", "yearly", "custom"
/// For custom, the caller should provide due_at and start_date directly.
fn compute_period_dates(period: &str) -> (Option<String>, Option<String>) {
    let year = chrono::Local::now().year();
    match period {
        "Q1" => (Some(format!("{year}-01-01")), Some(format!("{year}-03-31"))),
        "Q2" => (Some(format!("{year}-04-01")), Some(format!("{year}-06-30"))),
        "Q3" => (Some(format!("{year}-07-01")), Some(format!("{year}-09-30"))),
        "Q4" => (Some(format!("{year}-10-01")), Some(format!("{year}-12-31"))),
        "yearly" => (Some(format!("{year}-01-01")), Some(format!("{year}-12-31"))),
        _ => (None, None), // custom — caller provides dates
    }
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
    period: Option<String>,
    start_date: Option<String>,
    status: Option<String>,
) -> AppResult<Goal> {
    let c = conn(&state);
    validate_parent_goal(&c, None, parent_goal_id.as_deref())?;
    let id = new_id();
    let now = now();
    let max_pos: i32 = c
        .query_row(
            "SELECT COALESCE(MAX(position), -1) FROM goals WHERE COALESCE(parent_goal_id, '') = COALESCE(?, '')",
            params![parent_goal_id],
            |r| r.get(0),
        )
        .unwrap_or(-1);

    let p = period.unwrap_or_else(|| "yearly".to_string());
    let goal_status = status.unwrap_or_else(|| "active".to_string());
    let (computed_start, computed_due) = compute_period_dates(&p);
    // For custom period, use provided dates; otherwise use computed dates
    let final_start = if p == "custom" {
        start_date
    } else {
        computed_start
    };
    let final_due = if p == "custom" { due_at } else { computed_due };

    c.execute(
        "INSERT INTO goals
            (id, title, description, color, icon, due_at, parent_goal_id, position, created_at, updated_at,
             progress_mode, progress_value, progress_total, category, start_date, weight, status, period)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'percentage', 0, 100, NULL, ?, 5, ?, ?)",
        params![id, title, description, color, icon, final_due, parent_goal_id, max_pos + 1, now, now, final_start, goal_status, p],
    )?;
    Ok(Goal {
        id,
        title,
        description,
        color,
        icon,
        due_at: final_due,
        parent_goal_id,
        position: max_pos + 1,
        created_at: now.clone(),
        updated_at: now,
        progress_mode: "percentage".to_string(),
        progress_value: 0.0,
        progress_total: 100.0,
        category: None,
        start_date: final_start,
        weight: 5,
        status: goal_status,
        review_score: None,
        review_note: None,
        period: p,
        deleted_at: None,
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
    parent_goal_id: Option<Option<String>>,
    clear_parent_goal: Option<bool>,
    progress_mode: Option<String>,
    progress_value: Option<f64>,
    progress_total: Option<f64>,
    period: Option<String>,
    start_date: Option<Option<String>>,
    status: Option<String>,
) -> AppResult<()> {
    let c = conn(&state);
    let mut desc_v = None::<Option<String>>;
    let mut color_v = None::<Option<String>>;
    let mut icon_v = None::<Option<String>>;
    let mut due_v = None::<Option<String>>;
    let mut parent_v = None::<Option<String>>;
    let mut start_v = None::<Option<String>>;
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
    if clear_parent_goal.unwrap_or(false) {
        parent_v = Some(None);
    } else if let Some(d) = parent_goal_id {
        parent_v = Some(d);
    }
    if let Some(d) = start_date {
        start_v = Some(d);
    }
    // If period is being updated, recompute dates
    let final_due;
    let final_start;
    if let Some(ref p) = period {
        let (cs, cd) = compute_period_dates(p);
        if p == "custom" {
            final_due = due_v.clone();
            final_start = start_v.clone();
        } else {
            final_due = cd.map(Some);
            final_start = cs.map(Some);
        }
    } else {
        final_due = due_v;
        final_start = start_v;
    }
    if let Some(parent) = parent_v.as_ref() {
        validate_parent_goal(&c, Some(&id), parent.as_deref())?;
    }
    c.execute(
        "UPDATE goals SET
            title = COALESCE(?, title),
            description = CASE WHEN ? THEN ? ELSE description END,
            color = CASE WHEN ? THEN ? ELSE color END,
            icon = CASE WHEN ? THEN ? ELSE icon END,
            due_at = CASE WHEN ? THEN ? ELSE due_at END,
            parent_goal_id = CASE WHEN ? THEN ? ELSE parent_goal_id END,
            progress_mode = COALESCE(?, progress_mode),
            progress_value = COALESCE(?, progress_value),
            progress_total = COALESCE(?, progress_total),
            period = COALESCE(?, period),
            start_date = CASE WHEN ? THEN ? ELSE start_date END,
            status = COALESCE(?, status),
            updated_at = ?
         WHERE id = ?",
        params![
            title,
            desc_v.is_some() as i64,
            desc_v.unwrap_or(None),
            color_v.is_some() as i64,
            color_v.unwrap_or(None),
            icon_v.is_some() as i64,
            icon_v.unwrap_or(None),
            final_due.is_some() as i64,
            final_due.unwrap_or(None),
            parent_v.is_some() as i64,
            parent_v.unwrap_or(None),
            progress_mode,
            progress_value,
            progress_total,
            period,
            final_start.is_some() as i64,
            final_start.unwrap_or(None),
            status,
            now(),
            id,
        ],
    )?;
    Ok(())
}

#[tauri::command]
pub fn delete_goal(state: State<DbState>, id: String) -> AppResult<()> {
    let c = conn(&state);
    c.execute(
        "WITH RECURSIVE descendants(id) AS (
            SELECT id FROM goals WHERE id = ?1 AND deleted_at IS NULL
            UNION ALL
            SELECT goals.id
            FROM goals
            JOIN descendants ON goals.parent_goal_id = descendants.id
            WHERE goals.deleted_at IS NULL
         )
         UPDATE goals SET deleted_at = ?2, updated_at = ?2
         WHERE id IN (SELECT id FROM descendants)",
        params![id, now()],
    )?;
    Ok(())
}

fn load_deleted_sub_goals(c: &Connection, parent_id: &str) -> AppResult<Vec<GoalWithDetails>> {
    let mut stmt = c.prepare(
        "SELECT id, title, description, color, icon, due_at, parent_goal_id, position, created_at, updated_at,
                progress_mode, progress_value, progress_total,
                category, start_date, weight, status, review_score, review_note, period, deleted_at
         FROM goals
         WHERE parent_goal_id = ? AND deleted_at IS NOT NULL
         ORDER BY position ASC, created_at ASC",
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
            period: r.get(19)?,
            deleted_at: r.get(20)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(build_deleted_goal_with(c, row?)?);
    }
    Ok(out)
}

fn build_deleted_goal_with(c: &Connection, goal: Goal) -> AppResult<GoalWithDetails> {
    let milestones = load_milestones(c, &goal.id)?;
    let sub_goals = load_deleted_sub_goals(c, &goal.id)?;
    let key_results = load_key_results_for_goal(c, &goal.id).unwrap_or_default();
    let linked_tasks = load_linked_tasks(c, &goal.id).unwrap_or_default();
    let progress = if key_results.is_empty() {
        0.0
    } else {
        weighted_goal_progress(&key_results)
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

fn weighted_goal_progress(key_results: &[crate::models::KeyResult]) -> f64 {
    let total_weight: i32 = key_results.iter().map(|kr| kr.weight).sum();
    if total_weight <= 0 {
        return 0.0;
    }
    key_results
        .iter()
        .map(|kr| calc_kr_progress(kr) * kr.weight as f64)
        .sum::<f64>()
        / (total_weight as f64 * 100.0)
}

#[tauri::command]
pub fn list_deleted_goals(state: State<DbState>) -> AppResult<Vec<GoalWithDetails>> {
    let c = conn(&state);
    purge_expired_deleted_goals(&c)?;
    let mut stmt = c.prepare(
        "SELECT id, title, description, color, icon, due_at, parent_goal_id, position, created_at, updated_at,
                progress_mode, progress_value, progress_total,
                category, start_date, weight, status, review_score, review_note, period, deleted_at
         FROM goals g
         WHERE g.deleted_at IS NOT NULL
           AND (g.parent_goal_id IS NULL OR NOT EXISTS (
                SELECT 1 FROM goals parent
                WHERE parent.id = g.parent_goal_id AND parent.deleted_at IS NOT NULL
           ))
         ORDER BY g.deleted_at DESC",
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
            period: r.get(19)?,
            deleted_at: r.get(20)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(build_deleted_goal_with(&c, row?)?);
    }
    Ok(out)
}

#[tauri::command]
pub fn permanently_delete_goals(state: State<DbState>, ids: Vec<String>) -> AppResult<()> {
    let c = conn(&state);
    for id in ids {
        c.execute(
            "WITH RECURSIVE descendants(id) AS (
                SELECT id FROM goals WHERE id = ?1 AND deleted_at IS NOT NULL
                UNION ALL
                SELECT goals.id
                FROM goals
                JOIN descendants ON goals.parent_goal_id = descendants.id
                WHERE goals.deleted_at IS NOT NULL
             )
             DELETE FROM goals WHERE id IN (SELECT id FROM descendants)",
            params![id],
        )?;
    }
    Ok(())
}

#[tauri::command]
pub fn empty_goal_trash(state: State<DbState>) -> AppResult<()> {
    let c = conn(&state);
    c.execute("DELETE FROM goals WHERE deleted_at IS NOT NULL", [])?;
    Ok(())
}

#[tauri::command]
pub fn restore_deleted_goals(state: State<DbState>, ids: Vec<String>) -> AppResult<()> {
    let c = conn(&state);
    let restored_at = now();
    for id in ids {
        c.execute(
            "UPDATE goals
             SET parent_goal_id = CASE
                    WHEN parent_goal_id IS NOT NULL
                     AND EXISTS (
                        SELECT 1 FROM goals parent
                        WHERE parent.id = goals.parent_goal_id
                          AND parent.deleted_at IS NOT NULL
                     )
                    THEN NULL
                    ELSE parent_goal_id
                 END
             WHERE id = ?1 AND deleted_at IS NOT NULL",
            params![id],
        )?;
        c.execute(
            "WITH RECURSIVE descendants(id) AS (
                SELECT id FROM goals WHERE id = ?1 AND deleted_at IS NOT NULL
                UNION ALL
                SELECT goals.id
                FROM goals
                JOIN descendants ON goals.parent_goal_id = descendants.id
                WHERE goals.deleted_at IS NOT NULL
             )
             UPDATE goals
             SET deleted_at = NULL, updated_at = ?2
             WHERE id IN (SELECT id FROM descendants)",
            params![id, restored_at],
        )?;
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

// =================== Task Linking (for task-type KR) ===================

#[tauri::command]
pub fn link_task_to_kr(state: State<DbState>, kr_id: String, task_id: String) -> AppResult<()> {
    let c = conn(&state);
    // Get the goal_id from the KR
    let goal_id: String = c.query_row(
        "SELECT goal_id FROM key_results WHERE id = ?",
        params![kr_id],
        |r| r.get(0),
    )?;
    let id = new_id();
    let n = now();
    c.execute(
        "INSERT INTO goal_tasks (id, goal_id, kr_id, task_id, created_at) VALUES (?, ?, ?, ?, ?)",
        params![id, goal_id, kr_id, task_id, n],
    )?;
    // Recalculate task-type KR progress
    recalc_task_kr_progress(&c, &kr_id)?;
    recalc_goal_progress(&c, &goal_id)?;
    Ok(())
}

#[tauri::command]
pub fn unlink_task_from_kr(state: State<DbState>, kr_id: String, task_id: String) -> AppResult<()> {
    let c = conn(&state);
    let goal_id: String = c.query_row(
        "SELECT goal_id FROM key_results WHERE id = ?",
        params![kr_id],
        |r| r.get(0),
    )?;
    c.execute(
        "DELETE FROM goal_tasks WHERE kr_id = ? AND task_id = ?",
        params![kr_id, task_id],
    )?;
    recalc_task_kr_progress(&c, &kr_id)?;
    recalc_goal_progress(&c, &goal_id)?;
    Ok(())
}

/// For a task-type KR, count linked tasks and compute current_value
/// based on completed/total ratio, then update the KR.
fn recalc_task_kr_progress(c: &Connection, kr_id: &str) -> AppResult<()> {
    let kr = crate::commands::key_results::load_kr_internal(c, kr_id)?;
    if kr.kr_type != "task" {
        return Ok(());
    }
    // Count linked tasks
    let total: i32 = c
        .query_row(
            "SELECT COUNT(*) FROM goal_tasks WHERE kr_id = ?",
            params![kr_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let completed: i32 = if total > 0 {
        c.query_row(
            "SELECT COUNT(*) FROM goal_tasks gt JOIN tasks t ON t.id = gt.task_id WHERE gt.kr_id = ? AND t.is_completed = 1",
            params![kr_id],
            |r| r.get(0),
        ).unwrap_or(0)
    } else {
        0
    };
    let current_value = if total > 0 { completed as f64 } else { 0.0 };
    let target_value = total as f64;
    c.execute(
        "UPDATE key_results SET current_value = ?, target_value = ?, is_completed = ? WHERE id = ?",
        params![
            current_value,
            target_value,
            (current_value >= target_value && total > 0) as i64,
            kr_id
        ],
    )?;
    Ok(())
}
