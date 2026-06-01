use rusqlite::{params, Connection};
use tauri::State;

use crate::db::{new_id, now, DbState};
use crate::error::{AppError, AppResult};
use crate::models::{
    Board, BoardWithLists, List, ListWithTasks, Subtask, Task, TaskWithSubtasks,
};

fn conn<'a>(state: &'a DbState) -> std::sync::MutexGuard<'a, Connection> {
    state.conn.lock().expect("db lock")
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
    let mut stmt = c.prepare(
        "SELECT id, list_id, title, description, position, due_at, reminder_at, reminder_time,
                is_completed, completed_at, parent_task_id, color, created_at, updated_at
         FROM tasks WHERE list_id = ? ORDER BY position ASC, created_at ASC",
    )?;
    let rows = stmt.query_map(params![list_id], |r| {
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
            created_at: r.get(12)?,
            updated_at: r.get(13)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        let task = row?;
        let subs = list_subtasks_internal(&c, &task.id)?;
        out.push(TaskWithSubtasks { task, subtasks: subs });
    }
    Ok(out)
}

fn list_subtasks_internal(c: &Connection, task_id: &str) -> AppResult<Vec<Subtask>> {
    let mut stmt = c.prepare(
        "SELECT id, task_id, title, is_completed, position, created_at
         FROM subtasks WHERE task_id = ? ORDER BY position ASC, created_at ASC",
    )?;
    let rows = stmt.query_map(params![task_id], |r| {
        Ok(Subtask {
            id: r.get(0)?,
            task_id: r.get(1)?,
            title: r.get(2)?,
            is_completed: r.get::<_, i64>(3)? != 0,
            position: r.get(4)?,
            created_at: r.get(5)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

#[tauri::command]
pub fn list_all_tasks(state: State<DbState>) -> AppResult<Vec<Task>> {
    let c = conn(&state);
    let mut stmt = c.prepare(
        "SELECT id, list_id, title, description, position, due_at, reminder_at, reminder_time,
                is_completed, completed_at, parent_task_id, color, created_at, updated_at
         FROM tasks ORDER BY position ASC, created_at ASC",
    )?;
    let rows = stmt.query_map([], |r| {
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
            created_at: r.get(12)?,
            updated_at: r.get(13)?,
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
) -> AppResult<Task> {
    let c = conn(&state);
    let id = new_id();
    let now = now();
    let max_pos: i32 = c
        .query_row(
            "SELECT COALESCE(MAX(position), -1) FROM tasks WHERE list_id = ?",
            params![list_id],
            |r| r.get(0),
        )
        .unwrap_or(-1);
    c.execute(
        "INSERT INTO tasks
            (id, list_id, title, description, position, due_at, reminder_at, reminder_time,
             is_completed, parent_task_id, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)",
        params![
            id, list_id, title, description, max_pos + 1, due_at, reminder_at, reminder_time,
            color, now, now
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
        parent_task_id: None,
        color,
        created_at: now.clone(),
        updated_at: now,
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
) -> AppResult<()> {
    let c = conn(&state);
    let now = now();
    // For due_at/reminder_at/reminder_time/color, the inner Option represents clear-or-set.
    // We update each field only if Some is provided at the outer level.
    let (mut title_v, mut desc_v, mut due_v, mut rem_v, mut rt_v, mut color_v) = (
        None::<String>, None::<String>, None::<Option<String>>,
        None::<Option<String>>, None::<Option<String>>, None::<Option<String>>,
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
    c.execute(
        "UPDATE tasks SET
            title = COALESCE(?, title),
            description = COALESCE(?, description),
            due_at = CASE WHEN ? THEN ? ELSE due_at END,
            reminder_at = CASE WHEN ? THEN ? ELSE reminder_at END,
            reminder_time = CASE WHEN ? THEN ? ELSE reminder_time END,
            color = CASE WHEN ? THEN ? ELSE color END,
            updated_at = ?
         WHERE id = ?",
        params![
            title_v,
            desc_v,
            due_v.is_some() as i64, due_v.unwrap_or(None),
            rem_v.is_some() as i64, rem_v.unwrap_or(None),
            rt_v.is_some() as i64, rt_v.unwrap_or(None),
            color_v.is_some() as i64, color_v.unwrap_or(None),
            now, id,
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
    c.execute(
        "UPDATE tasks SET is_completed = ?, completed_at = ?, updated_at = ? WHERE id = ?",
        params![new_val as i64, completed_at, now(), id],
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
    // Shift positions in source list
    let src_list: String = tx.query_row(
        "SELECT list_id FROM tasks WHERE id = ?",
        params![id],
        |r| r.get(0),
    )?;
    if src_list == target_list_id {
        // Reorder within same list: shift others
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
        // Cross-list: shift source and target
        let src_pos: i32 = tx.query_row(
            "SELECT position FROM tasks WHERE id = ?",
            params![id],
            |r| r.get(0),
        )?;
        tx.execute(
            "UPDATE tasks SET position = position - 1
             WHERE list_id = ? AND position > ?",
            params![src_list, src_pos],
        )?;
        tx.execute(
            "UPDATE tasks SET position = position + 1
             WHERE list_id = ? AND position >= ?",
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

// =================== Subtask ===================

#[tauri::command]
pub fn create_subtask(
    state: State<DbState>,
    task_id: String,
    title: String,
) -> AppResult<Subtask> {
    let c = conn(&state);
    let id = new_id();
    let now = now();
    let max_pos: i32 = c
        .query_row(
            "SELECT COALESCE(MAX(position), -1) FROM subtasks WHERE task_id = ?",
            params![task_id],
            |r| r.get(0),
        )
        .unwrap_or(-1);
    c.execute(
        "INSERT INTO subtasks (id, task_id, title, is_completed, position, created_at)
         VALUES (?, ?, ?, 0, ?, ?)",
        params![id, task_id, title, max_pos + 1, now],
    )?;
    Ok(Subtask {
        id,
        task_id,
        title,
        is_completed: false,
        position: max_pos + 1,
        created_at: now,
    })
}

#[tauri::command]
pub fn toggle_subtask(state: State<DbState>, id: String) -> AppResult<bool> {
    let c = conn(&state);
    let cur: bool = c
        .query_row(
            "SELECT is_completed FROM subtasks WHERE id = ?",
            params![id],
            |r| r.get::<_, i64>(0).map(|v| v != 0),
        )
        .ok()
        .ok_or_else(|| AppError::NotFound(format!("subtask {id}")))?;
    let new_val = !cur;
    c.execute(
        "UPDATE subtasks SET is_completed = ? WHERE id = ?",
        params![new_val as i64, id],
    )?;
    Ok(new_val)
}

#[tauri::command]
pub fn delete_subtask(state: State<DbState>, id: String) -> AppResult<()> {
    let c = conn(&state);
    c.execute("DELETE FROM subtasks WHERE id = ?", params![id])?;
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
        let tasks = list_tasks_internal(&c, &list.id)?;
        lists_out.push(ListWithTasks { list, tasks });
    }
    Ok(BoardWithLists {
        board,
        lists: lists_out,
    })
}

fn list_tasks_internal(c: &Connection, list_id: &str) -> AppResult<Vec<TaskWithSubtasks>> {
    let mut stmt = c.prepare(
        "SELECT id, list_id, title, description, position, due_at, reminder_at, reminder_time,
                is_completed, completed_at, parent_task_id, color, created_at, updated_at
         FROM tasks WHERE list_id = ? ORDER BY position ASC, created_at ASC",
    )?;
    let rows = stmt.query_map(params![list_id], |r| {
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
            created_at: r.get(12)?,
            updated_at: r.get(13)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        let task = row?;
        let subs = list_subtasks_internal(c, &task.id)?;
        out.push(TaskWithSubtasks { task, subtasks: subs });
    }
    Ok(out)
}
