use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};
use url::Url;

use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::models::{
    AuthorizeCalendarEmailOAuthRequest, CalendarEmailAccount, CalendarEmailCredentialStatus,
    CalendarEmailSyncResult, CalendarEntry, CalendarHolidaySource, CalendarSyncStatus,
    CreateCalendarEmailAccountRequest, CreateManualCalendarEventRequest,
    ImportCalendarIcsSourceRequest, ImportHolidayJsonSourceRequest,
    SaveCalendarEmailCredentialRequest, SyncHolidayCountryRequest,
    UpdateManualCalendarEventRequest,
};

fn conn<'a>(state: &'a DbState) -> std::sync::MutexGuard<'a, Connection> {
    state.conn.lock().expect("db lock")
}

fn local_parts(value: Option<String>) -> (String, Option<String>, Option<String>) {
    let Some(raw) = value else {
        return (String::new(), None, None);
    };
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&raw) {
        let local = dt.with_timezone(&chrono::Local);
        return (
            local.format("%Y-%m-%d").to_string(),
            Some(local.format("%H:%M").to_string()),
            Some(raw),
        );
    }
    let date = raw.get(0..10).unwrap_or("").to_string();
    let time = raw
        .get(11..16)
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty());
    (date, time, Some(raw))
}

fn in_range(date: &str, start: &str, end: &str) -> bool {
    !date.is_empty() && date >= start && date <= end
}

#[derive(Debug, Clone)]
struct ParsedIcsEvent {
    uid: String,
    title: String,
    description: Option<String>,
    location: Option<String>,
    start_time: String,
    end_time: Option<String>,
    all_day: bool,
    sequence: i32,
    status: String,
    raw_ics: String,
}

#[derive(Debug, Clone)]
struct ParsedHolidayEvent {
    date: String,
    title: String,
    holiday_type: String,
}

#[derive(Debug, serde::Deserialize)]
struct NagerHoliday {
    date: String,
    #[serde(rename = "localName")]
    local_name: Option<String>,
    name: Option<String>,
}

const HOLIDAY_CONFIG_ID: &str = "default-cn";

fn country_label(country_code: &str, language: &str) -> String {
    match (country_code, language) {
        ("CN", "zh-CN") => "中国大陆".into(),
        ("CN", "zh-TW") => "中國大陸".into(),
        ("CN", _) => "China".into(),
        ("HK", "zh-CN") => "中国香港".into(),
        ("HK", "zh-TW") => "中國香港".into(),
        ("HK", _) => "Hong Kong (China)".into(),
        ("TW", "zh-CN") => "中国台湾".into(),
        ("TW", "zh-TW") => "中國台灣".into(),
        ("TW", _) => "Taiwan (China)".into(),
        (_, _) => country_code.into(),
    }
}

fn localized_generic_holiday(country_code: &str, language: &str) -> String {
    let country = country_label(country_code, language);
    match language {
        "zh-CN" => format!("{country}节假日"),
        "zh-TW" => format!("{country}節假日"),
        _ => format!("{country} public holiday"),
    }
}

fn localized_workday_title(language: &str) -> String {
    match language {
        "zh-CN" => "调休补班".into(),
        "zh-TW" => "調休補班".into(),
        _ => "Adjusted workday".into(),
    }
}

fn localized_holiday_title(country_code: &str, name: &str, language: &str) -> String {
    if language == "en" {
        return name.to_string();
    }
    let normalized = name.trim().to_lowercase();
    let translated = match (country_code, normalized.as_str(), language) {
        ("CN", "new year's day", "zh-CN") => Some("元旦"),
        ("CN", "new year's day", "zh-TW") => Some("元旦"),
        ("CN", "chinese new year (spring festival)", "zh-CN") => Some("春节"),
        ("CN", "chinese new year (spring festival)", "zh-TW") => Some("春節"),
        ("CN", "qingming festival (tomb-sweeping day)", "zh-CN") => Some("清明节"),
        ("CN", "qingming festival (tomb-sweeping day)", "zh-TW") => Some("清明節"),
        ("CN", "labour day", "zh-CN") => Some("劳动节"),
        ("CN", "labour day", "zh-TW") => Some("勞動節"),
        ("CN", "dragon boat festival", "zh-CN") => Some("端午节"),
        ("CN", "dragon boat festival", "zh-TW") => Some("端午節"),
        ("CN", "mid-autumn festival", "zh-CN") => Some("中秋节"),
        ("CN", "mid-autumn festival", "zh-TW") => Some("中秋節"),
        ("CN", "national day", "zh-CN") => Some("国庆节"),
        ("CN", "national day", "zh-TW") => Some("國慶節"),
        ("HK", "new year's day", "zh-CN") => Some("元旦"),
        ("HK", "new year's day", "zh-TW") => Some("元旦"),
        ("HK", "lunar new year", "zh-CN") => Some("农历新年"),
        ("HK", "lunar new year", "zh-TW") => Some("農曆新年"),
        ("HK", "ching ming festival", "zh-CN") => Some("清明节"),
        ("HK", "ching ming festival", "zh-TW") => Some("清明節"),
        ("HK", "labour day", "zh-CN") => Some("劳动节"),
        ("HK", "labour day", "zh-TW") => Some("勞動節"),
        ("HK", "buddha's birthday", "zh-CN") => Some("佛诞"),
        ("HK", "buddha's birthday", "zh-TW") => Some("佛誕"),
        ("HK", "tuen ng festival", "zh-CN") => Some("端午节"),
        ("HK", "tuen ng festival", "zh-TW") => Some("端午節"),
        ("HK", "hong kong special administrative region establishment day", "zh-CN") => {
            Some("香港特别行政区成立纪念日")
        }
        ("HK", "hong kong special administrative region establishment day", "zh-TW") => {
            Some("香港特別行政區成立紀念日")
        }
        ("HK", "national day", "zh-CN") => Some("国庆节"),
        ("HK", "national day", "zh-TW") => Some("國慶節"),
        ("HK", "chung yeung festival", "zh-CN") => Some("重阳节"),
        ("HK", "chung yeung festival", "zh-TW") => Some("重陽節"),
        ("HK", "christmas day", "zh-CN") => Some("圣诞节"),
        ("HK", "christmas day", "zh-TW") => Some("聖誕節"),
        ("HK", "boxing day", "zh-CN") => Some("圣诞节翌日"),
        ("HK", "boxing day", "zh-TW") => Some("聖誕節翌日"),
        _ => None,
    };
    translated
        .map(str::to_string)
        .unwrap_or_else(|| localized_generic_holiday(country_code, language))
}

fn china_adjusted_workdays(year: i32, language: &str) -> Vec<ParsedHolidayEvent> {
    if year != 2026 {
        return Vec::new();
    }
    let title = localized_workday_title(language);
    [
        "2026-01-04",
        "2026-02-14",
        "2026-02-28",
        "2026-05-09",
        "2026-09-20",
        "2026-10-10",
    ]
    .into_iter()
    .map(|date| ParsedHolidayEvent {
        date: date.into(),
        title: title.clone(),
        holiday_type: "workday".into(),
    })
    .collect()
}

fn localized_china_holiday_title(key: &str, language: &str) -> String {
    match (key, language) {
        ("new_year", "zh-CN") => "元旦".into(),
        ("new_year", "zh-TW") => "元旦".into(),
        ("new_year", _) => "New Year's Day".into(),
        ("spring_festival", "zh-CN") => "春节".into(),
        ("spring_festival", "zh-TW") => "春節".into(),
        ("spring_festival", _) => "Spring Festival".into(),
        ("qingming", "zh-CN") => "清明节".into(),
        ("qingming", "zh-TW") => "清明節".into(),
        ("qingming", _) => "Qingming Festival".into(),
        ("labour", "zh-CN") => "劳动节".into(),
        ("labour", "zh-TW") => "勞動節".into(),
        ("labour", _) => "Labour Day".into(),
        ("dragon_boat", "zh-CN") => "端午节".into(),
        ("dragon_boat", "zh-TW") => "端午節".into(),
        ("dragon_boat", _) => "Dragon Boat Festival".into(),
        ("mid_autumn", "zh-CN") => "中秋节".into(),
        ("mid_autumn", "zh-TW") => "中秋節".into(),
        ("mid_autumn", _) => "Mid-Autumn Festival".into(),
        ("national", "zh-CN") => "国庆节".into(),
        ("national", "zh-TW") => "國慶節".into(),
        ("national", _) => "National Day".into(),
        _ => localized_generic_holiday("CN", language),
    }
}

fn china_adjusted_holidays(year: i32, language: &str) -> Vec<ParsedHolidayEvent> {
    if year != 2026 {
        return Vec::new();
    }
    let days = [
        ("2026-01-01", "new_year"),
        ("2026-01-02", "new_year"),
        ("2026-01-03", "new_year"),
        ("2026-02-15", "spring_festival"),
        ("2026-02-16", "spring_festival"),
        ("2026-02-17", "spring_festival"),
        ("2026-02-18", "spring_festival"),
        ("2026-02-19", "spring_festival"),
        ("2026-02-20", "spring_festival"),
        ("2026-02-21", "spring_festival"),
        ("2026-02-22", "spring_festival"),
        ("2026-02-23", "spring_festival"),
        ("2026-04-05", "qingming"),
        ("2026-04-06", "qingming"),
        ("2026-04-07", "qingming"),
        ("2026-05-01", "labour"),
        ("2026-05-02", "labour"),
        ("2026-05-03", "labour"),
        ("2026-05-04", "labour"),
        ("2026-05-05", "labour"),
        ("2026-06-19", "dragon_boat"),
        ("2026-06-20", "dragon_boat"),
        ("2026-06-21", "dragon_boat"),
        ("2026-09-25", "mid_autumn"),
        ("2026-09-26", "mid_autumn"),
        ("2026-09-27", "mid_autumn"),
        ("2026-10-01", "national"),
        ("2026-10-02", "national"),
        ("2026-10-03", "national"),
        ("2026-10-04", "national"),
        ("2026-10-05", "national"),
        ("2026-10-06", "national"),
        ("2026-10-07", "national"),
    ];
    days.into_iter()
        .map(|(date, key)| ParsedHolidayEvent {
            date: date.into(),
            title: localized_china_holiday_title(key, language),
            holiday_type: "holiday".into(),
        })
        .collect()
}

fn ensure_default_holiday_config(c: &Connection) -> AppResult<()> {
    let count: i64 = c.query_row(
        "SELECT COUNT(*) FROM holiday_sync_configs WHERE id = ?",
        params![HOLIDAY_CONFIG_ID],
        |r| r.get(0),
    )?;
    if count == 0 {
        c.execute(
            "INSERT INTO holiday_sync_configs
                (id, country_code, region, enabled, show_workdays, source_url, last_sync_at, last_error, updated_at)
             VALUES (?, 'CN', NULL, 1, 1, 'nager:CN', NULL, NULL, ?)",
            params![HOLIDAY_CONFIG_ID, crate::db::now()],
        )?;
    } else {
        c.execute(
            "UPDATE holiday_sync_configs
             SET source_url = CASE WHEN source_url = 'builtin-cn' OR source_url IS NULL THEN 'nager:CN' ELSE source_url END,
                 country_code = CASE WHEN country_code IS NULL OR country_code = '' THEN 'CN' ELSE country_code END
             WHERE id = ?",
            params![HOLIDAY_CONFIG_ID],
        )?;
    }
    Ok(())
}

