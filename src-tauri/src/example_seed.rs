use rusqlite::{params, Connection};

use crate::db::now;
use crate::error::AppResult;

#[derive(Clone, Copy)]
enum SeedLanguage {
    ZhCn,
    ZhTw,
    En,
}

struct BoardSeed {
    id: &'static str,
    name: &'static str,
    description: &'static str,
}

struct ListSeed {
    id: &'static str,
    name: &'static str,
}

struct TaskSeed {
    id: &'static str,
    list_id: &'static str,
    title: &'static str,
    description: &'static str,
    start_days: i64,
    start_hour: u32,
    start_minute: u32,
    duration_minutes: i64,
    status: &'static str,
    priority: &'static str,
    color: &'static str,
}

struct GoalSeed {
    id: &'static str,
    title: &'static str,
    description: &'static str,
    color: &'static str,
    icon: &'static str,
    category: &'static str,
    start_days: i64,
    due_days: i64,
    progress: f64,
    key_results: Vec<KeyResultSeed>,
}

struct KeyResultSeed {
    id: &'static str,
    title: &'static str,
    target: f64,
    current: f64,
    unit: &'static str,
    weight: i32,
    check_days: i64,
}

struct EventSeed {
    id: &'static str,
    title: &'static str,
    description: &'static str,
    days: i64,
    start_hour: u32,
    start_minute: u32,
    duration_minutes: i64,
    color: &'static str,
    location: &'static str,
}

struct SeedCopy {
    prefix: &'static str,
    board: BoardSeed,
    lists: Vec<ListSeed>,
    tasks: Vec<TaskSeed>,
    goals: Vec<GoalSeed>,
    events: Vec<EventSeed>,
}

pub fn seed_example_data(conn: &Connection) -> AppResult<()> {
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

    let language = detect_seed_language(conn);
    let copy = seed_copy(language);
    let tx = conn.unchecked_transaction()?;
    let created_at = now();
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
    let add_minutes = |days: i64, hour: u32, minute: u32, minutes: i64| {
        let start = (today + chrono::Duration::days(days))
            .and_hms_opt(hour, minute, 0)
            .expect("valid seed time");
        format!(
            "{}{}",
            (start + chrono::Duration::minutes(minutes)).format("%Y-%m-%dT%H:%M:%S"),
            offset
        )
    };
    let title = |raw: &str| format!("{}{}", copy.prefix, raw);

    tx.execute(
        "INSERT INTO boards (id, name, description, color, icon, is_pinned, position, created_at, updated_at)
         VALUES (?, ?, ?, '#2563eb', 'Bot', 1, 0, ?, ?)",
        params![
            copy.board.id,
            title(copy.board.name),
            copy.board.description,
            created_at,
            created_at
        ],
    )?;

    for (position, list) in copy.lists.iter().enumerate() {
        tx.execute(
            "INSERT INTO lists (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)",
            params![
                list.id,
                copy.board.id,
                list.name,
                position as i32,
                created_at
            ],
        )?;
    }

    for (position, task) in copy.tasks.iter().enumerate() {
        let start_at = at(task.start_days, task.start_hour, task.start_minute);
        let due_at = add_minutes(
            task.start_days,
            task.start_hour,
            task.start_minute,
            task.duration_minutes,
        );
        tx.execute(
            "INSERT INTO tasks
                (id, list_id, title, description, position, due_at, reminder_at, reminder_time,
                 is_completed, completed_at, parent_task_id, color, status, priority, start_at,
                 created_at, updated_at, last_notified_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL)",
            params![
                task.id,
                task.list_id,
                title(task.title),
                task.description,
                position as i32,
                due_at,
                start_at,
                format!("{:02}:{:02}", task.start_hour, task.start_minute),
                if task.status == "completed" { 1 } else { 0 },
                if task.status == "completed" {
                    Some(due_at.clone())
                } else {
                    None::<String>
                },
                task.color,
                task.status,
                task.priority,
                start_at,
                created_at,
                created_at
            ],
        )?;
    }

    for (position, goal) in copy.goals.iter().enumerate() {
        tx.execute(
            "INSERT INTO goals
                (id, title, description, color, icon, due_at, parent_goal_id, position, created_at, updated_at,
                 progress_mode, progress_value, progress_total, category, start_date, weight, status,
                 review_score, review_note, period, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 'percentage', ?, 100, ?, ?, 8, 'active',
                     NULL, NULL, 'quarterly', NULL)",
            params![
                goal.id,
                title(goal.title),
                goal.description,
                goal.color,
                goal.icon,
                date(goal.due_days),
                position as i32,
                created_at,
                created_at,
                goal.progress,
                goal.category,
                date(goal.start_days),
            ],
        )?;

        tx.execute(
            "INSERT INTO milestones (id, goal_id, title, is_completed, completed_at, position, created_at)
             VALUES (?, ?, ?, 0, NULL, 0, ?)",
            params![
                format!("{}-milestone-1", goal.id),
                goal.id,
                title(milestone_title(language)),
                created_at
            ],
        )?;

        for (kr_position, kr) in goal.key_results.iter().enumerate() {
            tx.execute(
                "INSERT INTO key_results
                    (id, goal_id, title, type, start_value, target_value, current_value,
                     unit, weight, health_status, check_date, is_completed, position, created_at)
                 VALUES (?, ?, ?, 'metric', 0, ?, ?, ?, ?, 'normal', ?, 0, ?, ?)",
                params![
                    kr.id,
                    goal.id,
                    title(kr.title),
                    kr.target,
                    kr.current,
                    if kr.unit.is_empty() {
                        None::<String>
                    } else {
                        Some(kr.unit.to_string())
                    },
                    kr.weight,
                    date(kr.check_days),
                    kr_position as i32,
                    created_at
                ],
            )?;
        }
    }

    for event in copy.events {
        tx.execute(
            "INSERT INTO calendar_events
                (id, title, description, start_time, end_time, all_day, location,
                 source_type, source_account_id, external_uid, sequence, status, readonly,
                 color, holiday_type, raw_ics, created_at, updated_at, synced_at)
             VALUES (?, ?, ?, ?, ?, 0, ?, 'manual', NULL, NULL, 0, 'confirmed', 0,
                     ?, NULL, NULL, ?, ?, NULL)",
            params![
                event.id,
                title(event.title),
                event.description,
                at(event.days, event.start_hour, event.start_minute),
                add_minutes(
                    event.days,
                    event.start_hour,
                    event.start_minute,
                    event.duration_minutes
                ),
                event.location,
                event.color,
                created_at,
                created_at,
            ],
        )?;
    }

    tx.execute(
        "INSERT INTO settings (key, value) VALUES ('example_seeded_at', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![created_at],
    )?;
    tx.commit()?;
    Ok(())
}

