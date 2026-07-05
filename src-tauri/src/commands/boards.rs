use rusqlite::{params, Connection};
use tauri::State;

use crate::db::{new_id, now, DbState};
use crate::error::{AppError, AppResult};
use crate::models::{
    Board, BoardWithLists, List, ListWithTasks, Task, TaskActivityLog, TaskWithSubtasks,
};

const TASK_COLUMNS: &str = "id, list_id, title, description, position, due_at, reminder_at, reminder_time, is_completed, completed_at, parent_task_id, color, status, priority, start_at, created_at, updated_at";

fn conn<'a>(state: &'a DbState) -> std::sync::MutexGuard<'a, Connection> {
    state.conn.lock().expect("db lock")
}

fn row_to_task(r: &rusqlite::Row) -> rusqlite::Result<Task> {
    Ok(Task {
        id: r.get(0)?,
        list_id: r.get(1)?,
        title: r.get(2)?,
        description: r.get(3)?,
        position: r.get(4)?,
        due_at: r.get(5)?,
        reminder_at: r.get(6)?,
        reminder_time: r.get(7)?,
        is_completed: r.get::<_, i64>(8)? != 0,
        completed_at: r.get(9)?,
        parent_task_id: r.get(10)?,
        color: r.get(11)?,
        status: r.get(12)?,
        priority: r.get(13)?,
        start_at: r.get(14)?,
        created_at: r.get(15)?,
        updated_at: r.get(16)?,
    })
}

// =================== Board ===================