#[tauri::command]
pub fn calendar_holiday_sources(state: State<DbState>) -> AppResult<Vec<CalendarHolidaySource>> {
    let c = conn(&state);
    let mut sources = Vec::new();
    let mut stmt = c.prepare(
        "SELECT id, name, source_type, url FROM calendar_holiday_sources ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map([], |r| {
        let source_type: String = r.get(2)?;
        Ok(CalendarHolidaySource {
            id: r.get(0)?,
            name: r.get(1)?,
            description: if source_type == "json" {
                "用户导入的 JSON 节假日源。".into()
            } else {
                "用户导入的日历源。".into()
            },
            built_in: false,
            url: r.get(3)?,
        })
    })?;
    for row in rows {
        sources.push(row?);
    }
    Ok(sources)
}

fn parse_holiday_json(content: &str) -> AppResult<Vec<ParsedHolidayEvent>> {
    let value: serde_json::Value = serde_json::from_str(content)?;
    let arr = value
        .as_array()
        .ok_or_else(|| crate::error::AppError::Invalid("节假日 JSON 必须是数组".into()))?;
    let mut holidays = Vec::new();
    for item in arr {
        let date = item
            .get("date")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .trim()
            .to_string();
        let title = item
            .get("title")
            .or_else(|| item.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("节假日")
            .trim()
            .to_string();
        let holiday_type = item
            .get("type")
            .or_else(|| item.get("holidayType"))
            .and_then(|v| v.as_str())
            .unwrap_or("holiday")
            .trim()
            .to_lowercase();
        if date.len() != 10
            || !date.chars().enumerate().all(|(i, c)| {
                if i == 4 || i == 7 {
                    c == '-'
                } else {
                    c.is_ascii_digit()
                }
            })
        {
            return Err(crate::error::AppError::Invalid(format!(
                "日期格式错误：{date}"
            )));
        }
        let normalized_type =
            if holiday_type == "workday" || holiday_type == "ban" || holiday_type == "班" {
                "workday".to_string()
            } else {
                "holiday".to_string()
            };
        holidays.push(ParsedHolidayEvent {
            date,
            title,
            holiday_type: normalized_type,
        });
    }
    Ok(holidays)
}

fn write_holiday_events(
    c: &Connection,
    source_id: &str,
    source_name: &str,
    holidays: &[ParsedHolidayEvent],
    raw_content: Option<&str>,
) -> AppResult<()> {
    let now = crate::db::now();
    let tx = c.unchecked_transaction()?;
    tx.execute(
        "DELETE FROM calendar_events WHERE source_type = 'holiday' AND source_account_id = ?",
        params![source_id],
    )?;
    for h in holidays {
        tx.execute(
            "INSERT INTO calendar_events
                (id, title, description, start_time, end_time, all_day, location,
                 source_type, source_account_id, external_uid, sequence, status, readonly,
                 color, holiday_type, raw_ics, created_at, updated_at, synced_at)
             VALUES (?, ?, ?, ?, ?, 1, NULL, 'holiday', ?, ?, 0, 'confirmed', 1,
                     ?, ?, ?, ?, ?, ?)",
            params![
                format!("holiday-{}-{}", source_id, h.date),
                h.title,
                if h.holiday_type == "workday" {
                    format!("{source_name} · 补班工作日")
                } else {
                    format!("{source_name} · 节假日")
                },
                format!("{}T00:00:00+08:00", h.date),
                format!("{}T23:59:59+08:00", h.date),
                source_id,
                format!("{}-{}", source_id, h.date),
                if h.holiday_type == "workday" {
                    "#16a34a"
                } else {
                    "#ef4444"
                },
                h.holiday_type,
                raw_content,
                now,
                now,
                now,
            ],
        )?;
    }
    tx.execute(
        "UPDATE holiday_sync_configs
         SET enabled = 1, source_url = ?, last_sync_at = ?, last_error = NULL, updated_at = ?
         WHERE id = ?",
        params![source_id, now, now, HOLIDAY_CONFIG_ID],
    )?;
    tx.commit()?;
    Ok(())
}

#[tauri::command]
pub fn import_holiday_json_source(
    state: State<DbState>,
    input: ImportHolidayJsonSourceRequest,
) -> AppResult<CalendarSyncStatus> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(crate::error::AppError::Invalid("请输入数据源名称".into()));
    }
    let holidays = parse_holiday_json(&input.content)?;
    if holidays.is_empty() {
        return Err(crate::error::AppError::Invalid(
            "导入源中没有节假日数据".into(),
        ));
    }
    let c = conn(&state);
    ensure_default_holiday_config(&c)?;
    let source_id = format!("custom-json-{}", crate::db::new_id());
    let now = crate::db::now();
    c.execute(
        "INSERT INTO calendar_holiday_sources (id, name, source_type, content, url, created_at, updated_at)
         VALUES (?, ?, 'json', ?, NULL, ?, ?)",
        params![source_id, name, input.content, now, now],
    )?;
    write_holiday_events(&c, &source_id, name, &holidays, Some(&input.content))?;
    drop(c);
    calendar_sync_status(state)
}

fn write_ics_source_events(
    c: &Connection,
    source_id: &str,
    source_name: &str,
    events: Vec<ParsedIcsEvent>,
    raw_content: &str,
) -> AppResult<usize> {
    let tx = c.unchecked_transaction()?;
    tx.execute(
        "DELETE FROM calendar_events WHERE source_type = 'holiday' AND source_account_id = ?",
        params![source_id],
    )?;
    let timestamp = crate::db::now();
    let mut count = 0;
    for event in events {
        tx.execute(
            "INSERT INTO calendar_events
                (id, title, description, start_time, end_time, all_day, location,
                 source_type, source_account_id, external_uid, sequence, status, readonly,
                 color, holiday_type, raw_ics, created_at, updated_at, synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'holiday', ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)",
            params![
                format!("ics-{}-{}", source_id, event.uid),
                event.title,
                event.description,
                event.start_time,
                event.end_time,
                event.all_day as i64,
                event.location,
                source_id,
                event.uid,
                event.sequence,
                event.status,
                if event.all_day { "#ef4444" } else { "#0ea5e9" },
                if event.all_day {
                    Some("holiday".to_string())
                } else {
                    None
                },
                raw_content,
                timestamp,
                timestamp,
                timestamp,
            ],
        )?;
        count += 1;
    }
    tx.execute(
        "UPDATE holiday_sync_configs
         SET enabled = 1, source_url = ?, last_sync_at = ?, last_error = NULL, updated_at = ?
         WHERE id = ?",
        params![source_name, timestamp, timestamp, HOLIDAY_CONFIG_ID],
    )?;
    tx.commit()?;
    Ok(count)
}

#[tauri::command]
pub fn import_calendar_ics_source(
    state: State<DbState>,
    input: ImportCalendarIcsSourceRequest,
) -> AppResult<CalendarSyncStatus> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(AppError::Invalid("日历源名称不能为空".into()));
    }
    let events = parse_ics_events(&input.content);
    if events.is_empty() {
        return Err(AppError::Invalid("未解析到有效 ICS 事件".into()));
    }
    let c = conn(&state);
    ensure_default_holiday_config(&c)?;
    let timestamp = crate::db::now();
    let source_id = format!("custom-ics-{}", crate::db::new_id());
    c.execute(
        "INSERT INTO calendar_holiday_sources (id, name, source_type, content, url, created_at, updated_at)
         VALUES (?, ?, 'ics', ?, ?, ?, ?)",
        params![source_id, name, input.content, input.url, timestamp, timestamp],
    )?;
    write_ics_source_events(&c, &source_id, name, events, &input.content)?;
    drop(c);
    calendar_sync_status(state)
}

#[tauri::command]
pub fn sync_calendar_ics_url_source(
    state: State<DbState>,
    name: String,
    url: String,
) -> AppResult<CalendarSyncStatus> {
    let source_name = name.trim();
    let source_url = url.trim();
    if source_name.is_empty() || source_url.is_empty() {
        return Err(AppError::Invalid("日历源名称和 URL 不能为空".into()));
    }
    let content = reqwest::blocking::get(source_url)
        .map_err(|e| AppError::Invalid(format!("无法下载 ICS 源：{e}")))?
        .text()
        .map_err(|e| AppError::Invalid(format!("无法读取 ICS 源：{e}")))?;
    import_calendar_ics_source(
        state,
        ImportCalendarIcsSourceRequest {
            name: source_name.to_string(),
            content,
            url: Some(source_url.to_string()),
        },
    )
}

#[tauri::command]
pub fn delete_calendar_holiday_source(
    state: State<DbState>,
    id: String,
) -> AppResult<CalendarSyncStatus> {
    let c = conn(&state);
    c.execute(
        "DELETE FROM calendar_events WHERE source_type = 'holiday' AND source_account_id = ?",
        params![id],
    )?;
    c.execute(
        "DELETE FROM calendar_holiday_sources WHERE id = ?",
        params![id],
    )?;
    drop(c);
    calendar_sync_status(state)
}

#[tauri::command]
pub fn create_manual_calendar_event(
    state: State<DbState>,
    input: CreateManualCalendarEventRequest,
) -> AppResult<CalendarEntry> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err(AppError::Invalid("请输入日程标题".into()));
    }
    let id = crate::db::new_id();
    let now = crate::db::now();
    let start_at = input.start_at;
    let end_at = input.end_at.unwrap_or_else(|| start_at.clone());
    let color = input.color.unwrap_or_else(|| "#2563eb".into());
    let description = input.description.clone();
    let location = input.location.clone();
    let c = conn(&state);
    c.execute(
        "INSERT INTO calendar_events
            (id, title, description, start_time, end_time, all_day, location,
             source_type, source_account_id, external_uid, sequence, status, readonly,
             color, holiday_type, raw_ics, created_at, updated_at, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', NULL, NULL, 0, 'confirmed', 0,
                 ?, NULL, NULL, ?, ?, NULL)",
        params![
            id,
            title,
            description,
            start_at,
            end_at,
            input.all_day as i64,
            location,
            color,
            now,
            now,
        ],
    )?;
    let (date, time, start_raw) = local_parts(Some(start_at));
    let (_, end_time, end_raw) = local_parts(Some(end_at));
    Ok(CalendarEntry {
        id,
        title: title.to_string(),
        date,
        time: if input.all_day { None } else { time },
        end_time: if input.all_day { None } else { end_time },
        source_type: "manual".into(),
        readonly: false,
        list_id: None,
        list_name: None,
        board_id: None,
        board_name: None,
        board_color: None,
        linked_task_id: None,
        is_completed: false,
        color: Some(color),
        has_reminder: false,
        has_subtasks: false,
        subtask_count: 0,
        subtask_done: 0,
        location,
        description,
        holiday_type: None,
        status: Some("confirmed".into()),
        start_at: start_raw,
        due_at: end_raw,
    })
}