fn detect_seed_language(conn: &Connection) -> SeedLanguage {
    if let Ok(language) = conn.query_row(
        "SELECT value FROM settings WHERE key = 'language'",
        [],
        |r| r.get::<_, String>(0),
    ) {
        return normalize_language(&language);
    }
    normalize_language(&sys_locale::get_locale().unwrap_or_default())
}

fn normalize_language(language: &str) -> SeedLanguage {
    let normalized = language.to_lowercase();
    if normalized.contains("zh-tw")
        || normalized.contains("zh-hk")
        || normalized.contains("zh_mo")
        || normalized.contains("hant")
    {
        SeedLanguage::ZhTw
    } else if normalized.contains("zh") {
        SeedLanguage::ZhCn
    } else {
        SeedLanguage::En
    }
}

fn milestone_title(language: SeedLanguage) -> &'static str {
    match language {
        SeedLanguage::ZhCn => "完成第一轮阶段复盘",
        SeedLanguage::ZhTw => "完成第一輪階段復盤",
        SeedLanguage::En => "Finish the first checkpoint review",
    }
}

fn seed_copy(language: SeedLanguage) -> SeedCopy {
    match language {
        SeedLanguage::ZhCn => zh_cn_copy(),
        SeedLanguage::ZhTw => zh_tw_copy(),
        SeedLanguage::En => en_copy(),
    }
}

