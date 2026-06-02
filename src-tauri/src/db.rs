use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection};

use crate::error::{AppError, AppResult};

pub struct DbState {
    pub conn: Mutex<Connection>,
}

pub fn open(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(conn)
}

pub fn migrate(conn: &Connection) -> AppResult<()> {
    let user_version: i32 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if user_version == 0 {
        let tx = conn.unchecked_transaction()?;
        // 看板
        tx.execute_batch(
            r#"
            CREATE TABLE boards (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                color TEXT,
                icon TEXT,
                is_pinned INTEGER NOT NULL DEFAULT 0,
                position INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE lists (
                id TEXT PRIMARY KEY,
                board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                position INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE tasks (
                id TEXT PRIMARY KEY,
                list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT,
                position INTEGER NOT NULL,
                due_at TEXT,
                reminder_at TEXT,
                reminder_time TEXT,
                is_completed INTEGER NOT NULL DEFAULT 0,
                completed_at TEXT,
                parent_task_id TEXT,
                color TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE subtasks (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                is_completed INTEGER NOT NULL DEFAULT 0,
                position INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE goals (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                color TEXT,
                icon TEXT,
                due_at TEXT,
                parent_goal_id TEXT,
                position INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE milestones (
                id TEXT PRIMARY KEY,
                goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                is_completed INTEGER NOT NULL DEFAULT 0,
                completed_at TEXT,
                position INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE pomodoro_sessions (
                id TEXT PRIMARY KEY,
                task_id TEXT,
                mode TEXT NOT NULL,
                duration_seconds INTEGER NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                completed INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE check_ins (
                id TEXT PRIMARY KEY,
                date TEXT NOT NULL UNIQUE,
                count INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE user_profile (
                id TEXT PRIMARY KEY,
                nickname TEXT,
                avatar TEXT,
                phone TEXT,
                email TEXT,
                signature TEXT,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE sync_meta (
                id INTEGER PRIMARY KEY,
                last_pushed_at TEXT,
                last_pulled_at TEXT,
                server_url TEXT,
                auth_token TEXT
            );
            INSERT INTO sync_meta (id, last_pushed_at, last_pulled_at, server_url, auth_token)
                VALUES (1, NULL, NULL, NULL, NULL);
            INSERT INTO user_profile (id, nickname, avatar, phone, email, signature, updated_at)
                VALUES ('me', NULL, NULL, NULL, NULL, NULL, datetime('now'));
            "#,
        )?;
        tx.execute("PRAGMA user_version = 1;", params![])?;
        tx.commit()?;
    }
    if user_version < 2 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
            r#"
            ALTER TABLE goals ADD COLUMN progress_mode TEXT NOT NULL DEFAULT 'percentage';
            ALTER TABLE goals ADD COLUMN progress_value REAL NOT NULL DEFAULT 0;
            ALTER TABLE goals ADD COLUMN progress_total REAL NOT NULL DEFAULT 100;
            "#,
        )?;
        tx.execute("PRAGMA user_version = 2;", params![])?;
        tx.commit()?;
    }
    if user_version < 3 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
            r#"
            ALTER TABLE tasks ADD COLUMN last_notified_at TEXT;
            "#,
        )?;
        tx.execute("PRAGMA user_version = 3;", params![])?;
        tx.commit()?;
    }
    if user_version < 4 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS key_results (
                id TEXT PRIMARY KEY,
                goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT 'metric',
                start_value REAL NOT NULL DEFAULT 0,
                target_value REAL NOT NULL DEFAULT 1,
                current_value REAL NOT NULL DEFAULT 0,
                unit TEXT,
                weight INTEGER NOT NULL DEFAULT 20,
                is_completed INTEGER NOT NULL DEFAULT 0,
                position INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS progress_logs (
                id TEXT PRIMARY KEY,
                kr_id TEXT NOT NULL REFERENCES key_results(id) ON DELETE CASCADE,
                old_value REAL NOT NULL,
                new_value REAL NOT NULL,
                comment TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS goal_tasks (
                id TEXT PRIMARY KEY,
                goal_id TEXT REFERENCES goals(id) ON DELETE CASCADE,
                kr_id TEXT REFERENCES key_results(id) ON DELETE CASCADE,
                task_id TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            ALTER TABLE goals ADD COLUMN category TEXT;
            ALTER TABLE goals ADD COLUMN start_date TEXT;
            ALTER TABLE goals ADD COLUMN weight INTEGER NOT NULL DEFAULT 5;
            ALTER TABLE goals ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
            ALTER TABLE goals ADD COLUMN review_score INTEGER;
            ALTER TABLE goals ADD COLUMN review_note TEXT;
            "#,
        )?;
        tx.execute("PRAGMA user_version = 4;", params![])?;
        tx.commit()?;
    }
    Ok(())
}

pub fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub fn row_to_string_opt(row: &rusqlite::Row, idx: usize) -> AppResult<Option<String>> {
    Ok(row.get::<_, Option<String>>(idx)?)
}

pub fn _ensure(condition: bool, msg: &str) -> AppResult<()> {
    if condition {
        Ok(())
    } else {
        Err(AppError::Invalid(msg.to_string()))
    }
}