#[tauri::command]
pub fn update_manual_calendar_event(
    state: State<DbState>,
    input: UpdateManualCalendarEventRequest,
) -> AppResult<()> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err(AppError::Invalid("Please enter a schedule title".into()));
    }
    let c = conn(&state);
    let existing: Option<(String, i64)> = c
        .query_row(
            "SELECT source_type, readonly FROM calendar_events WHERE id = ?",
            params![input.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    let Some((source_type, readonly)) = existing else {
        return Err(AppError::Invalid("Calendar event not found".into()));
    };
    if source_type != "manual" || readonly != 0 {
        return Err(AppError::Invalid(
            "Only local schedules can be edited".into(),
        ));
    }
    let end_at = input.end_at.unwrap_or_else(|| input.start_at.clone());
    c.execute(
        "UPDATE calendar_events
            SET title = ?, description = ?, start_time = ?, end_time = ?, all_day = ?,
                location = ?, color = ?, updated_at = ?
          WHERE id = ?",
        params![
            title,
            input.description,
            input.start_at,
            end_at,
            input.all_day as i64,
            input.location,
            input.color,
            crate::db::now(),
            input.id,
        ],
    )?;
    Ok(())
}

fn row_to_calendar_email_account(r: &rusqlite::Row<'_>) -> rusqlite::Result<CalendarEmailAccount> {
    Ok(CalendarEmailAccount {
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
}

fn email_credential_entry(account_id: &str) -> Result<keyring::Entry, keyring::Error> {
    keyring::Entry::new("ascend-todo.calendar.email", account_id)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CalendarOAuthCredential {
    provider: String,
    client_id: String,
    access_token: String,
    refresh_token: Option<String>,
    expires_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct OAuthTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CalendarSyncConfigBackup {
    version: i32,
    exported_at: String,
    holiday_sources: Vec<CalendarHolidaySource>,
    email_accounts: Vec<CalendarEmailAccount>,
}

struct OAuth2ImapAuthenticator {
    user: String,
    access_token: String,
}

impl imap::Authenticator for OAuth2ImapAuthenticator {
    type Response = String;

    fn process(&self, _: &[u8]) -> Self::Response {
        format!(
            "user={}\x01auth=Bearer {}\x01\x01",
            self.user, self.access_token
        )
    }
}

fn normalized_email_provider(provider: &str) -> String {
    match provider.trim().to_lowercase().as_str() {
        "gmail" => "gmail".to_string(),
        "outlook" | "office365" | "microsoft" => "outlook".to_string(),
        _ => "imap".to_string(),
    }
}

fn provider_imap_defaults(provider: &str) -> (Option<String>, Option<i32>) {
    match provider {
        "gmail" => (Some("imap.gmail.com".to_string()), Some(993)),
        "outlook" => (Some("outlook.office365.com".to_string()), Some(993)),
        _ => (None, None),
    }
}

fn provider_auth_label(provider: &str) -> &'static str {
    match provider {
        "gmail" => "Gmail OAuth 访问令牌",
        "outlook" => "Outlook OAuth 访问令牌",
        _ => "邮箱授权码或密码",
    }
}

fn oauth_scope(provider: &str) -> &'static str {
    match provider {
        "gmail" => "https://mail.google.com/",
        "outlook" => "offline_access https://outlook.office.com/IMAP.AccessAsUser.All",
        _ => "",
    }
}

fn oauth_auth_endpoint(provider: &str) -> &'static str {
    match provider {
        "gmail" => "https://accounts.google.com/o/oauth2/v2/auth",
        "outlook" => "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        _ => "",
    }
}

fn oauth_token_endpoint(provider: &str) -> &'static str {
    match provider {
        "gmail" => "https://oauth2.googleapis.com/token",
        "outlook" => "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        _ => "",
    }
}

fn oauth_pkce_verifier() -> String {
    format!(
        "{}{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

fn base64_url_no_pad(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    let mut i = 0;
    while i + 3 <= bytes.len() {
        let chunk = ((bytes[i] as u32) << 16) | ((bytes[i + 1] as u32) << 8) | bytes[i + 2] as u32;
        out.push(TABLE[((chunk >> 18) & 0x3f) as usize] as char);
        out.push(TABLE[((chunk >> 12) & 0x3f) as usize] as char);
        out.push(TABLE[((chunk >> 6) & 0x3f) as usize] as char);
        out.push(TABLE[(chunk & 0x3f) as usize] as char);
        i += 3;
    }
    let rem = bytes.len() - i;
    if rem == 1 {
        let chunk = (bytes[i] as u32) << 16;
        out.push(TABLE[((chunk >> 18) & 0x3f) as usize] as char);
        out.push(TABLE[((chunk >> 12) & 0x3f) as usize] as char);
    } else if rem == 2 {
        let chunk = ((bytes[i] as u32) << 16) | ((bytes[i + 1] as u32) << 8);
        out.push(TABLE[((chunk >> 18) & 0x3f) as usize] as char);
        out.push(TABLE[((chunk >> 12) & 0x3f) as usize] as char);
        out.push(TABLE[((chunk >> 6) & 0x3f) as usize] as char);
    }
    out
}

fn oauth_pkce_challenge(verifier: &str) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(verifier.as_bytes());
    base64_url_no_pad(&digest)
}

fn pomodoro_record_end_at(
    started_at: Option<&str>,
    ended_at: Option<String>,
    duration_seconds: i32,
) -> Option<String> {
    if duration_seconds > 0 {
        if let Some(started_at) = started_at {
            if let Ok(start) = chrono::DateTime::parse_from_rfc3339(started_at) {
                return Some(
                    (start + chrono::Duration::seconds(duration_seconds as i64)).to_rfc3339(),
                );
            }
        }
    }
    ended_at
}

fn open_external_url(url: &str) -> AppResult<()> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", url])
            .spawn()
            .map_err(|e| AppError::Invalid(format!("Failed to open OAuth page: {e}")))?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| AppError::Invalid(format!("Failed to open OAuth page: {e}")))?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| AppError::Invalid(format!("Failed to open OAuth page: {e}")))?;
        return Ok(());
    }
}

fn wait_for_oauth_code(listener: TcpListener, expected_state: &str) -> AppResult<String> {
    for stream in listener.incoming() {
        let mut stream =
            stream.map_err(|e| AppError::Invalid(format!("OAuth callback failed: {e}")))?;
        let mut buffer = [0_u8; 4096];
        let read = stream
            .read(&mut buffer)
            .map_err(|e| AppError::Invalid(format!("OAuth callback read failed: {e}")))?;
        let request = String::from_utf8_lossy(&buffer[..read]);
        let path = request
            .lines()
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
            .unwrap_or("/");
        let callback = Url::parse(&format!("http://127.0.0.1{}", path))
            .map_err(|e| AppError::Invalid(format!("OAuth callback parse failed: {e}")))?;
        let query: std::collections::HashMap<_, _> = callback.query_pairs().into_owned().collect();
        let state = query.get("state").cloned().unwrap_or_default();
        let code = query.get("code").cloned();
        let error = query.get("error").cloned();
        let ok = code.is_some() && state == expected_state;
        let body = if ok {
            "Authorization completed. You can return to Ascend Todo."
        } else {
            "Authorization failed or expired. Please return to Ascend Todo and try again."
        };
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = stream.write_all(response.as_bytes());
        if let Some(err) = error {
            return Err(AppError::Auth(format!("OAuth authorization failed: {err}")));
        }
        if state != expected_state {
            return Err(AppError::Auth("OAuth state verification failed".into()));
        }
        if let Some(code) = code {
            return Ok(code);
        }
    }
    Err(AppError::Auth("OAuth authorization timed out".into()))
}

fn exchange_oauth_code(
    provider: &str,
    client_id: &str,
    redirect_uri: &str,
    code: &str,
    verifier: &str,
) -> AppResult<CalendarOAuthCredential> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| AppError::Invalid(format!("OAuth client setup failed: {e}")))?;
    let params = [
        ("client_id", client_id),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("grant_type", "authorization_code"),
        ("code_verifier", verifier),
    ];
    let response = client
        .post(oauth_token_endpoint(provider))
        .form(&params)
        .send()
        .map_err(|e| AppError::Auth(format!("OAuth token exchange failed: {e}")))?;
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().unwrap_or_default();
        return Err(AppError::Auth(format!(
            "OAuth token exchange failed: {status} {text}"
        )));
    }
    let token: OAuthTokenResponse = response
        .json()
        .map_err(|e| AppError::Auth(format!("OAuth token parse failed: {e}")))?;
    Ok(CalendarOAuthCredential {
        provider: provider.to_string(),
        client_id: client_id.to_string(),
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: token
            .expires_in
            .map(|seconds| chrono::Utc::now().timestamp() + seconds - 60),
    })
}

fn refresh_oauth_credential(
    provider: &str,
    credential: &CalendarOAuthCredential,
) -> AppResult<CalendarOAuthCredential> {
    let refresh_token = credential.refresh_token.as_deref().ok_or_else(|| {
        AppError::Auth("OAuth refresh token missing, please authorize again".into())
    })?;
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| AppError::Invalid(format!("OAuth client setup failed: {e}")))?;
    let params = [
        ("client_id", credential.client_id.as_str()),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];
    let response = client
        .post(oauth_token_endpoint(provider))
        .form(&params)
        .send()
        .map_err(|e| AppError::Auth(format!("OAuth token refresh failed: {e}")))?;
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().unwrap_or_default();
        return Err(AppError::Auth(format!(
            "OAuth token refresh failed: {status} {text}"
        )));
    }
    let token: OAuthTokenResponse = response
        .json()
        .map_err(|e| AppError::Auth(format!("OAuth token parse failed: {e}")))?;
    Ok(CalendarOAuthCredential {
        provider: provider.to_string(),
        client_id: credential.client_id.clone(),
        access_token: token.access_token,
        refresh_token: token
            .refresh_token
            .or_else(|| credential.refresh_token.clone()),
        expires_at: token
            .expires_in
            .map(|seconds| chrono::Utc::now().timestamp() + seconds - 60),
    })
}

fn resolve_calendar_email_secret(
    account: &CalendarEmailAccount,
    raw_secret: &str,
    entry: &keyring::Entry,
) -> AppResult<String> {
    let provider = normalized_email_provider(&account.provider);
    if provider != "gmail" && provider != "outlook" {
        return Ok(raw_secret.to_string());
    }
    let parsed = serde_json::from_str::<CalendarOAuthCredential>(raw_secret);
    let Ok(credential) = parsed else {
        return Ok(raw_secret.to_string());
    };
    let should_refresh = credential
        .expires_at
        .map(|expires_at| expires_at <= chrono::Utc::now().timestamp() + 120)
        .unwrap_or(false);
    let credential = if should_refresh {
        let refreshed = refresh_oauth_credential(&provider, &credential)?;
        let serialized = serde_json::to_string(&refreshed)
            .map_err(|e| AppError::Invalid(format!("OAuth token serialize failed: {e}")))?;
        entry
            .set_password(&serialized)
            .map_err(|e| AppError::Invalid(format!("OAuth token save failed: {e}")))?;
        refreshed
    } else {
        credential
    };
    Ok(credential.access_token)
}

