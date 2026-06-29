use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

use crate::db::DbState;
use crate::error::{AppError, AppResult};
use crate::models::{
    CalendarEmailAccount, CalendarEmailCredentialStatus, CalendarEmailSyncResult, CalendarEntry,
    CalendarHolidaySource, CalendarSyncStatus, CreateCalendarEmailAccountRequest,
    ImportCalendarIcsSourceRequest, ImportHolidayJsonSourceRequest, SaveCalendarEmailCredentialRequest,
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
    let time = raw.get(11..16).map(|s| s.to_string()).filter(|s| !s.is_empty());
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

struct BuiltInHoliday {
    date: &'static str,
    title: &'static str,
    holiday_type: &'static str,
}

const BUILTIN_CN_2026_HOLIDAYS: &[BuiltInHoliday] = &[
    BuiltInHoliday { date: "2026-01-01", title: "元旦", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-01-02", title: "元旦", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-01-03", title: "元旦", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-01-04", title: "元旦调休上班", holiday_type: "workday" },
    BuiltInHoliday { date: "2026-02-14", title: "春节调休上班", holiday_type: "workday" },
    BuiltInHoliday { date: "2026-02-15", title: "春节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-02-16", title: "春节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-02-17", title: "春节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-02-18", title: "春节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-02-19", title: "春节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-02-20", title: "春节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-02-21", title: "春节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-02-22", title: "春节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-02-23", title: "春节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-02-28", title: "春节调休上班", holiday_type: "workday" },
    BuiltInHoliday { date: "2026-04-05", title: "清明节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-04-06", title: "清明节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-04-07", title: "清明节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-05-01", title: "劳动节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-05-02", title: "劳动节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-05-03", title: "劳动节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-05-04", title: "劳动节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-05-05", title: "劳动节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-05-09", title: "劳动节调休上班", holiday_type: "workday" },
    BuiltInHoliday { date: "2026-06-19", title: "端午节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-06-20", title: "端午节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-06-21", title: "端午节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-09-25", title: "中秋节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-09-26", title: "中秋节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-09-27", title: "中秋节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-09-20", title: "国庆节调休上班", holiday_type: "workday" },
    BuiltInHoliday { date: "2026-10-01", title: "国庆节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-10-02", title: "国庆节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-10-03", title: "国庆节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-10-04", title: "国庆节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-10-05", title: "国庆节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-10-06", title: "国庆节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-10-07", title: "国庆节", holiday_type: "holiday" },
    BuiltInHoliday { date: "2026-10-10", title: "国庆节调休上班", holiday_type: "workday" },
];

fn ensure_default_holiday_config(c: &Connection) -> AppResult<()> {
    let count: i64 = c.query_row(
        "SELECT COUNT(*) FROM holiday_sync_configs WHERE id = 'default-cn'",
        [],
        |r| r.get(0),
    )?;
    if count == 0 {
        c.execute(
            "INSERT INTO holiday_sync_configs
                (id, country_code, region, enabled, show_workdays, source_url, last_sync_at, last_error, updated_at)
             VALUES ('default-cn', 'CN', NULL, 1, 1, 'builtin-cn', NULL, NULL, ?)",
            params![crate::db::now()],
        )?;
    }
    Ok(())
}

#[tauri::command]
pub fn calendar_holiday_sources(state: State<DbState>) -> AppResult<Vec<CalendarHolidaySource>> {
    let c = conn(&state);
    let mut sources = vec![
        CalendarHolidaySource {
            id: "builtin-cn".into(),
            name: "内置中国节假日".into(),
            description: "随软件版本打包更新，离线可用，作为默认兜底源。".into(),
            built_in: true,
            url: None,
        },
        CalendarHolidaySource {
            id: "custom-ics".into(),
            name: "用户导入 ICS 源".into(),
            description: "后续支持导入用户认可的国家日历 ICS 数据源。".into(),
            built_in: false,
            url: None,
        },
        CalendarHolidaySource {
            id: "custom-json".into(),
            name: "用户导入 JSON 源".into(),
            description: "后续支持导入结构化节假日 JSON 数据源。".into(),
            built_in: false,
            url: None,
        },
    ];
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
        if date.len() != 10 || !date.chars().enumerate().all(|(i, c)| {
            if i == 4 || i == 7 { c == '-' } else { c.is_ascii_digit() }
        }) {
            return Err(crate::error::AppError::Invalid(format!("日期格式错误：{date}")));
        }
        let normalized_type = if holiday_type == "workday" || holiday_type == "ban" || holiday_type == "班" {
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
                if h.holiday_type == "workday" { "#16a34a" } else { "#ef4444" },
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
         WHERE id = 'default-cn'",
        params![source_id, now, now],
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
        return Err(crate::error::AppError::Invalid("导入源中没有节假日数据".into()));
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
                if event.all_day { Some("holiday".to_string()) } else { None },
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
         WHERE id = 'default-cn'",
        params![source_name, timestamp, timestamp],
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
    if id == "builtin-cn" {
        return Err(AppError::Invalid("内置国家日历源不能删除".into()));
    }
    let c = conn(&state);
    c.execute(
        "DELETE FROM calendar_events WHERE source_type = 'holiday' AND source_account_id = ?",
        params![id],
    )?;
    c.execute("DELETE FROM calendar_holiday_sources WHERE id = ?", params![id])?;
    drop(c);
    calendar_sync_status(state)
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
    line.split_once(':').map(|(_, v)| v.trim().to_string()).unwrap_or_default()
}

fn fix_mojibake_text(value: &str) -> String {
    let has_suspicious_marker = value
        .chars()
        .any(|ch| matches!(ch, 'Ã' | 'Â' | 'Ä' | 'Å' | 'Æ' | 'Ç' | 'È' | 'É' | 'ä' | 'å' | 'æ' | 'ç' | 'è' | 'é')
            || cp1252_mojibake_byte(ch).is_some()
            || ('\u{0080}'..='\u{009f}').contains(&ch));
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
                    title: if title.is_empty() { "未命名会议".into() } else { title.clone() },
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
pub fn create_calendar_email_account(
    state: State<DbState>,
    input: CreateCalendarEmailAccountRequest,
) -> AppResult<CalendarEmailAccount> {
    let email = input.email.trim().to_lowercase();
    if email.is_empty() || !email.contains('@') {
        return Err(crate::error::AppError::Invalid("请输入有效邮箱地址".into()));
    }
    let provider = if input.provider.trim().is_empty() {
        "imap".to_string()
    } else {
        input.provider.trim().to_lowercase()
    };
    let interval = input.sync_interval_minutes.unwrap_or(10).clamp(3, 120);
    let now = crate::db::now();
    let id = crate::db::new_id();
    let c = conn(&state);
    c.execute(
        "INSERT INTO calendar_sync_accounts
            (id, provider, email, imap_host, imap_port, enabled, sync_interval_minutes,
             last_sync_at, last_error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, NULL, NULL, ?, ?)",
        params![
            id,
            provider,
            email,
            input.imap_host.map(|v| v.trim().to_string()).filter(|v| !v.is_empty()),
            input.imap_port,
            interval,
            now,
            now,
        ],
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
    tx.execute("DELETE FROM calendar_sync_accounts WHERE id = ?", params![id])?;
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

#[tauri::command]
pub fn sync_calendar_email_account(
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
    let secret = email_credential_entry(&account.id)
        .map_err(|e| crate::error::AppError::Auth(format!("无法访问系统凭据管理：{e}")))?
        .get_password()
        .map_err(|_| crate::error::AppError::Auth("请先保存邮箱授权码或密码".into()))?;

    let sync_result = (|| -> AppResult<CalendarEmailSyncResult> {
        let tls = native_tls::TlsConnector::builder()
            .build()
            .map_err(|e| crate::error::AppError::Invalid(format!("TLS 初始化失败：{e}")))?;
        let client = imap::connect((host.as_str(), port), host.as_str(), &tls)
            .map_err(|e| crate::error::AppError::Auth(format!("连接 IMAP 失败：{e}")))?;
        let mut session = client
            .login(account.email.as_str(), secret.as_str())
            .map_err(|e| crate::error::AppError::Auth(format!("邮箱登录失败：{}", e.0)))?;
        session
            .select("INBOX")
            .map_err(|e| crate::error::AppError::Invalid(format!("打开 INBOX 失败：{e}")))?;
        let ids = session
            .search("ALL")
            .map_err(|e| crate::error::AppError::Invalid(format!("搜索邮件失败：{e}")))?;
        let mut sorted_ids: Vec<u32> = ids.into_iter().collect();
        sorted_ids.sort_unstable();
        sorted_ids.reverse();
        sorted_ids.truncate(50);

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
pub fn sync_calendar_email_accounts(state: State<DbState>) -> AppResult<Vec<CalendarEmailSyncResult>> {
    let accounts = list_calendar_email_accounts(state.clone())?;
    let mut results = Vec::new();
    for account in accounts.into_iter().filter(|account| account.enabled) {
        if let Ok(result) = sync_calendar_email_account(state.clone(), account.id) {
            results.push(result);
        }
    }
    Ok(results)
}

#[tauri::command]
pub fn calendar_sync_status(state: State<DbState>) -> AppResult<CalendarSyncStatus> {
    let c = conn(&state);
    ensure_default_holiday_config(&c)?;
    let (holiday_enabled, holiday_source, holiday_country, holiday_last_sync_at, holiday_last_error): (i64, String, String, Option<String>, Option<String>) =
        c.query_row(
            "SELECT enabled, COALESCE(source_url, 'builtin-cn'), country_code, last_sync_at, last_error
             FROM holiday_sync_configs WHERE id = 'default-cn'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        )?;
    let holiday_event_count: i32 = c.query_row(
        "SELECT COUNT(*) FROM calendar_events WHERE source_type = 'holiday'",
        [],
        |r| r.get(0),
    )?;
    let email_account_count: i32 = c.query_row(
        "SELECT COUNT(*) FROM calendar_sync_accounts",
        [],
        |r| r.get(0),
    )?;
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
    let email_last_error: Option<String> = c.query_row(
        "SELECT last_error FROM calendar_sync_accounts
         WHERE last_error IS NOT NULL AND last_error != ''
         ORDER BY updated_at DESC LIMIT 1",
        [],
        |r| r.get(0),
    ).ok();
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

#[tauri::command]
pub fn sync_builtin_holidays(state: State<DbState>) -> AppResult<CalendarSyncStatus> {
    let c = conn(&state);
    ensure_default_holiday_config(&c)?;
    let now = crate::db::now();
    let tx = c.unchecked_transaction()?;
    tx.execute(
        "DELETE FROM calendar_events WHERE source_type = 'holiday' AND source_account_id = 'builtin-cn'",
        [],
    )?;
    for h in BUILTIN_CN_2026_HOLIDAYS {
        let id = format!("holiday-cn-{}", h.date);
        tx.execute(
            "INSERT INTO calendar_events
                (id, title, description, start_time, end_time, all_day, location,
                 source_type, source_account_id, external_uid, sequence, status, readonly,
                 color, holiday_type, raw_ics, created_at, updated_at, synced_at)
             VALUES (?, ?, ?, ?, ?, 1, NULL, 'holiday', 'builtin-cn', ?, 0, 'confirmed', 1,
                     ?, ?, NULL, ?, ?, ?)",
            params![
                id,
                h.title,
                if h.holiday_type == "workday" { "补班工作日" } else { "法定节假日" },
                format!("{}T00:00:00+08:00", h.date),
                format!("{}T23:59:59+08:00", h.date),
                format!("builtin-cn-{}", h.date),
                if h.holiday_type == "workday" { "#16a34a" } else { "#ef4444" },
                h.holiday_type,
                now,
                now,
                now,
            ],
        )?;
    }
    tx.execute(
        "UPDATE holiday_sync_configs
         SET enabled = 1, source_url = 'builtin-cn', last_sync_at = ?, last_error = NULL, updated_at = ?
         WHERE id = 'default-cn'",
        params![now, now],
    )?;
    tx.commit()?;
    drop(c);
    calendar_sync_status(state)
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
        let (date, time, due_at_raw) = local_parts(due_at);
        Ok(CalendarEntry {
            id: r.get(0)?,
            title: r.get(1)?,
            date,
            time,
            end_time: None,
            source_type: "task".into(),
            readonly: false,
            list_id: r.get(3)?,
            list_name: r.get(4)?,
            board_id: r.get(5)?,
            board_name: r.get(6)?,
            board_color: r.get(7)?,
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
            start_at: r.get(13)?,
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
        "SELECT kr.goal_id, kr.title, kr.type, kr.current_value, kr.target_value, kr.unit,
                kr.health_status, g.due_at, g.title, g.color
         FROM key_results kr
         JOIN goals g ON g.id = kr.goal_id
         WHERE g.due_at IS NOT NULL
           AND g.deleted_at IS NULL
           AND COALESCE(g.status, 'active') NOT IN ('draft', 'completed', 'archived')
         ORDER BY g.due_at ASC, kr.position ASC",
    )?;
    let kr_rows = kr_stmt.query_map([], |r| {
        let due_at: Option<String> = r.get(7)?;
        let (date, time, due_at_raw) = local_parts(due_at);
        let current: f64 = r.get(3)?;
        let target: f64 = r.get(4)?;
        let unit: Option<String> = r.get(5)?;
        Ok(CalendarEntry {
            id: r.get(0)?,
            title: format!("KR检查：{}", r.get::<_, String>(1)?),
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
            is_completed: current >= target,
            color: r.get(9)?,
            has_reminder: false,
            has_subtasks: false,
            subtask_count: 0,
            subtask_done: 0,
            location: None,
            description: Some(format!(
                "所属目标：{}\n当前进度：{}{} / {}{}\n状态：{}",
                r.get::<_, String>(8)?,
                current,
                unit.clone().unwrap_or_default(),
                target,
                unit.unwrap_or_default(),
                r.get::<_, Option<String>>(6)?.unwrap_or_else(|| "normal".into()),
            )),
            holiday_type: None,
            status: r.get(6)?,
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
                p.completed, t.title
         FROM pomodoro_sessions p
         LEFT JOIN tasks t ON t.id = p.task_id
         ORDER BY p.started_at ASC",
    )?;
    let pomodoro_rows = pomodoro_stmt.query_map([], |r| {
        let started_at: Option<String> = r.get(4)?;
        let ended_at: Option<String> = r.get(5)?;
        let (date, time, start_raw) = local_parts(started_at);
        let (_, end_time, end_raw) = local_parts(ended_at);
        let duration_seconds: i32 = r.get(3)?;
        let task_title: Option<String> = r.get(7)?;
        let duration_minutes = (duration_seconds + 59) / 60;
        let title = match task_title {
            Some(task) if !task.trim().is_empty() => format!("专注：{} · {}分钟", task, duration_minutes),
            _ => format!("专注记录 · {}分钟", duration_minutes),
        };
        Ok(CalendarEntry {
            id: r.get(0)?,
            title,
            date,
            time,
            end_time,
            source_type: "pomodoro_record".into(),
            readonly: true,
            list_id: None,
            list_name: None,
            board_id: None,
            board_name: None,
            board_color: None,
            is_completed: r.get::<_, i64>(6)? != 0,
            color: Some("#fb923c".into()),
            has_reminder: false,
            has_subtasks: false,
            subtask_count: 0,
            subtask_done: 0,
            location: None,
            description: Some(format!(
                "模式：{}\n时长：{}分钟{}",
                r.get::<_, String>(2)?,
                duration_minutes,
                r.get::<_, Option<String>>(1)?.map(|id| format!("\n关联任务：{}", id)).unwrap_or_default()
            )),
            holiday_type: None,
            status: Some(if r.get::<_, i64>(6)? != 0 { "completed" } else { "running" }.into()),
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
            r.get::<_, Option<i32>>(8)?.map(|v| v.to_string()).unwrap_or_else(|| "未评分".into()),
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
                "UPDATE tasks SET due_at = ?, updated_at = ? WHERE id = ?",
                params![start_at, crate::db::now(), entry_id],
            )?;
        }
        "manual" | "meeting" | "email" | "holiday" => {
            let readonly: Option<i64> = c.query_row(
                "SELECT readonly FROM calendar_events WHERE id = ?",
                params![entry_id],
                |r| r.get(0),
            ).optional()?;
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
    let mut out = String::from("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Ascend Todo//Calendar//CN\r\n");
    for entry in entries {
        let start_at = entry.start_at.clone().or(entry.due_at.clone()).unwrap_or_else(|| format!("{}T00:00:00+08:00", entry.date));
        let dt = chrono::DateTime::parse_from_rfc3339(&start_at)
            .map(|v| v.with_timezone(&chrono::Utc).format("%Y%m%dT%H%M%SZ").to_string())
            .unwrap_or_else(|_| entry.date.replace('-', ""));
        out.push_str("BEGIN:VEVENT\r\n");
        out.push_str(&format!("UID:{}@ascend-todo\r\n", escape_ics(&entry.id)));
        out.push_str(&format!("SUMMARY:{}\r\n", escape_ics(&entry.title)));
        out.push_str(&format!("DTSTART:{}\r\n", dt));
        if let Some(end_at) = entry.due_at.as_deref().filter(|_| entry.source_type != "task") {
            if let Ok(end_dt) = chrono::DateTime::parse_from_rfc3339(end_at) {
                out.push_str(&format!("DTEND:{}\r\n", end_dt.with_timezone(&chrono::Utc).format("%Y%m%dT%H%M%SZ")));
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
    let event: Option<(String, Option<String>, String)> = c.query_row(
        "SELECT start_time, end_time, title FROM calendar_events WHERE id = ?",
        params![entry_id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    ).optional()?;
    let Some((start_time, end_time, title)) = event else {
        return Err(AppError::Invalid("未找到日历事件".into()));
    };
    let duration = match (
        chrono::DateTime::parse_from_rfc3339(&start_time),
        end_time.as_deref().and_then(|v| chrono::DateTime::parse_from_rfc3339(v).ok()),
    ) {
        (Ok(start), Some(end)) => (end - start).num_seconds().max(60) as i32,
        _ => 25 * 60,
    };
    c.execute(
        "INSERT INTO pomodoro_sessions (id, task_id, mode, duration_seconds, started_at, ended_at, completed)
         VALUES (?, NULL, ?, ?, ?, ?, 1)",
        params![
            crate::db::new_id(),
            format!("calendar:{}", title),
            duration,
            start_time,
            end_time,
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