#[tauri::command]
pub fn list_boards(state: State<DbState>) -> AppResult<Vec<Board>> {
    let c = conn(&state);
    let mut stmt = c.prepare(
        "SELECT id, name, description, color, icon, is_pinned, position, created_at, updated_at
         FROM boards ORDER BY is_pinned DESC, position ASC, created_at ASC",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(Board {
            id: r.get(0)?,
            name: r.get(1)?,
            description: r.get(2)?,
            color: r.get(3)?,
            icon: r.get(4)?,
            is_pinned: r.get::<_, i64>(5)? != 0,
            position: r.get(6)?,
            created_at: r.get(7)?,
            updated_at: r.get(8)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

#[tauri::command]
pub fn create_board(
    state: State<DbState>,
    name: String,
    description: Option<String>,
    color: Option<String>,
    icon: Option<String>,
) -> AppResult<Board> {
    let c = conn(&state);
    let id = new_id();
    let now = now();
    let max_pos: i32 = c
        .query_row("SELECT COALESCE(MAX(position), -1) FROM boards", [], |r| {
            r.get(0)
        })
        .unwrap_or(-1);
    c.execute(
        "INSERT INTO boards (id, name, description, color, icon, is_pinned, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)",
        params![id, name, description, color, icon, max_pos + 1, now, now],
    )?;
    Ok(Board {
        id,
        name,
        description,
        color,
        icon,
        is_pinned: false,
        position: max_pos + 1,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub fn update_board(
    state: State<DbState>,
    id: String,
    name: Option<String>,
    description: Option<String>,
    color: Option<String>,
    icon: Option<String>,
) -> AppResult<()> {
    let c = conn(&state);
    let now = now();
    c.execute(
        "UPDATE boards SET
            name = COALESCE(?, name),
            description = COALESCE(?, description),
            color = COALESCE(?, color),
            icon = COALESCE(?, icon),
            updated_at = ?
         WHERE id = ?",
        params![name, description, color, icon, now, id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn toggle_pin_board(state: State<DbState>, id: String) -> AppResult<()> {
    let c = conn(&state);
    c.execute(
        "UPDATE boards SET is_pinned = 1 - is_pinned, updated_at = ? WHERE id = ?",
        params![now(), id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn delete_board(state: State<DbState>, id: String) -> AppResult<()> {
    let c = conn(&state);
    c.execute("DELETE FROM boards WHERE id = ?", params![id])?;
    Ok(())
}

// =================== List ===================

#[tauri::command]
pub fn list_lists(state: State<DbState>, board_id: String) -> AppResult<Vec<List>> {
    let c = conn(&state);
    let mut stmt = c.prepare(
        "SELECT id, board_id, name, position, created_at FROM lists WHERE board_id = ? ORDER BY position ASC, created_at ASC",
    )?;
    let rows = stmt.query_map(params![board_id], |r| {
        Ok(List {
            id: r.get(0)?,
            board_id: r.get(1)?,
            name: r.get(2)?,
            position: r.get(3)?,
            created_at: r.get(4)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

#[tauri::command]
pub fn create_list(state: State<DbState>, board_id: String, name: String) -> AppResult<List> {
    let c = conn(&state);
    let id = new_id();
    let now = now();
    let max_pos: i32 = c
        .query_row(
            "SELECT COALESCE(MAX(position), -1) FROM lists WHERE board_id = ?",
            params![board_id],
            |r| r.get(0),
        )
        .unwrap_or(-1);
    c.execute(
        "INSERT INTO lists (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)",
        params![id, board_id, name, max_pos + 1, now],
    )?;
    Ok(List {
        id,
        board_id,
        name,
        position: max_pos + 1,
        created_at: now,
    })
}

#[tauri::command]
pub fn rename_list(state: State<DbState>, id: String, name: String) -> AppResult<()> {
    let c = conn(&state);
    c.execute("UPDATE lists SET name = ? WHERE id = ?", params![name, id])?;
    Ok(())
}

#[tauri::command]
pub fn delete_list(state: State<DbState>, id: String) -> AppResult<()> {
    let c = conn(&state);
    c.execute("DELETE FROM lists WHERE id = ?", params![id])?;
    Ok(())
}

#[tauri::command]
pub fn reorder_lists(state: State<DbState>, ids: Vec<String>) -> AppResult<()> {
    let c = conn(&state);
    let tx = c.unchecked_transaction()?;
    for (i, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE lists SET position = ? WHERE id = ?",
            params![i as i32, id],
        )?;
    }
    tx.commit()?;
    Ok(())
}

// =================== Task ===================

#[tauri::command]
pub fn list_tasks(state: State<DbState>, list_id: String) -> AppResult<Vec<TaskWithSubtasks>> {
    let c = conn(&state);
    list_tasks_for_parent(&c, &list_id, None)
}

/// Recursively load tasks: parent_task_id IS NULL for top-level, then children
fn list_tasks_for_parent(
    c: &Connection,
    list_id: &str,
    parent_id: Option<&str>,
) -> AppResult<Vec<TaskWithSubtasks>> {
    let sql = match parent_id {
        Some(_) => format!(
            "SELECT {} FROM tasks WHERE list_id = ? AND parent_task_id = ? ORDER BY position ASC, created_at ASC",
            TASK_COLUMNS
        ),
        None => format!(
            "SELECT {} FROM tasks WHERE list_id = ? AND parent_task_id IS NULL ORDER BY position ASC, created_at ASC",
            TASK_COLUMNS
        ),
    };
    let mut stmt = c.prepare(&sql)?;
    let rows = match parent_id {
        Some(pid) => stmt.query_map(params![list_id, pid], row_to_task)?,
        None => stmt.query_map(params![list_id], row_to_task)?,
    };
    let mut out = Vec::new();
    for row in rows {
        let task = row?;
        let children = list_tasks_for_parent(c, list_id, Some(&task.id))?;
        out.push(TaskWithSubtasks {
            task,
            subtasks: children,
        });
    }
    Ok(out)
}

#[tauri::command]
pub fn list_all_tasks(state: State<DbState>) -> AppResult<Vec<Task>> {
    let c = conn(&state);
    let mut stmt = c.prepare(&format!(
        "SELECT {} FROM tasks ORDER BY position ASC, created_at ASC",
        TASK_COLUMNS
    ))?;
    let rows = stmt.query_map([], row_to_task)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

#[tauri::command]
pub fn list_task_activity_logs(
    state: State<DbState>,
    task_id: String,
    limit: Option<i32>,
) -> AppResult<Vec<TaskActivityLog>> {
    let c = conn(&state);
    let lim = limit.unwrap_or(50);
    let mut stmt = c.prepare(
        "SELECT id, task_id, kind, title, detail, source_id, duration_seconds, created_at
         FROM task_activity_logs
         WHERE task_id = ?
         ORDER BY created_at DESC
         LIMIT ?",
    )?;
    let rows = stmt.query_map(params![task_id, lim], |r| {
        Ok(TaskActivityLog {
            id: r.get(0)?,
            task_id: r.get(1)?,
            kind: r.get(2)?,
            title: r.get(3)?,
            detail: r.get(4)?,
            source_id: r.get(5)?,
            duration_seconds: r.get(6)?,
            created_at: r.get(7)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

#[tauri::command]
pub fn create_task(
    state: State<DbState>,
    list_id: String,
    title: String,
    description: Option<String>,
    due_at: Option<String>,
    reminder_at: Option<String>,
    reminder_time: Option<String>,
    color: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    start_at: Option<String>,
    parent_id: Option<String>,
) -> AppResult<Task> {
    let c = conn(&state);
    let id = new_id();
    let now = now();
    let status_val = status.unwrap_or_else(|| "not_started".to_string());
    // Determine parent_task_id: use parent_id if provided
    let parent_task_id = parent_id;
    let max_pos: i32 = match &parent_task_id {
        Some(pid) => c.query_row(
            "SELECT COALESCE(MAX(position), -1) FROM tasks WHERE list_id = ? AND parent_task_id = ?",
            params![list_id, pid],
            |r| r.get(0),
        ).unwrap_or(-1),
        None => c.query_row(
            "SELECT COALESCE(MAX(position), -1) FROM tasks WHERE list_id = ? AND parent_task_id IS NULL",
            params![list_id],
            |r| r.get(0),
        ).unwrap_or(-1),
    };
    c.execute(
        "INSERT INTO tasks
            (id, list_id, title, description, position, due_at, reminder_at, reminder_time,
             is_completed, parent_task_id, color, status, priority, start_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)",
        params![
            id, list_id, title, description, max_pos + 1, due_at, reminder_at, reminder_time,
            parent_task_id, color, status_val, priority, start_at, now, now
        ],
    )?;
    Ok(Task {
        id,
        list_id,
        title,
        description,
        position: max_pos + 1,
        due_at,
        reminder_at,
        reminder_time,
        is_completed: false,
        completed_at: None,
        parent_task_id,
        color,
        status: status_val,
        priority,
        start_at,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub fn get_task(state: State<DbState>, task_id: String) -> AppResult<TaskWithSubtasks> {
    let c = conn(&state);
    let task = c
        .query_row(
            &format!("SELECT {} FROM tasks WHERE id = ?", TASK_COLUMNS),
            params![task_id],
            row_to_task,
        )
        .map_err(|_| AppError::NotFound(format!("task {task_id}")))?;
    let children = list_tasks_for_parent(&c, &task.list_id, Some(&task.id))?;
    Ok(TaskWithSubtasks {
        task,
        subtasks: children,
    })
}

#[tauri::command]
pub fn update_task(
    state: State<DbState>,
    id: String,
    title: Option<String>,
    description: Option<String>,
    due_at: Option<Option<String>>,
    reminder_at: Option<Option<String>>,
    reminder_time: Option<Option<String>>,
    color: Option<Option<String>>,
    status: Option<String>,
    priority: Option<Option<String>>,
    start_at: Option<Option<String>>,
) -> AppResult<()> {
    let c = conn(&state);
    let now = now();
    let (
        mut title_v,
        mut desc_v,
        mut due_v,
        mut rem_v,
        mut rt_v,
        mut color_v,
        mut status_v,
        mut priority_v,
        mut start_at_v,
    ) = (
        None::<String>,
        None::<String>,
        None::<Option<String>>,
        None::<Option<String>>,
        None::<Option<String>>,
        None::<Option<String>>,
        None::<String>,
        None::<Option<String>>,
        None::<Option<String>>,
    );
    if title.is_some() {
        title_v = title;
    }
    if description.is_some() {
        desc_v = description;
    }
    if let Some(d) = due_at {
        due_v = Some(d);
    }
    if let Some(d) = reminder_at {
        rem_v = Some(d);
    }
    if let Some(d) = reminder_time {
        rt_v = Some(d);
    }
    if let Some(d) = color {
        color_v = Some(d);
    }
    if status.is_some() {
        status_v = status;
    }
    if let Some(d) = priority {
        priority_v = Some(d);
    }
    if let Some(d) = start_at {
        start_at_v = Some(d);
    }
    let completion_status = status_v.clone();
    c.execute(
        "UPDATE tasks SET
            title = COALESCE(?, title),
            description = COALESCE(?, description),
            due_at = CASE WHEN ? THEN ? ELSE due_at END,
            reminder_at = CASE WHEN ? THEN ? ELSE reminder_at END,
            reminder_time = CASE WHEN ? THEN ? ELSE reminder_time END,
            color = CASE WHEN ? THEN ? ELSE color END,
            status = COALESCE(?, status),
            is_completed = CASE
                WHEN ? IS NULL THEN is_completed
                WHEN ? = 'completed' THEN 1
                ELSE 0
            END,
            completed_at = CASE
                WHEN ? IS NULL THEN completed_at
                WHEN ? = 'completed' THEN COALESCE(completed_at, ?)
                ELSE NULL
            END,
            priority = CASE WHEN ? THEN ? ELSE priority END,
            start_at = CASE WHEN ? THEN ? ELSE start_at END,
            updated_at = ?
         WHERE id = ?",
        params![
            title_v,
            desc_v,
            due_v.is_some() as i64,
            due_v.unwrap_or(None),
            rem_v.is_some() as i64,
            rem_v.unwrap_or(None),
            rt_v.is_some() as i64,
            rt_v.unwrap_or(None),
            color_v.is_some() as i64,
            color_v.unwrap_or(None),
            status_v,
            completion_status.clone(),
            completion_status.clone(),
            completion_status.clone(),
            completion_status,
            now.clone(),
            priority_v.is_some() as i64,
            priority_v.unwrap_or(None),
            start_at_v.is_some() as i64,
            start_at_v.unwrap_or(None),
            now,
            id,
        ],
    )?;
    Ok(())
}

#[tauri::command]
pub fn toggle_task(state: State<DbState>, id: String) -> AppResult<bool> {
    let c = conn(&state);
    let cur: bool = c
        .query_row(
            "SELECT is_completed FROM tasks WHERE id = ?",
            params![id],
            |r| r.get::<_, i64>(0).map(|v| v != 0),
        )
        .ok()
        .ok_or_else(|| AppError::NotFound(format!("task {id}")))?;
    let new_val = !cur;
    let completed_at = if new_val { Some(now()) } else { None };
    let new_status = if new_val { "completed" } else { "not_started" };
    c.execute(
        "UPDATE tasks SET is_completed = ?, completed_at = ?, status = ?, updated_at = ? WHERE id = ?",
        params![new_val as i64, completed_at, new_status, now(), id],
    )?;
    Ok(new_val)
}

#[tauri::command]
pub fn delete_task(state: State<DbState>, id: String) -> AppResult<()> {
    let c = conn(&state);
    c.execute("DELETE FROM tasks WHERE id = ?", params![id])?;
    Ok(())
}

#[tauri::command]
pub fn move_task(
    state: State<DbState>,
    id: String,
    target_list_id: String,
    target_position: i32,
) -> AppResult<()> {
    let c = conn(&state);
    let tx = c.unchecked_transaction()?;
    let src_list: String =
        tx.query_row("SELECT list_id FROM tasks WHERE id = ?", params![id], |r| {
            r.get(0)
        })?;
    if src_list == target_list_id {
        let cur_pos: i32 = tx.query_row(
            "SELECT position FROM tasks WHERE id = ?",
            params![id],
            |r| r.get(0),
        )?;
        if target_position > cur_pos {
            tx.execute(
                "UPDATE tasks SET position = position - 1
                 WHERE list_id = ? AND id != ? AND position > ? AND position <= ?",
                params![target_list_id, id, cur_pos, target_position],
            )?;
        } else {
            tx.execute(
                "UPDATE tasks SET position = position + 1
                 WHERE list_id = ? AND id != ? AND position >= ? AND position < ?",
                params![target_list_id, id, target_position, cur_pos],
            )?;
        }
        tx.execute(
            "UPDATE tasks SET position = ?, updated_at = ? WHERE id = ?",
            params![target_position, now(), id],
        )?;
    } else {
        let src_pos: i32 = tx.query_row(
            "SELECT position FROM tasks WHERE id = ?",
            params![id],
            |r| r.get(0),
        )?;
        tx.execute(
            "UPDATE tasks SET position = position - 1 WHERE list_id = ? AND position > ?",
            params![src_list, src_pos],
        )?;
        tx.execute(
            "UPDATE tasks SET position = position + 1 WHERE list_id = ? AND position >= ?",
            params![target_list_id, target_position],
        )?;
        tx.execute(
            "UPDATE tasks SET list_id = ?, position = ?, updated_at = ? WHERE id = ?",
            params![target_list_id, target_position, now(), id],
        )?;
    }
    tx.commit()?;
    Ok(())
}

#[tauri::command]
pub fn reorder_tasks(state: State<DbState>, list_id: String, ids: Vec<String>) -> AppResult<()> {
    let c = conn(&state);
    let tx = c.unchecked_transaction()?;
    for (i, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE tasks SET position = ?, updated_at = ? WHERE id = ? AND list_id = ?",
            params![i as i32, now(), id, list_id],
        )?;
    }
    tx.commit()?;
    Ok(())
}

// =================== Board with structure (composite read) ===================

#[tauri::command]
pub fn get_board_with_structure(
    state: State<DbState>,
    board_id: String,
) -> AppResult<BoardWithLists> {
    let c = conn(&state);
    let board: Board = c.query_row(
        "SELECT id, name, description, color, icon, is_pinned, position, created_at, updated_at
         FROM boards WHERE id = ?",
        params![board_id],
        |r| {
            Ok(Board {
                id: r.get(0)?,
                name: r.get(1)?,
                description: r.get(2)?,
                color: r.get(3)?,
                icon: r.get(4)?,
                is_pinned: r.get::<_, i64>(5)? != 0,
                position: r.get(6)?,
                created_at: r.get(7)?,
                updated_at: r.get(8)?,
            })
        },
    )?;
    let mut lists_stmt = c.prepare(
        "SELECT id, board_id, name, position, created_at FROM lists WHERE board_id = ? ORDER BY position ASC",
    )?;
    let list_rows = lists_stmt.query_map(params![board_id], |r| {
        Ok(List {
            id: r.get(0)?,
            board_id: r.get(1)?,
            name: r.get(2)?,
            position: r.get(3)?,
            created_at: r.get(4)?,
        })
    })?;
    let mut lists_out = Vec::new();
    for l in list_rows {
        let list = l?;
        let tasks = list_tasks_for_parent(&c, &list.id, None)?;
        lists_out.push(ListWithTasks { list, tasks });
    }
    Ok(BoardWithLists {
        board,
        lists: lists_out,
    })
}