fn ensure_calendar_email_account_exists(c: &Connection, id: &str) -> AppResult<()> {
    let count: i64 = c.query_row(
        "SELECT COUNT(*) FROM calendar_sync_accounts WHERE id = ?",
        params![id],
        |r| r.get(0),
    )?;
    if count == 0 {
        return Err(crate::error::AppError::NotFound("邮箱账号不存在".into()));
    }
    Ok(())
}

fn parse_ics_datetime(value: &str) -> Option<(String, bool)> {
    let v = value.trim();
    if v.len() == 8 && v.chars().all(|c| c.is_ascii_digit()) {
        return Some((
            format!("{}-{}-{}T00:00:00+08:00", &v[0..4], &v[4..6], &v[6..8]),
            true,
        ));
    }
    let normalized = v.trim_end_matches('Z');
    if normalized.len() >= 15 {
        let raw = format!(
            "{}-{}-{}T{}:{}:{}{}",
            &normalized[0..4],
            &normalized[4..6],
            &normalized[6..8],
            &normalized[9..11],
            &normalized[11..13],
            &normalized[13..15],
            if v.ends_with('Z') { "+00:00" } else { "+08:00" },
        );
        return Some((raw, false));
    }
    None
}

fn unfold_ics_lines(ics: &str) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    for raw in ics.replace("\r\n", "\n").replace('\r', "\n").split('\n') {
        if raw.starts_with(' ') || raw.starts_with('\t') {
            if let Some(last) = lines.last_mut() {
                last.push_str(raw.trim_start());
            }
        } else {
            lines.push(raw.to_string());
        }
    }
    lines
}

fn ics_line_name(line: &str) -> String {
    line.split(':')
        .next()
        .unwrap_or_default()
        .split(';')
        .next()
        .unwrap_or_default()
        .to_uppercase()
}

fn ics_line_value(line: &str) -> String {
    line.split_once(':')
        .map(|(_, v)| v.trim().to_string())
        .unwrap_or_default()
}

fn fix_mojibake_text(value: &str) -> String {
    let has_suspicious_marker = value.chars().any(|ch| {
        matches!(
            ch,
            'Ã' | 'Â' | 'Ä' | 'Å' | 'Æ' | 'Ç' | 'È' | 'É' | 'ä' | 'å' | 'æ' | 'ç' | 'è' | 'é'
        ) || cp1252_mojibake_byte(ch).is_some()
            || ('\u{0080}'..='\u{009f}').contains(&ch)
    });
    if !has_suspicious_marker {
        return value.replace('\u{00a0}', " ");
    }

    let mut bytes = Vec::with_capacity(value.len());
    for ch in value.chars() {
        let code = ch as u32;
        if code <= 0xff {
            bytes.push(code as u8);
        } else if let Some(byte) = cp1252_mojibake_byte(ch) {
            bytes.push(byte);
        } else {
            return value.replace('\u{00a0}', " ");
        }
    }

    match String::from_utf8(bytes) {
        Ok(decoded) => decoded.replace('\u{00a0}', " "),
        Err(_) => value.replace('\u{00a0}', " "),
    }
}

fn cp1252_mojibake_byte(ch: char) -> Option<u8> {
    match ch {
        '€' => Some(0x80),
        '‚' => Some(0x82),
        'ƒ' => Some(0x83),
        '„' => Some(0x84),
        '…' => Some(0x85),
        '†' => Some(0x86),
        '‡' => Some(0x87),
        'ˆ' => Some(0x88),
        '‰' => Some(0x89),
        'Š' => Some(0x8a),
        '‹' => Some(0x8b),
        'Œ' => Some(0x8c),
        'Ž' => Some(0x8e),
        '‘' => Some(0x91),
        '’' => Some(0x92),
        '“' => Some(0x93),
        '”' => Some(0x94),
        '•' => Some(0x95),
        '–' => Some(0x96),
        '—' => Some(0x97),
        '˜' => Some(0x98),
        '™' => Some(0x99),
        'š' => Some(0x9a),
        '›' => Some(0x9b),
        'œ' => Some(0x9c),
        'ž' => Some(0x9e),
        'Ÿ' => Some(0x9f),
        _ => None,
    }
}

