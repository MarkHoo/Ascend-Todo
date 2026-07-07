use std::sync::Mutex;

use once_cell::sync::Lazy;
use rusqlite::{params, Connection};

use crate::error::AppResult;
use crate::models::{
    Board, CalendarEmailAccountBackup, CalendarEventBackup, CalendarHolidaySourceBackup, CheckIn,
    Goal, GoalTaskLink, HolidaySyncConfigBackup, KeyResult, List, Milestone, PomodoroSession,
    ProgressLog, ReviewReport, Snapshot, Task, UserProfile,
};

/// Mock in-memory "remote" snapshot. Persists for the lifetime of the process.
static REMOTE: Lazy<Mutex<Option<Snapshot>>> = Lazy::new(|| Mutex::new(None));

pub fn build_snapshot(c: &Connection) -> AppResult<Snapshot> {
    let mut boards = Vec::new();
    {
        let mut stmt = c.prepare(
            "SELECT id, name, description, color, icon, is_pinned, position, created_at, updated_at FROM boards",
        )?;
        for r in stmt.query_map([], |r| {
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
        })? {
            boards.push(r?);
        }
    }

    let mut lists = Vec::new();
    {
        let mut stmt = c.prepare("SELECT id, board_id, name, position, created_at FROM lists")?;
        for r in stmt.query_map([], |r| {
            Ok(List {
                id: r.get(0)?,
                board_id: r.get(1)?,
                name: r.get(2)?,
                position: r.get(3)?,
                created_at: r.get(4)?,
            })
        })? {
            lists.push(r?);
        }
    }

    let mut tasks = Vec::new();
    {
        let mut stmt = c.prepare(
            "SELECT id, list_id, title, description, position, due_at, reminder_at, reminder_time,
                    is_completed, completed_at, parent_task_id, color, status, priority, start_at, created_at, updated_at
             FROM tasks",
        )?;
        for r in stmt.query_map([], |r| {
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
        })? {
            tasks.push(r?);
        }
    }

    let mut goals = Vec::new();
    {
        let mut stmt = c.prepare(
            "SELECT id, title, description, color, icon, due_at, parent_goal_id, position, created_at, updated_at,
                    progress_mode, progress_value, progress_total,
                    category, start_date, weight, status, review_score, review_note, period, deleted_at
             FROM goals WHERE deleted_at IS NULL",
        )?;
        for r in stmt.query_map([], |r| {
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
        })? {
            goals.push(r?);
        }
    }

    let mut milestones = Vec::new();
    {
        let mut stmt = c.prepare(
            "SELECT id, goal_id, title, is_completed, completed_at, position, created_at FROM milestones",
        )?;
        for r in stmt.query_map([], |r| {
            Ok(Milestone {
                id: r.get(0)?,
                goal_id: r.get(1)?,
                title: r.get(2)?,
                is_completed: r.get::<_, i64>(3)? != 0,
                completed_at: r.get(4)?,
                position: r.get(5)?,
                created_at: r.get(6)?,
            })
        })? {
            milestones.push(r?);
        }
    }

    let mut key_results = Vec::new();
    {
        let mut stmt = c.prepare(
            "SELECT id, goal_id, title, type, start_value, target_value, current_value,
                    unit, weight, health_status, check_date, is_completed, position, created_at
             FROM key_results",
        )?;
        for r in stmt.query_map([], |r| {
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
                health_status: r.get(9)?,
                check_date: r.get(10)?,
                is_completed: r.get::<_, i64>(11)? != 0,
                position: r.get(12)?,
                created_at: r.get(13)?,
            })
        })? {
            key_results.push(r?);
        }
    }

    let mut progress_logs = Vec::new();
    {
        let mut stmt = c.prepare(
            "SELECT id, kr_id, old_value, new_value, comment, created_at FROM progress_logs",
        )?;
        for r in stmt.query_map([], |r| {
            Ok(ProgressLog {
                id: r.get(0)?,
                kr_id: r.get(1)?,
                old_value: r.get(2)?,
                new_value: r.get(3)?,
                comment: r.get(4)?,
                created_at: r.get(5)?,
            })
        })? {
            progress_logs.push(r?);
        }
    }

    let mut goal_task_links = Vec::new();
    {
        let mut stmt =
            c.prepare("SELECT id, goal_id, kr_id, task_id, created_at FROM goal_tasks")?;
        for r in stmt.query_map([], |r| {
            Ok(GoalTaskLink {
                id: r.get(0)?,
                goal_id: r.get(1)?,
                kr_id: r.get(2)?,
                task_id: r.get(3)?,
                created_at: r.get(4)?,
            })
        })? {
            goal_task_links.push(r?);
        }
    }

    let mut pomodoros = Vec::new();
    {
        let mut stmt = c.prepare(
            "SELECT id, task_id, mode, duration_seconds, started_at, ended_at, completed,
                    source_event_id, source_title
             FROM pomodoro_sessions",
        )?;
        for r in stmt.query_map([], |r| {
            Ok(PomodoroSession {
                id: r.get(0)?,
                task_id: r.get(1)?,
                mode: r.get(2)?,
                duration_seconds: r.get(3)?,
                started_at: r.get(4)?,
                ended_at: r.get(5)?,
                completed: r.get::<_, i64>(6)? != 0,
                source_event_id: r.get(7)?,
                source_title: r.get(8)?,
            })
        })? {
            pomodoros.push(r?);
        }
    }

    let mut check_ins = Vec::new();
    {
        let mut stmt = c.prepare("SELECT id, date, count FROM check_ins")?;
        for r in stmt.query_map([], |r| {
            Ok(CheckIn {
                id: r.get(0)?,
                date: r.get(1)?,
                count: r.get(2)?,
            })
        })? {
            check_ins.push(r?);
        }
    }

    let mut review_reports = Vec::new();
    {
        let mut stmt = c.prepare(
            "SELECT id, period_type, period_start, period_end, highlights, blockers,
                    lessons, next_actions, score, created_at, updated_at
             FROM review_reports",
        )?;
        for r in stmt.query_map([], |r| {
            Ok(ReviewReport {
                id: r.get(0)?,
                period_type: r.get(1)?,
                period_start: r.get(2)?,
                period_end: r.get(3)?,
                highlights: r.get(4)?,
                blockers: r.get(5)?,
                lessons: r.get(6)?,
                next_actions: r.get(7)?,
                score: r.get(8)?,
                created_at: r.get(9)?,
                updated_at: r.get(10)?,
            })
        })? {
            review_reports.push(r?);
        }
    }

    let mut calendar_events = Vec::new();
    {
        let mut stmt = c.prepare(
            "SELECT id, title, description, start_time, end_time, all_day, location,
                    source_type, source_account_id, external_uid, sequence, status, readonly,
                    color, holiday_type, raw_ics, created_at, updated_at, synced_at
             FROM calendar_events",
        )?;
        for r in stmt.query_map([], |r| {
            Ok(CalendarEventBackup {
                id: r.get(0)?,
                title: r.get(1)?,
                description: r.get(2)?,
                start_time: r.get(3)?,
                end_time: r.get(4)?,
                all_day: r.get::<_, i64>(5)? != 0,
                location: r.get(6)?,
                source_type: r.get(7)?,
                source_account_id: r.get(8)?,
                external_uid: r.get(9)?,
                sequence: r.get(10)?,
                status: r.get(11)?,
                readonly: r.get::<_, i64>(12)? != 0,
                color: r.get(13)?,
                holiday_type: r.get(14)?,
                raw_ics: r.get(15)?,
                created_at: r.get(16)?,
                updated_at: r.get(17)?,
                synced_at: r.get(18)?,
            })
        })? {
            calendar_events.push(r?);
        }
    }

    let mut calendar_holiday_sources = Vec::new();
    {
        let mut stmt = c.prepare(
            "SELECT id, name, source_type, content, url, created_at, updated_at FROM calendar_holiday_sources",
        )?;
        for r in stmt.query_map([], |r| {
            Ok(CalendarHolidaySourceBackup {
                id: r.get(0)?,
                name: r.get(1)?,
                source_type: r.get(2)?,
                content: r.get(3)?,
                url: r.get(4)?,
                created_at: r.get(5)?,
                updated_at: r.get(6)?,
            })
        })? {
            calendar_holiday_sources.push(r?);
        }
    }

    let mut calendar_email_accounts = Vec::new();
    {
        let mut stmt = c.prepare(
            "SELECT id, provider, email, imap_host, imap_port, enabled,
                    sync_interval_minutes, last_sync_at, last_error, created_at, updated_at
             FROM calendar_sync_accounts",
        )?;
        for r in stmt.query_map([], |r| {
            Ok(CalendarEmailAccountBackup {
                id: r.get(0)?,
                provider: r.get(1)?,
                email: r.get(2)?,
                imap_host: r.get(3)?,
                imap_port: r.get(4)?,
                enabled: r.get::<_, i64>(5)? != 0,
                sync_interval_minutes: r.get(6)?,
                last_sync_at: r.get(7)?,
                last_error: r.get(8)?,
                created_at: r.get(9)?,
                updated_at: r.get(10)?,
            })
        })? {
            calendar_email_accounts.push(r?);
        }
    }

    let mut holiday_sync_configs = Vec::new();
    {
        let mut stmt = c.prepare(
            "SELECT id, country_code, region, enabled, show_workdays, source_url,
                    last_sync_at, last_error, updated_at
             FROM holiday_sync_configs",
        )?;
        for r in stmt.query_map([], |r| {
            Ok(HolidaySyncConfigBackup {
                id: r.get(0)?,
                country_code: r.get(1)?,
                region: r.get(2)?,
                enabled: r.get::<_, i64>(3)? != 0,
                show_workdays: r.get::<_, i64>(4)? != 0,
                source_url: r.get(5)?,
                last_sync_at: r.get(6)?,
                last_error: r.get(7)?,
                updated_at: r.get(8)?,
            })
        })? {
            holiday_sync_configs.push(r?);
        }
    }

    let user_profile: Option<UserProfile> = c
        .query_row(
            "SELECT id, nickname, avatar, phone, email, signature, updated_at FROM user_profile WHERE id = 'me'",
            [],
            |r| {
                Ok(UserProfile {
                    id: r.get(0)?,
                    nickname: r.get(1)?,
                    avatar: r.get(2)?,
                    phone: r.get(3)?,
                    email: r.get(4)?,
                    signature: r.get(5)?,
                    updated_at: r.get(6)?,
                })
            },
        )
        .ok();
    let user_profile = user_profile.map(|mut profile| {
        profile.avatar = None;
        profile
    });

    let mut settings = std::collections::HashMap::new();
    {
        let mut stmt = c.prepare("SELECT key, value FROM settings")?;
        for r in stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))? {
            let (k, v) = r?;
            settings.insert(k, v);
        }
    }

    Ok(Snapshot {
        boards,
        lists,
        tasks,
        goals,
        key_results,
        progress_logs,
        goal_task_links,
        milestones,
        pomodoro_sessions: pomodoros,
        check_ins,
        review_reports,
        calendar_events,
        calendar_holiday_sources,
        calendar_email_accounts,
        holiday_sync_configs,
        user_profile,
        settings,
        generated_at: chrono::Utc::now().to_rfc3339(),
    })
}

