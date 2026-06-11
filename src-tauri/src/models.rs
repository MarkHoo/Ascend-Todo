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
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "aurora-day".into(),
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
        }
    }
}

// ============ Auth / Sync ============

camel! {
pub struct AuthSession {
    pub token: String,
    pub nickname: String,
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
}}

// ============ Aggregate Snapshots (for sync) ============

camel! {
pub struct Snapshot {
    pub boards: Vec<Board>,
    pub lists: Vec<List>,
    pub tasks: Vec<Task>,
    pub goals: Vec<Goal>,
    pub milestones: Vec<Milestone>,
    pub pomodoro_sessions: Vec<PomodoroSession>,
    pub check_ins: Vec<CheckIn>,
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
    pub list_id: String,
    pub list_name: String,
    pub board_id: String,
    pub board_name: String,
    pub board_color: Option<String>,
    pub is_completed: bool,
    pub color: Option<String>,
    pub has_reminder: bool,
    pub has_subtasks: bool,
    pub subtask_count: i32,
    pub subtask_done: i32,
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
}}
