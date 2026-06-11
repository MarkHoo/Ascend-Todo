use std::sync::Mutex;

use once_cell::sync::Lazy;
use rusqlite::{params, Connection};

use crate::error::AppResult;
use crate::models::{
    Board, CheckIn, Goal, List, Milestone, PomodoroSession, Snapshot, Task, UserProfile,
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
        let mut stmt = c.prepare(
            "SELECT id, board_id, name, position, created_at FROM lists",
        )?;
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

    let mut pomodoros = Vec::new();
    {
        let mut stmt = c.prepare(
            "SELECT id, task_id, mode, duration_seconds, started_at, ended_at, completed FROM pomodoro_sessions",
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
        milestones,
        pomodoro_sessions: pomodoros,
        check_ins,
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
    tx.execute("DELETE FROM tasks", [])?;
    tx.execute("DELETE FROM lists", [])?;
    tx.execute("DELETE FROM boards", [])?;
    tx.execute("DELETE FROM milestones", [])?;
    tx.execute("DELETE FROM goals", [])?;
    tx.execute("DELETE FROM pomodoro_sessions", [])?;
    tx.execute("DELETE FROM check_ins", [])?;
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
            "INSERT INTO goals (id, title, description, color, icon, due_at, parent_goal_id, position, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                g.id, g.title, g.description, g.color, g.icon, g.due_at, g.parent_goal_id,
                g.position, g.created_at, g.updated_at
            ],
        )?;
    }
    for m in &s.milestones {
        tx.execute(
            "INSERT INTO milestones (id, goal_id, title, is_completed, completed_at, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![m.id, m.goal_id, m.title, m.is_completed as i64, m.completed_at, m.position, m.created_at],
        )?;
    }
    for p in &s.pomodoro_sessions {
        tx.execute(
            "INSERT INTO pomodoro_sessions (id, task_id, mode, duration_seconds, started_at, ended_at, completed) VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![p.id, p.task_id, p.mode, p.duration_seconds, p.started_at, p.ended_at, p.completed as i64],
        )?;
    }
    for ck in &s.check_ins {
        tx.execute(
            "INSERT INTO check_ins (id, date, count) VALUES (?, ?, ?)",
            params![ck.id, ck.date, ck.count],
        )?;
    }
    if let Some(p) = &s.user_profile {
        tx.execute(
            "UPDATE user_profile SET nickname = ?, avatar = ?, phone = ?, email = ?, signature = ?, updated_at = ? WHERE id = 'me'",
            params![p.nickname, p.avatar, p.phone, p.email, p.signature, p.updated_at],
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
