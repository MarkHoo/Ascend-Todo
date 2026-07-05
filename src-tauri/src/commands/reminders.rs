use chrono::{DateTime, Datelike, Duration, Local, NaiveTime, TimeZone, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, State, WebviewUrl, WebviewWindowBuilder};

use crate::db::{now, DbState};
use crate::error::{AppError, AppResult};
use crate::models::{ReminderItem, TaskReminderSettings};

const REMINDER_WINDOW_LABEL: &str = "reminder-popup";
const REMINDER_WINDOW_WIDTH: u32 = 390;
const REMINDER_WINDOW_HEIGHT: u32 = 236;

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OpenReminderTaskPayload {
    board_id: String,
    task_id: String,
}

fn reminder_window_url(item: &ReminderItem) -> WebviewUrl {
    let query = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("taskId", &item.task_id)
        .append_pair("taskTitle", &item.task_title)
        .append_pair("boardId", &item.board_id)
        .append_pair("boardName", &item.board_name)
        .append_pair("listName", &item.list_name)
        .finish();
    WebviewUrl::App(format!("index.html?{query}#/reminder-popup").into())
}

fn position_reminder_window(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    if let Some(monitor) = window.primary_monitor()? {
        let work_area = monitor.work_area();
        let scale_factor = monitor.scale_factor();
        let window_size = window.outer_size()?;
        let margin = (16.0 * scale_factor).round() as i32;
        let work_right = work_area.position.x + work_area.size.width as i32;
        let work_bottom = work_area.position.y + work_area.size.height as i32;
        let x = (work_right - window_size.width as i32 - margin)
            .max(work_area.position.x + margin);
        let y = (work_bottom - window_size.height as i32 - margin)
            .max(work_area.position.y + margin);
        window.set_position(PhysicalPosition::new(x, y))?;
    }
    Ok(())
}

fn conn<'a>(state: &'a DbState) -> std::sync::MutexGuard<'a, Connection> {
    state.conn.lock().expect("db lock")
}

fn parse_weekdays(value: &str) -> Vec<i32> {
    value
        .split(',')
        .filter_map(|item| item.parse::<i32>().ok())
        .filter(|day| (1..=7).contains(day))
        .collect()
}

fn serialize_weekdays(days: &[i32]) -> String {
    let mut normalized: Vec<i32> = days
        .iter()
        .copied()
        .filter(|day| (1..=7).contains(day))
        .collect();
    normalized.sort_unstable();
    normalized.dedup();
    normalized
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>()
        .join(",")
}

fn allowed_weekdays(mode: &str, weekdays: &[i32]) -> Vec<i32> {
    match mode {
        "weekdays" => vec![1, 2, 3, 4, 5],
        "custom" => weekdays.to_vec(),
        _ => vec![1, 2, 3, 4, 5, 6, 7],
    }
}

fn calculate_next(
    reminder_time: &str,
    repeat_mode: &str,
    weekdays: &[i32],
    after: DateTime<Local>,
) -> AppResult<String> {
    let time = NaiveTime::parse_from_str(reminder_time, "%H:%M")
        .map_err(|_| AppError::Invalid("提醒时间格式无效".to_string()))?;
    let allowed = allowed_weekdays(repeat_mode, weekdays);
    if allowed.is_empty() {
        return Err(AppError::Invalid("自定义提醒至少选择一天".to_string()));
    }

    for offset in 0..=8 {
        let date = after.date_naive() + Duration::days(offset);
        if !allowed.contains(&(date.weekday().number_from_monday() as i32)) {
            continue;
        }
        let naive = date.and_time(time);
        if let Some(candidate) = Local.from_local_datetime(&naive).earliest() {
            if candidate > after {
                return Ok(candidate.with_timezone(&Utc).to_rfc3339());
            }
        }
    }
    Err(AppError::Invalid("无法计算下一次提醒时间".to_string()))
}