fn normalize_ics_text(value: &str) -> String {
    let unescaped = value
        .replace("\\n", "\n")
        .replace("\\N", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\");
    fix_mojibake_text(&unescaped)
}

fn clean_ics_person(value: &str) -> String {
    let cleaned = value
        .trim()
        .strip_prefix("mailto:")
        .unwrap_or(value.trim())
        .to_string();
    normalize_ics_text(&cleaned)
}

fn parse_ics_events(ics: &str) -> Vec<ParsedIcsEvent> {
    let lines = unfold_ics_lines(ics);
    let method = lines
        .iter()
        .find(|line| ics_line_name(line) == "METHOD")
        .map(|line| ics_line_value(line).to_uppercase())
        .unwrap_or_default();
    let mut events = Vec::new();
    let mut in_event = false;
    let mut uid = String::new();
    let mut title = String::new();
    let mut description: Option<String> = None;
    let mut location: Option<String> = None;
    let mut start_time: Option<String> = None;
    let mut end_time: Option<String> = None;
    let mut all_day = false;
    let mut sequence = 0;
    let mut status = String::from("confirmed");
    let mut details: Vec<String> = Vec::new();

    for line in lines {
        let name = ics_line_name(&line);
        if name == "BEGIN" && ics_line_value(&line).eq_ignore_ascii_case("VEVENT") {
            in_event = true;
            uid.clear();
            title.clear();
            description = None;
            location = None;
            start_time = None;
            end_time = None;
            all_day = false;
            sequence = 0;
            status = String::from("confirmed");
            details.clear();
            continue;
        }
        if name == "END" && ics_line_value(&line).eq_ignore_ascii_case("VEVENT") {
            if !uid.is_empty() && start_time.is_some() {
                if method == "CANCEL" || status.eq_ignore_ascii_case("CANCELLED") {
                    status = "cancelled".into();
                }
                let full_description = if details.is_empty() {
                    description.clone()
                } else {
                    let detail_text = details.join("\n");
                    Some(match description.clone() {
                        Some(desc) if !desc.trim().is_empty() => format!("{desc}\n\n{detail_text}"),
                        _ => detail_text,
                    })
                };
                events.push(ParsedIcsEvent {
                    uid: uid.clone(),
                    title: if title.is_empty() {
                        "未命名会议".into()
                    } else {
                        title.clone()
                    },
                    description: full_description,
                    location: location.clone(),
                    start_time: start_time.clone().unwrap_or_default(),
                    end_time: end_time.clone(),
                    all_day,
                    sequence,
                    status: status.clone(),
                    raw_ics: ics.to_string(),
                });
            }
            in_event = false;
            continue;
        }
        if !in_event {
            continue;
        }
        let value = ics_line_value(&line);
        match name.as_str() {
            "UID" => uid = value,
            "SUMMARY" => title = normalize_ics_text(&value),
            "DESCRIPTION" => description = Some(normalize_ics_text(&value)),
            "LOCATION" => location = Some(normalize_ics_text(&value)),
            "ORGANIZER" => details.push(format!("组织者：{}", clean_ics_person(&value))),
            "ATTENDEE" => details.push(format!("参会人：{}", clean_ics_person(&value))),
            "URL" => details.push(format!("会议链接：{}", normalize_ics_text(&value))),
            "DTSTART" => {
                if let Some((dt, is_all_day)) = parse_ics_datetime(&value) {
                    start_time = Some(dt);
                    all_day = is_all_day;
                }
            }
            "DTEND" => {
                if let Some((dt, _)) = parse_ics_datetime(&value) {
                    end_time = Some(dt);
                }
            }
            "SEQUENCE" => sequence = value.parse().unwrap_or(0),
            "STATUS" => status = value.to_lowercase(),
            _ => {}
        }
    }
    events
}

fn collect_calendar_parts(parsed: &mailparse::ParsedMail<'_>, out: &mut Vec<String>) {
    let mimetype = parsed.ctype.mimetype.to_lowercase();
    let disposition = parsed.get_content_disposition();
    let filename = disposition
        .params
        .get("filename")
        .or_else(|| disposition.params.get("name"))
        .map(|v| v.to_lowercase());
    if mimetype == "text/calendar" || filename.as_deref().is_some_and(|v| v.ends_with(".ics")) {
        if let Ok(body) = parsed.get_body() {
            out.push(body);
        }
    }
    for subpart in &parsed.subparts {
        collect_calendar_parts(subpart, out);
    }
}

fn upsert_ics_events(
    c: &Connection,
    account: &CalendarEmailAccount,
    events: Vec<ParsedIcsEvent>,
) -> AppResult<(i32, i32, i32)> {
    let mut imported = 0;
    let mut updated = 0;
    let mut cancelled = 0;
    let now = crate::db::now();
    for event in events {
        let existing: Option<(String, i32)> = c
            .query_row(
                "SELECT id, sequence FROM calendar_events
                 WHERE source_type = 'meeting' AND source_account_id = ? AND external_uid = ?",
                params![account.id, event.uid],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .ok();
        if event.status == "cancelled" {
            if let Some((id, _)) = existing {
                c.execute(
                    "UPDATE calendar_events SET status = 'cancelled', updated_at = ?, synced_at = ? WHERE id = ?",
                    params![now, now, id],
                )?;
                cancelled += 1;
            }
            continue;
        }
        if let Some((id, old_sequence)) = existing {
            if event.sequence >= old_sequence {
                c.execute(
                    "UPDATE calendar_events
                     SET title = ?, description = ?, start_time = ?, end_time = ?, all_day = ?,
                         location = ?, sequence = ?, status = ?, readonly = 1, color = ?,
                         raw_ics = ?, updated_at = ?, synced_at = ?
                     WHERE id = ?",
                    params![
                        event.title,
                        event.description,
                        event.start_time,
                        event.end_time,
                        event.all_day as i32,
                        event.location,
                        event.sequence,
                        event.status,
                        "#0ea5e9",
                        event.raw_ics,
                        now,
                        now,
                        id,
                    ],
                )?;
                updated += 1;
            }
        } else {
            c.execute(
                "INSERT INTO calendar_events
                    (id, title, description, start_time, end_time, all_day, location,
                     source_type, source_account_id, external_uid, sequence, status, readonly,
                     color, holiday_type, raw_ics, created_at, updated_at, synced_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'meeting', ?, ?, ?, ?, 1, ?, NULL, ?, ?, ?, ?)",
                params![
                    crate::db::new_id(),
                    event.title,
                    event.description,
                    event.start_time,
                    event.end_time,
                    event.all_day as i32,
                    event.location,
                    account.id,
                    event.uid,
                    event.sequence,
                    event.status,
                    "#0ea5e9",
                    event.raw_ics,
                    now,
                    now,
                    now,
                ],
            )?;
            imported += 1;
        }
    }
    Ok((imported, updated, cancelled))
}

#[tauri::command]
pub fn list_calendar_email_accounts(state: State<DbState>) -> AppResult<Vec<CalendarEmailAccount>> {
    let c = conn(&state);
    let mut stmt = c.prepare(
        "SELECT id, provider, email, imap_host, imap_port, enabled, sync_interval_minutes,
                last_sync_at, last_error, created_at, updated_at
         FROM calendar_sync_accounts
         ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map([], row_to_calendar_email_account)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

#[tauri::command]
pub fn export_calendar_sync_config(state: State<DbState>) -> AppResult<String> {
    let c = conn(&state);
    let mut sources = Vec::new();
    let mut source_stmt = c.prepare(
        "SELECT id, name, source_type, url FROM calendar_holiday_sources ORDER BY created_at ASC",
    )?;
    let source_rows = source_stmt.query_map([], |r| {
        let source_type: String = r.get(2)?;
        Ok(CalendarHolidaySource {
            id: r.get(0)?,
            name: r.get(1)?,
            description: if source_type == "json" {
                "JSON holiday source".into()
            } else {
                "ICS calendar source".into()
            },
            built_in: false,
            url: r.get(3)?,
        })
    })?;
    for row in source_rows {
        sources.push(row?);
    }

    let mut accounts = Vec::new();
    let mut account_stmt = c.prepare(
        "SELECT id, provider, email, imap_host, imap_port, enabled, sync_interval_minutes,
                last_sync_at, last_error, created_at, updated_at
         FROM calendar_sync_accounts
         ORDER BY created_at ASC",
    )?;
    let account_rows = account_stmt.query_map([], row_to_calendar_email_account)?;
    for row in account_rows {
        let mut account = row?;
        account.last_error = None;
        accounts.push(account);
    }

    let backup = CalendarSyncConfigBackup {
        version: 1,
        exported_at: crate::db::now(),
        holiday_sources: sources,
        email_accounts: accounts,
    };
    serde_json::to_string_pretty(&backup)
        .map_err(|e| AppError::Invalid(format!("Calendar sync config export failed: {e}")))
}

#[tauri::command]
pub fn import_calendar_sync_config(
    state: State<DbState>,
    content: String,
) -> AppResult<CalendarSyncStatus> {
    let backup: CalendarSyncConfigBackup = serde_json::from_str(&content)
        .map_err(|e| AppError::Invalid(format!("Calendar sync config parse failed: {e}")))?;
    let c = conn(&state);
    let now = crate::db::now();
    for source in backup.holiday_sources {
        let source_type = if source.url.as_deref().unwrap_or_default().trim().is_empty() {
            "json"
        } else {
            "ics"
        };
        let exists: i64 = c.query_row(
            "SELECT COUNT(*) FROM calendar_holiday_sources WHERE name = ? AND COALESCE(url, '') = COALESCE(?, '')",
            params![source.name, source.url],
            |r| r.get(0),
        )?;
        if exists == 0 {
            c.execute(
                "INSERT INTO calendar_holiday_sources (id, name, source_type, content, url, created_at, updated_at)
                 VALUES (?, ?, ?, NULL, ?, ?, ?)",
                params![crate::db::new_id(), source.name, source_type, source.url, now, now],
            )?;
        }
    }
    for account in backup.email_accounts {
        let provider = normalized_email_provider(&account.provider);
        let exists: i64 = c.query_row(
            "SELECT COUNT(*) FROM calendar_sync_accounts WHERE provider = ? AND email = ?",
            params![provider, account.email],
            |r| r.get(0),
        )?;
        if exists == 0 {
            let (default_host, default_port) = provider_imap_defaults(&provider);
            c.execute(
                "INSERT INTO calendar_sync_accounts
                    (id, provider, email, imap_host, imap_port, enabled, sync_interval_minutes,
                     last_sync_at, last_error, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)",
                params![
                    crate::db::new_id(),
                    provider,
                    account.email,
                    account.imap_host.or(default_host),
                    account.imap_port.or(default_port),
                    account.enabled as i32,
                    account.sync_interval_minutes.clamp(3, 120),
                    now,
                    now,
                ],
            )?;
        }
    }
    drop(c);
    calendar_sync_status(state)
}

#[tauri::command]
pub fn create_calendar_email_account(
    state: State<DbState>,
    input: CreateCalendarEmailAccountRequest,
) -> AppResult<CalendarEmailAccount> {
    let email = input.email.trim().to_lowercase();
    if email.is_empty() || !email.contains('@') {
        return Err(crate::error::AppError::Invalid("请输入有效邮箱地址".into()));
    }
    let provider = normalized_email_provider(&input.provider);
    let (default_host, default_port) = provider_imap_defaults(&provider);
    let imap_host = input
        .imap_host
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .or(default_host);
    let imap_port = input.imap_port.or(default_port);
    let interval = input.sync_interval_minutes.unwrap_or(10).clamp(3, 120);
    let now = crate::db::now();
    let id = crate::db::new_id();
    let c = conn(&state);
    c.execute(
        "INSERT INTO calendar_sync_accounts
            (id, provider, email, imap_host, imap_port, enabled, sync_interval_minutes,
             last_sync_at, last_error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, NULL, NULL, ?, ?)",
        params![id, provider, email, imap_host, imap_port, interval, now, now,],
    )?;
    let account = c.query_row(
        "SELECT id, provider, email, imap_host, imap_port, enabled, sync_interval_minutes,
                last_sync_at, last_error, created_at, updated_at
         FROM calendar_sync_accounts WHERE id = ?",
        params![id],
        row_to_calendar_email_account,
    )?;
    Ok(account)
}

#[tauri::command]
pub fn set_calendar_email_account_enabled(
    state: State<DbState>,
    id: String,
    enabled: bool,
) -> AppResult<()> {
    let c = conn(&state);
    c.execute(
        "UPDATE calendar_sync_accounts SET enabled = ?, updated_at = ? WHERE id = ?",
        params![enabled as i32, crate::db::now(), id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn delete_calendar_email_account(state: State<DbState>, id: String) -> AppResult<()> {
    let c = conn(&state);
    let tx = c.unchecked_transaction()?;
    tx.execute(
        "DELETE FROM calendar_events WHERE source_type IN ('meeting', 'email') AND source_account_id = ?",
        params![id],
    )?;
    tx.execute(
        "DELETE FROM calendar_sync_accounts WHERE id = ?",
        params![id],
    )?;
    tx.commit()?;
    if let Ok(entry) = email_credential_entry(&id) {
        let _ = entry.delete_credential();
    }
    Ok(())
}

#[tauri::command]
pub fn save_calendar_email_credential(
    state: State<DbState>,
    input: SaveCalendarEmailCredentialRequest,
) -> AppResult<CalendarEmailCredentialStatus> {
    let c = conn(&state);
    ensure_calendar_email_account_exists(&c, &input.account_id)?;
    let secret = input.secret.trim();
    if secret.is_empty() {
        return Err(crate::error::AppError::Invalid("授权码不能为空".into()));
    }
    let entry = email_credential_entry(&input.account_id)
        .map_err(|e| crate::error::AppError::Invalid(format!("无法访问系统凭据管理：{e}")))?;
    entry
        .set_password(secret)
        .map_err(|e| crate::error::AppError::Invalid(format!("保存邮箱授权信息失败：{e}")))?;
    Ok(CalendarEmailCredentialStatus {
        account_id: input.account_id,
        has_credential: true,
    })
}

#[tauri::command]
pub fn calendar_email_credential_status(
    state: State<DbState>,
    account_id: String,
) -> AppResult<CalendarEmailCredentialStatus> {
    let c = conn(&state);
    ensure_calendar_email_account_exists(&c, &account_id)?;
    let has_credential = email_credential_entry(&account_id)
        .ok()
        .and_then(|entry| entry.get_password().ok())
        .map(|secret| !secret.is_empty())
        .unwrap_or(false);
    Ok(CalendarEmailCredentialStatus {
        account_id,
        has_credential,
    })
}

#[tauri::command]
pub fn authorize_calendar_email_oauth(
    state: State<DbState>,
    input: AuthorizeCalendarEmailOAuthRequest,
) -> AppResult<CalendarEmailCredentialStatus> {
    let c = conn(&state);
    let account = get_calendar_email_account(&c, &input.account_id)?;
    drop(c);

    let provider = normalized_email_provider(&account.provider);
    if provider != "gmail" && provider != "outlook" {
        return Err(AppError::Invalid(
            "OAuth is only available for Gmail and Outlook accounts".into(),
        ));
    }
    let client_id = input.client_id.trim();
    if client_id.is_empty() {
        return Err(AppError::Invalid("OAuth Client ID is required".into()));
    }

    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| AppError::Invalid(format!("OAuth local callback listener failed: {e}")))?;
    let port = listener
        .local_addr()
        .map_err(|e| AppError::Invalid(format!("OAuth local callback port failed: {e}")))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{}/oauth/callback", port);
    let state_token = uuid::Uuid::new_v4().to_string();
    let verifier = oauth_pkce_verifier();
    let challenge = oauth_pkce_challenge(&verifier);
    let mut auth_url = Url::parse(oauth_auth_endpoint(&provider))
        .map_err(|e| AppError::Invalid(format!("OAuth authorization URL parse failed: {e}")))?;
    {
        let mut query = auth_url.query_pairs_mut();
        query.append_pair("client_id", client_id);
        query.append_pair("redirect_uri", &redirect_uri);
        query.append_pair("response_type", "code");
        query.append_pair("scope", oauth_scope(&provider));
        query.append_pair("state", &state_token);
        query.append_pair("code_challenge", &challenge);
        query.append_pair("code_challenge_method", "S256");
        if provider == "gmail" {
            query.append_pair("access_type", "offline");
            query.append_pair("prompt", "consent");
            query.append_pair("login_hint", &account.email);
        } else {
            query.append_pair("prompt", "select_account");
            query.append_pair("login_hint", &account.email);
        }
    }

    open_external_url(auth_url.as_str())?;
    let code = wait_for_oauth_code(listener, &state_token)?;
    let credential = exchange_oauth_code(&provider, client_id, &redirect_uri, &code, &verifier)?;
    let serialized = serde_json::to_string(&credential)
        .map_err(|e| AppError::Invalid(format!("OAuth token serialize failed: {e}")))?;
    let entry = email_credential_entry(&account.id)
        .map_err(|e| AppError::Invalid(format!("Credential store access failed: {e}")))?;
    entry
        .set_password(&serialized)
        .map_err(|e| AppError::Invalid(format!("OAuth credential save failed: {e}")))?;
    Ok(CalendarEmailCredentialStatus {
        account_id: account.id,
        has_credential: true,
    })
}

#[tauri::command]
pub fn delete_calendar_email_credential(
    state: State<DbState>,
    account_id: String,
) -> AppResult<()> {
    let c = conn(&state);
    ensure_calendar_email_account_exists(&c, &account_id)?;
    if let Ok(entry) = email_credential_entry(&account_id) {
        let _ = entry.delete_credential();
    }
    Ok(())
}

fn get_calendar_email_account(c: &Connection, account_id: &str) -> AppResult<CalendarEmailAccount> {
    let account = c.query_row(
        "SELECT id, provider, email, imap_host, imap_port, enabled, sync_interval_minutes,
                last_sync_at, last_error, created_at, updated_at
         FROM calendar_sync_accounts WHERE id = ?",
        params![account_id],
        row_to_calendar_email_account,
    )?;
    Ok(account)
}

fn mark_email_sync_error(c: &Connection, account_id: &str, error: &str) -> AppResult<()> {
    c.execute(
        "UPDATE calendar_sync_accounts SET last_error = ?, updated_at = ? WHERE id = ?",
        params![error, crate::db::now(), account_id],
    )?;
    Ok(())
}

fn mark_email_sync_success(c: &Connection, account_id: &str) -> AppResult<()> {
    let now = crate::db::now();
    c.execute(
        "UPDATE calendar_sync_accounts SET last_sync_at = ?, last_error = NULL, updated_at = ? WHERE id = ?",
        params![now, now, account_id],
    )?;
    Ok(())
}

fn sync_calendar_email_account_blocking(
    state: State<DbState>,
    account_id: String,
) -> AppResult<CalendarEmailSyncResult> {
    let account = {
        let c = conn(&state);
        get_calendar_email_account(&c, &account_id)?
    };
    if !account.enabled {
        return Err(crate::error::AppError::Invalid("邮箱账号未启用".into()));
    }
    let host = account
        .imap_host
        .clone()
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| crate::error::AppError::Invalid("请先设置 IMAP 服务器".into()))?;
    let port = account.imap_port.unwrap_or(993) as u16;
    let credential_entry = email_credential_entry(&account.id)
        .map_err(|e| crate::error::AppError::Auth(format!("无法访问系统凭据管理：{e}")))?;
    let raw_secret = credential_entry.get_password().map_err(|_| {
        crate::error::AppError::Auth(format!(
            "请先保存{}",
            provider_auth_label(&normalized_email_provider(&account.provider))
        ))
    })?;
    let secret = resolve_calendar_email_secret(&account, &raw_secret, &credential_entry)?;

    let sync_result = (|| -> AppResult<CalendarEmailSyncResult> {
        let tls = native_tls::TlsConnector::builder()
            .build()
            .map_err(|e| crate::error::AppError::Invalid(format!("TLS 初始化失败：{e}")))?;
        let client = imap::connect((host.as_str(), port), host.as_str(), &tls)
            .map_err(|e| crate::error::AppError::Auth(format!("连接 IMAP 失败：{e}")))?;
        let provider = normalized_email_provider(&account.provider);
        let mut session = if provider == "gmail" || provider == "outlook" {
            let auth = OAuth2ImapAuthenticator {
                user: account.email.clone(),
                access_token: secret.clone(),
            };
            client
                .authenticate("XOAUTH2", &auth)
                .map_err(|e| crate::error::AppError::Auth(format!("OAuth 邮箱授权失败：{}", e.0)))?
        } else {
            client
                .login(account.email.as_str(), secret.as_str())
                .map_err(|e| crate::error::AppError::Auth(format!("邮箱登录失败：{}", e.0)))?
        };
        session
            .select("INBOX")
            .map_err(|e| crate::error::AppError::Invalid(format!("打开 INBOX 失败：{e}")))?;
        let since = (chrono::Local::now() - chrono::Duration::days(45))
            .format("%d-%b-%Y")
            .to_string();
        let ids = session
            .search(format!("SINCE {}", since))
            .map_err(|e| crate::error::AppError::Invalid(format!("搜索邮件失败：{e}")))?;
        let mut sorted_ids: Vec<u32> = ids.into_iter().collect();
        sorted_ids.sort_unstable();
        sorted_ids.reverse();
        sorted_ids.truncate(25);

        let mut scanned_messages = 0;
        let mut all_events = Vec::new();
        for id in sorted_ids {
            let fetches = session
                .fetch(id.to_string(), "RFC822")
                .map_err(|e| crate::error::AppError::Invalid(format!("读取邮件失败：{e}")))?;
            for fetch in fetches.iter() {
                scanned_messages += 1;
                let Some(body) = fetch.body() else {
                    continue;
                };
                let parsed = match mailparse::parse_mail(body) {
                    Ok(parsed) => parsed,
                    Err(_) => continue,
                };
                let mut calendar_parts = Vec::new();
                collect_calendar_parts(&parsed, &mut calendar_parts);
                for ics in calendar_parts {
                    all_events.extend(parse_ics_events(&ics));
                }
            }
        }
        let _ = session.logout();

        let (imported_events, updated_events, cancelled_events) = {
            let c = conn(&state);
            let result = upsert_ics_events(&c, &account, all_events)?;
            mark_email_sync_success(&c, &account.id)?;
            result
        };
        Ok(CalendarEmailSyncResult {
            account_id: account.id,
            scanned_messages,
            imported_events,
            updated_events,
            cancelled_events,
        })
    })();

    if let Err(error) = &sync_result {
        let c = conn(&state);
        let _ = mark_email_sync_error(&c, &account_id, &error.to_string());
    }
    sync_result
}

#[tauri::command]
pub async fn sync_calendar_email_account(
    app: AppHandle,
    account_id: String,
) -> AppResult<CalendarEmailSyncResult> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<DbState>();
        sync_calendar_email_account_blocking(state, account_id)
    })
    .await
    .map_err(|e| AppError::Invalid(format!("calendar email sync task failed: {e}")))?
}

fn sync_calendar_email_accounts_blocking(
    state: State<DbState>,
) -> AppResult<Vec<CalendarEmailSyncResult>> {
    let accounts = list_calendar_email_accounts(state.clone())?;
    let mut results = Vec::new();
    for account in accounts.into_iter().filter(|account| account.enabled) {
        if let Ok(result) = sync_calendar_email_account_blocking(state.clone(), account.id) {
            results.push(result);
        }
    }
    Ok(results)
}

#[tauri::command]
pub async fn sync_calendar_email_accounts(
    app: AppHandle,
) -> AppResult<Vec<CalendarEmailSyncResult>> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<DbState>();
        sync_calendar_email_accounts_blocking(state)
    })
    .await
    .map_err(|e| AppError::Invalid(format!("calendar email sync task failed: {e}")))?
}

