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
    let first_install = user_version == 0;
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
    if user_version < 14 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
            r#"
            ALTER TABLE pomodoro_sessions ADD COLUMN source_event_id TEXT;
            ALTER TABLE pomodoro_sessions ADD COLUMN source_title TEXT;
            CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_source_event
                ON pomodoro_sessions(source_event_id);
            "#,
        )?;
        tx.execute("PRAGMA user_version = 14;", params![])?;
        tx.commit()?;
    }
    if user_version < 15 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
            r#"
            ALTER TABLE key_results ADD COLUMN check_date TEXT;
            CREATE INDEX IF NOT EXISTS idx_key_results_check_date
                ON key_results(check_date);
            "#,
        )?;
        tx.execute("PRAGMA user_version = 15;", params![])?;
        tx.commit()?;
    }
    if user_version < 16 {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS task_activity_logs (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                detail TEXT,
                source_id TEXT,
                duration_seconds INTEGER,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_task_activity_logs_task
                ON task_activity_logs(task_id, created_at DESC);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_task_activity_logs_source
                ON task_activity_logs(kind, source_id)
                WHERE source_id IS NOT NULL;
            "#,
        )?;
        tx.execute("PRAGMA user_version = 16;", params![])?;
        tx.commit()?;
    }
    if first_install {
        seed_example_data(conn)?;
    }
    conn.execute(
        "DELETE FROM goals
         WHERE deleted_at IS NOT NULL
           AND julianday(deleted_at) <= julianday('now', '-30 days')",
        [],
    )?;
    Ok(())
}

