use rusqlite::{params, Connection};

use crate::db::now;
use crate::error::AppResult;

#[derive(Clone, Copy)]
enum SeedLanguage {
    ZhCn,
    ZhTw,
    En,
}

struct SeedCopy {
    prefix: &'static str,
    boards: [(&'static str, &'static str); 2],
    lists: [&'static str; 8],
    tasks: [(&'static str, &'static str); 12],
    subtasks: [(&'static str, &'static str); 4],
    goals: [(&'static str, &'static str); 5],
    milestones: [&'static str; 6],
    key_results: [&'static str; 7],
    events: [(&'static str, &'static str); 5],
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
    let title = |raw: &str| format!("{}{}", copy.prefix, localize_seed_text(language, raw));

    let boards = [
        (
            "example-board-work",
            copy.boards[0].0,
            copy.boards[0].1,
            "#2563eb",
            "BriefcaseBusiness",
            0,
        ),
        (
            "example-board-learning",
            copy.boards[1].0,
            copy.boards[1].1,
            "#16a34a",
            "GraduationCap",
            1,
        ),
    ];
    for (id, name, description, color, icon, position) in boards {
        tx.execute(
            "INSERT INTO boards (id, name, description, color, icon, is_pinned, position, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![id, title(name), localize_seed_text(language, description), color, icon, 1, position, now, now],
        )?;
    }

    let lists = [
        (
            "example-list-work-inbox",
            "example-board-work",
            copy.lists[0],
            0,
        ),
        (
            "example-list-work-focus",
            "example-board-work",
            copy.lists[1],
            1,
        ),
        (
            "example-list-work-waiting",
            "example-board-work",
            copy.lists[2],
            2,
        ),
        (
            "example-list-work-done",
            "example-board-work",
            copy.lists[3],
            3,
        ),
        (
            "example-list-learning-inbox",
            "example-board-learning",
            copy.lists[4],
            0,
        ),
        (
            "example-list-learning-practice",
            "example-board-learning",
            copy.lists[5],
            1,
        ),
        (
            "example-list-learning-output",
            "example-board-learning",
            copy.lists[6],
            2,
        ),
        (
            "example-list-learning-review",
            "example-board-learning",
            copy.lists[7],
            3,
        ),
    ];
    for (id, board_id, name, position) in lists {
        tx.execute(
            "INSERT INTO lists (id, board_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)",
            params![
                id,
                board_id,
                localize_seed_text(language, name),
                position,
                now
            ],
        )?;
    }

    let tasks = [
        (
            "example-task-work-1",
            "example-list-work-inbox",
            0,
            -1,
            10,
            0,
            -1,
            11,
            15,
            "doing",
            "high",
            "#2563eb",
            false,
        ),
        (
            "example-task-work-2",
            "example-list-work-inbox",
            1,
            1,
            15,
            30,
            1,
            16,
            30,
            "not_started",
            "medium",
            "#7c3aed",
            false,
        ),
        (
            "example-task-work-3",
            "example-list-work-focus",
            2,
            0,
            14,
            0,
            0,
            15,
            10,
            "doing",
            "high",
            "#dc2626",
            false,
        ),
        (
            "example-task-work-4",
            "example-list-work-focus",
            3,
            2,
            10,
            30,
            2,
            11,
            30,
            "not_started",
            "medium",
            "#0891b2",
            false,
        ),
        (
            "example-task-work-5",
            "example-list-work-waiting",
            4,
            -2,
            16,
            20,
            -2,
            17,
            0,
            "completed",
            "low",
            "#16a34a",
            true,
        ),
        (
            "example-task-work-6",
            "example-list-work-done",
            5,
            -4,
            9,
            40,
            -4,
            10,
            20,
            "completed",
            "medium",
            "#16a34a",
            true,
        ),
        (
            "example-task-learning-1",
            "example-list-learning-inbox",
            6,
            0,
            20,
            0,
            0,
            20,
            45,
            "doing",
            "medium",
            "#16a34a",
            false,
        ),
        (
            "example-task-learning-2",
            "example-list-learning-practice",
            7,
            1,
            7,
            30,
            1,
            8,
            30,
            "doing",
            "high",
            "#ea580c",
            false,
        ),
        (
            "example-task-learning-3",
            "example-list-learning-practice",
            8,
            2,
            20,
            15,
            2,
            21,
            0,
            "not_started",
            "medium",
            "#2563eb",
            false,
        ),
        (
            "example-task-learning-4",
            "example-list-learning-output",
            9,
            5,
            9,
            30,
            5,
            10,
            45,
            "not_started",
            "high",
            "#7c3aed",
            false,
        ),
        (
            "example-task-learning-5",
            "example-list-learning-review",
            10,
            -1,
            21,
            0,
            -1,
            21,
            30,
            "completed",
            "low",
            "#16a34a",
            true,
        ),
        (
            "example-task-learning-6",
            "example-list-learning-review",
            11,
            3,
            19,
            30,
            3,
            20,
            20,
            "not_started",
            "medium",
            "#0891b2",
            false,
        ),
    ];
    for (
        index,
        (
            id,
            list_id,
            text_index,
            start_days,
            start_hour,
            start_min,
            due_days,
            due_hour,
            due_min,
            status,
            priority,
            color,
            completed,
        ),
    ) in tasks.iter().enumerate()
    {
        let (raw_title, description) = copy.tasks[*text_index];
        let completed_at = if *completed {
            Some(at(*due_days, *due_hour, *due_min))
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
                title(raw_title),
                localize_seed_text(language, description),
                index as i32,
                at(*due_days, *due_hour, *due_min),
                at(*start_days, *start_hour, *start_min),
                format!("{:02}:{:02}", start_hour, start_min),
                if *completed { 1 } else { 0 },
                completed_at,
                color,
                status,
                priority,
                at(*start_days, *start_hour, *start_min),
                now,
                now
            ],
        )?;
    }

    let subtasks = [
        (
            "example-subtask-work-1",
            "example-list-work-focus",
            0,
            "example-task-work-3",
            20,
            "completed",
            true,
        ),
        (
            "example-subtask-work-2",
            "example-list-work-focus",
            1,
            "example-task-work-3",
            21,
            "doing",
            false,
        ),
        (
            "example-subtask-learning-1",
            "example-list-learning-practice",
            2,
            "example-task-learning-2",
            20,
            "doing",
            false,
        ),
        (
            "example-subtask-learning-2",
            "example-list-learning-practice",
            3,
            "example-task-learning-2",
            21,
            "not_started",
            false,
        ),
    ];
    for (id, list_id, text_index, parent_id, position, status, completed) in subtasks {
        let (raw_title, description) = copy.subtasks[text_index];
        tx.execute(
            "INSERT INTO tasks
                (id, list_id, title, description, position, due_at, reminder_at, reminder_time,
                 is_completed, completed_at, parent_task_id, color, status, priority, start_at,
                 created_at, updated_at, last_notified_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, NULL, ?, 'medium', ?, ?, ?, NULL)",
            params![
                id,
                list_id,
                title(raw_title),
                localize_seed_text(language, description),
                position,
                at(1, 18, 0),
                if completed { 1 } else { 0 },
                if completed { Some(at(0, 18, 0)) } else { None },
                parent_id,
                status,
                at(1, 9, 0),
                now,
                now
            ],
        )?;
    }

    let goals = [
        (
            "example-goal-career",
            0,
            "#2563eb",
            "BriefcaseBusiness",
            0,
            45,
            "career",
            8,
            "quarterly",
            62.0,
        ),
        (
            "example-goal-health",
            1,
            "#16a34a",
            "HeartPulse",
            -5,
            30,
            "health",
            7,
            "monthly",
            45.0,
        ),
        (
            "example-goal-learning",
            2,
            "#ea580c",
            "BookOpen",
            -3,
            75,
            "learning",
            8,
            "yearly",
            38.0,
        ),
        (
            "example-goal-finance",
            3,
            "#0891b2",
            "WalletCards",
            1,
            60,
            "life",
            5,
            "quarterly",
            55.0,
        ),
        (
            "example-goal-family",
            4,
            "#7c3aed",
            "Home",
            2,
            90,
            "family",
            6,
            "yearly",
            25.0,
        ),
    ];
    for (
        position,
        (id, text_index, color, icon, start_days, due_days, category, weight, period, progress),
    ) in goals.iter().enumerate()
    {
        let (raw_title, description) = copy.goals[*text_index];
        tx.execute(
            "INSERT INTO goals
                (id, title, description, color, icon, due_at, parent_goal_id, position, created_at, updated_at,
                 progress_mode, progress_value, progress_total, category, start_date, weight, status,
                 review_score, review_note, period, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 'percentage', ?, 100, ?, ?, ?, 'active', NULL, NULL, ?, NULL)",
            params![
                id,
                title(raw_title),
                localize_seed_text(language, description),
                color,
                icon,
                date(*due_days),
                position as i32,
                now,
                now,
                progress,
                category,
                date(*start_days),
                weight,
                period
            ],
        )?;
    }

    let milestones = [
        ("example-ms-career-1", "example-goal-career", 0, true, -1, 0),
        (
            "example-ms-career-2",
            "example-goal-career",
            1,
            false,
            12,
            1,
        ),
        ("example-ms-health-1", "example-goal-health", 2, false, 7, 0),
        (
            "example-ms-learning-1",
            "example-goal-learning",
            3,
            true,
            -2,
            0,
        ),
        (
            "example-ms-finance-1",
            "example-goal-finance",
            4,
            false,
            20,
            0,
        ),
        (
            "example-ms-family-1",
            "example-goal-family",
            5,
            false,
            30,
            0,
        ),
    ];
    for (id, goal_id, text_index, completed, days, position) in milestones {
        tx.execute(
            "INSERT INTO milestones (id, goal_id, title, is_completed, completed_at, position, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![
                id,
                goal_id,
                title(copy.milestones[text_index]),
                if completed { 1 } else { 0 },
                if completed { Some(at(days, 18, 0)) } else { None },
                position,
                now
            ],
        )?;
    }

    let key_results = [
        (
            "example-kr-career-1",
            "example-goal-career",
            0,
            0.0,
            12.0,
            7.0,
            "items",
            40,
            "normal",
            7,
            false,
            0,
        ),
        (
            "example-kr-career-2",
            "example-goal-career",
            1,
            0.0,
            5.0,
            2.0,
            "people",
            30,
            "risk",
            14,
            false,
            1,
        ),
        (
            "example-kr-health-1",
            "example-goal-health",
            2,
            0.0,
            20.0,
            9.0,
            "days",
            50,
            "normal",
            6,
            false,
            0,
        ),
        (
            "example-kr-learning-1",
            "example-goal-learning",
            3,
            0.0,
            24.0,
            8.0,
            "hours",
            45,
            "normal",
            10,
            false,
            0,
        ),
        (
            "example-kr-learning-2",
            "example-goal-learning",
            4,
            0.0,
            3.0,
            1.0,
            "projects",
            35,
            "good",
            21,
            false,
            1,
        ),
        (
            "example-kr-finance-1",
            "example-goal-finance",
            5,
            0.0,
            1.0,
            0.6,
            "",
            50,
            "normal",
            15,
            false,
            0,
        ),
        (
            "example-kr-family-1",
            "example-goal-family",
            6,
            0.0,
            6.0,
            2.0,
            "times",
            50,
            "normal",
            30,
            false,
            0,
        ),
    ];
    for (
        id,
        goal_id,
        text_index,
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
             VALUES (?, ?, ?, 'metric', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                id,
                goal_id,
                title(copy.key_results[text_index]),
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
            "example-link-career-1",
            "example-goal-career",
            "example-kr-career-1",
            "example-task-work-3",
        ),
        (
            "example-link-career-2",
            "example-goal-career",
            "example-kr-career-2",
            "example-task-work-2",
        ),
        (
            "example-link-health-1",
            "example-goal-health",
            "example-kr-health-1",
            "example-task-learning-5",
        ),
        (
            "example-link-learning-1",
            "example-goal-learning",
            "example-kr-learning-1",
            "example-task-learning-2",
        ),
        (
            "example-link-family-1",
            "example-goal-family",
            "example-kr-family-1",
            "example-task-learning-6",
        ),
    ];
    for (id, goal_id, kr_id, task_id) in goal_tasks {
        tx.execute(
            "INSERT INTO goal_tasks (id, goal_id, kr_id, task_id, created_at) VALUES (?, ?, ?, ?, ?)",
            params![id, goal_id, kr_id, task_id, now],
        )?;
    }

    let events = [
        ("example-event-planning", 0, 8, 30, 0, 9, 0, "#2563eb"),
        ("example-event-focus", 0, 13, 30, 0, 14, 20, "#7c3aed"),
        ("example-event-walk", 1, 18, 40, 1, 19, 20, "#16a34a"),
        ("example-event-study", 2, 20, 30, 2, 21, 15, "#ea580c"),
        ("example-event-review", 5, 10, 0, 5, 10, 50, "#0891b2"),
    ];
    for (
        text_index,
        (id, start_days, start_hour, start_minute, end_days, end_hour, end_minute, color),
    ) in events.iter().enumerate()
    {
        let (raw_title, description) = copy.events[text_index];
        tx.execute(
            "INSERT INTO calendar_events
                (id, title, description, start_time, end_time, all_day, location, source_type,
                 source_account_id, external_uid, sequence, status, readonly, color, holiday_type,
                 raw_ics, created_at, updated_at, synced_at)
             VALUES (?, ?, ?, ?, ?, 0, NULL, 'manual', NULL, NULL, 0, 'confirmed', 0, ?, NULL, NULL, ?, ?, NULL)",
            params![
                id,
                title(raw_title),
                localize_seed_text(language, description),
                at(*start_days, *start_hour, *start_minute),
                at(*end_days, *end_hour, *end_minute),
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

fn detect_seed_language(conn: &Connection) -> SeedLanguage {
    if let Ok(language) = conn.query_row(
        "SELECT value FROM settings WHERE key = 'language'",
        [],
        |r| r.get::<_, String>(0),
    ) {
        return normalize_language(&language);
    }
    let locale = sys_locale::get_locale().unwrap_or_default();
    normalize_language(&locale)
}

fn normalize_language(language: &str) -> SeedLanguage {
    let normalized = language.to_lowercase();
    if normalized.contains("hant")
        || normalized.contains("tw")
        || normalized.contains("hk")
        || normalized.contains("mo")
    {
        SeedLanguage::ZhTw
    } else if normalized.starts_with("zh") {
        SeedLanguage::ZhCn
    } else {
        SeedLanguage::En
    }
}

fn localize_seed_text(language: SeedLanguage, text: &str) -> String {
    match language {
        SeedLanguage::ZhTw => to_traditional_zh(text),
        _ => text.to_string(),
    }
}

fn to_traditional_zh(text: &str) -> String {
    let replacements = [
        ("示例", "範例"),
        ("围绕", "圍繞"),
        ("选题", "選題"),
        ("发布", "發布"),
        ("复盘", "復盤"),
        ("组织", "組織"),
        ("数据", "資料"),
        ("个人", "個人"),
        ("计划", "計畫"),
        ("阅读", "閱讀"),
        ("练习", "練習"),
        ("输出", "輸出"),
        ("推进", "推進"),
        ("灵感", "靈感"),
        ("收集", "蒐集"),
        ("专注", "專注"),
        ("等待", "等待"),
        ("反馈", "回饋"),
        ("完成", "完成"),
        ("学习", "學習"),
        ("沉淀", "沉澱"),
        ("整理", "整理"),
        ("用户", "使用者"),
        ("访谈", "訪談"),
        ("洞察", "洞察"),
        ("背景", "背景"),
        ("需要", "需要"),
        ("零散", "零散"),
        ("行动", "行動"),
        ("结论", "結論"),
        ("检查点", "檢查點"),
        ("提炼", "提煉"),
        ("高频", "高頻"),
        ("需求", "需求"),
        ("标记", "標記"),
        ("证据", "證據"),
        ("验证", "驗證"),
        ("问题", "問題"),
        ("目标", "目標"),
        ("讨论", "討論"),
        ("准备", "準備"),
        ("清单", "清單"),
        ("方向", "方向"),
        ("每个", "每個"),
        ("包含", "包含"),
        ("人群", "族群"),
        ("开头", "開頭"),
        ("钩子", "鉤子"),
        ("风险", "風險"),
        ("适合", "適合"),
        ("试做", "試做"),
        ("制作", "製作"),
        ("活动", "活動"),
        ("落地页", "落地頁"),
        ("文案", "文案"),
        ("初稿", "初稿"),
        ("写作", "寫作"),
        ("结构", "結構"),
        ("当前", "目前"),
        ("困扰", "困擾"),
        ("解决", "解決"),
        ("承诺", "承諾"),
        ("利益", "利益"),
        ("按钮", "按鈕"),
        ("注意", "注意"),
        ("润色", "潤飾"),
        ("句子", "句子"),
        ("核对", "核對"),
        ("授权", "授權"),
        ("图片", "圖片"),
        ("字体", "字型"),
        ("引用", "引用"),
        ("链接", "連結"),
        ("合作方", "合作方"),
        ("确认", "確認"),
        ("记录", "記錄"),
        ("备注", "備註"),
        ("评论", "評論"),
        ("跟进", "跟進"),
        ("设计稿", "設計稿"),
        ("设计", "設計"),
        ("同事", "同事"),
        ("第一版", "第一版"),
        ("视觉", "視覺"),
        ("主要", "主要"),
        ("修改", "修改"),
        ("意见", "意見"),
        ("移动端", "行動端"),
        ("首屏", "首屏"),
        ("补充", "補充"),
        ("表现", "表現"),
        ("标题", "標題"),
        ("带来", "帶來"),
        ("点击", "點擊"),
        ("真实", "真實"),
        ("顾虑", "顧慮"),
        ("调整", "調整"),
        ("时间", "時間"),
        ("生成式", "生成式"),
        ("产品", "產品"),
        ("案例", "案例"),
        ("方式", "方式"),
        ("快速", "快速"),
        ("重点", "重點"),
        ("场景", "場景"),
        ("路径", "路徑"),
        ("借鉴", "借鑑"),
        ("细节", "細節"),
        ("编程", "程式設計"),
        ("页面", "頁面"),
        ("表单", "表單"),
        ("校验", "驗證"),
        ("状态", "狀態"),
        ("保存", "儲存"),
        ("功能", "功能"),
        ("完整", "完整"),
        ("考虑", "考慮"),
        ("词汇", "詞彙"),
        ("卡片", "卡片"),
        ("方法", "方法"),
        ("每个词", "每個詞"),
        ("搭配", "搭配"),
        ("第二天", "隔天"),
        ("复习", "複習"),
        ("笔记", "筆記"),
        ("草稿", "草稿"),
        ("今天", "今天"),
        ("概念", "概念"),
        ("容易", "容易"),
        ("混淆", "混淆"),
        ("下次", "下次"),
        ("具体", "具體"),
        ("观察点", "觀察點"),
        ("稳定", "穩定"),
        ("哪类", "哪類"),
        ("拖延", "拖延"),
        ("下周", "下週"),
        ("减少", "減少"),
        ("干扰", "干擾"),
        ("家庭", "家庭"),
        ("照片", "照片"),
        ("步骤", "步驟"),
        ("年份", "年份"),
        ("文件夹", "資料夾"),
        ("删除", "刪除"),
        ("重复", "重複"),
        ("共享", "共享"),
        ("相册", "相簿"),
        ("核心", "核心"),
        ("卖点", "賣點"),
        ("内部", "內部"),
        ("术语", "術語"),
        ("超过", "超過"),
        ("优先", "優先"),
        ("动词", "動詞"),
        ("环境", "環境"),
        ("命令", "指令"),
        ("遇到", "遇到"),
        ("触发", "觸發"),
        ("操作", "操作"),
        ("提升", "提升"),
        ("策划", "策劃"),
        ("说明", "說明"),
        ("建立", "建立"),
        ("固定", "固定"),
        ("节奏", "節奏"),
        ("本期", "本期"),
        ("临时", "臨時"),
        ("赶稿", "趕稿"),
        ("命中率", "命中率"),
        ("可复用", "可複用"),
        ("模板", "範本"),
        ("运动", "運動"),
        ("习惯", "習慣"),
        ("追求", "追求"),
        ("强度", "強度"),
        ("持续性", "持續性"),
        ("工作日", "工作日"),
        ("晚间", "晚間"),
        ("散步", "散步"),
        ("周末", "週末"),
        ("力量", "肌力"),
        ("训练", "訓練"),
        ("身体", "身體"),
        ("现代", "現代"),
        ("前端", "前端"),
        ("基础", "基礎"),
        ("管理", "管理"),
        ("可访问性", "可存取性"),
        ("体验", "體驗"),
        ("作品", "作品"),
        ("收尾", "收尾"),
        ("季度", "季度"),
        ("预算", "預算"),
        ("固定支出", "固定支出"),
        ("投入", "投入"),
        ("备用金", "備用金"),
        ("不确定感", "不確定感"),
        ("资料", "資料"),
        ("归档", "歸檔"),
        ("证件", "證件"),
        ("扫描件", "掃描件"),
        ("重要", "重要"),
        ("隐私", "隱私"),
        ("备份", "備份"),
        ("跨部门", "跨部門"),
        ("连续", "連續"),
        ("搭建", "建置"),
        ("账单", "帳單"),
        ("分类", "分類"),
        ("高质量", "高品質"),
        ("小时", "小時"),
        ("有效", "有效"),
        ("运动", "運動"),
        ("晨间", "晨間"),
        ("今日", "今日"),
        ("待办", "待辦"),
        ("预留", "預留"),
        ("缓冲", "緩衝"),
        ("规则", "規則"),
        ("静音", "靜音"),
        ("处理", "處理"),
        ("措辞", "措辭"),
        ("轻松", "輕鬆"),
        ("播客", "Podcast"),
        ("文章", "文章"),
        ("要点", "重點"),
        ("问题", "問題"),
        ("最顺", "最順"),
        ("最卡", "最卡"),
        ("动作", "動作"),
    ];
    let mut result = text.to_string();
    for (from, to) in replacements {
        result = result.replace(from, to);
    }
    result
}

fn seed_copy(language: SeedLanguage) -> SeedCopy {
    match language {
        SeedLanguage::ZhTw => zh_tw_copy(),
        SeedLanguage::En => en_copy(),
        SeedLanguage::ZhCn => zh_cn_copy(),
    }
}

fn zh_cn_copy() -> SeedCopy {
    SeedCopy {
        prefix: "【示例】",
        boards: [
            ("互联网内容运营周计划", "围绕选题、素材、发布和复盘组织一周工作，不包含任何真实业务数据。"),
            ("个人学习与成长计划", "把阅读、练习、输出和复盘放到同一个节奏里，适合下班后推进。"),
        ],
        lists: ["灵感收集", "本周专注", "等待反馈", "已完成", "待学习", "练习中", "输出作品", "复盘沉淀"],
        tasks: [
            ("整理三条用户访谈洞察", "## 背景\n本周需要把零散访谈整理成可行动结论。\n\n### 检查点\n- 提炼 3 个高频需求\n- 标记原话证据\n- 写出下一步验证问题\n\n> 目标是让结论可以直接进入周会讨论。"),
            ("准备短视频选题清单", "## 输出要求\n- 5 个选题方向\n- 每个方向包含目标人群、开头钩子和风险点\n- 标记一个最适合本周试做的选题"),
            ("制作活动落地页文案初稿", "## 写作结构\n1. 用户当前困扰\n2. 解决方案承诺\n3. 关键利益点\n4. 行动按钮文案\n\n**注意：**先完成结构，再润色句子。"),
            ("核对发布前素材授权", "## 清单\n- 图片来源\n- 字体授权\n- 数据引用链接\n- 合作方确认记录\n\n完成后把风险项备注在卡片评论里。"),
            ("跟进设计稿反馈", "## 当前状态\n设计同事已给出第一版视觉稿。\n\n- [x] 记录主要修改意见\n- [ ] 确认移动端首屏展示\n- [ ] 补充按钮文案"),
            ("复盘上周社媒发布表现", "## 复盘问题\n- 哪个标题带来更多点击？\n- 评论里出现了哪些真实顾虑？\n- 下次是否需要调整发布时间？"),
            ("阅读一篇生成式 AI 产品案例", "## 阅读方式\n先快速扫读，再重点记录：\n\n- 产品解决的具体场景\n- 用户完成任务的路径\n- 可以借鉴的交互细节"),
            ("完成 45 分钟编程练习", "## 练习目标\n用一个小页面练习表单校验和状态保存。\n\n```text\n先保证功能完整，再考虑视觉细节。\n```"),
            ("整理英语技术词汇卡片", "## 方法\n- 每个词写一个真实句子\n- 标记常见搭配\n- 第二天用 5 分钟复习"),
            ("写一篇学习笔记草稿", "## 结构\n1. 今天学了什么\n2. 哪个概念最容易混淆\n3. 下次要做的小练习\n\n保持短小，但要具体。"),
            ("复盘本周专注时间", "## 观察点\n- 哪个时间段最稳定？\n- 哪类任务最容易拖延？\n- 下周减少一个干扰源"),
            ("安排一次家庭照片整理", "## 步骤\n- 先按年份建立文件夹\n- 删除明显重复照片\n- 选 20 张加入共享相册"),
        ],
        subtasks: [
            ("列出落地页核心卖点", "把卖点写成用户能听懂的话，不使用内部术语。"),
            ("补充移动端按钮文案", "按钮文字不超过 8 个字，优先动词开头。"),
            ("完成练习环境准备", "确认编辑器、运行命令和示例数据都可用。"),
            ("记录练习中遇到的问题", "不要只写结论，要写出触发问题的操作路径。"),
        ],
        goals: [
            ("提升内容策划稳定性", "## 目标说明\n建立从选题、素材、发布到复盘的固定节奏。\n\n### 本期重点\n- 减少临时赶稿\n- 提升选题命中率\n- 每周沉淀可复用模板"),
            ("建立每周运动习惯", "## 目标说明\n不追求强度，先保证持续性。\n\n- 工作日晚间散步\n- 周末一次力量训练\n- 每周记录身体状态"),
            ("完成一轮现代前端学习", "## 学习范围\n- TypeScript 基础\n- React 状态管理\n- 可访问性和表单体验\n\n最终用一个小作品收尾。"),
            ("整理个人季度预算", "## 目标说明\n把固定支出、学习投入和备用金拆清楚。\n\n> 预算不是限制生活，而是减少不确定感。"),
            ("改善家庭共享资料归档", "## 目标说明\n把照片、证件扫描件和重要记录整理到清晰结构中。\n\n注意隐私和备份。"),
        ],
        milestones: ["完成第一版周计划模板", "完成一次跨部门反馈收集", "连续运动 7 天", "完成学习环境搭建", "完成本月账单分类", "整理一个家庭共享文件夹"],
        key_results: ["完成 12 条高质量选题", "访谈 5 位目标用户", "完成 20 天轻运动", "完成 24 小时有效学习", "完成 3 个练习作品", "完成季度预算表", "完成 6 次家庭资料整理"],
        events: [
            ("晨间计划", "## 今日安排\n- 查看待办\n- 选出 3 件最重要的事\n- 给每件事预留缓冲时间"),
            ("专注文案修改", "## 专注规则\n手机静音，先处理结构，再处理措辞。"),
            ("晚间散步", "轻松走路 40 分钟，顺便听一集播客。"),
            ("技术阅读", "阅读一篇文章并写 5 条要点，不追求一次读完全部。"),
            ("周末复盘", "## 复盘问题\n- 本周最顺的一件事\n- 最卡的一件事\n- 下周只改进一个动作"),
        ],
    }
}

fn zh_tw_copy() -> SeedCopy {
    let mut copy = zh_cn_copy();
    copy.prefix = "【範例】";
    copy.boards = [
        (
            "網路內容營運週計畫",
            "圍繞選題、素材、發布和復盤組織一週工作，不包含任何真實業務資料。",
        ),
        (
            "個人學習與成長計畫",
            "把閱讀、練習、輸出和復盤放到同一個節奏裡，適合下班後推進。",
        ),
    ];
    copy.lists = [
        "靈感收集",
        "本週專注",
        "等待回饋",
        "已完成",
        "待學習",
        "練習中",
        "輸出作品",
        "復盤沉澱",
    ];
    copy
}

fn en_copy() -> SeedCopy {
    SeedCopy {
        prefix: "【Sample】",
        boards: [
            ("Weekly Content Operations", "A realistic weekly workflow for research, drafts, publishing, and review."),
            ("Personal Learning Plan", "A practical routine for reading, practice, output, and weekly reflection."),
        ],
        lists: ["Ideas", "Focus This Week", "Waiting", "Done", "To Learn", "Practicing", "Output", "Reflection"],
        tasks: [
            ("Summarize three interview insights", "## Context\nTurn scattered interview notes into useful decisions.\n\n### Checklist\n- Extract 3 recurring needs\n- Keep evidence from original quotes\n- Write the next validation questions"),
            ("Prepare a short-form topic list", "## Output\n- 5 topic directions\n- Audience, opening hook, and risk for each\n- Pick one topic to test this week"),
            ("Draft landing page copy", "## Structure\n1. Current user pain\n2. Promise of the solution\n3. Key benefits\n4. Call-to-action copy\n\n**Note:** finish the structure before polishing."),
            ("Check asset permissions", "## Checklist\n- Image source\n- Font license\n- Data reference link\n- Partner confirmation"),
            ("Follow up on design feedback", "## Current state\nThe first visual draft is ready.\n\n- [x] Capture main comments\n- [ ] Check mobile first screen\n- [ ] Improve button copy"),
            ("Review last week's social posts", "## Questions\n- Which headline brought more clicks?\n- What concerns appeared in comments?\n- Should the publish time change?"),
            ("Read a generative AI product case", "## Reading notes\nFocus on the scenario, user path, and interaction details worth borrowing."),
            ("Complete a 45-minute coding practice", "## Goal\nPractice form validation and state saving with a tiny page.\n\n```text\nMake it work first, then polish.\n```"),
            ("Build English tech vocabulary cards", "## Method\n- Write a real sentence\n- Mark common collocations\n- Review tomorrow for 5 minutes"),
            ("Draft a learning note", "## Structure\n1. What I learned\n2. What confused me\n3. One small next exercise"),
            ("Review weekly focus time", "## Observe\n- Best focus window\n- Most delayed task type\n- One distraction to reduce"),
            ("Organize family photos", "## Steps\n- Create folders by year\n- Remove obvious duplicates\n- Pick 20 photos for a shared album"),
        ],
        subtasks: [
            ("List the main page benefits", "Use user-friendly language instead of internal terms."),
            ("Improve mobile button copy", "Keep it short and action-oriented."),
            ("Prepare the practice environment", "Confirm editor, command, and sample data."),
            ("Record practice issues", "Write the action path, not just the conclusion."),
        ],
        goals: [
            ("Make content planning more consistent", "## Goal\nBuild a repeatable rhythm from topics to review.\n\n### Focus\n- Fewer last-minute drafts\n- Better topic quality\n- Reusable weekly templates"),
            ("Build a weekly exercise habit", "## Goal\nStart with consistency, not intensity.\n\n- Evening walks\n- One weekend strength session\n- Weekly body-state notes"),
            ("Finish a modern frontend learning cycle", "## Scope\n- TypeScript basics\n- React state management\n- Accessible forms\n\nEnd with a small project."),
            ("Organize a quarterly personal budget", "## Goal\nSeparate fixed costs, learning budget, and emergency savings.\n\n> Budgeting reduces uncertainty."),
            ("Improve family file organization", "## Goal\nOrganize photos, scanned documents, and important records with privacy in mind."),
        ],
        milestones: ["Finish the first weekly template", "Collect one round of feedback", "Exercise 7 days in a row", "Set up the learning environment", "Classify this month's bills", "Organize one shared family folder"],
        key_results: ["Finish 12 quality topic ideas", "Interview 5 target users", "Complete 20 light exercise days", "Study effectively for 24 hours", "Finish 3 practice projects", "Complete the quarterly budget sheet", "Organize family files 6 times"],
        events: [
            ("Morning planning", "## Today\n- Review tasks\n- Pick the top 3\n- Leave buffer time"),
            ("Focused copy editing", "Phone silent. Fix structure before wording."),
            ("Evening walk", "Walk for 40 minutes and listen to one podcast episode."),
            ("Technical reading", "Read one article and write 5 notes."),
            ("Weekend review", "## Questions\n- What went smoothly?\n- What got stuck?\n- What is one action for next week?"),
        ],
    }
}