fn fetch_nager_holidays(
    country_code: &str,
    year: i32,
    language: &str,
) -> AppResult<Vec<ParsedHolidayEvent>> {
    let url = format!("https://date.nager.at/api/v4/Holidays/{country_code}/{year}");
    let response = reqwest::blocking::get(&url)
        .map_err(|e| AppError::Invalid(format!("failed to download holiday calendar: {e}")))?;
    if !response.status().is_success() {
        return Err(AppError::Invalid(format!(
            "holiday calendar service returned {} for {country_code}",
            response.status()
        )));
    }
    if response.status().as_u16() == 204 {
        return Ok(Vec::new());
    }
    let body = response
        .text()
        .map_err(|e| AppError::Invalid(format!("failed to read holiday calendar: {e}")))?;
    let holidays: Vec<NagerHoliday> = serde_json::from_str(&body)
        .map_err(|e| AppError::Invalid(format!("failed to parse holiday calendar: {e}")))?;
    let mut parsed: Vec<ParsedHolidayEvent> = holidays
        .into_iter()
        .map(|holiday| ParsedHolidayEvent {
            date: holiday.date,
            title: localized_holiday_title(
                country_code,
                &holiday
                    .local_name
                    .filter(|value| !value.trim().is_empty())
                    .or(holiday.name)
                    .unwrap_or_else(|| "Holiday".into()),
                language,
            ),
            holiday_type: "holiday".into(),
        })
        .collect();
    if country_code == "CN" {
        parsed.extend(china_adjusted_holidays(year, language));
        parsed.extend(china_adjusted_workdays(year, language));
    }
    let mut seen = std::collections::HashSet::new();
    parsed.reverse();
    parsed.retain(|event| seen.insert(event.date.clone()));
    parsed.reverse();
    Ok(parsed)
}

fn sync_holiday_country_blocking(
    state: State<DbState>,
    input: SyncHolidayCountryRequest,
) -> AppResult<CalendarSyncStatus> {
    let country_code = input.country_code.trim().to_uppercase();
    if country_code.len() != 2 || !country_code.chars().all(|ch| ch.is_ascii_alphabetic()) {
        return Err(AppError::Invalid("invalid holiday country code".into()));
    }
    let language = match input.language.as_str() {
        "zh-CN" | "zh-TW" | "en" => input.language.as_str(),
        _ => "en",
    };
    let current_year = chrono::Local::now()
        .format("%Y")
        .to_string()
        .parse::<i32>()
        .unwrap_or(2026);
    let source_id = format!("nager:{country_code}");
    let mut holidays = fetch_nager_holidays(&country_code, current_year, language)?;
    holidays.extend(fetch_nager_holidays(
        &country_code,
        current_year + 1,
        language,
    )?);

    let c = conn(&state);
    ensure_default_holiday_config(&c)?;
    let now = crate::db::now();
    let tx = c.unchecked_transaction()?;
    tx.execute(
        "DELETE FROM calendar_events
         WHERE source_type = 'holiday'
           AND (source_account_id = 'builtin-cn' OR source_account_id LIKE 'nager:%')",
        [],
    )?;
    tx.execute(
        "DELETE FROM calendar_holiday_sources WHERE id = 'builtin-cn' OR id LIKE 'nager:%'",
        [],
    )?;
    for holiday in holidays {
        tx.execute(
            "INSERT INTO calendar_events
                (id, title, description, start_time, end_time, all_day, location,
                 source_type, source_account_id, external_uid, sequence, status, readonly,
                 color, holiday_type, raw_ics, created_at, updated_at, synced_at)
             VALUES (?, ?, ?, ?, ?, 1, NULL, 'holiday', ?, ?, 0, 'confirmed', 1,
                     ?, ?, NULL, ?, ?, ?)",
            params![
                format!("holiday-{}-{}", source_id, holiday.date),
                holiday.title,
                if holiday.holiday_type == "workday" {
                    localized_workday_title(language)
                } else {
                    localized_generic_holiday(&country_code, language)
                },
                format!("{}T00:00:00", holiday.date),
                format!("{}T23:59:59", holiday.date),
                source_id,
                format!("{}-{}", source_id, holiday.date),
                if holiday.holiday_type == "workday" {
                    "#16a34a"
                } else {
                    "#ef4444"
                },
                holiday.holiday_type,
                now,
                now,
                now,
            ],
        )?;
    }
    tx.execute(
        "UPDATE holiday_sync_configs
         SET enabled = 1, country_code = ?, source_url = ?, last_sync_at = ?, last_error = NULL, updated_at = ?
         WHERE id = ?",
        params![country_code, source_id, now, now, HOLIDAY_CONFIG_ID],
    )?;
    tx.commit()?;
    drop(c);
    calendar_sync_status(state)
}