fn ensure_settings(c: &Connection, task_id: &str) -> AppResult<()> {
    let existing: bool = c.query_row(
        "SELECT EXISTS(SELECT 1 FROM task_reminder_settings WHERE task_id = ?)",
        params![task_id],
        |row| row.get(0),
    )?;
    if existing {
        return Ok(());
    }
    let reminder_time: Option<String> = c
        .query_row(
            "SELECT reminder_time FROM tasks WHERE id = ?",
            params![task_id],
            |row| row.get(0),
        )
        .optional()?
        .flatten();
    let enabled = reminder_time.is_some();
    let time = reminder_time.unwrap_or_else(|| "09:00".to_string());
    let next = if enabled {
        Some(calculate_next(&time, "daily", &[1, 2, 3, 4, 5, 6, 7], Local::now())?)
    } else {
        None
    };
    c.execute(
        "INSERT INTO task_reminder_settings
            (task_id, enabled, repeat_mode, weekdays, notification_enabled, sound_enabled,
             snooze_minutes, paused, next_reminder_at, updated_at)
         VALUES (?, ?, 'daily', '1,2,3,4,5,6,7', 1, 1, 0, 0, ?, ?)",
        params![task_id, enabled as i64, next, now()],
    )?;
    Ok(())
}

fn fill_missing_schedules(c: &Connection) -> AppResult<()> {
    let mut stmt = c.prepare(
        "SELECT s.task_id, COALESCE(t.reminder_time, '09:00'), s.repeat_mode, s.weekdays
         FROM task_reminder_settings s
         JOIN tasks t ON t.id = s.task_id
         WHERE s.enabled = 1 AND s.paused = 0 AND s.next_reminder_at IS NULL",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
        ))
    })?;
    let pending = rows.collect::<Result<Vec<_>, _>>()?;
    drop(stmt);
    for (task_id, time, mode, weekdays) in pending {
        let next = calculate_next(&time, &mode, &parse_weekdays(&weekdays), Local::now())?;
        c.execute(
            "UPDATE task_reminder_settings SET next_reminder_at = ?, updated_at = ? WHERE task_id = ?",
            params![next, now(), task_id],
        )?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_task_reminder_settings(
    state: State<DbState>,
    task_id: String,
) -> AppResult<TaskReminderSettings> {
    let c = conn(&state);
    ensure_settings(&c, &task_id)?;
    c.query_row(
        "SELECT s.task_id, s.enabled, COALESCE(t.reminder_time, '09:00'), s.repeat_mode,
                s.weekdays, s.notification_enabled, s.sound_enabled, s.snooze_minutes,
                s.paused, s.silent_until, s.next_reminder_at
         FROM task_reminder_settings s
         JOIN tasks t ON t.id = s.task_id
         WHERE s.task_id = ?",
        params![task_id],
        |row| {
            Ok(TaskReminderSettings {
                task_id: row.get(0)?,
                enabled: row.get::<_, i64>(1)? != 0,
                reminder_time: row.get(2)?,
                repeat_mode: row.get(3)?,
                weekdays: parse_weekdays(&row.get::<_, String>(4)?),
                notification_enabled: row.get::<_, i64>(5)? != 0,
                sound_enabled: row.get::<_, i64>(6)? != 0,
                snooze_minutes: row.get(7)?,
                paused: row.get::<_, i64>(8)? != 0,
                silent_until: row.get(9)?,
                next_reminder_at: row.get(10)?,
            })
        },
    )
    .map_err(Into::into)
}

#[tauri::command]
pub fn update_task_reminder_settings(
    state: State<DbState>,
    task_id: String,
    enabled: bool,
    reminder_time: String,
    repeat_mode: String,
    weekdays: Vec<i32>,
    notification_enabled: bool,
    sound_enabled: bool,
    snooze_minutes: i32,
    paused: bool,
) -> AppResult<TaskReminderSettings> {
    let c = conn(&state);
    ensure_settings(&c, &task_id)?;
    let next = if enabled && !paused {
        Some(calculate_next(
            &reminder_time,
            &repeat_mode,
            &weekdays,
            Local::now(),
        )?)
    } else {
        None
    };
    c.execute(
        "UPDATE task_reminder_settings SET
            enabled = ?, repeat_mode = ?, weekdays = ?, notification_enabled = ?,
            sound_enabled = ?, snooze_minutes = ?, paused = ?, silent_until = NULL,
            next_reminder_at = ?, updated_at = ?
         WHERE task_id = ?",
        params![
            enabled as i64,
            repeat_mode,
            serialize_weekdays(&weekdays),
            notification_enabled as i64,
            sound_enabled as i64,
            snooze_minutes.max(0),
            paused as i64,
            next,
            now(),
            task_id,
        ],
    )?;
    c.execute(
        "UPDATE tasks SET reminder_time = ?, last_notified_at = NULL, updated_at = ? WHERE id = ?",
        params![if enabled { Some(reminder_time) } else { None }, now(), task_id],
    )?;
    drop(c);
    get_task_reminder_settings(state, task_id)
}

#[tauri::command]
pub fn pending_reminders(state: State<DbState>, now_iso: String) -> AppResult<Vec<ReminderItem>> {
    let c = conn(&state);
    fill_missing_schedules(&c)?;
    let mut stmt = c.prepare(
        "SELECT t.id, t.title, t.due_at, t.reminder_at, t.reminder_time, t.is_completed,
                b.name, l.name, b.id, s.next_reminder_at, s.sound_enabled, s.notification_enabled
         FROM task_reminder_settings s
         JOIN tasks t ON t.id = s.task_id
         JOIN lists l ON l.id = t.list_id
         JOIN boards b ON b.id = l.board_id
         WHERE s.enabled = 1 AND s.paused = 0
           AND s.next_reminder_at IS NOT NULL AND s.next_reminder_at <= ?
           AND (s.silent_until IS NULL OR s.silent_until <= ?)
         ORDER BY s.next_reminder_at ASC",
    )?;
    let rows = stmt.query_map(params![now_iso, now_iso], |row| {
        Ok(ReminderItem {
            task_id: row.get(0)?,
            task_title: row.get(1)?,
            due_at: row.get(2)?,
            reminder_at: row.get(3)?,
            reminder_time: row.get(4)?,
            is_completed: row.get::<_, i64>(5)? != 0,
            board_name: row.get(6)?,
            list_name: row.get(7)?,
            board_id: row.get(8)?,
            next_reminder_at: row.get(9)?,
            sound_enabled: row.get::<_, i64>(10)? != 0,
            notification_enabled: row.get::<_, i64>(11)? != 0,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

#[tauri::command]
pub fn mark_reminder_sent(state: State<DbState>, task_id: String) -> AppResult<()> {
    let c = conn(&state);
    ensure_settings(&c, &task_id)?;
    let (time, mode, weekdays, enabled, paused, snooze, count_date, trigger_count):
        (String, String, String, bool, bool, i32, Option<String>, i32) =
        c.query_row(
            "SELECT COALESCE(t.reminder_time, '09:00'), s.repeat_mode, s.weekdays,
                    s.enabled, s.paused, s.snooze_minutes, s.trigger_count_date, s.trigger_count
             FROM task_reminder_settings s JOIN tasks t ON t.id = s.task_id
             WHERE s.task_id = ?",
            params![task_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get::<_, i64>(3)? != 0,
                    row.get::<_, i64>(4)? != 0,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                ))
            },
        )?;
    let today = Local::now().format("%Y-%m-%d").to_string();
    let count = if count_date.as_deref() == Some(&today) {
        trigger_count + 1
    } else {
        1
    };
    let next = if enabled && !paused && snooze > 0 && count < 3 {
        Some((Utc::now() + Duration::minutes(snooze as i64)).to_rfc3339())
    } else if enabled && !paused {
        Some(calculate_next(&time, &mode, &parse_weekdays(&weekdays), Local::now())?)
    } else {
        None
    };
    c.execute(
        "UPDATE task_reminder_settings
         SET last_triggered_at = ?, next_reminder_at = ?, trigger_count_date = ?,
             trigger_count = ?, updated_at = ?
         WHERE task_id = ?",
        params![now(), next, today, count, now(), task_id],
    )?;
    c.execute(
        "UPDATE tasks SET last_notified_at = ? WHERE id = ?",
        params![now(), task_id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn snooze_task_reminder(
    state: State<DbState>,
    task_id: String,
    minutes: Option<i32>,
) -> AppResult<()> {
    let c = conn(&state);
    ensure_settings(&c, &task_id)?;
    let configured: i32 = c.query_row(
        "SELECT snooze_minutes FROM task_reminder_settings WHERE task_id = ?",
        params![task_id],
        |row| row.get(0),
    )?;
    let delay = minutes.unwrap_or(configured).max(1);
    let next = (Utc::now() + Duration::minutes(delay as i64)).to_rfc3339();
    c.execute(
        "UPDATE task_reminder_settings SET next_reminder_at = ?, updated_at = ? WHERE task_id = ?",
        params![next, now(), task_id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn silence_task_reminder_today(state: State<DbState>, task_id: String) -> AppResult<()> {
    let c = conn(&state);
    ensure_settings(&c, &task_id)?;
    let tomorrow = Local::now()
        .date_naive()
        .succ_opt()
        .and_then(|date| date.and_hms_opt(0, 0, 0))
        .and_then(|time| Local.from_local_datetime(&time).earliest())
        .ok_or_else(|| AppError::Invalid("无法计算明天时间".to_string()))?;
    let (time, mode, weekdays): (String, String, String) = c.query_row(
        "SELECT COALESCE(t.reminder_time, '09:00'), s.repeat_mode, s.weekdays
         FROM task_reminder_settings s JOIN tasks t ON t.id = s.task_id
         WHERE s.task_id = ?",
        params![task_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;
    let next = calculate_next(
        &time,
        &mode,
        &parse_weekdays(&weekdays),
        tomorrow,
    )?;
    c.execute(
        "UPDATE task_reminder_settings
         SET silent_until = ?, next_reminder_at = ?, updated_at = ?
         WHERE task_id = ?",
        params![
            tomorrow.with_timezone(&Utc).to_rfc3339(),
            next,
            now(),
            task_id
        ],
    )?;
    Ok(())
}

#[tauri::command]
pub fn upcoming_reminders(state: State<DbState>, limit: Option<i32>) -> AppResult<Vec<ReminderItem>> {
    let c = conn(&state);
    fill_missing_schedules(&c)?;
    let mut stmt = c.prepare(
        "SELECT t.id, t.title, t.due_at, t.reminder_at, t.reminder_time, t.is_completed,
                b.name, l.name, b.id, s.next_reminder_at, s.sound_enabled, s.notification_enabled
         FROM task_reminder_settings s
         JOIN tasks t ON t.id = s.task_id
         JOIN lists l ON l.id = t.list_id
         JOIN boards b ON b.id = l.board_id
         WHERE s.enabled = 1 AND s.paused = 0
           AND s.next_reminder_at IS NOT NULL
         ORDER BY s.next_reminder_at ASC LIMIT ?",
    )?;
    let rows = stmt.query_map(params![limit.unwrap_or(50)], |row| {
        Ok(ReminderItem {
            task_id: row.get(0)?,
            task_title: row.get(1)?,
            due_at: row.get(2)?,
            reminder_at: row.get(3)?,
            reminder_time: row.get(4)?,
            is_completed: row.get::<_, i64>(5)? != 0,
            board_name: row.get(6)?,
            list_name: row.get(7)?,
            board_id: row.get(8)?,
            next_reminder_at: row.get(9)?,
            sound_enabled: row.get::<_, i64>(10)? != 0,
            notification_enabled: row.get::<_, i64>(11)? != 0,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

#[tauri::command]
pub async fn show_reminder_popup(app: AppHandle, item: ReminderItem) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(REMINDER_WINDOW_LABEL) {
        window.emit("reminder-popup-data", &item)?;
        position_reminder_window(&window)?;
        window.show()?;
        window.set_focus()?;
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        &app,
        REMINDER_WINDOW_LABEL,
        reminder_window_url(&item),
    )
    .title("任务提醒")
    .inner_size(
        REMINDER_WINDOW_WIDTH as f64,
        REMINDER_WINDOW_HEIGHT as f64,
    )
    .min_inner_size(
        REMINDER_WINDOW_WIDTH as f64,
        REMINDER_WINDOW_HEIGHT as f64,
    )
    .max_inner_size(
        REMINDER_WINDOW_WIDTH as f64,
        REMINDER_WINDOW_HEIGHT as f64,
    )
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(true)
    .focused(true)
    .visible(false)
    .build()?;

    position_reminder_window(&window)?;
    window.show()?;
    window.set_focus()?;
    Ok(())
}

#[tauri::command]
pub async fn open_reminder_task(
    app: AppHandle,
    board_id: String,
    task_id: String,
) -> AppResult<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.show()?;
        window.unminimize()?;
        window.set_focus()?;
        window.emit(
            "open-reminder-task",
            OpenReminderTaskPayload { board_id, task_id },
        )?;
    }
    Ok(())
}
