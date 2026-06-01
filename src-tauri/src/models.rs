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
    pub created_at: String,
    pub updated_at: String,
}}

camel! {
pub struct Subtask {
    pub id: String,
    pub task_id: String,
    pub title: String,
    pub is_completed: bool,
    pub position: i32,
    pub created_at: String,
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
    pub subtasks: Vec<Subtask>,
}

// ============ Goals / Milestones ============

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalWithMilestones {
    #[serde(flatten)]
    pub goal: Goal,
    pub milestones: Vec<Milestone>,
    pub sub_goals: Vec<GoalWithMilestones>,
    pub progress: f64,
}

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
    pub subtasks: Vec<Subtask>,
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