pub fn mock_push(snap: &Snapshot) -> AppResult<()> {
    log::info!(
        "[mock-sync] push: {} boards, {} tasks, {} goals, {} pomodoros",
        snap.boards.len(),
        snap.tasks.len(),
        snap.goals.len(),
        snap.pomodoro_sessions.len()
    );
    let mut g = REMOTE.lock().expect("remote lock");
    *g = Some(snap.clone());
    Ok(())
}

pub fn mock_pull() -> AppResult<Option<Snapshot>> {
    let g = REMOTE.lock().expect("remote lock");
    Ok(g.clone())
}

pub fn apply_snapshot(c: &Connection, s: &Snapshot) -> AppResult<()> {
    let tx = c.unchecked_transaction()?;
    // Wipe in FK-safe order
    tx.execute("DELETE FROM goal_tasks", [])?;
    tx.execute("DELETE FROM progress_logs", [])?;
    tx.execute("DELETE FROM key_results", [])?;
    tx.execute("DELETE FROM tasks", [])?;
    tx.execute("DELETE FROM lists", [])?;
    tx.execute("DELETE FROM boards", [])?;
    tx.execute("DELETE FROM milestones", [])?;
    tx.execute("DELETE FROM goals", [])?;
    tx.execute("DELETE FROM pomodoro_sessions", [])?;
    tx.execute("DELETE FROM check_ins", [])?;
    tx.execute("DELETE FROM review_reports", [])?;
    tx.execute("DELETE FROM calendar_events", [])?;
    tx.execute("DELETE FROM calendar_holiday_sources", [])?;
    tx.execute("DELETE FROM calendar_sync_accounts", [])?;
    tx.execute("DELETE FROM holiday_sync_configs", [])?;
    tx.execute("DELETE FROM settings", [])?;

    for b in &s.boards {
        tx.execute(
            "INSERT INTO boards (id, name, description, color, icon, is_pinned, position, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                b.id, b.name, b.description, b.color, b.icon,
                b.is_pinned as i64, b.position, b.created_at, b.updated_at
            ],
        )?;
    }
    for l in &s.lists {
        tx.execute(
            "INSERT INTO lists (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)",
            params![l.id, l.board_id, l.name, l.position, l.created_at],
        )?;
    }
    for t in &s.tasks {
        tx.execute(
            "INSERT INTO tasks (id, list_id, title, description, position, due_at, reminder_at, reminder_time,
                                is_completed, completed_at, parent_task_id, color, status, priority, start_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                t.id, t.list_id, t.title, t.description, t.position, t.due_at, t.reminder_at, t.reminder_time,
                t.is_completed as i64, t.completed_at, t.parent_task_id, t.color,
                t.status, t.priority, t.start_at, t.created_at, t.updated_at
            ],
        )?;
    }
    for g in &s.goals {
        tx.execute(
            "INSERT INTO goals
                (id, title, description, color, icon, due_at, parent_goal_id, position, created_at, updated_at,
                 progress_mode, progress_value, progress_total, category, start_date, weight, status,
                 review_score, review_note, period, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                g.id, g.title, g.description, g.color, g.icon, g.due_at, g.parent_goal_id,
                g.position, g.created_at, g.updated_at, g.progress_mode, g.progress_value,
                g.progress_total, g.category, g.start_date, g.weight, g.status, g.review_score,
                g.review_note, g.period, g.deleted_at
            ],
        )?;
    }
    for m in &s.milestones {
        tx.execute(
            "INSERT INTO milestones (id, goal_id, title, is_completed, completed_at, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![m.id, m.goal_id, m.title, m.is_completed as i64, m.completed_at, m.position, m.created_at],
        )?;
    }
    for kr in &s.key_results {
        tx.execute(
            "INSERT INTO key_results
                (id, goal_id, title, type, start_value, target_value, current_value,
                 unit, weight, health_status, check_date, is_completed, position, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                kr.id,
                kr.goal_id,
                kr.title,
                kr.kr_type,
                kr.start_value,
                kr.target_value,
                kr.current_value,
                kr.unit,
                kr.weight,
                kr.health_status,
                kr.check_date,
                kr.is_completed as i64,
                kr.position,
                kr.created_at
            ],
        )?;
    }
    for log in &s.progress_logs {
        tx.execute(
            "INSERT INTO progress_logs (id, kr_id, old_value, new_value, comment, created_at)
             VALUES (?, ?, ?, ?, ?, ?)",
            params![
                log.id,
                log.kr_id,
                log.old_value,
                log.new_value,
                log.comment,
                log.created_at
            ],
        )?;
    }
    for link in &s.goal_task_links {
        tx.execute(
            "INSERT INTO goal_tasks (id, goal_id, kr_id, task_id, created_at)
             VALUES (?, ?, ?, ?, ?)",
            params![
                link.id,
                link.goal_id,
                link.kr_id,
                link.task_id,
                link.created_at
            ],
        )?;
    }
    for p in &s.pomodoro_sessions {
        tx.execute(
            "INSERT INTO pomodoro_sessions
                (id, task_id, mode, duration_seconds, started_at, ended_at, completed, source_event_id, source_title)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                p.id, p.task_id, p.mode, p.duration_seconds, p.started_at, p.ended_at,
                p.completed as i64, p.source_event_id, p.source_title
            ],
        )?;
    }
    for ck in &s.check_ins {
        tx.execute(
            "INSERT INTO check_ins (id, date, count) VALUES (?, ?, ?)",
            params![ck.id, ck.date, ck.count],
        )?;
    }
    for report in &s.review_reports {
        tx.execute(
            "INSERT INTO review_reports
                (id, period_type, period_start, period_end, highlights, blockers,
                 lessons, next_actions, score, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                report.id,
                report.period_type,
                report.period_start,
                report.period_end,
                report.highlights,
                report.blockers,
                report.lessons,
                report.next_actions,
                report.score,
                report.created_at,
                report.updated_at
            ],
        )?;
    }
    for event in &s.calendar_events {
        tx.execute(
            "INSERT INTO calendar_events
                (id, title, description, start_time, end_time, all_day, location,
                 source_type, source_account_id, external_uid, sequence, status, readonly,
                 color, holiday_type, raw_ics, created_at, updated_at, synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                event.id,
                event.title,
                event.description,
                event.start_time,
                event.end_time,
                event.all_day as i64,
                event.location,
                event.source_type,
                event.source_account_id,
                event.external_uid,
                event.sequence,
                event.status,
                event.readonly as i64,
                event.color,
                event.holiday_type,
                event.raw_ics,
                event.created_at,
                event.updated_at,
                event.synced_at
            ],
        )?;
    }
    for source in &s.calendar_holiday_sources {
        tx.execute(
            "INSERT INTO calendar_holiday_sources (id, name, source_type, content, url, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![
                source.id, source.name, source.source_type, source.content, source.url,
                source.created_at, source.updated_at
            ],
        )?;
    }
    for account in &s.calendar_email_accounts {
        tx.execute(
            "INSERT INTO calendar_sync_accounts
                (id, provider, email, imap_host, imap_port, enabled,
                 sync_interval_minutes, last_sync_at, last_error, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                account.id,
                account.provider,
                account.email,
                account.imap_host,
                account.imap_port,
                account.enabled as i64,
                account.sync_interval_minutes,
                account.last_sync_at,
                account.last_error,
                account.created_at,
                account.updated_at
            ],
        )?;
    }
    for config in &s.holiday_sync_configs {
        tx.execute(
            "INSERT INTO holiday_sync_configs
                (id, country_code, region, enabled, show_workdays, source_url,
                 last_sync_at, last_error, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                config.id,
                config.country_code,
                config.region,
                config.enabled as i64,
                config.show_workdays as i64,
                config.source_url,
                config.last_sync_at,
                config.last_error,
                config.updated_at
            ],
        )?;
    }
    if let Some(p) = &s.user_profile {
        tx.execute(
            "UPDATE user_profile SET nickname = ?, phone = ?, email = ?, signature = ?, updated_at = ? WHERE id = 'me'",
            params![p.nickname, p.phone, p.email, p.signature, p.updated_at],
        )?;
    }
    for (k, v) in &s.settings {
        tx.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![k, v],
        )?;
    }
    tx.commit()?;
    Ok(())
}
