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
    if user_version < 5 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
            r#"
            ALTER TABLE goals ADD COLUMN period TEXT NOT NULL DEFAULT 'yearly';
            "#,
        )?;
        tx.execute("PRAGMA user_version = 5;", params![])?;
        tx.commit()?;
    }
    if user_version < 6 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
            r#"
            ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'not_started';
            ALTER TABLE tasks ADD COLUMN priority TEXT;
            ALTER TABLE tasks ADD COLUMN start_at TEXT;
            "#,
        )?;
        tx.execute("PRAGMA user_version = 6;", params![])?;
        tx.commit()?;
    }
    if user_version < 7 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
            r#"
            ALTER TABLE subtasks ADD COLUMN status TEXT NOT NULL DEFAULT 'not_started';
            ALTER TABLE subtasks ADD COLUMN due_at TEXT;
            ALTER TABLE subtasks ADD COLUMN priority TEXT;
            ALTER TABLE subtasks ADD COLUMN start_at TEXT;
            ALTER TABLE subtasks ADD COLUMN completed_at TEXT;
            "#,
        )?;
        tx.execute("PRAGMA user_version = 7;", params![])?;
        tx.commit()?;
    }
    if user_version < 8 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
            r#"
            ALTER TABLE key_results ADD COLUMN health_status TEXT NOT NULL DEFAULT 'normal';
            "#,
        )?;
        tx.execute("PRAGMA user_version = 8;", params![])?;
        tx.commit()?;
    }
    if user_version < 8 {
        let tx = conn.unchecked_transaction()?;
        // Move existing subtasks into tasks table as child tasks (parent_task_id set)
        tx.execute_batch(
            r#"
            INSERT INTO tasks (id, list_id, title, description, position, due_at, reminder_at, reminder_time,
                is_completed, completed_at, parent_task_id, color, status, priority, start_at, created_at, updated_at, last_notified_at)
            SELECT
                s.id,
                t.list_id,
                s.title,
                NULL,
                (SELECT COALESCE(MAX(t2.position), -1) FROM tasks t2 WHERE t2.list_id = t.list_id) + s.position + 1,
                s.due_at,
                NULL,
                NULL,
                s.is_completed,
                s.completed_at,
                s.task_id,
                NULL,
                COALESCE(s.status, 'not_started'),
                s.priority,
                s.start_at,
                s.created_at,
                s.created_at,
                NULL
            FROM subtasks s
            JOIN tasks t ON t.id = s.task_id;
            DROP TABLE subtasks;
            "#,
        )?;
        tx.execute("PRAGMA user_version = 8;", params![])?;
        tx.commit()?;
    }
    if user_version < 9 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
            r#"
            ALTER TABLE goals ADD COLUMN deleted_at TEXT;
            CREATE INDEX IF NOT EXISTS idx_goals_deleted_at ON goals(deleted_at);
            "#,
        )?;
        tx.execute("PRAGMA user_version = 9;", params![])?;
        tx.commit()?;
    }
    if user_version < 10 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
            r#"
            CREATE TABLE task_reminder_settings (
                task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
                enabled INTEGER NOT NULL DEFAULT 0,
                repeat_mode TEXT NOT NULL DEFAULT 'daily',
                weekdays TEXT NOT NULL DEFAULT '1,2,3,4,5,6,7',
                notification_enabled INTEGER NOT NULL DEFAULT 1,
                sound_enabled INTEGER NOT NULL DEFAULT 1,
                snooze_minutes INTEGER NOT NULL DEFAULT 0,
                paused INTEGER NOT NULL DEFAULT 0,
                silent_until TEXT,
                next_reminder_at TEXT,
                last_triggered_at TEXT,
                trigger_count_date TEXT,
                trigger_count INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            );
            INSERT INTO task_reminder_settings
                (task_id, enabled, repeat_mode, weekdays, notification_enabled, sound_enabled,
                 snooze_minutes, paused, next_reminder_at, updated_at)
            SELECT id, 1, 'daily', '1,2,3,4,5,6,7', 1, 1, 0, 0, NULL, datetime('now')
            FROM tasks
            WHERE reminder_time IS NOT NULL;
            "#,
        )?;
        tx.execute("PRAGMA user_version = 10;", params![])?;
        tx.commit()?;
    }
    if user_version < 11 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
            r#"
            CREATE TABLE review_reports (
                id TEXT PRIMARY KEY,
                period_type TEXT NOT NULL,
                period_start TEXT NOT NULL,
                period_end TEXT NOT NULL,
                highlights TEXT NOT NULL DEFAULT '',
                blockers TEXT NOT NULL DEFAULT '',
                lessons TEXT NOT NULL DEFAULT '',
                next_actions TEXT NOT NULL DEFAULT '',
                score INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(period_type, period_start, period_end)
            );
            CREATE INDEX IF NOT EXISTS idx_review_reports_period
                ON review_reports(period_type, period_start, period_end);
            "#,
        )?;
        tx.execute("PRAGMA user_version = 11;", params![])?;
        tx.commit()?;
    }
    if user_version < 12 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS calendar_events (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                start_time TEXT NOT NULL,
                end_time TEXT,
                all_day INTEGER NOT NULL DEFAULT 0,
                location TEXT,
                source_type TEXT NOT NULL DEFAULT 'manual',
                source_account_id TEXT,
                external_uid TEXT,
                sequence INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'confirmed',
                readonly INTEGER NOT NULL DEFAULT 0,
                color TEXT,
                holiday_type TEXT,
                raw_ics TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                synced_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_calendar_events_time
                ON calendar_events(start_time, end_time);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_external
                ON calendar_events(source_type, source_account_id, external_uid)
                WHERE external_uid IS NOT NULL;

            CREATE TABLE IF NOT EXISTS calendar_sync_accounts (
                id TEXT PRIMARY KEY,
                provider TEXT NOT NULL DEFAULT 'imap',
                email TEXT NOT NULL,
                imap_host TEXT,
                imap_port INTEGER,
                enabled INTEGER NOT NULL DEFAULT 1,
                sync_interval_minutes INTEGER NOT NULL DEFAULT 20,
                last_sync_at TEXT,
                last_error TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS holiday_sync_configs (
                id TEXT PRIMARY KEY,
                country_code TEXT NOT NULL,
                region TEXT,
                enabled INTEGER NOT NULL DEFAULT 0,
                show_workdays INTEGER NOT NULL DEFAULT 1,
                source_url TEXT,
                last_sync_at TEXT,
                last_error TEXT,
                updated_at TEXT NOT NULL
            );
            "#,
        )?;
        tx.execute("PRAGMA user_version = 12;", params![])?;
        tx.commit()?;
    }
    if user_version < 13 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS calendar_holiday_sources (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                source_type TEXT NOT NULL DEFAULT 'json',
                content TEXT,
                url TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            "#,
        )?;
        tx.execute("PRAGMA user_version = 13;", params![])?;
        tx.commit()?;
    }
    conn.execute(
        "DELETE FROM goals
         WHERE deleted_at IS NOT NULL
           AND julianday(deleted_at) <= julianday('now', '-30 days')",
        [],
    )?;
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
