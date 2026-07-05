// Types that mirror the Rust models (snake_case from serde -> camelCase here for TS)

export type ISODate = string;

export interface Board {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  isPinned: boolean;
  position: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface List {
  id: string;
  boardId: string;
  name: string;
  position: number;
  createdAt: ISODate;
}

export interface Task {
  id: string;
  listId: string;
  title: string;
  description?: string | null;
  position: number;
  dueAt?: string | null;
  reminderAt?: string | null;
  reminderTime?: string | null;
  isCompleted: boolean;
  completedAt?: string | null;
  parentTaskId?: string | null;
  color?: string | null;
  status: 'not_started' | 'in_progress' | 'long_term' | 'completed' | 'closed';
  priority?: 'normal' | 'lowest' | 'higher' | 'highest' | 'lower' | null;
  startAt?: string | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

// Subtask is now just a nested TaskWithSubtasks
export type TaskWithSubtasks = Task & {
  subtasks: TaskWithSubtasks[];
};

export interface TaskActivityLog {
  id: string;
  taskId: string;
  kind: 'pomodoro' | string;
  title: string;
  detail?: string | null;
  sourceId?: string | null;
  durationSeconds?: number | null;
  createdAt: ISODate;
}

export interface ListWithTasks {
  list: List;
  tasks: TaskWithSubtasks[];
}

export interface BoardWithLists {
  board: Board;
  lists: ListWithTasks[];
}

export type GoalPeriod = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'yearly' | 'custom';

export interface Goal {
  id: string;
  title: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  dueAt?: string | null;
  parentGoalId?: string | null;
  position: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Milestone {
  id: string;
  goalId: string;
  title: string;
  isCompleted: boolean;
  completedAt?: string | null;
  position: number;
  createdAt: ISODate;
}

export interface KeyResult {
  id: string;
  goalId: string;
  title: string;
  type: 'metric' | 'boolean' | 'task';
  startValue: number;
  targetValue: number;
  currentValue: number;
  unit?: string | null;
  weight: number;
  healthStatus: 'normal' | 'risk' | 'behind';
  checkDate?: string | null;
  isCompleted: boolean;
  position: number;
  createdAt: ISODate;
}

export interface ProgressLog {
  id: string;
  krId: string;
  oldValue: number;
  newValue: number;
  comment?: string | null;
  createdAt: ISODate;
}

export interface KeyResultWithLogs {
  id: string;
  goalId: string;
  title: string;
  type: 'metric' | 'boolean' | 'task';
  startValue: number;
  targetValue: number;
  currentValue: number;
  unit?: string | null;
  weight: number;
  healthStatus: 'normal' | 'risk' | 'behind';
  checkDate?: string | null;
  isCompleted: boolean;
  position: number;
  createdAt: ISODate;
  progress: number;
  logs: ProgressLog[];
  milestones: Milestone[];
}

export interface LinkedTask {
  krId?: string | null;
  id: string;
  title: string;
  isCompleted: boolean;
  boardName: string;
  listName: string;
  dueAt?: string | null;
  status: Task['status'];
  priority?: Task['priority'];
  startAt?: string | null;
}

export interface GoalWithDetails {
  // flattened Goal fields
  id: string;
  title: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  dueAt?: string | null;
  parentGoalId?: string | null;
  position: number;
  createdAt: ISODate;
  updatedAt: ISODate;
  progressMode: 'percentage' | 'numeric';
  progressValue: number;
  progressTotal: number;
  category?: string | null;
  startDate?: string | null;
  weight: number;
  status: 'draft' | 'active' | 'completed' | 'abandoned' | 'archived';
  reviewScore?: number | null;
  reviewNote?: string | null;
  period: GoalPeriod;
  deletedAt?: string | null;
  milestones: Milestone[];
  keyResults: KeyResult[];
  subGoals: GoalWithDetails[];
  progress: number;
  linkedTasks: LinkedTask[];
}

// Backward compatibility alias
export type GoalWithMilestones = GoalWithDetails;

export interface PomodoroSession {
  id: string;
  taskId?: string | null;
  mode: 'countdown' | 'countup';
  durationSeconds: number;
  startedAt: ISODate;
  endedAt?: string | null;
  completed: boolean;
  sourceEventId?: string | null;
  sourceTitle?: string | null;
}

export interface DailyPomodoroCount {
  date: string;
  count: number;
  seconds: number;
}

export interface PomodoroStats {
  totalSessions: number;
  totalSeconds: number;
  completedSessions: number;
  byDay: DailyPomodoroCount[];
}

export interface CheckIn {
  id: string;
  date: string;
  count: number;
}

export interface CheckInSummary {
  total: number;
  todayCount: number;
  streak: number;
  byDay: CheckIn[];
}

export type ReviewPeriodType = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface ReviewReport {
  id: string;
  periodType: ReviewPeriodType;
  periodStart: string;
  periodEnd: string;
  highlights: string;
  blockers: string;
  lessons: string;
  nextActions: string;
  score?: number | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface UserProfile {
  id: string;
  nickname?: string | null;
  avatar?: string | null;
  phone?: string | null;
  email?: string | null;
  signature?: string | null;
  updatedAt: ISODate;
}

export interface AppSettings {
  theme:
    | 'aurora-day'
    | 'mint-garden'
    | 'midnight'
    | 'amber-dawn'
    | 'rose-mist'
    | 'sakura-pink'
    | 'ocean-breeze'
    | 'forest-night'
    | 'lime-pop'
    | 'coral-glow'
    | 'graphite-neon'
    | 'lavender-frost';
  displaySize: 'compact' | 'standard' | 'comfortable' | 'large';
  language: 'en' | 'zh-CN' | 'zh-TW';
  weekStart: 'mon' | 'sun';
  pomodoroDuration: number;
  pomodoroLongBreak: number;
  autoUpdate: boolean;
  syncEnabled: boolean;
  syncServerUrl?: string | null;
  reminderSound: 'bell' | 'chime' | 'digital' | 'waiting' | 'marimba-waiting' | 'none';
  notificationEnabled: boolean;
  motivationalQuotes: boolean;
  autoStart: boolean;
  minimizeToTray: boolean;
  calendarDefaultTimedReminderMinutes: number;
  calendarDefaultAllDayReminder: 'none' | 'same_day_09' | 'previous_day_18' | 'previous_day_20' | 'previous_day_09';
  calendarDefaultDurationMinutes: number;
  calendarDefaultEventColor: string;
  calendarEventDensity: 'comfortable' | 'compact';
  holidayCountry: string;
}

export interface AuthSession {
  token: string;
  nickname: string;
  serverUrl?: string | null;
}

export interface SyncStatus {
  enabled: boolean;
  loggedIn: boolean;
  lastPushedAt?: string | null;
  lastPulledAt?: string | null;
  pendingChanges: number;
  serverUrl?: string | null;
}

export interface CalendarEntry {
  id: string;
  title: string;
  date: string;
  time?: string | null;
  endTime?: string | null;
  sourceType: 'task' | 'manual' | 'meeting' | 'email' | 'holiday' | 'pomodoro_plan' | 'pomodoro_record' | 'goal' | 'review';
  readonly: boolean;
  listId?: string | null;
  listName?: string | null;
  boardId?: string | null;
  boardName?: string | null;
  boardColor?: string | null;
  linkedTaskId?: string | null;
  isCompleted: boolean;
  color?: string | null;
  hasReminder: boolean;
  hasSubtasks: boolean;
  subtaskCount: number;
  subtaskDone: number;
  location?: string | null;
  description?: string | null;
  holidayType?: 'holiday' | 'workday' | null;
  status?: string | null;
  startAt?: string | null;
  dueAt?: string | null;
}

export interface CalendarHolidaySource {
  id: string;
  name: string;
  description: string;
  builtIn: boolean;
  url?: string | null;
}

export interface ImportHolidayJsonSourceRequest {
  name: string;
  content: string;
}

export interface ImportCalendarIcsSourceRequest {
  name: string;
  content: string;
  url?: string | null;
}

export interface SyncHolidayCountryRequest {
  countryCode: string;
  language: AppSettings['language'];
}

export interface CreateManualCalendarEventRequest {
  title: string;
  description?: string | null;
  startAt: string;
  endAt?: string | null;
  allDay: boolean;
  location?: string | null;
  color?: string | null;
}

export interface CalendarSyncStatus {
  holidayEnabled: boolean;
  holidaySource: string;
  holidayCountry: string;
  holidayLastSyncAt?: string | null;
  holidayLastError?: string | null;
  holidayEventCount: number;
  emailAccountCount: number;
  emailEnabledCount: number;
  emailLastSyncAt?: string | null;
  emailLastError?: string | null;
}

export interface CalendarEmailAccount {
  id: string;
  provider: string;
  email: string;
  imapHost?: string | null;
  imapPort?: number | null;
  enabled: boolean;
  syncIntervalMinutes: number;
  lastSyncAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCalendarEmailAccountRequest {
  provider: string;
  email: string;
  imapHost?: string | null;
  imapPort?: number | null;
  syncIntervalMinutes?: number | null;
}

export interface SaveCalendarEmailCredentialRequest {
  accountId: string;
  secret: string;
}

export interface AuthorizeCalendarEmailOAuthRequest {
  accountId: string;
  clientId: string;
}

export interface CalendarEmailCredentialStatus {
  accountId: string;
  hasCredential: boolean;
}

export interface CalendarEmailSyncResult {
  accountId: string;
  scannedMessages: number;
  importedEvents: number;
  updatedEvents: number;
  cancelledEvents: number;
}

export interface ReminderItem {
  taskId: string;
  taskTitle: string;
  dueAt?: string | null;
  reminderAt?: string | null;
  reminderTime?: string | null;
  isCompleted: boolean;
  boardName: string;
  listName: string;
  boardId: string;
  nextReminderAt?: string | null;
  soundEnabled: boolean;
  notificationEnabled: boolean;
}

export interface TaskReminderSettings {
  taskId: string;
  enabled: boolean;
  reminderTime: string;
  repeatMode: 'daily' | 'weekdays' | 'custom';
  weekdays: number[];
  notificationEnabled: boolean;
  soundEnabled: boolean;
  snoozeMinutes: number;
  paused: boolean;
  silentUntil?: string | null;
  nextReminderAt?: string | null;
}
