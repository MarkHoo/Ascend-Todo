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
  theme: 'aurora-day' | 'mint-garden' | 'midnight' | 'amber-dawn';
  language: 'en' | 'zh-CN' | 'zh-TW';
  weekStart: 'mon' | 'sun';
  pomodoroDuration: number;
  pomodoroLongBreak: number;
  autoUpdate: boolean;
  syncEnabled: boolean;
  syncServerUrl?: string | null;
  reminderSound: 'bell' | 'chime' | 'digital' | 'none';
  notificationEnabled: boolean;
  motivationalQuotes: boolean;
  autoStart: boolean;
  minimizeToTray: boolean;
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
  listId: string;
  listName: string;
  boardId: string;
  boardName: string;
  boardColor?: string | null;
  isCompleted: boolean;
  color?: string | null;
  hasReminder: boolean;
  hasSubtasks: boolean;
  subtaskCount: number;
  subtaskDone: number;
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