fn zh_cn_copy() -> SeedCopy {
    SeedCopy {
        prefix: "【示例】",
        board: BoardSeed {
            id: "example-board-agent-life",
            name: "生活与 Agent 学习计划",
            description: "把日常生活整理、学习 Agent 开发和小型实践放在同一个节奏里，适合首次体验看板、目标和日历。",
        },
        lists: vec![
            ListSeed { id: "example-list-today", name: "今日整理" },
            ListSeed { id: "example-list-learning", name: "本周学习" },
            ListSeed { id: "example-list-build", name: "实践开发" },
            ListSeed { id: "example-list-review", name: "复盘沉淀" },
        ],
        tasks: vec![
            TaskSeed { id: "example-task-life-1", list_id: "example-list-today", title: "整理本周生活待办", description: r#"## 今天先收口
- 账单、快递、家务各列 1-2 件
- 标出必须今天完成的事项
- 不超过 30 分钟，避免整理本身变成负担"#, start_days: 0, start_hour: 8, start_minute: 30, duration_minutes: 30, status: "doing", priority: "medium", color: "#16a34a" },
            TaskSeed { id: "example-task-agent-1", list_id: "example-list-learning", title: "阅读一篇 Agent 架构文章", description: r#"## 阅读关注点
- Agent 的任务规划方式
- 工具调用和上下文管理
- 失败重试与人工确认边界

> 不追求全部记住，只提炼 3 条可实践结论。"#, start_days: 0, start_hour: 10, start_minute: 20, duration_minutes: 40, status: "doing", priority: "high", color: "#2563eb" },
            TaskSeed { id: "example-task-agent-2", list_id: "example-list-learning", title: "梳理一个个人知识库场景", description: r#"## 场景描述
让 Agent 根据个人笔记回答问题，并在不确定时引用原文来源。

### 边界
- 不编造不存在的笔记
- 回答必须带来源
- 私密内容默认不外发"#, start_days: 0, start_hour: 15, start_minute: 30, duration_minutes: 45, status: "not_started", priority: "high", color: "#7c3aed" },
            TaskSeed { id: "example-task-agent-3", list_id: "example-list-build", title: "搭建最小工具调用 Demo", description: r#"## Demo 范围
- 一个读取本地 Markdown 的工具
- 一个查询待办事项的工具
- Agent 根据问题决定是否调用工具

```text
先验证工具调用链路，再优化界面。
```"#, start_days: 1, start_hour: 9, start_minute: 40, duration_minutes: 50, status: "not_started", priority: "high", color: "#0ea5e9" },
            TaskSeed { id: "example-task-agent-4", list_id: "example-list-review", title: "记录一次 Agent 失败案例", description: r#"## 复盘模板
- 失败发生在哪一步？
- 是提示词、工具结果还是上下文不足？
- 下次需要增加什么保护？

> 重点不是追责，而是把失败变成规则。"#, start_days: 1, start_hour: 20, start_minute: 10, duration_minutes: 35, status: "not_started", priority: "medium", color: "#f97316" },
            TaskSeed { id: "example-task-life-2", list_id: "example-list-today", title: "安排一次轻量运动", description: r#"## 运动目标
- 快走 25 分钟
- 拉伸 10 分钟
- 回来后记录身体状态

保持低门槛，优先稳定执行。"#, start_days: 2, start_hour: 18, start_minute: 40, duration_minutes: 35, status: "not_started", priority: "medium", color: "#22c55e" },
            TaskSeed { id: "example-task-agent-5", list_id: "example-list-learning", title: "整理 Agent 开发术语卡片", description: r#"## 术语卡片
- Tool Calling
- RAG
- Context Window
- Memory
- Evaluation
- MCP

每个术语写一句自己的理解和一个例子。"#, start_days: 3, start_hour: 10, start_minute: 0, duration_minutes: 40, status: "not_started", priority: "medium", color: "#0891b2" },
            TaskSeed { id: "example-task-review-1", list_id: "example-list-review", title: "写一份周末学习复盘", description: r#"## 复盘问题
1. 哪个概念真正用起来了？
2. 哪个环节最容易卡住？
3. 下周只改进一个什么动作？"#, start_days: 5, start_hour: 16, start_minute: 0, duration_minutes: 45, status: "not_started", priority: "low", color: "#64748b" },
        ],
        goals: zh_cn_goals(),
        events: vec![
            EventSeed { id: "example-event-life-plan", title: "晨间生活整理", description: r#"## 今日整理
- 看一眼日历
- 选出 3 件最重要的事
- 给学习任务留出缓冲"#, days: 0, start_hour: 8, start_minute: 20, duration_minutes: 30, color: "#16a34a", location: "家中书桌" },
            EventSeed { id: "example-event-agent-reading", title: "Agent 论文/文章阅读", description: r#"阅读一篇 Agent 或 RAG 相关文章，只记录：
- 一个新概念
- 一个可实践方法
- 一个仍不理解的问题"#, days: 0, start_hour: 20, start_minute: 0, duration_minutes: 45, color: "#2563eb", location: "安静角落" },
            EventSeed { id: "example-event-agent-demo", title: "工具调用 Demo 实验", description: r#"## 实验目标
验证 Agent 能否根据用户问题选择正确工具。

### 不做
- 不做复杂 UI
- 不接入真实隐私数据
- 不追求一次完成"#, days: 1, start_hour: 14, start_minute: 30, duration_minutes: 60, color: "#0ea5e9", location: "电脑前" },
            EventSeed { id: "example-event-week-review", title: "周末生活与学习复盘", description: r#"## 复盘
- 本周生活节奏是否稳定？
- Agent 学习卡在哪里？
- 下周只保留一个最重要实验"#, days: 4, start_hour: 19, start_minute: 30, duration_minutes: 45, color: "#f97316", location: "家中书桌" },
        ],
    }
}

fn zh_cn_goals() -> Vec<GoalSeed> {
    vec![
        GoalSeed {
            id: "example-goal-agent-kb",
            title: "完成一个个人知识库 Agent 原型",
            description: r#"## 目标说明
做一个只服务个人学习的知识库 Agent 原型。

### 重点
- 回答要能引用来源
- 不确定时明确说不知道
- 工具失败时给出可理解提示"#,
            color: "#2563eb",
            icon: "Bot",
            category: "learning",
            start_days: 0,
            due_days: 28,
            progress: 25.0,
            key_results: vec![
                KeyResultSeed {
                    id: "example-kr-agent-kb-1",
                    title: "完成 1 个本地笔记读取工具",
                    target: 1.0,
                    current: 0.0,
                    unit: "个",
                    weight: 30,
                    check_days: 7,
                },
                KeyResultSeed {
                    id: "example-kr-agent-kb-2",
                    title: "接入 2 类可查询资料源",
                    target: 2.0,
                    current: 0.0,
                    unit: "类",
                    weight: 25,
                    check_days: 14,
                },
                KeyResultSeed {
                    id: "example-kr-agent-kb-3",
                    title: "完成 5 条真实问题测试",
                    target: 5.0,
                    current: 1.0,
                    unit: "条",
                    weight: 25,
                    check_days: 21,
                },
                KeyResultSeed {
                    id: "example-kr-agent-kb-4",
                    title: "写完 1 份原型复盘说明",
                    target: 1.0,
                    current: 0.0,
                    unit: "份",
                    weight: 20,
                    check_days: 28,
                },
            ],
        },
        GoalSeed {
            id: "example-goal-agent-foundation",
            title: "建立 Agent 开发基础知识体系",
            description: r#"## 学习范围
- Tool Calling
- RAG 与向量检索
- 上下文压缩
- 多轮任务规划
- Eval 与安全边界
- MCP 工具生态

> 目标不是追热点，而是形成能动手的知识结构。"#,
            color: "#7c3aed",
            icon: "BrainCircuit",
            category: "learning",
            start_days: 0,
            due_days: 35,
            progress: 35.0,
            key_results: vec![
                KeyResultSeed {
                    id: "example-kr-agent-foundation-1",
                    title: "阅读 6 篇高质量 Agent/RAG 文章",
                    target: 6.0,
                    current: 2.0,
                    unit: "篇",
                    weight: 35,
                    check_days: 14,
                },
                KeyResultSeed {
                    id: "example-kr-agent-foundation-2",
                    title: "整理 20 张术语卡片",
                    target: 20.0,
                    current: 6.0,
                    unit: "张",
                    weight: 30,
                    check_days: 21,
                },
                KeyResultSeed {
                    id: "example-kr-agent-foundation-3",
                    title: "完成 3 次小型代码实验",
                    target: 3.0,
                    current: 1.0,
                    unit: "次",
                    weight: 35,
                    check_days: 28,
                },
            ],
        },
        GoalSeed {
            id: "example-goal-life-rhythm",
            title: "保持日常生活稳定节奏",
            description: r#"## 目标说明
学习新技术时也要维持基本生活节奏。

- 运动保持低强度
- 睡前只整理 10 分钟
- 精力差时主动降低任务量"#,
            color: "#16a34a",
            icon: "HeartPulse",
            category: "health",
            start_days: 0,
            due_days: 30,
            progress: 40.0,
            key_results: vec![
                KeyResultSeed {
                    id: "example-kr-life-1",
                    title: "完成 12 次轻量运动",
                    target: 12.0,
                    current: 4.0,
                    unit: "次",
                    weight: 40,
                    check_days: 12,
                },
                KeyResultSeed {
                    id: "example-kr-life-2",
                    title: "完成 8 次睡前整理",
                    target: 8.0,
                    current: 3.0,
                    unit: "次",
                    weight: 30,
                    check_days: 18,
                },
                KeyResultSeed {
                    id: "example-kr-life-3",
                    title: "记录 14 天精力状态",
                    target: 14.0,
                    current: 5.0,
                    unit: "天",
                    weight: 30,
                    check_days: 24,
                },
            ],
        },
    ]
}

fn zh_tw_copy() -> SeedCopy {
    SeedCopy {
        prefix: "【範例】",
        board: BoardSeed {
            id: "example-board-agent-life",
            name: "生活與 Agent 學習計畫",
            description: "把日常生活整理、學習 Agent 開發和小型實作放在同一個節奏裡，適合首次體驗看板、目標和日曆。",
        },
        lists: vec![
            ListSeed { id: "example-list-today", name: "今日整理" },
            ListSeed { id: "example-list-learning", name: "本週學習" },
            ListSeed { id: "example-list-build", name: "實作開發" },
            ListSeed { id: "example-list-review", name: "復盤沉澱" },
        ],
        tasks: vec![
            TaskSeed { id: "example-task-life-1", list_id: "example-list-today", title: "整理本週生活待辦", description: r#"## 今天先收口
- 帳單、包裹、家務各列 1-2 件
- 標出必須今天完成的事項
- 不超過 30 分鐘，避免整理本身變成負擔"#, start_days: 0, start_hour: 8, start_minute: 30, duration_minutes: 30, status: "doing", priority: "medium", color: "#16a34a" },
            TaskSeed { id: "example-task-agent-1", list_id: "example-list-learning", title: "閱讀一篇 Agent 架構文章", description: r#"## 閱讀關注點
- Agent 的任務規劃方式
- 工具調用和上下文管理
- 失敗重試與人工確認邊界

> 不追求全部記住，只提煉 3 條可實踐結論。"#, start_days: 0, start_hour: 10, start_minute: 20, duration_minutes: 40, status: "doing", priority: "high", color: "#2563eb" },
            TaskSeed { id: "example-task-agent-2", list_id: "example-list-learning", title: "梳理一個個人知識庫場景", description: r#"## 場景描述
讓 Agent 根據個人筆記回答問題，並在不確定時引用原文來源。

### 邊界
- 不編造不存在的筆記
- 回答必須帶來源
- 私密內容預設不外發"#, start_days: 0, start_hour: 15, start_minute: 30, duration_minutes: 45, status: "not_started", priority: "high", color: "#7c3aed" },
            TaskSeed { id: "example-task-agent-3", list_id: "example-list-build", title: "搭建最小工具調用 Demo", description: r#"## Demo 範圍
- 一個讀取本地 Markdown 的工具
- 一個查詢待辦事項的工具
- Agent 根據問題決定是否調用工具

```text
先驗證工具調用鏈路，再優化介面。
```"#, start_days: 1, start_hour: 9, start_minute: 40, duration_minutes: 50, status: "not_started", priority: "high", color: "#0ea5e9" },
            TaskSeed { id: "example-task-agent-4", list_id: "example-list-review", title: "記錄一次 Agent 失敗案例", description: r#"## 復盤模板
- 失敗發生在哪一步？
- 是提示詞、工具結果還是上下文不足？
- 下次需要增加什麼保護？

> 重點不是追責，而是把失敗變成規則。"#, start_days: 1, start_hour: 20, start_minute: 10, duration_minutes: 35, status: "not_started", priority: "medium", color: "#f97316" },
            TaskSeed { id: "example-task-life-2", list_id: "example-list-today", title: "安排一次輕量運動", description: r#"## 運動目標
- 快走 25 分鐘
- 拉伸 10 分鐘
- 回來後記錄身體狀態

保持低門檻，優先穩定執行。"#, start_days: 2, start_hour: 18, start_minute: 40, duration_minutes: 35, status: "not_started", priority: "medium", color: "#22c55e" },
            TaskSeed { id: "example-task-agent-5", list_id: "example-list-learning", title: "整理 Agent 開發術語卡片", description: r#"## 術語卡片
- Tool Calling
- RAG
- Context Window
- Memory
- Evaluation
- MCP

每個術語寫一句自己的理解和一個例子。"#, start_days: 3, start_hour: 10, start_minute: 0, duration_minutes: 40, status: "not_started", priority: "medium", color: "#0891b2" },
            TaskSeed { id: "example-task-review-1", list_id: "example-list-review", title: "寫一份週末學習復盤", description: r#"## 復盤問題
1. 哪個概念真正用起來了？
2. 哪個環節最容易卡住？
3. 下週只改進一個什麼動作？"#, start_days: 5, start_hour: 16, start_minute: 0, duration_minutes: 45, status: "not_started", priority: "low", color: "#64748b" },
        ],
        goals: zh_tw_goals(),
        events: vec![
            EventSeed { id: "example-event-life-plan", title: "晨間生活整理", description: r#"## 今日整理
- 看一眼日曆
- 選出 3 件最重要的事
- 給學習任務留出緩衝"#, days: 0, start_hour: 8, start_minute: 20, duration_minutes: 30, color: "#16a34a", location: "家中書桌" },
            EventSeed { id: "example-event-agent-reading", title: "Agent 論文/文章閱讀", description: r#"閱讀一篇 Agent 或 RAG 相關文章，只記錄：
- 一個新概念
- 一個可實踐方法
- 一個仍不理解的問題"#, days: 0, start_hour: 20, start_minute: 0, duration_minutes: 45, color: "#2563eb", location: "安靜角落" },
            EventSeed { id: "example-event-agent-demo", title: "工具調用 Demo 實驗", description: r#"## 實驗目標
驗證 Agent 能否根據使用者問題選擇正確工具。

### 不做
- 不做複雜 UI
- 不接入真實隱私資料
- 不追求一次完成"#, days: 1, start_hour: 14, start_minute: 30, duration_minutes: 60, color: "#0ea5e9", location: "電腦前" },
            EventSeed { id: "example-event-week-review", title: "週末生活與學習復盤", description: r#"## 復盤
- 本週生活節奏是否穩定？
- Agent 學習卡在哪裡？
- 下週只保留一個最重要實驗"#, days: 4, start_hour: 19, start_minute: 30, duration_minutes: 45, color: "#f97316", location: "家中書桌" },
        ],
    }
}

fn zh_tw_goals() -> Vec<GoalSeed> {
    vec![
        GoalSeed {
            id: "example-goal-agent-kb",
            title: "完成一個個人知識庫 Agent 原型",
            description: r#"## 目標說明
做一個只服務個人學習的知識庫 Agent 原型。

### 重點
- 回答要能引用來源
- 不確定時明確說不知道
- 工具失敗時給出可理解提示"#,
            color: "#2563eb",
            icon: "Bot",
            category: "learning",
            start_days: 0,
            due_days: 28,
            progress: 25.0,
            key_results: vec![
                KeyResultSeed {
                    id: "example-kr-agent-kb-1",
                    title: "完成 1 個本地筆記讀取工具",
                    target: 1.0,
                    current: 0.0,
                    unit: "個",
                    weight: 30,
                    check_days: 7,
                },
                KeyResultSeed {
                    id: "example-kr-agent-kb-2",
                    title: "接入 2 類可查詢資料源",
                    target: 2.0,
                    current: 0.0,
                    unit: "類",
                    weight: 25,
                    check_days: 14,
                },
                KeyResultSeed {
                    id: "example-kr-agent-kb-3",
                    title: "完成 5 條真實問題測試",
                    target: 5.0,
                    current: 1.0,
                    unit: "條",
                    weight: 25,
                    check_days: 21,
                },
                KeyResultSeed {
                    id: "example-kr-agent-kb-4",
                    title: "寫完 1 份原型復盤說明",
                    target: 1.0,
                    current: 0.0,
                    unit: "份",
                    weight: 20,
                    check_days: 28,
                },
            ],
        },
        GoalSeed {
            id: "example-goal-agent-foundation",
            title: "建立 Agent 開發基礎知識體系",
            description: r#"## 學習範圍
- Tool Calling
- RAG 與向量檢索
- 上下文壓縮
- 多輪任務規劃
- Eval 與安全邊界
- MCP 工具生態

> 目標不是追熱點，而是形成能動手的知識結構。"#,
            color: "#7c3aed",
            icon: "BrainCircuit",
            category: "learning",
            start_days: 0,
            due_days: 35,
            progress: 35.0,
            key_results: vec![
                KeyResultSeed {
                    id: "example-kr-agent-foundation-1",
                    title: "閱讀 6 篇高品質 Agent/RAG 文章",
                    target: 6.0,
                    current: 2.0,
                    unit: "篇",
                    weight: 35,
                    check_days: 14,
                },
                KeyResultSeed {
                    id: "example-kr-agent-foundation-2",
                    title: "整理 20 張術語卡片",
                    target: 20.0,
                    current: 6.0,
                    unit: "張",
                    weight: 30,
                    check_days: 21,
                },
                KeyResultSeed {
                    id: "example-kr-agent-foundation-3",
                    title: "完成 3 次小型程式實驗",
                    target: 3.0,
                    current: 1.0,
                    unit: "次",
                    weight: 35,
                    check_days: 28,
                },
            ],
        },
        GoalSeed {
            id: "example-goal-life-rhythm",
            title: "保持日常生活穩定節奏",
            description: r#"## 目標說明
學習新技術時也要維持基本生活節奏。

- 運動保持低強度
- 睡前只整理 10 分鐘
- 精力差時主動降低任務量"#,
            color: "#16a34a",
            icon: "HeartPulse",
            category: "health",
            start_days: 0,
            due_days: 30,
            progress: 40.0,
            key_results: vec![
                KeyResultSeed {
                    id: "example-kr-life-1",
                    title: "完成 12 次輕量運動",
                    target: 12.0,
                    current: 4.0,
                    unit: "次",
                    weight: 40,
                    check_days: 12,
                },
                KeyResultSeed {
                    id: "example-kr-life-2",
                    title: "完成 8 次睡前整理",
                    target: 8.0,
                    current: 3.0,
                    unit: "次",
                    weight: 30,
                    check_days: 18,
                },
                KeyResultSeed {
                    id: "example-kr-life-3",
                    title: "記錄 14 天精力狀態",
                    target: 14.0,
                    current: 5.0,
                    unit: "天",
                    weight: 30,
                    check_days: 24,
                },
            ],
        },
    ]
}

fn en_copy() -> SeedCopy {
    SeedCopy {
        prefix: "【Sample】",
        board: BoardSeed {
            id: "example-board-agent-life",
            name: "Life and Agent Learning Plan",
            description: "A practical board for daily life cleanup, learning Agent development, and building small experiments.",
        },
        lists: vec![
            ListSeed { id: "example-list-today", name: "Today" },
            ListSeed { id: "example-list-learning", name: "Learning This Week" },
            ListSeed { id: "example-list-build", name: "Build Practice" },
            ListSeed { id: "example-list-review", name: "Review Notes" },
        ],
        tasks: vec![
            TaskSeed { id: "example-task-life-1", list_id: "example-list-today", title: "Organize this week's life errands", description: r#"## Close the loop today
- List 1-2 items for bills, deliveries, and chores
- Mark what must be done today
- Keep it under 30 minutes so planning does not become the work"#, start_days: 0, start_hour: 8, start_minute: 30, duration_minutes: 30, status: "doing", priority: "medium", color: "#16a34a" },
            TaskSeed { id: "example-task-agent-1", list_id: "example-list-learning", title: "Read one Agent architecture article", description: r#"## Reading focus
- How the Agent plans tasks
- Tool calling and context management
- Retry behavior and human-confirmation boundaries

> Do not memorize everything. Extract three usable takeaways."#, start_days: 0, start_hour: 10, start_minute: 20, duration_minutes: 40, status: "doing", priority: "high", color: "#2563eb" },
            TaskSeed { id: "example-task-agent-2", list_id: "example-list-learning", title: "Define a personal knowledge-base scenario", description: r#"## Scenario
Let an Agent answer questions from personal notes and cite the original source when uncertain.

### Boundaries
- Do not invent notes that do not exist
- Answers must include sources
- Private content does not leave the device by default"#, start_days: 0, start_hour: 15, start_minute: 30, duration_minutes: 45, status: "not_started", priority: "high", color: "#7c3aed" },
            TaskSeed { id: "example-task-agent-3", list_id: "example-list-build", title: "Build a minimal tool-calling demo", description: r#"## Demo scope
- A tool that reads local Markdown
- A tool that queries todo items
- The Agent decides whether to call a tool based on the question

```text
Validate the tool chain first. Polish the interface later.
```"#, start_days: 1, start_hour: 9, start_minute: 40, duration_minutes: 50, status: "not_started", priority: "high", color: "#0ea5e9" },
            TaskSeed { id: "example-task-agent-4", list_id: "example-list-review", title: "Record one Agent failure case", description: r#"## Review template
- Where did the failure happen?
- Was it the prompt, tool result, or missing context?
- What guardrail should be added next time?

> The point is not blame. Turn the failure into a rule."#, start_days: 1, start_hour: 20, start_minute: 10, duration_minutes: 35, status: "not_started", priority: "medium", color: "#f97316" },
            TaskSeed { id: "example-task-life-2", list_id: "example-list-today", title: "Schedule one light exercise session", description: r#"## Exercise goal
- Fast walk for 25 minutes
- Stretch for 10 minutes
- Record how your body feels afterward

Keep the barrier low and execution stable."#, start_days: 2, start_hour: 18, start_minute: 40, duration_minutes: 35, status: "not_started", priority: "medium", color: "#22c55e" },
            TaskSeed { id: "example-task-agent-5", list_id: "example-list-learning", title: "Create Agent development term cards", description: r#"## Term cards
- Tool Calling
- RAG
- Context Window
- Memory
- Evaluation
- MCP

Write one explanation and one example for each term."#, start_days: 3, start_hour: 10, start_minute: 0, duration_minutes: 40, status: "not_started", priority: "medium", color: "#0891b2" },
            TaskSeed { id: "example-task-review-1", list_id: "example-list-review", title: "Write a weekend learning review", description: r#"## Review questions
1. Which concept became useful in practice?
2. Where did I get stuck most often?
3. What single action should improve next week?"#, start_days: 5, start_hour: 16, start_minute: 0, duration_minutes: 45, status: "not_started", priority: "low", color: "#64748b" },
        ],
        goals: vec![
            GoalSeed { id: "example-goal-agent-kb", title: "Build a personal knowledge-base Agent prototype", description: r#"## Goal
Build a knowledge-base Agent prototype only for personal learning.

### Focus
- Answers cite sources
- Uncertainty is stated clearly
- Tool failures produce understandable messages"#, color: "#2563eb", icon: "Bot", category: "learning", start_days: 0, due_days: 28, progress: 25.0, key_results: vec![
                KeyResultSeed { id: "example-kr-agent-kb-1", title: "Finish 1 local-note reader tool", target: 1.0, current: 0.0, unit: "tool", weight: 30, check_days: 7 },
                KeyResultSeed { id: "example-kr-agent-kb-2", title: "Connect 2 searchable data sources", target: 2.0, current: 0.0, unit: "sources", weight: 25, check_days: 14 },
                KeyResultSeed { id: "example-kr-agent-kb-3", title: "Run 5 real-question tests", target: 5.0, current: 1.0, unit: "tests", weight: 25, check_days: 21 },
                KeyResultSeed { id: "example-kr-agent-kb-4", title: "Write 1 prototype review note", target: 1.0, current: 0.0, unit: "note", weight: 20, check_days: 28 },
            ] },
            GoalSeed { id: "example-goal-agent-foundation", title: "Build a foundation for Agent development", description: r#"## Learning scope
- Tool Calling
- RAG and vector search
- Context compression
- Multi-step planning
- Evals and safety boundaries
- MCP tool ecosystem

> The goal is not chasing hype. Build a structure you can use."#, color: "#7c3aed", icon: "BrainCircuit", category: "learning", start_days: 0, due_days: 35, progress: 35.0, key_results: vec![
                KeyResultSeed { id: "example-kr-agent-foundation-1", title: "Read 6 high-quality Agent/RAG articles", target: 6.0, current: 2.0, unit: "articles", weight: 35, check_days: 14 },
                KeyResultSeed { id: "example-kr-agent-foundation-2", title: "Create 20 term cards", target: 20.0, current: 6.0, unit: "cards", weight: 30, check_days: 21 },
                KeyResultSeed { id: "example-kr-agent-foundation-3", title: "Finish 3 small code experiments", target: 3.0, current: 1.0, unit: "experiments", weight: 35, check_days: 28 },
            ] },
            GoalSeed { id: "example-goal-life-rhythm", title: "Keep a stable daily-life rhythm", description: r#"## Goal
Keep basic life rhythm while learning a fast-moving technical topic.

- Keep exercise low intensity
- Tidy up for only 10 minutes before bed
- Reduce workload when energy is low"#, color: "#16a34a", icon: "HeartPulse", category: "health", start_days: 0, due_days: 30, progress: 40.0, key_results: vec![
                KeyResultSeed { id: "example-kr-life-1", title: "Complete 12 light exercise sessions", target: 12.0, current: 4.0, unit: "sessions", weight: 40, check_days: 12 },
                KeyResultSeed { id: "example-kr-life-2", title: "Finish 8 bedtime tidy-ups", target: 8.0, current: 3.0, unit: "times", weight: 30, check_days: 18 },
                KeyResultSeed { id: "example-kr-life-3", title: "Record energy state for 14 days", target: 14.0, current: 5.0, unit: "days", weight: 30, check_days: 24 },
            ] },
        ],
        events: vec![
            EventSeed { id: "example-event-life-plan", title: "Morning life cleanup", description: r#"## Today
- Check the calendar
- Pick the top 3 tasks
- Leave buffer time for learning"#, days: 0, start_hour: 8, start_minute: 20, duration_minutes: 30, color: "#16a34a", location: "Desk" },
            EventSeed { id: "example-event-agent-reading", title: "Agent paper/article reading", description: r#"Read one Agent or RAG article and record only:
- One new concept
- One practical method
- One question that remains unclear"#, days: 0, start_hour: 20, start_minute: 0, duration_minutes: 45, color: "#2563eb", location: "Quiet corner" },
            EventSeed { id: "example-event-agent-demo", title: "Tool-calling demo experiment", description: r#"## Experiment goal
Check whether the Agent can choose the right tool based on the user's question.

### Not doing
- No complex UI
- No real private data
- No pressure to finish in one pass"#, days: 1, start_hour: 14, start_minute: 30, duration_minutes: 60, color: "#0ea5e9", location: "Computer" },
            EventSeed { id: "example-event-week-review", title: "Weekend life and learning review", description: r#"## Review
- Was my life rhythm stable this week?
- Where did Agent learning get stuck?
- What is the single most important experiment next week?"#, days: 4, start_hour: 19, start_minute: 30, duration_minutes: 45, color: "#f97316", location: "Desk" },
        ],
    }
}