fn seed_example_data(conn: &Connection) -> AppResult<()> {
    let already_seeded: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM settings WHERE key = 'example_seeded_at'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if already_seeded > 0 {
        return Ok(());
    }

    let tx = conn.unchecked_transaction()?;
    let now = now();
    let today = chrono::Local::now().date_naive();
    let offset = chrono::Local::now().format("%:z").to_string();
    let date = |days: i64| {
        (today + chrono::Duration::days(days))
            .format("%Y-%m-%d")
            .to_string()
    };
    let at = |days: i64, hour: u32, minute: u32| {
        format!("{}T{:02}:{:02}:00{}", date(days), hour, minute, offset)
    };

    let boards = [
        (
            "example-board-growth",
            "示例互联网增长与产品交付",
            "示例：从需求洞察、AI 功能实验到上线复盘的完整工作流。",
            "#2563eb",
            "Rocket",
            0,
        ),
        (
            "example-board-learning",
            "示例个人 AI 学习计划",
            "示例：把学习路径、练习项目、复盘输出组织成可持续推进的看板。",
            "#16a34a",
            "GraduationCap",
            1,
        ),
    ];
    for (id, name, description, color, icon, position) in boards {
        tx.execute(
            "INSERT INTO boards (id, name, description, color, icon, is_pinned, position, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![id, name, description, color, icon, 1, position, now, now],
        )?;
    }

    let lists = [
        (
            "example-list-growth-inbox",
            "example-board-growth",
            "机会池",
            0,
        ),
        (
            "example-list-growth-doing",
            "example-board-growth",
            "本周推进",
            1,
        ),
        (
            "example-list-growth-review",
            "example-board-growth",
            "验证与复盘",
            2,
        ),
        (
            "example-list-growth-done",
            "example-board-growth",
            "已完成",
            3,
        ),
        (
            "example-list-learning-inbox",
            "example-board-learning",
            "学习素材",
            0,
        ),
        (
            "example-list-learning-doing",
            "example-board-learning",
            "正在练习",
            1,
        ),
        (
            "example-list-learning-output",
            "example-board-learning",
            "作品输出",
            2,
        ),
        (
            "example-list-learning-review",
            "example-board-learning",
            "复盘沉淀",
            3,
        ),
    ];
    for (id, board_id, name, position) in lists {
        tx.execute(
            "INSERT INTO lists (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)",
            params![id, board_id, name, position, now],
        )?;
    }

    let tasks = [
        (
            "example-task-growth-1",
            "example-list-growth-inbox",
            "示例梳理 AI 助手用户反馈标签",
            "把客服记录、社区反馈和 NPS 文本拆成痛点、场景、付费意愿三类。",
            0,
            -1,
            1,
            "doing",
            "high",
            "#2563eb",
            false,
        ),
        (
            "example-task-growth-2",
            "example-list-growth-inbox",
            "示例设计新用户首日激活实验",
            "准备 A/B 实验：默认模板、示例数据、完成引导三组对照。",
            1,
            1,
            3,
            "not_started",
            "medium",
            "#7c3aed",
            false,
        ),
        (
            "example-task-growth-3",
            "example-list-growth-doing",
            "示例完成数据同步异常监控面板",
            "定义同步成功率、失败原因、设备分布和版本分布指标。",
            0,
            0,
            2,
            "doing",
            "high",
            "#dc2626",
            false,
        ),
        (
            "example-task-growth-4",
            "example-list-growth-doing",
            "示例准备 v2.8 发布说明",
            "突出云同步、设备管理、示例数据和性能优化。",
            1,
            2,
            4,
            "not_started",
            "medium",
            "#0891b2",
            false,
        ),
        (
            "example-task-growth-5",
            "example-list-growth-review",
            "示例复盘邮件验证码转化",
            "查看发送、到达、验证成功、重试和失败路径。",
            0,
            -3,
            -2,
            "completed",
            "low",
            "#16a34a",
            true,
        ),
        (
            "example-task-growth-6",
            "example-list-growth-done",
            "示例完成竞品飞书日历交互拆解",
            "记录日程密度、提醒默认值和卡片展示方式。",
            0,
            -5,
            -4,
            "completed",
            "medium",
            "#16a34a",
            true,
        ),
        (
            "example-task-learning-1",
            "example-list-learning-inbox",
            "示例整理大模型 Agent 学习资料",
            "筛选官方文档、工程案例和可复现 demo。",
            0,
            0,
            2,
            "doing",
            "medium",
            "#16a34a",
            false,
        ),
        (
            "example-task-learning-2",
            "example-list-learning-doing",
            "示例完成 Rust 后端鉴权练习",
            "实现邮箱注册、JWT 刷新、设备指纹和接口限流。",
            0,
            1,
            5,
            "doing",
            "high",
            "#ea580c",
            false,
        ),
        (
            "example-task-learning-3",
            "example-list-learning-doing",
            "示例用 React 重构个人资料页",
            "练习状态拆分、弹窗交互和响应式布局。",
            1,
            2,
            6,
            "not_started",
            "medium",
            "#2563eb",
            false,
        ),
        (
            "example-task-learning-4",
            "example-list-learning-output",
            "示例发布一篇 AI 工作流复盘",
            "用真实任务讲清楚需求、实现、验证和上线检查。",
            0,
            5,
            8,
            "not_started",
            "high",
            "#7c3aed",
            false,
        ),
        (
            "example-task-learning-5",
            "example-list-learning-review",
            "示例整理本周番茄钟专注数据",
            "找出高质量专注时段和容易分心的触发点。",
            0,
            -2,
            -1,
            "completed",
            "low",
            "#16a34a",
            true,
        ),
        (
            "example-task-learning-6",
            "example-list-learning-review",
            "示例复盘英语技术阅读卡片",
            "沉淀 20 个高频技术表达和 5 段摘要。",
            1,
            3,
            7,
            "not_started",
            "medium",
            "#0891b2",
            false,
        ),
    ];
    for (
        id,
        list_id,
        title,
        description,
        position,
        start_days,
        due_days,
        status,
        priority,
        color,
        completed,
    ) in tasks
    {
        let completed_at = if completed {
            Some(at(due_days, 18, 0))
        } else {
            None
        };
        tx.execute(
            "INSERT INTO tasks
                (id, list_id, title, description, position, due_at, reminder_at, reminder_time,
                 is_completed, completed_at, parent_task_id, color, status, priority, start_at,
                 created_at, updated_at, last_notified_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL)",
            params![
                id,
                list_id,
                title,
                description,
                position,
                at(due_days, 18, 0),
                at(due_days, 9, 0),
                "09:00",
                if completed { 1 } else { 0 },
                completed_at,
                color,
                status,
                priority,
                at(start_days, 9, 0),
                now,
                now
            ],
        )?;
    }

    let child_tasks = [
        (
            "example-task-growth-3-a",
            "example-list-growth-doing",
            "示例定义同步失败用户可读提示",
            "example-task-growth-3",
            10,
            0,
            1,
            "completed",
            "medium",
            true,
        ),
        (
            "example-task-growth-3-b",
            "example-list-growth-doing",
            "示例补充管理员后台版本统计",
            "example-task-growth-3",
            11,
            1,
            2,
            "doing",
            "medium",
            false,
        ),
        (
            "example-task-learning-2-a",
            "example-list-learning-doing",
            "示例完成登录接口单元检查",
            "example-task-learning-2",
            10,
            1,
            3,
            "doing",
            "high",
            false,
        ),
        (
            "example-task-learning-2-b",
            "example-list-learning-doing",
            "示例整理 MySQL 表结构笔记",
            "example-task-learning-2",
            11,
            1,
            4,
            "not_started",
            "low",
            false,
        ),
    ];
    for (
        id,
        list_id,
        title,
        parent_id,
        position,
        start_days,
        due_days,
        status,
        priority,
        completed,
    ) in child_tasks
    {
        tx.execute(
            "INSERT INTO tasks
                (id, list_id, title, description, position, due_at, reminder_at, reminder_time,
                 is_completed, completed_at, parent_task_id, color, status, priority, start_at,
                 created_at, updated_at, last_notified_at)
             VALUES (?, ?, ?, NULL, ?, ?, NULL, NULL, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL)",
            params![
                id,
                list_id,
                title,
                position,
                at(due_days, 18, 0),
                if completed { 1 } else { 0 },
                if completed {
                    Some(at(due_days, 18, 0))
                } else {
                    None
                },
                parent_id,
                status,
                priority,
                at(start_days, 9, 0),
                now,
                now
            ],
        )?;
    }

    let goals = [
        (
            "example-goal-growth",
            "示例上线云同步商业化闭环",
            "围绕账号、同步、设备管理和后台运营数据完成可交付闭环。",
            "#2563eb",
            "Cloud",
            0,
            45,
            "work",
            8,
            "active",
            "quarterly",
            62.0,
        ),
        (
            "example-goal-ai-feature",
            "示例完成 AI 任务规划助手 MVP",
            "让用户可以从一段目标描述生成看板、日程和检查点。",
            "#7c3aed",
            "Sparkles",
            2,
            60,
            "product",
            9,
            "active",
            "quarterly",
            35.0,
        ),
        (
            "example-goal-learning-rust",
            "示例掌握 Rust 全栈同步系统",
            "通过后端、桌面端、数据库和部署实践形成可复用能力。",
            "#ea580c",
            "Code2",
            -3,
            75,
            "learning",
            7,
            "active",
            "yearly",
            48.0,
        ),
        (
            "example-goal-health-focus",
            "示例建立稳定专注与复盘节奏",
            "用番茄钟、周复盘和日历规划降低上下文切换成本。",
            "#16a34a",
            "Timer",
            -7,
            30,
            "personal",
            6,
            "active",
            "monthly",
            70.0,
        ),
        (
            "example-goal-writing",
            "示例输出 6 篇技术复盘文章",
            "把真实产品迭代、AI 工具链和同步架构经验沉淀成文章。",
            "#0891b2",
            "PenLine",
            1,
            90,
            "growth",
            5,
            "active",
            "yearly",
            25.0,
        ),
    ];
    for (
        id,
        title,
        description,
        color,
        icon,
        start_days,
        due_days,
        category,
        weight,
        status,
        period,
        progress,
    ) in goals
    {
        tx.execute(
            "INSERT INTO goals
                (id, title, description, color, icon, due_at, parent_goal_id, position, created_at, updated_at,
                 progress_mode, progress_value, progress_total, category, start_date, weight, status,
                 review_score, review_note, period, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 'percentage', ?, 100, ?, ?, ?, ?, NULL, NULL, ?, NULL)",
            params![
                id,
                title,
                description,
                color,
                icon,
                date(due_days),
                weight,
                now,
                now,
                progress,
                category,
                date(start_days),
                weight,
                status,
                period
            ],
        )?;
    }

    let milestones = [
        (
            "example-ms-growth-1",
            "example-goal-growth",
            "示例完成账号登录与邮箱验证",
            true,
            -1,
            0,
        ),
        (
            "example-ms-growth-2",
            "example-goal-growth",
            "示例完成多设备冲突处理演练",
            false,
            12,
            1,
        ),
        (
            "example-ms-ai-1",
            "example-goal-ai-feature",
            "示例完成需求提示词模板",
            true,
            3,
            0,
        ),
        (
            "example-ms-rust-1",
            "example-goal-learning-rust",
            "示例完成 Axum + MySQL 项目骨架",
            true,
            -2,
            0,
        ),
        (
            "example-ms-focus-1",
            "example-goal-health-focus",
            "示例连续 7 天记录专注时间",
            false,
            7,
            0,
        ),
        (
            "example-ms-writing-1",
            "example-goal-writing",
            "示例发布第一篇上线复盘",
            false,
            20,
            0,
        ),
    ];
    for (id, goal_id, title, completed, days, position) in milestones {
        tx.execute(
            "INSERT INTO milestones (id, goal_id, title, is_completed, completed_at, position, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![id, goal_id, title, if completed { 1 } else { 0 }, if completed { Some(at(days, 18, 0)) } else { None }, position, now],
        )?;
    }

    let key_results = [
        (
            "example-kr-growth-1",
            "example-goal-growth",
            "示例同步成功率达到 99.5%",
            "metric",
            0.0,
            99.5,
            97.8,
            "%",
            35,
            "normal",
            7,
            false,
            0,
        ),
        (
            "example-kr-growth-2",
            "example-goal-growth",
            "示例完成 20 个真实用户迁移测试",
            "metric",
            0.0,
            20.0,
            12.0,
            "人",
            35,
            "risk",
            14,
            false,
            1,
        ),
        (
            "example-kr-growth-3",
            "example-goal-growth",
            "示例后台关键运营指标完整可看",
            "binary",
            0.0,
            1.0,
            1.0,
            "",
            30,
            "good",
            3,
            true,
            2,
        ),
        (
            "example-kr-ai-1",
            "example-goal-ai-feature",
            "示例生成任务计划准确率达到 80%",
            "metric",
            0.0,
            80.0,
            42.0,
            "%",
            50,
            "normal",
            21,
            false,
            0,
        ),
        (
            "example-kr-rust-1",
            "example-goal-learning-rust",
            "示例完成 12 个后端实战小模块",
            "metric",
            0.0,
            12.0,
            6.0,
            "个",
            45,
            "normal",
            10,
            false,
            0,
        ),
        (
            "example-kr-focus-1",
            "example-goal-health-focus",
            "示例每周深度专注达到 12 小时",
            "metric",
            0.0,
            12.0,
            8.5,
            "小时",
            60,
            "good",
            6,
            false,
            0,
        ),
        (
            "example-kr-writing-1",
            "example-goal-writing",
            "示例完成 6 篇文章中的 2 篇",
            "metric",
            0.0,
            6.0,
            1.0,
            "篇",
            50,
            "risk",
            30,
            false,
            0,
        ),
    ];
    for (
        id,
        goal_id,
        title,
        kr_type,
        start_value,
        target_value,
        current_value,
        unit,
        weight,
        health_status,
        check_days,
        completed,
        position,
    ) in key_results
    {
        tx.execute(
            "INSERT INTO key_results
                (id, goal_id, title, type, start_value, target_value, current_value,
                 unit, weight, health_status, check_date, is_completed, position, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                id,
                goal_id,
                title,
                kr_type,
                start_value,
                target_value,
                current_value,
                if unit.is_empty() {
                    None::<String>
                } else {
                    Some(unit.to_string())
                },
                weight,
                health_status,
                date(check_days),
                if completed { 1 } else { 0 },
                position,
                now
            ],
        )?;
    }

    let goal_tasks = [
        (
            "example-link-growth-1",
            "example-goal-growth",
            "example-kr-growth-1",
            "example-task-growth-3",
        ),
        (
            "example-link-growth-2",
            "example-goal-growth",
            "example-kr-growth-2",
            "example-task-growth-2",
        ),
        (
            "example-link-ai-1",
            "example-goal-ai-feature",
            "example-kr-ai-1",
            "example-task-growth-1",
        ),
        (
            "example-link-rust-1",
            "example-goal-learning-rust",
            "example-kr-rust-1",
            "example-task-learning-2",
        ),
        (
            "example-link-focus-1",
            "example-goal-health-focus",
            "example-kr-focus-1",
            "example-task-learning-5",
        ),
    ];
    for (id, goal_id, kr_id, task_id) in goal_tasks {
        tx.execute(
            "INSERT INTO goal_tasks (id, goal_id, kr_id, task_id, created_at) VALUES (?, ?, ?, ?, ?)",
            params![id, goal_id, kr_id, task_id, now],
        )?;
    }

    let events = [
        (
            "example-event-standup",
            "示例增长实验站会",
            "同步看板状态，确认本周实验阻塞。",
            0,
            9,
            30,
            0,
            10,
            0,
            "#2563eb",
        ),
        (
            "example-event-deepwork",
            "示例AI 功能原型深度工作",
            "关闭通知，完成任务拆解生成流程。",
            0,
            14,
            0,
            0,
            16,
            0,
            "#7c3aed",
        ),
        (
            "example-event-review",
            "示例周复盘与目标检查",
            "检查关键结果进度、更新下周计划。",
            2,
            17,
            30,
            2,
            18,
            30,
            "#16a34a",
        ),
        (
            "example-event-learning",
            "示例Rust 后端练习",
            "练习鉴权、限流和错误提示。",
            3,
            20,
            0,
            3,
            21,
            30,
            "#ea580c",
        ),
        (
            "example-event-all-day",
            "示例产品发布窗口",
            "全天关注用户反馈、同步成功率和安装包下载情况。",
            5,
            0,
            0,
            5,
            23,
            59,
            "#0891b2",
        ),
    ];
    for (
        id,
        title,
        description,
        start_days,
        start_hour,
        start_minute,
        end_days,
        end_hour,
        end_minute,
        color,
    ) in events
    {
        let all_day = if id == "example-event-all-day" { 1 } else { 0 };
        tx.execute(
            "INSERT INTO calendar_events
                (id, title, description, start_time, end_time, all_day, location, source_type,
                 source_account_id, external_uid, sequence, status, readonly, color, holiday_type,
                 raw_ics, created_at, updated_at, synced_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL, 'manual', NULL, NULL, 0, 'confirmed', 0, ?, NULL, NULL, ?, ?, NULL)",
            params![
                id,
                title,
                description,
                at(start_days, start_hour, start_minute),
                at(end_days, end_hour, end_minute),
                all_day,
                color,
                now,
                now
            ],
        )?;
    }

    tx.execute(
        "INSERT INTO settings (key, value) VALUES ('example_seeded_at', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![now],
    )?;
    tx.commit()?;
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