#[tauri::command]
pub async fn sync_holiday_country(
    app: AppHandle,
    input: SyncHolidayCountryRequest,
) -> AppResult<CalendarSyncStatus> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<DbState>();
        sync_holiday_country_blocking(state, input)
    })
    .await
    .map_err(|e| AppError::Invalid(format!("holiday sync task failed: {e}")))?
}

#[tauri::command]
pub fn calendar_sync_status(state: State<DbState>) -> AppResult<CalendarSyncStatus> {
    let c = conn(&state);
    ensure_default_holiday_config(&c)?;
    let (
        holiday_enabled,
        holiday_source,
        holiday_country,
        holiday_last_sync_at,
        holiday_last_error,
    ): (i64, String, String, Option<String>, Option<String>) = c.query_row(
        "SELECT enabled, COALESCE(source_url, 'nager:CN'), country_code, last_sync_at, last_error
             FROM holiday_sync_configs WHERE id = ?",
        params![HOLIDAY_CONFIG_ID],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
    )?;
    let holiday_event_count: i32 = c.query_row(
        "SELECT COUNT(*) FROM calendar_events WHERE source_type = 'holiday'",
        [],
        |r| r.get(0),
    )?;
    let email_account_count: i32 =
        c.query_row("SELECT COUNT(*) FROM calendar_sync_accounts", [], |r| {
            r.get(0)
        })?;
    let email_enabled_count: i32 = c.query_row(
        "SELECT COUNT(*) FROM calendar_sync_accounts WHERE enabled = 1",
        [],
        |r| r.get(0),
    )?;
    let email_last_sync_at: Option<String> = c.query_row(
        "SELECT MAX(last_sync_at) FROM calendar_sync_accounts",
        [],
        |r| r.get(0),
    )?;
    let email_last_error: Option<String> = c
        .query_row(
            "SELECT last_error FROM calendar_sync_accounts
         WHERE last_error IS NOT NULL AND last_error != ''
         ORDER BY updated_at DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .ok();
    Ok(CalendarSyncStatus {
        holiday_enabled: holiday_enabled != 0,
        holiday_source,
        holiday_country,
        holiday_last_sync_at,
        holiday_last_error,
        holiday_event_count,
        email_account_count,
        email_enabled_count,
        email_last_sync_at,
        email_last_error,
    })
}

/// Returns task and calendar entries whose date falls within [start, end] inclusive (YYYY-MM-DD).
#[tauri::command]
pub fn calendar_range(
    state: State<DbState>,
    start: String,
    end: String,
) -> AppResult<Vec<CalendarEntry>> {
    let c = conn(&state);
    let mut stmt = c.prepare(
        "SELECT t.id, t.title, t.due_at,
                t.list_id, l.name as list_name, l.board_id, b.name as board_name, b.color,
                t.is_completed, t.color,
                (t.reminder_at IS NOT NULL OR t.reminder_time IS NOT NULL) as has_reminder,
                t.description, t.status, t.start_at, t.due_at
         FROM tasks t
         JOIN lists l ON l.id = t.list_id
         JOIN boards b ON b.id = l.board_id
         WHERE t.due_at IS NOT NULL
         ORDER BY t.due_at ASC",
    )?;
    let rows = stmt.query_map([], |r| {
        let due_at: Option<String> = r.get(2)?;
        let start_at: Option<String> = r.get(13)?;
        let start_value = start_at.clone().or_else(|| due_at.clone());
        let (date, time, start_at_raw) = local_parts(start_value);
        let (_, end_time, due_at_raw) = local_parts(due_at);
        Ok(CalendarEntry {
            id: r.get(0)?,
            title: r.get(1)?,
            date,
            time,
            end_time: if start_at.is_some() { end_time } else { None },
            source_type: "task".into(),
            readonly: false,
            list_id: r.get(3)?,
            list_name: r.get(4)?,
            board_id: r.get(5)?,
            board_name: r.get(6)?,
            board_color: r.get(7)?,
            linked_task_id: r.get(0)?,
            is_completed: r.get::<_, i64>(8)? != 0,
            color: r.get(9)?,
            has_reminder: r.get::<_, i64>(10)? != 0,
            has_subtasks: false,
            subtask_count: 0,
            subtask_done: 0,
            location: None,
            description: r.get(11)?,
            holiday_type: None,
            status: r.get(12)?,
            start_at: start_at_raw,
            due_at: due_at_raw,
        })
    })?;
    let mut out: Vec<CalendarEntry> = Vec::new();
    for r in rows {
        let mut e = r?;
        if !in_range(&e.date, &start, &end) {
            continue;
        }
        let (total, done): (i64, i64) = c.query_row(
            "SELECT COUNT(*), COALESCE(SUM(CASE WHEN is_completed THEN 1 ELSE 0 END), 0)
             FROM tasks WHERE parent_task_id = ?",
            params![e.id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        e.has_subtasks = total > 0;
        e.subtask_count = total as i32;
        e.subtask_done = done as i32;
        out.push(e);
    }
    let mut event_stmt = c.prepare(
        "SELECT id, title, start_time, end_time, all_day,
                source_type, readonly, color, location, description, holiday_type, status
         FROM calendar_events
         WHERE status != 'cancelled'
         ORDER BY start_time ASC",
    )?;
    let event_rows = event_stmt.query_map([], |r| {
        let all_day = r.get::<_, i64>(4)? != 0;
        let (date, time, start_raw) = local_parts(r.get(2)?);
        let (_, end_time, end_raw) = local_parts(r.get(3)?);
        Ok(CalendarEntry {
            id: r.get(0)?,
            title: r.get(1)?,
            date,
            time: if all_day { None } else { time },
            end_time: if all_day { None } else { end_time },
            source_type: r.get(5)?,
            readonly: r.get::<_, i64>(6)? != 0,
            list_id: None,
            list_name: None,
            board_id: None,
            board_name: None,
            board_color: None,
            linked_task_id: None,
            is_completed: false,
            color: r.get(7)?,
            has_reminder: false,
            has_subtasks: false,
            subtask_count: 0,
            subtask_done: 0,
            location: r.get(8)?,
            description: r.get(9)?,
            holiday_type: r.get(10)?,
            status: r.get(11)?,
            start_at: start_raw,
            due_at: end_raw,
        })
    })?;
    for r in event_rows {
        let e = r?;
        if in_range(&e.date, &start, &end) {
            out.push(e);
        }
    }

    let mut goal_stmt = c.prepare(
        "SELECT id, title, description, due_at, color, status
         FROM goals
         WHERE due_at IS NOT NULL
           AND deleted_at IS NULL
           AND COALESCE(status, 'active') != 'draft'
         ORDER BY due_at ASC",
    )?;
    let goal_rows = goal_stmt.query_map([], |r| {
        let due_at: Option<String> = r.get(3)?;
        let (date, time, due_at_raw) = local_parts(due_at);
        Ok(CalendarEntry {
            id: r.get(0)?,
            title: format!("目标截止：{}", r.get::<_, String>(1)?),
            date,
            time,
            end_time: None,
            source_type: "goal".into(),
            readonly: true,
            list_id: None,
            list_name: None,
            board_id: None,
            board_name: None,
            board_color: None,
            linked_task_id: None,
            is_completed: r.get::<_, Option<String>>(5)?.as_deref() == Some("completed"),
            color: r.get(4)?,
            has_reminder: false,
            has_subtasks: false,
            subtask_count: 0,
            subtask_done: 0,
            location: None,
            description: r.get(2)?,
            holiday_type: None,
            status: r.get(5)?,
            start_at: None,
            due_at: due_at_raw,
        })
    })?;
    for r in goal_rows {
        let e = r?;
        if in_range(&e.date, &start, &end) {
            out.push(e);
        }
    }

    let mut kr_stmt = c.prepare(
        "SELECT kr.goal_id, kr.id, kr.title, kr.type, kr.current_value, kr.target_value, kr.unit,
                kr.health_status, kr.check_date, g.title, g.color
         FROM key_results kr
         JOIN goals g ON g.id = kr.goal_id
         WHERE kr.check_date IS NOT NULL
           AND g.deleted_at IS NULL
           AND COALESCE(g.status, 'active') NOT IN ('draft', 'completed', 'archived')
         ORDER BY kr.check_date ASC, kr.position ASC",
    )?;
    let kr_rows = kr_stmt.query_map([], |r| {
        let due_at: Option<String> = r.get(8)?;
        let (date, time, due_at_raw) = local_parts(due_at);
        let current: f64 = r.get(4)?;
        let target: f64 = r.get(5)?;
        let unit: Option<String> = r.get(6)?;
        let goal_id: String = r.get(0)?;
        let kr_id: String = r.get(1)?;
        Ok(CalendarEntry {
            id: format!("kr-check:{}:{}", goal_id, kr_id),
            title: format!("KR检查：{}", r.get::<_, String>(2)?),
            date,
            time,
            end_time: None,
            source_type: "goal".into(),
            readonly: true,
            list_id: None,
            list_name: None,
            board_id: None,
            board_name: None,
            board_color: None,
            linked_task_id: None,
            is_completed: current >= target,
            color: r.get(10)?,
            has_reminder: false,
            has_subtasks: false,
            subtask_count: 0,
            subtask_done: 0,
            location: None,
            description: Some(format!(
                "所属目标：{}\n当前进度：{}{} / {}{}\n状态：{}",
                r.get::<_, String>(9)?,
                current,
                unit.clone().unwrap_or_default(),
                target,
                unit.unwrap_or_default(),
                r.get::<_, Option<String>>(7)?
                    .unwrap_or_else(|| "normal".into()),
            )),
            holiday_type: None,
            status: r.get(7)?,
            start_at: None,
            due_at: due_at_raw,
        })
    })?;
    for r in kr_rows {
        let e = r?;
        if in_range(&e.date, &start, &end) {
            out.push(e);
        }
    }

    let mut pomodoro_stmt = c.prepare(
        "SELECT p.id, p.task_id, p.mode, p.duration_seconds, p.started_at, p.ended_at,
                p.completed, t.title, p.source_event_id, p.source_title,
                t.list_id, l.name, l.board_id, b.name, b.color
         FROM pomodoro_sessions p
         LEFT JOIN tasks t ON t.id = p.task_id
         LEFT JOIN lists l ON l.id = t.list_id
         LEFT JOIN boards b ON b.id = l.board_id
         ORDER BY p.started_at ASC",
    )?;
    let pomodoro_rows = pomodoro_stmt.query_map([], |r| {
        let started_at: Option<String> = r.get(4)?;
        let ended_at: Option<String> = r.get(5)?;
        let duration_seconds: i32 = r.get(3)?;
        let display_end_at =
            pomodoro_record_end_at(started_at.as_deref(), ended_at, duration_seconds);
        let (date, time, start_raw) = local_parts(started_at);
        let (_, end_time, end_raw) = local_parts(display_end_at);
        let task_title: Option<String> = r.get(7)?;
        let duration_minutes = (duration_seconds + 59) / 60;
        let source_title: Option<String> = r.get(9)?;
        let title = match (source_title.as_deref(), task_title) {
            (Some(source), _) if !source.trim().is_empty() => {
                format!("会议专注：{} · {}分钟", source, duration_minutes)
            }
            (_, Some(task)) if !task.trim().is_empty() => {
                format!("专注：{} · {}分钟", task, duration_minutes)
            }
            _ => format!("专注记录 · {}分钟", duration_minutes),
        };
        let source_line = source_title
            .filter(|source| !source.trim().is_empty())
            .map(|source| format!("\n关联日历：{}", source))
            .unwrap_or_default();
        let source_id_line = r
            .get::<_, Option<String>>(8)?
            .map(|id| format!("\n来源事件：{}", id))
            .unwrap_or_default();
        let task_line = r
            .get::<_, Option<String>>(1)?
            .map(|id| format!("\n关联任务：{}", id))
            .unwrap_or_default();
        let mode = r.get::<_, String>(2)?;
        let mode_label = match mode.as_str() {
            "countdown" => "倒计时",
            "countup" => "正计时",
            other => other,
        };
        Ok(CalendarEntry {
            id: r.get(0)?,
            title,
            date,
            time,
            end_time,
            source_type: "pomodoro_record".into(),
            readonly: true,
            list_id: r.get(10)?,
            list_name: r.get(11)?,
            board_id: r.get(12)?,
            board_name: r.get(13)?,
            board_color: r.get(14)?,
            linked_task_id: r.get(1)?,
            is_completed: r.get::<_, i64>(6)? != 0,
            color: Some("#fb923c".into()),
            has_reminder: false,
            has_subtasks: false,
            subtask_count: 0,
            subtask_done: 0,
            location: None,
            description: Some(format!(
                "模式：{}\n时长：{}分钟{}{}{}",
                mode_label, duration_minutes, source_line, source_id_line, task_line
            )),
            holiday_type: None,
            status: Some(
                if r.get::<_, i64>(6)? != 0 {
                    "completed"
                } else {
                    "running"
                }
                .into(),
            ),
            start_at: start_raw,
            due_at: end_raw,
        })
    })?;
    for r in pomodoro_rows {
        let e = r?;
        if in_range(&e.date, &start, &end) {
            out.push(e);
        }
    }

    let mut review_stmt = c.prepare(
        "SELECT id, period_type, period_start, period_end, highlights, blockers,
                lessons, next_actions, score, updated_at
         FROM review_reports
         ORDER BY period_end ASC, updated_at ASC",
    )?;
    let review_rows = review_stmt.query_map([], |r| {
        let period_end: String = r.get(3)?;
        let updated_at: Option<String> = r.get(9)?;
        let description = format!(
            "周期：{} 至 {}\n评分：{}\n\n亮点：{}\n\n阻碍：{}\n\n经验：{}\n\n下一步：{}",
            r.get::<_, String>(2)?,
            period_end,
            r.get::<_, Option<i32>>(8)?
                .map(|v| v.to_string())
                .unwrap_or_else(|| "未评分".into()),
            r.get::<_, String>(4)?,
            r.get::<_, String>(5)?,
            r.get::<_, String>(6)?,
            r.get::<_, String>(7)?,
        );
        Ok(CalendarEntry {
            id: r.get(0)?,
            title: format!("{}复盘", review_period_label(&r.get::<_, String>(1)?)),
            date: period_end,
            time: None,
            end_time: None,
            source_type: "review".into(),
            readonly: true,
            list_id: None,
            list_name: None,
            board_id: None,
            board_name: None,
            board_color: None,
            linked_task_id: None,
            is_completed: true,
            color: Some("#64748b".into()),
            has_reminder: false,
            has_subtasks: false,
            subtask_count: 0,
            subtask_done: 0,
            location: None,
            description: Some(description),
            holiday_type: None,
            status: Some("completed".into()),
            start_at: updated_at,
            due_at: None,
        })
    })?;
    for r in review_rows {
        let e = r?;
        if in_range(&e.date, &start, &end) {
            out.push(e);
        }
    }

    out.sort_by(|a, b| {
        let at = format!("{} {}", a.date, a.time.clone().unwrap_or_default());
        let bt = format!("{} {}", b.date, b.time.clone().unwrap_or_default());
        at.cmp(&bt)
    });
    Ok(out)
}

fn review_period_label(period_type: &str) -> &'static str {
    match period_type {
        "day" => "日",
        "week" => "周",
        "month" => "月",
        "quarter" => "季度",
        "year" => "年",
        _ => "周期",
    }
}

#[tauri::command]
pub fn update_calendar_entry_time(
    state: State<DbState>,
    entry_id: String,
    source_type: String,
    start_at: String,
    end_at: Option<String>,
) -> AppResult<()> {
    let c = conn(&state);
    match source_type.as_str() {
        "task" => {
            c.execute(
                "UPDATE tasks SET start_at = ?, due_at = ?, updated_at = ? WHERE id = ?",
                params![
                    start_at.clone(),
                    end_at.unwrap_or(start_at),
                    crate::db::now(),
                    entry_id
                ],
            )?;
        }
        "manual" | "meeting" | "email" | "holiday" => {
            let readonly: Option<i64> = c
                .query_row(
                    "SELECT readonly FROM calendar_events WHERE id = ?",
                    params![entry_id],
                    |r| r.get(0),
                )
                .optional()?;
            if readonly.unwrap_or(1) != 0 {
                return Err(AppError::Invalid("只读日历事件不能调整时间".into()));
            }
            c.execute(
                "UPDATE calendar_events SET start_time = ?, end_time = ?, all_day = 0, updated_at = ? WHERE id = ?",
                params![start_at, end_at, crate::db::now(), entry_id],
            )?;
        }
        _ => return Err(AppError::Invalid("该类型日历事件不能调整时间".into())),
    }
    Ok(())
}

#[tauri::command]
pub fn export_calendar_range(
    state: State<DbState>,
    start: String,
    end: String,
) -> AppResult<String> {
    let entries = calendar_range(state, start, end)?;
    Ok(serde_json::to_string_pretty(&entries)?)
}

#[tauri::command]
pub fn export_calendar_range_ics(
    state: State<DbState>,
    start: String,
    end: String,
) -> AppResult<String> {
    let entries = calendar_range(state, start, end)?;
    let mut out =
        String::from("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Ascend Todo//Calendar//CN\r\n");
    for entry in entries {
        let start_at = entry
            .start_at
            .clone()
            .or(entry.due_at.clone())
            .unwrap_or_else(|| format!("{}T00:00:00+08:00", entry.date));
        let dt = chrono::DateTime::parse_from_rfc3339(&start_at)
            .map(|v| {
                v.with_timezone(&chrono::Utc)
                    .format("%Y%m%dT%H%M%SZ")
                    .to_string()
            })
            .unwrap_or_else(|_| entry.date.replace('-', ""));
        out.push_str("BEGIN:VEVENT\r\n");
        out.push_str(&format!("UID:{}@ascend-todo\r\n", escape_ics(&entry.id)));
        out.push_str(&format!("SUMMARY:{}\r\n", escape_ics(&entry.title)));
        out.push_str(&format!("DTSTART:{}\r\n", dt));
        if let Some(end_at) = entry
            .due_at
            .as_deref()
            .filter(|_| entry.source_type != "task")
        {
            if let Ok(end_dt) = chrono::DateTime::parse_from_rfc3339(end_at) {
                out.push_str(&format!(
                    "DTEND:{}\r\n",
                    end_dt.with_timezone(&chrono::Utc).format("%Y%m%dT%H%M%SZ")
                ));
            }
        }
        if let Some(location) = entry.location {
            out.push_str(&format!("LOCATION:{}\r\n", escape_ics(&location)));
        }
        if let Some(description) = entry.description {
            out.push_str(&format!("DESCRIPTION:{}\r\n", escape_ics(&description)));
        }
        out.push_str("END:VEVENT\r\n");
    }
    out.push_str("END:VCALENDAR\r\n");
    Ok(out)
}

fn escape_ics(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('\n', "\\n")
        .replace(',', "\\,")
        .replace(';', "\\;")
}

#[tauri::command]
pub fn create_pomodoro_from_calendar_entry(
    state: State<DbState>,
    entry_id: String,
) -> AppResult<()> {
    let c = conn(&state);
    let event: Option<(String, Option<String>, String)> = c
        .query_row(
            "SELECT start_time, end_time, title FROM calendar_events WHERE id = ?",
            params![entry_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?;
    let Some((start_time, end_time, title)) = event else {
        return Err(AppError::Invalid("未找到日历事件".into()));
    };
    let parsed_start = chrono::DateTime::parse_from_rfc3339(&start_time).ok();
    let parsed_end = end_time
        .as_deref()
        .and_then(|v| chrono::DateTime::parse_from_rfc3339(v).ok());
    let duration = match (parsed_start.as_ref(), parsed_end.as_ref()) {
        (Some(start), Some(end)) => (*end - *start).num_seconds().max(60) as i32,
        _ => 25 * 60,
    };
    let final_end_time = end_time.or_else(|| {
        parsed_start.map(|start| (start + chrono::Duration::seconds(duration as i64)).to_rfc3339())
    });
    c.execute(
        "INSERT INTO pomodoro_sessions
            (id, task_id, mode, duration_seconds, started_at, ended_at, completed, source_event_id, source_title)
         VALUES (?, NULL, 'countdown', ?, ?, ?, 1, ?, ?)",
        params![
            crate::db::new_id(),
            duration,
            start_time,
            final_end_time,
            entry_id,
            title,
        ],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_feishu_meeting_mojibake() {
        let raw = "\u{00e8}\u{00a7}\u{2020}\u{00e9}\u{00a2}\u{2018}\u{00e4}\u{00bc}\u{0161}\u{00e8}\u{00ae}\u{00ae}:\u{00c2} https://vc.feishu.cn/j/539862884\\n\
\u{00e4}\u{00bc}\u{0161}\u{00e8}\u{00ae}\u{00ae} ID:\u{00c2} 539862884\\n\
\u{00e6}\u{00b5}\u{2039}\u{00e8}\u{00af}\u{2022}\u{00e5}\u{0090}\u{0152}\u{00e6}\u{00ad}\u{00a5}\u{00e5}\u{0160}\u{0160}\u{00e8}\u{0192}\u{00bd}";

        let normalized = normalize_ics_text(raw);

        assert!(normalized.contains("视频会议: https://vc.feishu.cn/j/539862884"));
        assert!(normalized.contains("会议 ID: 539862884"));
        assert!(normalized.contains("测试同步功能"));
        assert!(!normalized.contains('Â'));
    }

    #[test]
    fn keeps_normal_ics_text_unchanged() {
        let raw = "视频会议: https://vc.feishu.cn/j/539862884\\n会议 ID: 539862884";

        let normalized = normalize_ics_text(raw);

        assert_eq!(
            normalized,
            "视频会议: https://vc.feishu.cn/j/539862884\n会议 ID: 539862884"
        );
    }
}
