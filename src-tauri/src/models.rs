use serde::{Deserialize, Serialize};

// All structs use camelCase JSON to align with TypeScript frontend.
macro_rules! camel {
    ($($t:tt)*) => {
        #[derive(Debug, Clone, Serialize, Deserialize)]
        #[serde(rename_all = "camelCase")]
        $($t)*
    };
}

// ============ Boards / Lists / Tasks / Subtasks ============

camel! {
pub struct Board {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub is_pinned: bool,
    pub position: i32,
    pub created_at: String,
    pub updated_at: String,
}}

camel! {
pub struct List {
    pub id: String,
    pub board_id: String,
    pub name: String,
    pub position: i32,
    pub created_at: String,
}}

camel! {
pub struct Task {
    pub id: String,
    pub list_id: String,
    pub title: String,
    pub description: Option<String>,
    pub position: i32,
    pub due_at: Option<String>,
    pub reminder_at: Option<String>,
    pub reminder_time: Option<String>,
    pub is_completed: bool,
    pub completed_at: Option<String>,
    pub parent_task_id: Option<String>,
    pub color: Option<String>,
    pub status: String,
    pub priority: Option<String>,
    pub start_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardWithLists {
    pub board: Board,
    pub lists: Vec<ListWithTasks>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListWithTasks {
    pub list: List,
    pub tasks: Vec<TaskWithSubtasks>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskWithSubtasks {
    #[serde(flatten)]
    pub task: Task,
    pub subtasks: Vec<TaskWithSubtasks>,
}

camel! {
pub struct TaskActivityLog {
    pub id: String,
    pub task_id: String,
    pub kind: String,
    pub title: String,
    pub detail: Option<String>,
    pub source_id: Option<String>,
    pub duration_seconds: Option<i32>,
    pub created_at: String,
}}

// ============ Goals / Milestones / KeyResults ============

camel! {
pub struct Goal {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub due_at: Option<String>,
    pub parent_goal_id: Option<String>,
    pub position: i32,
    pub created_at: String,
    pub updated_at: String,
    pub progress_mode: String,
    pub progress_value: f64,
    pub progress_total: f64,
    pub category: Option<String>,
    pub start_date: Option<String>,
    pub weight: i32,
    pub status: String,
    pub review_score: Option<i32>,
    pub review_note: Option<String>,
    pub period: String,
    #[serde(default)]
    pub deleted_at: Option<String>,
}}

camel! {
pub struct Milestone {
    pub id: String,
    pub goal_id: String,
    pub title: String,
    pub is_completed: bool,
    pub completed_at: Option<String>,
    pub position: i32,
    pub created_at: String,
}}

camel! {
pub struct KeyResult {
    pub id: String,
    pub goal_id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub kr_type: String,
    pub start_value: f64,
    pub target_value: f64,
    pub current_value: f64,
    pub unit: Option<String>,
    pub weight: i32,
    pub health_status: String,
    pub check_date: Option<String>,
    pub is_completed: bool,
    pub position: i32,
    pub created_at: String,
}}

camel! {
pub struct ProgressLog {
    pub id: String,
    pub kr_id: String,
    pub old_value: f64,
    pub new_value: f64,
    pub comment: Option<String>,
    pub created_at: String,
}}

camel! {
pub struct GoalTask {
    pub id: String,
    pub goal_id: Option<String>,
    pub kr_id: Option<String>,
    pub task_id: String,
    pub created_at: String,
}}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalWithDetails {
    #[serde(flatten)]
    pub goal: Goal,
    pub milestones: Vec<Milestone>,
    pub key_results: Vec<KeyResult>,
    pub sub_goals: Vec<GoalWithDetails>,
    pub progress: f64,
    pub linked_tasks: Vec<LinkedTask>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyResultWithLogs {
    #[serde(flatten)]
    pub kr: KeyResult,
    pub progress: f64,
    pub logs: Vec<ProgressLog>,
    pub milestones: Vec<Milestone>,
}

camel! {
pub struct LinkedTask {
    pub kr_id: Option<String>,
    pub id: String,
    pub title: String,
    pub is_completed: bool,
    pub board_name: String,
    pub list_name: String,
    pub due_at: Option<String>,
    pub status: String,
    pub priority: Option<String>,
    pub start_at: Option<String>,
}}

// ============ Pomodoro ============

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PomodoroMode {
    Countdown,
    Countup,
}

camel! {
pub struct PomodoroSession {
    pub id: String,
    pub task_id: Option<String>,
    pub mode: String,
    pub duration_seconds: i32,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub completed: bool,
    pub source_event_id: Option<String>,
    pub source_title: Option<String>,
}}

camel! {
pub struct DailyPomodoroCount {
    pub date: String,
    pub count: i32,
    pub seconds: i32,
}}

camel! {
pub struct PomodoroStats {
    pub total_sessions: i32,
    pub total_seconds: i32,
    pub completed_sessions: i32,
    pub by_day: Vec<DailyPomodoroCount>,
}}

// ============ Check-ins ============

camel! {
pub struct CheckIn {
    pub id: String,
    pub date: String,
    pub count: i32,
}}

camel! {
pub struct CheckInSummary {
    pub total: i32,
    pub today_count: i32,
    pub streak: i32,
    pub by_day: Vec<CheckIn>,
}}

// ============ Period reviews ============

camel! {
pub struct ReviewReport {
    pub id: String,
    pub period_type: String,
    pub period_start: String,
    pub period_end: String,
    pub highlights: String,
    pub blockers: String,
    pub lessons: String,
    pub next_actions: String,
    pub score: Option<i32>,
    pub created_at: String,
    pub updated_at: String,
}}

// ============ User Profile ============

camel! {
pub struct UserProfile {
    pub id: String,
    pub nickname: Option<String>,
    pub avatar: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub signature: Option<String>,
    pub updated_at: String,
}}

// ============ Settings ============

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: String,
    pub display_size: String,
    pub language: String,
    pub week_start: String,
    pub pomodoro_duration: i32,
    pub pomodoro_long_break: i32,
    pub auto_update: bool,
    pub sync_enabled: bool,
    pub sync_server_url: Option<String>,
    pub reminder_sound: String,
    pub notification_enabled: bool,
    pub motivational_quotes: bool,
    pub auto_start: bool,
    pub minimize_to_tray: bool,
    pub calendar_default_timed_reminder_minutes: i32,
    pub calendar_default_all_day_reminder: String,
    pub calendar_default_duration_minutes: i32,
    pub calendar_default_event_color: String,
    pub calendar_event_density: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "aurora-day".into(),
            display_size: "standard".into(),
            language: "en".into(),
            week_start: "mon".into(),
            pomodoro_duration: 25 * 60,
            pomodoro_long_break: 5 * 60,
            auto_update: true,
            sync_enabled: false,
            sync_server_url: None,
            reminder_sound: "bell".into(),
            notification_enabled: true,
            motivational_quotes: true,
            auto_start: true,
            minimize_to_tray: true,
            calendar_default_timed_reminder_minutes: 10,
            calendar_default_all_day_reminder: "same_day_09".into(),
            calendar_default_duration_minutes: 30,
            calendar_default_event_color: "#2563eb".into(),
            calendar_event_density: "comfortable".into(),
        }
    }
}

// ============ Auth / Sync ============

camel! {
pub struct AuthSession {
    pub token: String,
    pub nickname: String,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub email_verified: bool,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub device_id: Option<String>,
    pub server_url: Option<String>,
}}

camel! {
pub struct SyncStatus {
    pub enabled: bool,
    pub logged_in: bool,
    pub last_pushed_at: Option<String>,
    pub last_pulled_at: Option<String>,
    pub pending_changes: i32,
    pub server_url: Option<String>,
    pub remote_version: Option<i64>,
}}

// ============ Aggregate Snapshots (for sync) ============

camel! {
pub struct GoalTaskLink {
    pub id: String,
    pub goal_id: Option<String>,
    pub kr_id: Option<String>,
    pub task_id: String,
    pub created_at: String,
}}

camel! {
pub struct CalendarEventBackup {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub start_time: String,
    pub end_time: Option<String>,
    pub all_day: bool,
    pub location: Option<String>,
    pub source_type: String,
    pub source_account_id: Option<String>,
    pub external_uid: Option<String>,
    pub sequence: i32,
    pub status: String,
    pub readonly: bool,
    pub color: Option<String>,
    pub holiday_type: Option<String>,
    pub raw_ics: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub synced_at: Option<String>,
}}

camel! {
pub struct CalendarHolidaySourceBackup {
    pub id: String,
    pub name: String,
    pub source_type: String,
    pub content: Option<String>,
    pub url: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}}

camel! {
pub struct CalendarEmailAccountBackup {
    pub id: String,
    pub provider: String,
    pub email: String,
    pub imap_host: Option<String>,
    pub imap_port: Option<i32>,
    pub enabled: bool,
    pub sync_interval_minutes: i32,
    pub last_sync_at: Option<String>,
    pub last_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}}

camel! {
pub struct HolidaySyncConfigBackup {
    pub id: String,
    pub country_code: String,
    pub region: Option<String>,
    pub enabled: bool,
    pub show_workdays: bool,
    pub source_url: Option<String>,
    pub last_sync_at: Option<String>,
    pub last_error: Option<String>,
    pub updated_at: String,
}}

camel! {
pub struct BackupEnvelope {
    pub schema_version: i32,
    pub app_version: String,
    pub backup_kind: String,
    pub generated_at: String,
    pub snapshot: Snapshot,
}}

camel! {
pub struct Snapshot {
    pub boards: Vec<Board>,
    pub lists: Vec<List>,
    pub tasks: Vec<Task>,
    pub goals: Vec<Goal>,
    pub key_results: Vec<KeyResult>,
    pub progress_logs: Vec<ProgressLog>,
    pub goal_task_links: Vec<GoalTaskLink>,
    pub milestones: Vec<Milestone>,
    pub pomodoro_sessions: Vec<PomodoroSession>,
    pub check_ins: Vec<CheckIn>,
    pub review_reports: Vec<ReviewReport>,
    pub calendar_events: Vec<CalendarEventBackup>,
    pub calendar_holiday_sources: Vec<CalendarHolidaySourceBackup>,
    pub calendar_email_accounts: Vec<CalendarEmailAccountBackup>,
    pub holiday_sync_configs: Vec<HolidaySyncConfigBackup>,
    pub user_profile: Option<UserProfile>,
    pub settings: std::collections::HashMap<String, String>,
    pub generated_at: String,
}}

// ============ Calendar ============

camel! {
pub struct CalendarEntry {
    pub id: String,
    pub title: String,
    pub date: String,
    pub time: Option<String>,
    pub end_time: Option<String>,
    pub source_type: String,
    pub readonly: bool,
    pub list_id: Option<String>,
    pub list_name: Option<String>,
    pub board_id: Option<String>,
    pub board_name: Option<String>,
    pub board_color: Option<String>,
    pub linked_task_id: Option<String>,
    pub is_completed: bool,
    pub color: Option<String>,
    pub has_reminder: bool,
    pub has_subtasks: bool,
    pub subtask_count: i32,
    pub subtask_done: i32,
    pub location: Option<String>,
    pub description: Option<String>,
    pub holiday_type: Option<String>,
    pub status: Option<String>,
    pub start_at: Option<String>,
    pub due_at: Option<String>,
}}

camel! {
pub struct CalendarHolidaySource {
    pub id: String,
    pub name: String,
    pub description: String,
    pub built_in: bool,
    pub url: Option<String>,
}}

camel! {
pub struct ImportHolidayJsonSourceRequest {
    pub name: String,
    pub content: String,
}}

camel! {
pub struct ImportCalendarIcsSourceRequest {
    pub name: String,
    pub content: String,
    pub url: Option<String>,
}}

camel! {
pub struct SyncHolidayCountryRequest {
    pub country_code: String,
    pub language: String,
}}

camel! {
pub struct CreateManualCalendarEventRequest {
    pub title: String,
    pub description: Option<String>,
    pub start_at: String,
    pub end_at: Option<String>,
    pub all_day: bool,
    pub location: Option<String>,
    pub color: Option<String>,
}}

camel! {
pub struct UpdateManualCalendarEventRequest {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub start_at: String,
    pub end_at: Option<String>,
    pub all_day: bool,
    pub location: Option<String>,
    pub color: Option<String>,
}}

camel! {
pub struct CalendarSyncStatus {
    pub holiday_enabled: bool,
    pub holiday_source: String,
    pub holiday_country: String,
    pub holiday_last_sync_at: Option<String>,
    pub holiday_last_error: Option<String>,
    pub holiday_event_count: i32,
    pub email_account_count: i32,
    pub email_enabled_count: i32,
    pub email_last_sync_at: Option<String>,
    pub email_last_error: Option<String>,
}}

camel! {
pub struct CalendarEmailAccount {
    pub id: String,
    pub provider: String,
    pub email: String,
    pub imap_host: Option<String>,
    pub imap_port: Option<i32>,
    pub enabled: bool,
    pub sync_interval_minutes: i32,
    pub last_sync_at: Option<String>,
    pub last_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}}

camel! {
pub struct CreateCalendarEmailAccountRequest {
    pub provider: String,
    pub email: String,
    pub imap_host: Option<String>,
    pub imap_port: Option<i32>,
    pub sync_interval_minutes: Option<i32>,
}}

camel! {
pub struct SaveCalendarEmailCredentialRequest {
    pub account_id: String,
    pub secret: String,
}}

camel! {
pub struct CalendarEmailCredentialStatus {
    pub account_id: String,
    pub has_credential: bool,
}}

camel! {
pub struct AuthorizeCalendarEmailOAuthRequest {
    pub account_id: String,
    pub client_id: String,
}}

camel! {
pub struct CalendarEmailSyncResult {
    pub account_id: String,
    pub scanned_messages: i32,
    pub imported_events: i32,
    pub updated_events: i32,
    pub cancelled_events: i32,
}}

camel! {
pub struct ReminderItem {
    pub task_id: String,
    pub task_title: String,
    pub due_at: Option<String>,
    pub reminder_at: Option<String>,
    pub reminder_time: Option<String>,
    pub is_completed: bool,
    pub board_name: String,
    pub list_name: String,
    pub board_id: String,
    pub next_reminder_at: Option<String>,
    pub sound_enabled: bool,
    pub notification_enabled: bool,
}}

camel! {
pub struct TaskReminderSettings {
    pub task_id: String,
    pub enabled: bool,
    pub reminder_time: String,
    pub repeat_mode: String,
    pub weekdays: Vec<i32>,
    pub notification_enabled: bool,
    pub sound_enabled: bool,
    pub snooze_minutes: i32,
    pub paused: bool,
    pub silent_until: Option<String>,
    pub next_reminder_at: Option<String>,
}}
