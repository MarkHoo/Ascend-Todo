import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Archive,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flame,
  Focus,
  Lightbulb,
  ListChecks,
  RefreshCw,
  Save,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  checkInsApi,
  calendarApi,
  goalsApi,
  keyResultsApi,
  pomodoroApi,
  reviewsApi,
  tasksApi,
  type ReviewDraft,
} from '@/api';
import { Button } from '@/components/common/Button';
import { ProgressBar } from '@/components/common/ProgressBar';
import { Textarea } from '@/components/common/Input';
import { toast } from '@/components/common/Toast';
import { useEChart } from '@/hooks/useEChart';
import { useSettingsStore } from '@/store/useSettingsStore';
import type {
  CheckInSummary,
  CheckIn,
  GoalWithDetails,
  PomodoroSession,
  ProgressLog,
  ReviewPeriodType,
  ReviewReport,
  Task,
  AppSettings,
  CalendarEntry,
} from '@/types';
import {
  availableYears,
  dayjs,
  heatmapCells,
  heatmapCellsForYear,
  rangeDays,
  startOfWeek,
} from '@/utils/date';
import { quoteForToday } from '@/utils/quotes';

const DAYS_BACK = 365;
const PERIOD_VALUES: ReviewPeriodType[] = ['day', 'week', 'month', 'quarter', 'year'];

const overviewCopy = {
  'zh-CN': {
    quote: '今日一句',
    overview: '总览',
    review: '复盘分析',
    periods: { day: '按天', week: '按周', month: '按月', quarter: '按季度', year: '按年' },
    previous: '上一周期',
    next: '下一周期',
    current: '回到本期',
    refresh: '刷新数据',
    streak: '连续打卡',
    days: '天',
    activeInPeriod: '本期活跃 {{active}}/{{total}} 天',
    completedTasks: '完成任务',
    items: '项',
    onTimeRate: '按时率',
    goalProgress: '目标推进',
    advanced: '推进',
    goals: '个',
    risk: '风险',
    focusDuration: '专注时长',
    pomodoros: '个番茄',
    linkedTasks: '关联任务',
    dueTasks: '到期任务',
    taskTrend: '任务执行趋势',
    taskTrendDesc: '到期计划与实际完成情况',
    periodCreated: '本期新增',
    periodDue: '本期到期',
    overdueNow: '当前逾期',
    carryover: '跨期遗留',
    goalProgressTitle: '目标推进情况',
    goalProgressDesc: '按本期关键结果加权进度变化排序',
    noActiveGoals: '暂无进行中的目标',
    periodAdvanced: '本期推进',
    periodStagnant: '本期未更新',
    riskBehind: '风险/失控',
    focusOutput: '专注与产出',
    focusOutputDesc: '专注投入与任务完成趋势，仅表示关联而非因果',
    averageSession: '平均每次',
    completedPomodoro: '完成番茄',
    taskLinkRate: '任务关联率',
    scheduleExecution: '日程执行',
    scheduleExecutionDesc: '基于任务开始时间与截至时间分析',
    dueCompletionRate: '到期任务完成率',
    highestLoad: '负载最高',
    noSchedule: '暂无安排',
    needAction: '需要处理',
    overdueOrCarryover: '{{count}} 项逾期或遗留',
    priorityQueue: '优先处理',
    priorityQueueDesc: '自动汇总逾期、临期、停滞目标和关键结果检查节点',
    priorityOverdue: '逾期任务',
    priorityUpcoming: '即将到期',
    priorityGoalRisk: '目标风险',
    priorityKrCheck: 'KR 检查',
    noPriorityItems: '当前没有需要优先处理的事项',
    dueToday: '今天',
    dueTomorrow: '明天',
    dueInDays: '{{days}} 天后',
    overdueDays: '逾期 {{days}} 天',
    stagnantGoal: '本期未推进',
    riskGoal: '目标有风险',
    conclusions: '本期结论',
    conclusionsDesc: '根据当前任务、目标、日程和专注记录自动生成',
    reviewRecords: '复盘记录',
    reviewRecordsDesc: '已保存 {{count}} 期，点击记录即可查看和继续编辑',
    all: '全部',
    noReviewRecords: '暂无已保存的复盘记录',
    period: '周期',
    reviewDate: '复盘日期',
    score: '评分',
    summary: '内容摘要',
    updatedAt: '更新时间',
    scorePoint: '{{score}} 分',
    noScore: '未评分',
    reviewSubtitle: '{{period}} · 将数据结论转化为下一周期可执行的行动',
    reviewScores: '{{score}} 分',
    highlights: '本期成果',
    highlightsPlaceholder: '完成了什么，哪些结果值得保留？',
    blockers: '问题与阻碍',
    blockersPlaceholder: '哪些任务逾期，哪些目标停滞，原因是什么？',
    lessons: '经验与规律',
    lessonsPlaceholder: '哪些安排有效，专注时间与产出有什么规律？',
    nextActions: '下期行动',
    nextActionsPlaceholder: '下一周期最重要的三件事和具体行动。',
    lastSaved: '上次保存：{{time}}',
    notSaved: '本周期尚未保存复盘',
    savingReview: '保存中',
    saveReview: '保存复盘',
    regenerateReview: '重新生成建议',
    reviewRegenerated: '已根据当前数据重新生成复盘建议',
    activityMap: '活动图',
    activityMapDesc: '完成任务和番茄专注形成的活动记录',
    recent365: '最近 365 天',
    activeDayCount: '{{count}} 个活跃日',
    activityCount: '{{date}} · {{count}} 次活动',
    less: '少',
    more: '多',
    hoursMinutes: '{{hours}}小时{{minutes}}分',
    hoursOnly: '{{hours}}小时',
    minutes: '{{minutes}}分钟',
    reviewType: { day: '日复盘', week: '周复盘', month: '月复盘', quarter: '季度复盘', year: '年度复盘' },
    savedReviewEmpty: '已保存复盘，暂未填写文字内容',
    compareNew: '较上期新增',
    compareFlat: '与上期持平',
    compareChange: '较上期{{direction}} {{percent}}%',
    increase: '增加',
    decrease: '减少',
    insightTasks: '本期完成 {{completed}} 项任务，{{comparison}}，到期任务按时率为 {{rate}}。',
    insightOverdue: '当前有 {{count}} 项任务已经逾期，建议优先处理或重新安排截至时间。',
    insightNoOverdue: '当前没有逾期任务，日程执行状态良好。',
    insightStagnant: '{{stagnant}} 个进行中目标本期没有关键结果更新，{{risk}} 个目标处于有风险或失控状态。',
    insightGoalsOk: '所有进行中目标本期均有更新，整体加权推进 {{delta}}。',
    insightFocus: '本期完成 {{sessions}} 次专注，共 {{duration}}，其中 {{rate}} 已关联到具体任务。',
    loadFailed: '总览数据加载失败：{{error}}',
    historyLoadFailed: '复盘记录加载失败：{{error}}',
    reviewSaved: '本期复盘已保存',
    reviewSaveFailed: '复盘保存失败：{{error}}',
  },
  'zh-TW': {
    quote: '今日一句',
    overview: '總覽',
    review: '復盤分析',
    periods: { day: '按天', week: '按週', month: '按月', quarter: '按季度', year: '按年' },
    previous: '上一週期',
    next: '下一週期',
    current: '回到本期',
    refresh: '重新整理資料',
    streak: '連續打卡',
    days: '天',
    activeInPeriod: '本期活躍 {{active}}/{{total}} 天',
    completedTasks: '完成任務',
    items: '項',
    onTimeRate: '準時率',
    goalProgress: '目標推進',
    advanced: '推進',
    goals: '個',
    risk: '風險',
    focusDuration: '專注時長',
    pomodoros: '個番茄',
    linkedTasks: '關聯任務',
    dueTasks: '到期任務',
    taskTrend: '任務執行趨勢',
    taskTrendDesc: '到期計劃與實際完成情況',
    periodCreated: '本期新增',
    periodDue: '本期到期',
    overdueNow: '目前逾期',
    carryover: '跨期遺留',
    goalProgressTitle: '目標推進情況',
    goalProgressDesc: '按本期關鍵結果加權進度變化排序',
    noActiveGoals: '暫無進行中的目標',
    periodAdvanced: '本期推進',
    periodStagnant: '本期未更新',
    riskBehind: '風險/失控',
    focusOutput: '專注與產出',
    focusOutputDesc: '專注投入與任務完成趨勢，僅表示關聯而非因果',
    averageSession: '平均每次',
    completedPomodoro: '完成番茄',
    taskLinkRate: '任務關聯率',
    scheduleExecution: '日程執行',
    scheduleExecutionDesc: '基於任務開始時間與截止時間分析',
    dueCompletionRate: '到期任務完成率',
    highestLoad: '負載最高',
    noSchedule: '暫無安排',
    needAction: '需要處理',
    overdueOrCarryover: '{{count}} 項逾期或遺留',
    priorityQueue: '優先處理',
    priorityQueueDesc: '自動彙總逾期、臨期、停滯目標和關鍵結果檢查節點',
    priorityOverdue: '逾期任務',
    priorityUpcoming: '即將到期',
    priorityGoalRisk: '目標風險',
    priorityKrCheck: 'KR 檢查',
    noPriorityItems: '目前沒有需要優先處理的事項',
    dueToday: '今天',
    dueTomorrow: '明天',
    dueInDays: '{{days}} 天後',
    overdueDays: '逾期 {{days}} 天',
    stagnantGoal: '本期未推進',
    riskGoal: '目標有風險',
    conclusions: '本期結論',
    conclusionsDesc: '根據目前任務、目標、日程和專注記錄自動生成',
    reviewRecords: '復盤記錄',
    reviewRecordsDesc: '已儲存 {{count}} 期，點擊記錄即可查看和繼續編輯',
    all: '全部',
    noReviewRecords: '暫無已儲存的復盤記錄',
    period: '週期',
    reviewDate: '復盤日期',
    score: '評分',
    summary: '內容摘要',
    updatedAt: '更新時間',
    scorePoint: '{{score}} 分',
    noScore: '未評分',
    reviewSubtitle: '{{period}} · 將資料結論轉化為下一週期可執行的行動',
    reviewScores: '{{score}} 分',
    highlights: '本期成果',
    highlightsPlaceholder: '完成了什麼，哪些結果值得保留？',
    blockers: '問題與阻礙',
    blockersPlaceholder: '哪些任務逾期，哪些目標停滯，原因是什麼？',
    lessons: '經驗與規律',
    lessonsPlaceholder: '哪些安排有效，專注時間與產出有什麼規律？',
    nextActions: '下期行動',
    nextActionsPlaceholder: '下一週期最重要的三件事和具體行動。',
    lastSaved: '上次儲存：{{time}}',
    notSaved: '本週期尚未儲存復盤',
    savingReview: '儲存中',
    saveReview: '儲存復盤',
    regenerateReview: '重新生成建議',
    reviewRegenerated: '已根據目前資料重新生成復盤建議',
    activityMap: '活動圖',
    activityMapDesc: '完成任務和番茄專注形成的活動記錄',
    recent365: '最近 365 天',
    activeDayCount: '{{count}} 個活躍日',
    activityCount: '{{date}} · {{count}} 次活動',
    less: '少',
    more: '多',
    hoursMinutes: '{{hours}}小時{{minutes}}分',
    hoursOnly: '{{hours}}小時',
    minutes: '{{minutes}}分鐘',
    reviewType: { day: '日復盤', week: '週復盤', month: '月復盤', quarter: '季度復盤', year: '年度復盤' },
    savedReviewEmpty: '已儲存復盤，暫未填寫文字內容',
    compareNew: '較上期新增',
    compareFlat: '與上期持平',
    compareChange: '較上期{{direction}} {{percent}}%',
    increase: '增加',
    decrease: '減少',
    insightTasks: '本期完成 {{completed}} 項任務，{{comparison}}，到期任務準時率為 {{rate}}。',
    insightOverdue: '目前有 {{count}} 項任務已經逾期，建議優先處理或重新安排截止時間。',
    insightNoOverdue: '目前沒有逾期任務，日程執行狀態良好。',
    insightStagnant: '{{stagnant}} 個進行中目標本期沒有關鍵結果更新，{{risk}} 個目標處於有風險或失控狀態。',
    insightGoalsOk: '所有進行中目標本期均有更新，整體加權推進 {{delta}}。',
    insightFocus: '本期完成 {{sessions}} 次專注，共 {{duration}}，其中 {{rate}} 已關聯到具體任務。',
    loadFailed: '總覽資料載入失敗：{{error}}',
    historyLoadFailed: '復盤記錄載入失敗：{{error}}',
    reviewSaved: '本期復盤已儲存',
    reviewSaveFailed: '復盤儲存失敗：{{error}}',
  },
  en: {
    quote: 'Quote of the day',
    overview: 'Overview',
    review: 'Review',
    periods: { day: 'Day', week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year' },
    previous: 'Previous period',
    next: 'Next period',
    current: 'Current period',
    refresh: 'Refresh data',
    streak: 'Streak',
    days: 'd',
    activeInPeriod: '{{active}}/{{total}} active days',
    completedTasks: 'Completed tasks',
    items: '',
    onTimeRate: 'On-time',
    goalProgress: 'Goal progress',
    advanced: 'Advanced',
    goals: '',
    risk: 'Risk',
    focusDuration: 'Focus time',
    pomodoros: 'pomodoros',
    linkedTasks: 'linked tasks',
    dueTasks: 'Due tasks',
    taskTrend: 'Task execution trend',
    taskTrendDesc: 'Planned due tasks vs. actual completions',
    periodCreated: 'Created',
    periodDue: 'Due',
    overdueNow: 'Overdue now',
    carryover: 'Carryover',
    goalProgressTitle: 'Goal progress',
    goalProgressDesc: 'Sorted by weighted key result progress in this period',
    noActiveGoals: 'No active goals',
    periodAdvanced: 'Advanced',
    periodStagnant: 'Not updated',
    riskBehind: 'At risk',
    focusOutput: 'Focus and output',
    focusOutputDesc: 'Focus input and task completion trend; correlation only',
    averageSession: 'Avg/session',
    completedPomodoro: 'Pomodoros',
    taskLinkRate: 'Task link rate',
    scheduleExecution: 'Schedule execution',
    scheduleExecutionDesc: 'Based on task start and due times',
    dueCompletionRate: 'Due task completion rate',
    highestLoad: 'Highest load',
    noSchedule: 'No schedule',
    needAction: 'Needs action',
    overdueOrCarryover: '{{count}} overdue or carried over',
    priorityQueue: 'Priority queue',
    priorityQueueDesc: 'Overdue, upcoming, stagnant goals, and key-result check-ins',
    priorityOverdue: 'Overdue task',
    priorityUpcoming: 'Due soon',
    priorityGoalRisk: 'Goal risk',
    priorityKrCheck: 'KR check',
    noPriorityItems: 'No priority items right now',
    dueToday: 'Today',
    dueTomorrow: 'Tomorrow',
    dueInDays: 'In {{days}} days',
    overdueDays: '{{days}} days overdue',
    stagnantGoal: 'No progress this period',
    riskGoal: 'Goal at risk',
    conclusions: 'Period conclusions',
    conclusionsDesc: 'Generated from tasks, goals, schedules, and focus records',
    reviewRecords: 'Review records',
    reviewRecordsDesc: '{{count}} saved periods. Click a record to view or continue editing',
    all: 'All',
    noReviewRecords: 'No saved review records',
    period: 'Period',
    reviewDate: 'Review date',
    score: 'Score',
    summary: 'Summary',
    updatedAt: 'Updated at',
    scorePoint: '{{score}} pts',
    noScore: 'No score',
    reviewSubtitle: '{{period}} · Turn data conclusions into actions for the next period',
    reviewScores: '{{score}} pts',
    highlights: 'Highlights',
    highlightsPlaceholder: 'What was completed? What results are worth keeping?',
    blockers: 'Problems and blockers',
    blockersPlaceholder: 'Which tasks are overdue, which goals stalled, and why?',
    lessons: 'Lessons and patterns',
    lessonsPlaceholder: 'What worked? What patterns link focus time and output?',
    nextActions: 'Next actions',
    nextActionsPlaceholder: 'The three most important actions for the next period.',
    lastSaved: 'Last saved: {{time}}',
    notSaved: 'No review saved for this period',
    savingReview: 'Saving',
    saveReview: 'Save review',
    regenerateReview: 'Regenerate suggestions',
    reviewRegenerated: 'Review suggestions regenerated from current data',
    activityMap: 'Activity',
    activityMapDesc: 'Activity generated from completed tasks and Pomodoro focus',
    recent365: 'Last 365 days',
    activeDayCount: '{{count}} active days',
    activityCount: '{{date}} · {{count}} activities',
    less: 'Less',
    more: 'More',
    hoursMinutes: '{{hours}}h {{minutes}}m',
    hoursOnly: '{{hours}}h',
    minutes: '{{minutes}}m',
    reviewType: { day: 'Daily review', week: 'Weekly review', month: 'Monthly review', quarter: 'Quarterly review', year: 'Yearly review' },
    savedReviewEmpty: 'Saved review with no written content yet',
    compareNew: 'new vs previous period',
    compareFlat: 'same as previous period',
    compareChange: '{{direction}} {{percent}}% vs previous period',
    increase: 'up',
    decrease: 'down',
    insightTasks: '{{completed}} tasks completed this period, {{comparison}}, with an on-time due-task rate of {{rate}}.',
    insightOverdue: '{{count}} tasks are overdue. Prioritize them or reschedule their due times.',
    insightNoOverdue: 'No overdue tasks right now. Schedule execution looks healthy.',
    insightStagnant: '{{stagnant}} active goals had no key result updates this period; {{risk}} goals are at risk or behind.',
    insightGoalsOk: 'All active goals were updated this period, with weighted progress of {{delta}}.',
    insightFocus: '{{sessions}} focus sessions completed this period, totaling {{duration}}. {{rate}} are linked to specific tasks.',
    loadFailed: 'Failed to load overview data: {{error}}',
    historyLoadFailed: 'Failed to load review records: {{error}}',
    reviewSaved: 'Review saved for this period',
    reviewSaveFailed: 'Failed to save review: {{error}}',
  },
} satisfies Record<string, {
  quote: string;
  overview: string;
  review: string;
  periods: Record<ReviewPeriodType, string>;
  previous: string;
  next: string;
  current: string;
  refresh: string;
  streak: string;
  days: string;
  activeInPeriod: string;
  completedTasks: string;
  items: string;
  onTimeRate: string;
  goalProgress: string;
  advanced: string;
  goals: string;
  risk: string;
  focusDuration: string;
  pomodoros: string;
  linkedTasks: string;
  [key: string]: any;
}>;

function useOverviewText() {
  const language = useSettingsStore((state) => state.settings.language);
  return overviewCopy[language];
}

interface PeriodRange {
  start: dayjs.Dayjs;
  end: dayjs.Dayjs;
  previousStart: dayjs.Dayjs;
  previousEnd: dayjs.Dayjs;
  label: string;
}

interface GoalAnalysis {
  goal: GoalWithDetails;
  delta: number;
  updated: boolean;
  risk: 'normal' | 'risk' | 'behind';
}

interface PriorityItem {
  id: string;
  tone: 'danger' | 'warning' | 'normal';
  kind: string;
  title: string;
  detail: string;
  date?: string | null;
}

const EMPTY_REVIEW: ReviewDraft = {
  highlights: '',
  blockers: '',
  lessons: '',
  nextActions: '',
  score: null,
};

export function OverviewPage() {
  const location = useLocation();
  const settings = useSettingsStore((state) => state.settings);
  const copy = overviewCopy[settings.language];
  const periods = useMemo(
    () => PERIOD_VALUES.map((value) => ({ value, label: copy.periods[value] })),
    [copy],
  );
  const [view, setView] = useState<'overview' | 'review'>('overview');
  const [periodType, setPeriodType] = useState<ReviewPeriodType>('week');
  const [anchor, setAnchor] = useState(() => dayjs());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<GoalWithDetails[]>([]);
  const [sessions, setSessions] = useState<PomodoroSession[]>([]);
  const [todayEntries, setTodayEntries] = useState<CalendarEntry[]>([]);
  const [checkInSummary, setCheckInSummary] = useState<CheckInSummary | null>(null);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [dateMap, setDateMap] = useState<Map<string, number>>(new Map());
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);
  const [goalLogs, setGoalLogs] = useState<Record<string, ProgressLog[]>>({});
  const [review, setReview] = useState<ReviewDraft>(EMPTY_REVIEW);
  const [reviewHistory, setReviewHistory] = useState<ReviewReport[]>([]);
  const [historyFilter, setHistoryFilter] = useState<ReviewPeriodType | 'all'>('all');
  const [reviewUpdatedAt, setReviewUpdatedAt] = useState<string | null>(null);
  const [autoReviewSeedKey, setAutoReviewSeedKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const period = useMemo(
    () => getPeriodRange(anchor, periodType, settings.weekStart, copy),
    [anchor, periodType, settings.weekStart, copy],
  );
  const quote = useMemo(
    () => quoteForToday(settings.language),
    [settings.language],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const today = dayjs().format('YYYY-MM-DD');
      const [allTasks, goalTree, allSessions, checks, allCheckIns, activityPomodoros, calendarToday] = await Promise.all([
        tasksApi.listAll(),
        goalsApi.list(),
        pomodoroApi.list(100000),
        checkInsApi.summary(),
        checkInsApi.list(),
        pomodoroApi.stats(730),
        calendarApi.range(today, today).catch(() => [] as CalendarEntry[]),
      ]);
      const flatGoals = flattenGoals(goalTree).filter((goal) => !goal.deletedAt && goal.status !== 'draft');
      const krIds = flatGoals.flatMap((goal) => goal.keyResults.map((kr) => kr.id));
      const histories = await mapWithConcurrency(
        krIds,
        8,
        async (id) => [id, await keyResultsApi.history(id, 300)] as const,
      );
      const nextLogs = Object.fromEntries(histories);
      const activity = new Map<string, number>();
      allTasks.forEach((task) => {
        if (task.isCompleted && task.completedAt) {
          const date = dayjs(task.completedAt).format('YYYY-MM-DD');
          activity.set(date, (activity.get(date) || 0) + 1);
        }
      });
      activityPomodoros.byDay.forEach((item) => {
        activity.set(item.date, (activity.get(item.date) || 0) + item.count);
      });
      setTasks(allTasks);
      setGoals(flatGoals);
      setSessions(allSessions);
      setTodayEntries(calendarToday);
      setCheckInSummary(checks);
      setCheckIns(allCheckIns);
      setGoalLogs(nextLogs);
      setDateMap(activity);
    } catch (error) {
      toast.error(copy.loadFailed.replace('{{error}}', String(error)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData, location.pathname]);

  useEffect(() => {
    let cancelled = false;
    reviewsApi
      .get(periodType, period.start.format('YYYY-MM-DD'), period.end.format('YYYY-MM-DD'))
      .then((saved) => {
        if (cancelled) return;
        setReview(saved ? {
          highlights: saved.highlights,
          blockers: saved.blockers,
          lessons: saved.lessons,
          nextActions: saved.nextActions,
          score: saved.score,
        } : EMPTY_REVIEW);
        setReviewUpdatedAt(saved?.updatedAt || null);
      })
      .catch(() => {
        if (!cancelled) {
          setReview(EMPTY_REVIEW);
          setReviewUpdatedAt(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [period.end, period.start, periodType]);

  const fetchReviewHistory = useCallback(async () => {
    try {
      setReviewHistory(await reviewsApi.list());
    } catch (error) {
      toast.error(copy.historyLoadFailed.replace('{{error}}', String(error)));
    }
  }, []);

  useEffect(() => {
    if (view === 'review') {
      void fetchReviewHistory();
    }
  }, [fetchReviewHistory, view]);

  const analysis = useMemo(
    () => buildAnalysis(tasks, goals, sessions, checkInSummary, checkIns, goalLogs, period, periodType, copy),
    [tasks, goals, sessions, checkInSummary, checkIns, goalLogs, period, periodType, copy],
  );

  useEffect(() => {
    const key = `${periodType}:${period.start.format('YYYY-MM-DD')}:${period.end.format('YYYY-MM-DD')}`;
    const reviewIsEmpty = !review.highlights && !review.blockers && !review.lessons && !review.nextActions && !review.score;
    if (loading || reviewUpdatedAt || autoReviewSeedKey === key || !reviewIsEmpty) return;
    setReview(generateAutoReviewDraft(analysis, copy));
    setAutoReviewSeedKey(key);
  }, [analysis, autoReviewSeedKey, copy, loading, period.end, period.start, periodType, review, reviewUpdatedAt]);

  const saveReview = async () => {
    setSaving(true);
    try {
      const saved = await reviewsApi.save(
        periodType,
        period.start.format('YYYY-MM-DD'),
        period.end.format('YYYY-MM-DD'),
        review,
      );
      setReviewUpdatedAt(saved.updatedAt);
      await fetchReviewHistory();
      toast.success(copy.reviewSaved);
    } catch (error) {
      toast.error(copy.reviewSaveFailed.replace('{{error}}', String(error)));
    } finally {
      setSaving(false);
    }
  };

  const regenerateReview = () => {
    setReview(generateAutoReviewDraft(analysis, copy));
    setAutoReviewSeedKey(`${periodType}:${period.start.format('YYYY-MM-DD')}:${period.end.format('YYYY-MM-DD')}:manual`);
    toast.success(copy.reviewRegenerated);
  };

  const shiftPeriod = (amount: number) => {
    const unit = periodType === 'quarter' ? 'month' : periodType;
    const step = periodType === 'quarter' ? amount * 3 : amount;
    setAnchor((current) => current.add(step, unit));
  };

  const openReviewReport = (report: ReviewReport) => {
    setPeriodType(report.periodType);
    setAnchor(dayjs(report.periodStart));
    setReview({
      highlights: report.highlights,
      blockers: report.blockers,
      lessons: report.lessons,
      nextActions: report.nextActions,
      score: report.score,
    });
    setReviewUpdatedAt(report.updatedAt);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      {settings.motivationalQuotes && (
        <section className="card p-6 bg-gradient-to-br from-primary-soft to-surface">
          <div className="text-xs text-text-muted">{copy.quote}</div>
          <div className="text-xl font-medium mt-1 italic">「{quote}」</div>
          <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
            <CalendarDays size={12} />
            {dayjs().format('YYYY-MM-DD dddd')}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border bg-surface p-1">
          <button
            className={`px-4 py-1.5 rounded-md text-sm font-medium ${view === 'overview' ? 'bg-primary text-white' : 'text-text-muted'}`}
            onClick={() => setView('overview')}
          >
            {copy.overview}
          </button>
          <button
            className={`px-4 py-1.5 rounded-md text-sm font-medium ${view === 'review' ? 'bg-primary text-white' : 'text-text-muted'}`}
            onClick={() => setView('review')}
          >
            {copy.review}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-surface p-1">
            {periods.map((item) => (
              <button
                key={item.value}
                className={`px-3 py-1.5 rounded-md text-xs font-medium ${periodType === item.value ? 'bg-surface-2 text-primary' : 'text-text-muted'}`}
                onClick={() => {
                  setPeriodType(item.value);
                  setAnchor(dayjs());
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button className="btn-ghost p-2" title={copy.previous} onClick={() => shiftPeriod(-1)}>
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[170px] text-center text-sm font-semibold">{period.label}</span>
          <button
            className="btn-ghost p-2"
            title={copy.next}
            disabled={period.end.isAfter(dayjs(), 'day')}
            onClick={() => shiftPeriod(1)}
          >
            <ChevronRight size={16} />
          </button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(dayjs())}>{copy.current}</Button>
          <button className="btn-ghost p-2" title={copy.refresh} onClick={() => void fetchData()}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard
          icon={<Flame size={18} className="text-orange-500" />}
          label={copy.streak}
          value={`${analysis.streak}${copy.days}`}
          detail={copy.activeInPeriod.replace('{{active}}', String(analysis.activeDays)).replace('{{total}}', String(analysis.periodDays))}
        />
        <StatCard
          icon={<CheckCircle2 size={18} className="text-green-500" />}
          label={copy.completedTasks}
          value={`${analysis.completedTasks}${copy.items}`}
          detail={`${copy.onTimeRate} ${formatPercent(analysis.onTimeRate)} · ${comparisonText(analysis.completedTasks, analysis.previousCompletedTasks, copy)}`}
        />
        <StatCard
          icon={<Target size={18} className="text-blue-500" />}
          label={copy.goalProgress}
          value={`${signedPercent(analysis.goalDelta)}`}
          detail={`${copy.advanced} ${analysis.advancedGoals} ${copy.goals} · ${copy.risk} ${analysis.riskGoals} ${copy.goals}`}
        />
        <StatCard
          icon={<Timer size={18} className="text-pink-500" />}
          label={copy.focusDuration}
          value={formatDuration(analysis.focusSeconds, copy)}
          detail={`${analysis.focusSessions} ${copy.pomodoros} · ${copy.linkedTasks} ${formatPercent(analysis.linkedFocusRate)}`}
        />
      </div>

      <ActivityHeatmap
        dateMap={dateMap}
        selectedYear={selectedYear}
        setSelectedYear={setSelectedYear}
        dropdownOpen={yearDropdownOpen}
        setDropdownOpen={setYearDropdownOpen}
        weekStart={settings.weekStart}
      />

      {view === 'overview' ? (
        <>
          <TodaySchedule entries={todayEntries} />
          <OverviewAnalysis analysis={analysis} periodType={periodType} />
        </>
      ) : (
        <ReviewAnalysis
          analysis={analysis}
          review={review}
          setReview={setReview}
          updatedAt={reviewUpdatedAt}
          saving={saving}
          onSave={saveReview}
          onRegenerate={regenerateReview}
          history={reviewHistory}
          historyFilter={historyFilter}
          setHistoryFilter={setHistoryFilter}
          currentPeriodType={periodType}
          currentPeriodStart={period.start.format('YYYY-MM-DD')}
          currentPeriodLabel={period.label}
          onOpenReport={openReviewReport}
        />
      )}
    </div>
  );
}

function OverviewAnalysis({
  analysis,
  periodType,
}: {
  analysis: ReturnType<typeof buildAnalysis>;
  periodType: ReviewPeriodType;
}) {
  const copy = useOverviewText();
  const taskOption = useMemo(() => ({
    tooltip: { trigger: 'axis' as const },
    legend: { top: 0, right: 0, textStyle: { color: '#64748b', fontSize: 11 } },
    grid: { left: 42, right: 16, top: 42, bottom: 30 },
    xAxis: {
      type: 'category' as const,
      data: analysis.buckets.map((item) => item.label),
      axisLabel: { color: '#64748b', fontSize: 10 },
      axisLine: { lineStyle: { color: '#d7dde8' } },
    },
    yAxis: {
      type: 'value' as const,
      minInterval: 1,
      axisLabel: { color: '#64748b', fontSize: 10 },
      splitLine: { lineStyle: { color: '#e8ecf3' } },
    },
    series: [
      {
        name: copy.dueTasks,
        type: 'bar' as const,
        data: analysis.buckets.map((item) => item.due),
        itemStyle: { color: '#94a3b8', borderRadius: [3, 3, 0, 0] },
      },
      {
        name: copy.completedTasks,
        type: 'bar' as const,
        data: analysis.buckets.map((item) => item.completed),
        itemStyle: { color: '#10b981', borderRadius: [3, 3, 0, 0] },
      },
    ],
  }), [analysis.buckets, copy]);

  const focusOption = useMemo(() => ({
    tooltip: {
      trigger: 'axis' as const,
      formatter: (params: Array<{ axisValue: string; marker: string; seriesName: string; value: number }>) => {
        const title = params[0]?.axisValue ?? '';
        return [
          title,
          ...params.map((item) => {
            const suffix = item.seriesName === copy.focusDuration ? 'h' : '';
            return `${item.marker}${item.seriesName}: ${item.value}${suffix}`;
          }),
        ].join('<br/>');
      },
    },
    legend: { top: 0, right: 0, textStyle: { color: '#64748b', fontSize: 11 } },
    grid: { left: 46, right: 46, top: 42, bottom: 30 },
    xAxis: {
      type: 'category' as const,
      data: analysis.buckets.map((item) => item.label),
      axisLabel: { color: '#64748b', fontSize: 10 },
      axisLine: { lineStyle: { color: '#d7dde8' } },
    },
    yAxis: [
      {
        type: 'value' as const,
        axisLabel: { color: '#64748b', fontSize: 10, formatter: '{value}h' },
        splitLine: { lineStyle: { color: '#e8ecf3' } },
      },
      {
        type: 'value' as const,
        minInterval: 1,
        axisLabel: { color: '#64748b', fontSize: 10 },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: copy.focusDuration,
        type: 'line' as const,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: analysis.buckets.map((item) => Number((item.focusSeconds / 3600).toFixed(2))),
        lineStyle: { color: '#6366f1', width: 2.5 },
        itemStyle: { color: '#6366f1' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(99,102,241,0.22)' },
              { offset: 1, color: 'rgba(99,102,241,0)' },
            ],
          },
        },
      },
      {
        name: copy.completedTasks,
        type: 'line' as const,
        yAxisIndex: 1,
        smooth: true,
        data: analysis.buckets.map((item) => item.completed),
        lineStyle: { color: '#f59e0b', width: 2 },
        itemStyle: { color: '#f59e0b' },
      },
    ],
  }), [analysis.buckets, copy]);

  const taskRef = useEChart(taskOption, [periodType]);
  const focusRef = useEChart(focusOption, [periodType]);

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <SectionTitle icon={<AlertTriangle size={16} />} title={copy.priorityQueue} subtitle={copy.priorityQueueDesc} />
        {analysis.priorityItems.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
            {copy.noPriorityItems}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-2">
            {analysis.priorityItems.map((item) => (
              <PriorityRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="card p-5">
          <SectionTitle icon={<ListChecks size={16} />} title={copy.taskTrend} subtitle={copy.taskTrendDesc} />
          <div ref={taskRef} className="w-full h-[260px]" />
          <div className="grid grid-cols-4 gap-2 border-t border-border pt-3">
            <MiniMetric label={copy.periodCreated} value={analysis.createdTasks} />
            <MiniMetric label={copy.periodDue} value={analysis.dueTasks} />
            <MiniMetric label={copy.overdueNow} value={analysis.overdueTasks} tone={analysis.overdueTasks > 0 ? 'danger' : 'normal'} />
            <MiniMetric label={copy.carryover} value={analysis.carryoverTasks} tone={analysis.carryoverTasks > 0 ? 'warning' : 'normal'} />
          </div>
        </section>

        <section className="card p-5">
          <SectionTitle icon={<Target size={16} />} title={copy.goalProgressTitle} subtitle={copy.goalProgressDesc} />
          <div className="space-y-3 mt-4">
            {analysis.goalAnalysis.length === 0 && <EmptyText>{copy.noActiveGoals}</EmptyText>}
            {analysis.goalAnalysis.slice(0, 6).map((item) => (
              <div key={item.goal.id} className="border-b border-border last:border-0 pb-3 last:pb-0">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${healthClass(item.risk)}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{item.goal.title}</span>
                      <span className={item.delta > 0 ? 'text-success tabular-nums' : 'text-text-muted tabular-nums'}>
                        {signedPercent(item.delta)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <ProgressBar
                        value={item.goal.progress}
                        color={healthColor(item.risk)}
                        className="flex-1"
                      />
                      <span className="text-xs text-text-muted tabular-nums">{formatPercent(item.goal.progress)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 border-t border-border mt-4 pt-3">
            <MiniMetric label={copy.periodAdvanced} value={analysis.advancedGoals} />
            <MiniMetric label={copy.periodStagnant} value={analysis.stagnantGoals} tone={analysis.stagnantGoals > 0 ? 'warning' : 'normal'} />
            <MiniMetric label={copy.riskBehind} value={analysis.riskGoals} tone={analysis.riskGoals > 0 ? 'danger' : 'normal'} />
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="card p-5">
          <SectionTitle icon={<Focus size={16} />} title={copy.focusOutput} subtitle={copy.focusOutputDesc} />
          <div ref={focusRef} className="w-full h-[260px]" />
          <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
            <MiniMetric label={copy.averageSession} value={formatDuration(analysis.averageFocusSeconds, copy)} />
            <MiniMetric label={copy.completedPomodoro} value={analysis.focusSessions} />
            <MiniMetric label={copy.taskLinkRate} value={formatPercent(analysis.linkedFocusRate)} />
          </div>
        </section>

        <section className="card p-5">
          <SectionTitle icon={<CalendarDays size={16} />} title={copy.scheduleExecution} subtitle={copy.scheduleExecutionDesc} />
          <div className="mt-5 space-y-4">
            <div>
              <div className="flex justify-between text-xs text-text-muted mb-2">
                <span>{copy.dueCompletionRate}</span>
                <span>{formatPercent(analysis.dueCompletionRate)}</span>
              </div>
              <ProgressBar value={analysis.dueCompletionRate} color="var(--success)" height={10} />
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-3">
              {analysis.weekdayLoad.map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span>{item.label}</span>
                    <span className="text-text-muted">{copy.items ? `${item.count} ${copy.items}` : item.count}</span>
                  </div>
                  <ProgressBar
                    value={analysis.maxWeekdayLoad > 0 ? item.count / analysis.maxWeekdayLoad : 0}
                    color="var(--primary)"
                    height={6}
                  />
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-4 grid grid-cols-2 gap-3">
              <InsightLine
                icon={<Clock3 size={15} />}
                label={copy.highestLoad}
                value={analysis.busiestDay ? `${analysis.busiestDay.label} · ${analysis.busiestDay.count}` : copy.noSchedule}
              />
              <InsightLine
                icon={<AlertTriangle size={15} />}
                label={copy.needAction}
                value={copy.overdueOrCarryover.replace('{{count}}', String(analysis.overdueTasks + analysis.carryoverTasks))}
                warning={analysis.overdueTasks + analysis.carryoverTasks > 0}
              />
            </div>
          </div>
        </section>
      </div>

      <AutomaticInsights insights={analysis.insights} />
    </div>
  );
}

function TodaySchedule({ entries }: { entries: CalendarEntry[] }) {
  const navigate = useNavigate();
  const copy = useOverviewText();
  const visible = entries
    .slice()
    .sort((a, b) => `${a.time || '99:99'}${a.title}`.localeCompare(`${b.time || '99:99'}${b.title}`))
    .slice(0, 6);
  const title = copy.overview === 'Overview' ? "Today's schedule" : copy.overview === '總覽' ? '今日安排' : '今日安排';
  const empty = copy.overview === 'Overview' ? 'No schedule for today' : copy.overview === '總覽' ? '今日暫無安排' : '今日暂无安排';
  const sourceLabels: Record<CalendarEntry['sourceType'], string> = copy.overview === 'Overview'
    ? {
      task: 'Task',
      manual: 'Schedule',
      meeting: 'Meeting',
      email: 'Meeting',
      holiday: 'Holiday',
      pomodoro_plan: 'Pomodoro plan',
      pomodoro_record: 'Pomodoro',
      goal: 'Goal',
      review: 'Review',
    }
    : copy.overview === '總覽'
      ? {
        task: '任務',
        manual: '日程',
        meeting: '來源會議',
        email: '來源會議',
        holiday: '節假日',
        pomodoro_plan: '番茄計畫',
        pomodoro_record: '番茄記錄',
        goal: '目標',
        review: '復盤',
      }
      : {
        task: '任务',
        manual: '日程',
        meeting: '来源会议',
        email: '来源会议',
        holiday: '节假日',
        pomodoro_plan: '番茄计划',
        pomodoro_record: '番茄记录',
        goal: '目标',
        review: '复盘',
      };
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle icon={<CalendarDays size={16} />} title={title} subtitle={copy.scheduleExecutionDesc} />
        <Button variant="outline" size="sm" onClick={() => navigate('/calendar')}>
          {copy.overview === 'Overview' ? 'Open calendar' : copy.overview === '總覽' ? '打開日曆' : '打开日历'}
        </Button>
      </div>
      {visible.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
          {empty}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-2">
          {visible.map((entry) => (
            <button
              key={`${entry.sourceType}:${entry.id}`}
              className="rounded-lg border border-border bg-surface px-3 py-2.5 text-left shadow-sm transition-colors hover:bg-surface-2"
              onClick={() => navigate(entry.sourceType === 'goal' ? `/goals/${entry.id.startsWith('kr-check:') ? entry.id.split(':')[1] : entry.id}` : '/calendar')}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{entry.title}</div>
                  <div className="mt-1 truncate text-xs text-text-muted">
                    {[entry.time ? `${entry.time}${entry.endTime ? ` - ${entry.endTime}` : ''}` : copy.all || 'All day', entry.boardName, entry.location].filter(Boolean).join(' · ')}
                  </div>
                  {(entry.sourceType === 'meeting' || entry.sourceType === 'email') && (
                    <div className="mt-1 truncate text-[11px] text-text-muted">
                      {copy.overview === 'Overview' ? 'Source ID' : copy.overview === '總覽' ? '來源 ID' : '来源 ID'}: {entry.id}
                    </div>
                  )}
                </div>
                <span className="chip shrink-0">{sourceLabels[entry.sourceType]}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ReviewAnalysis({
  analysis,
  review,
  setReview,
  updatedAt,
  saving,
  onSave,
  onRegenerate,
  history,
  historyFilter,
  setHistoryFilter,
  currentPeriodType,
  currentPeriodStart,
  currentPeriodLabel,
  onOpenReport,
}: {
  analysis: ReturnType<typeof buildAnalysis>;
  review: ReviewDraft;
  setReview: (review: ReviewDraft) => void;
  updatedAt: string | null;
  saving: boolean;
  onSave: () => void;
  onRegenerate: () => void;
  history: ReviewReport[];
  historyFilter: ReviewPeriodType | 'all';
  setHistoryFilter: (filter: ReviewPeriodType | 'all') => void;
  currentPeriodType: ReviewPeriodType;
  currentPeriodStart: string;
  currentPeriodLabel: string;
  onOpenReport: (report: ReviewReport) => void;
}) {
  const copy = useOverviewText();
  const filteredHistory = historyFilter === 'all'
    ? history
    : history.filter((item) => item.periodType === historyFilter);

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle
            icon={<Archive size={16} />}
            title={copy.reviewRecords}
            subtitle={copy.reviewRecordsDesc.replace('{{count}}', String(history.length))}
          />
          <div className="inline-flex flex-wrap rounded-lg border border-border bg-surface p-1">
            <button
              className={`px-3 py-1.5 rounded-md text-xs ${historyFilter === 'all' ? 'bg-surface-2 text-primary font-medium' : 'text-text-muted'}`}
              onClick={() => setHistoryFilter('all')}
            >
              {copy.all}
            </button>
            {PERIOD_VALUES.map((value) => (
              <button
                key={value}
                className={`px-3 py-1.5 rounded-md text-xs ${historyFilter === value ? 'bg-surface-2 text-primary font-medium' : 'text-text-muted'}`}
                onClick={() => setHistoryFilter(value)}
              >
                {periodTypeShortLabel(value, copy)}
              </button>
            ))}
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="h-24 flex items-center justify-center text-sm text-text-muted">
            {copy.noReviewRecords}
          </div>
        ) : (
          <div className="mt-4 border border-border rounded-lg overflow-x-auto">
            <div className="min-w-[820px]">
            <div className="grid grid-cols-[92px_minmax(180px,1fr)_80px_minmax(220px,1.4fr)_142px] bg-surface-2 text-xs text-text-muted">
              <div className="px-3 py-2.5">{copy.period}</div>
              <div className="px-3 py-2.5 border-l border-border">{copy.reviewDate}</div>
              <div className="px-3 py-2.5 border-l border-border">{copy.score}</div>
              <div className="px-3 py-2.5 border-l border-border">{copy.summary}</div>
              <div className="px-3 py-2.5 border-l border-border">{copy.updatedAt}</div>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              {filteredHistory.map((report) => {
                const active = report.periodType === currentPeriodType && report.periodStart === currentPeriodStart;
                return (
                  <button
                    key={report.id}
                    className={`w-full grid grid-cols-[92px_minmax(180px,1fr)_80px_minmax(220px,1.4fr)_142px] text-left text-sm border-t border-border first:border-t-0 transition-colors ${
                      active ? 'bg-primary-soft' : 'hover:bg-surface-2'
                    }`}
                    onClick={() => onOpenReport(report)}
                  >
                    <div className="px-3 py-3">
                      <span className="chip">{periodTypeShortLabel(report.periodType, copy)}</span>
                    </div>
                    <div className="px-3 py-3 border-l border-border font-medium truncate">
                      {reviewPeriodLabel(report, copy)}
                    </div>
                    <div className="px-3 py-3 border-l border-border tabular-nums">
                      {report.score ? copy.scorePoint.replace('{{score}}', String(report.score)) : copy.noScore}
                    </div>
                    <div className="px-3 py-3 border-l border-border text-text-muted truncate">
                      {reviewSummary(report, copy)}
                    </div>
                    <div className="px-3 py-3 border-l border-border text-xs text-text-muted tabular-nums">
                      {dayjs(report.updatedAt).format('YYYY-MM-DD HH:mm')}
                    </div>
                  </button>
                );
              })}
            </div>
            </div>
          </div>
        )}
      </section>

      <AutomaticInsights insights={analysis.insights} />

      <section className="card p-5">
        <SectionTitle
          icon={<BarChart3 size={16} />}
          title={periodReviewTitle(currentPeriodType, copy)}
          subtitle={copy.reviewSubtitle.replace('{{period}}', currentPeriodLabel)}
        />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">
          {[1, 2, 3, 4, 5].map((score) => (
            <button
              key={score}
              className={`h-10 rounded-lg border text-sm font-medium transition-colors ${
                review.score === score ? 'border-primary bg-primary-soft text-primary' : 'border-border hover:bg-surface-2'
              }`}
              onClick={() => setReview({ ...review, score })}
            >
              {copy.reviewScores.replace('{{score}}', String(score))}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          <Textarea
            label={copy.highlights}
            placeholder={copy.highlightsPlaceholder}
            value={review.highlights}
            onChange={(event) => setReview({ ...review, highlights: event.target.value })}
            className="min-h-[120px]"
          />
          <Textarea
            label={copy.blockers}
            placeholder={copy.blockersPlaceholder}
            value={review.blockers}
            onChange={(event) => setReview({ ...review, blockers: event.target.value })}
            className="min-h-[120px]"
          />
          <Textarea
            label={copy.lessons}
            placeholder={copy.lessonsPlaceholder}
            value={review.lessons}
            onChange={(event) => setReview({ ...review, lessons: event.target.value })}
            className="min-h-[120px]"
          />
          <Textarea
            label={copy.nextActions}
            placeholder={copy.nextActionsPlaceholder}
            value={review.nextActions}
            onChange={(event) => setReview({ ...review, nextActions: event.target.value })}
            className="min-h-[120px]"
          />
        </div>
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-text-muted">
            {updatedAt ? copy.lastSaved.replace('{{time}}', dayjs(updatedAt).format('YYYY-MM-DD HH:mm')) : copy.notSaved}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onRegenerate} disabled={saving}>
              <RefreshCw size={15} />
              {copy.regenerateReview}
            </Button>
            <Button onClick={onSave} disabled={saving}>
              <Save size={15} />
              {saving ? copy.savingReview : copy.saveReview}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function AutomaticInsights({ insights }: { insights: { tone: string; text: string }[] }) {
  const copy = useOverviewText();
  return (
    <section className="card p-5">
      <SectionTitle icon={<Lightbulb size={16} />} title={copy.conclusions} subtitle={copy.conclusionsDesc} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mt-4">
        {insights.map((insight, index) => (
          <div key={`${insight.text}-${index}`} className="flex items-start gap-3">
            <span className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${
              insight.tone === 'danger' ? 'bg-danger' : insight.tone === 'success' ? 'bg-success' : 'bg-primary'
            }`} />
            <span className="text-sm leading-6">{insight.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActivityHeatmap({
  dateMap,
  selectedYear,
  setSelectedYear,
  dropdownOpen,
  setDropdownOpen,
  weekStart,
}: {
  dateMap: Map<string, number>;
  selectedYear: number | null;
  setSelectedYear: (year: number | null) => void;
  dropdownOpen: boolean;
  setDropdownOpen: (open: boolean) => void;
  weekStart: 'mon' | 'sun';
}) {
  const copy = useOverviewText();
  const years = useMemo(() => availableYears(dateMap), [dateMap]);
  const cells = useMemo(
    () => selectedYear === null
      ? heatmapCells(DAYS_BACK, weekStart)
      : heatmapCellsForYear(selectedYear, weekStart),
    [selectedYear, weekStart],
  );
  const totalWeeks = useMemo(
    () => cells.length === 0 ? 53 : Math.max(...cells.map((cell) => cell.week)) + 1,
    [cells],
  );
  const activityDays = useMemo(() => {
    const start = selectedYear === null
      ? dayjs().subtract(DAYS_BACK, 'day').format('YYYY-MM-DD')
      : `${selectedYear}-01-01`;
    const end = selectedYear === null ? dayjs().format('YYYY-MM-DD') : `${selectedYear}-12-31`;
    return Array.from(dateMap.entries()).filter(([date, count]) => count > 0 && date >= start && date <= end).length;
  }, [dateMap, selectedYear]);

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold">{copy.activityMap}</div>
          <div className="text-xs text-text-muted mt-0.5">{copy.activityMapDesc}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              className="btn-ghost text-sm flex items-center gap-1 px-2 py-1"
              onClick={() => setDropdownOpen(!dropdownOpen)}
            >
              {selectedYear === null ? copy.recent365 : selectedYear}
              <ChevronDown size={14} />
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1 card py-1 z-20 min-w-[120px] shadow-soft">
                <button
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-2"
                  onClick={() => {
                    setSelectedYear(null);
                    setDropdownOpen(false);
                  }}
                >
                  {copy.recent365}
                </button>
                {years.map((year) => (
                  <button
                    key={year}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-surface-2 ${selectedYear === year ? 'text-primary font-medium' : ''}`}
                    onClick={() => {
                      setSelectedYear(year);
                      setDropdownOpen(false);
                    }}
                  >
                    {year}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="text-xs text-text-muted">{copy.activeDayCount.replace('{{count}}', String(activityDays))}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `repeat(${totalWeeks}, minmax(0, 1fr))` }}>
          {Array.from({ length: totalWeeks }).map((_, week) => (
            <div key={week} className="flex flex-col gap-0.5">
              {Array.from({ length: 7 }).map((__, dow) => {
                const cell = cells.find((item) => item.week === week && item.dow === dow);
                if (!cell) return <div key={dow} className="w-3 h-3" />;
                const count = dateMap.get(cell.date.format('YYYY-MM-DD')) || 0;
                const color = count === 0
                  ? 'var(--heatmap-0)'
                  : count <= 2
                    ? 'var(--heatmap-1)'
                    : count <= 5
                      ? 'var(--heatmap-2)'
                      : count <= 8
                        ? 'var(--heatmap-3)'
                        : 'var(--heatmap-4)';
                return (
                  <div
                    key={dow}
                    className="w-3 h-3 rounded-sm"
                    style={{ background: color }}
                    title={copy.activityCount.replace('{{date}}', cell.date.format('YYYY-MM-DD')).replace('{{count}}', String(count))}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1 text-xs text-text-muted">
        <span>{copy.less}</span>
        {['var(--heatmap-0)', 'var(--heatmap-1)', 'var(--heatmap-2)', 'var(--heatmap-3)', 'var(--heatmap-4)'].map(
          (color) => <span key={color} className="w-3 h-3 rounded-sm" style={{ background: color }} />,
        )}
        <span>{copy.more}</span>
      </div>
    </section>
  );
}

function buildAnalysis(
  tasks: Task[],
  goals: GoalWithDetails[],
  sessions: PomodoroSession[],
  checkIns: CheckInSummary | null,
  allCheckIns: CheckIn[],
  logs: Record<string, ProgressLog[]>,
  period: PeriodRange,
  periodType: ReviewPeriodType,
  copy: typeof overviewCopy[AppSettings['language']],
) {
  const inRange = (value: string | null | undefined, start = period.start, end = period.end) => {
    if (!value) return false;
    const date = dayjs(value);
    return !date.isBefore(start) && !date.isAfter(end);
  };
  const completed = tasks.filter((task) => task.status === 'completed' && inRange(task.completedAt));
  const previousCompleted = tasks.filter(
    (task) => task.status === 'completed' && inRange(task.completedAt, period.previousStart, period.previousEnd),
  );
  const dueTasks = tasks.filter((task) => inRange(task.dueAt));
  const completedDue = dueTasks.filter((task) => task.status === 'completed');
  const onTime = completedDue.filter(
    (task) => task.completedAt && task.dueAt && !dayjs(task.completedAt).isAfter(dayjs(task.dueAt)),
  );
  const overdue = tasks.filter(
    (task) => task.status !== 'completed' && task.status !== 'closed' && task.dueAt && dayjs(task.dueAt).isBefore(dayjs()),
  );
  const carryover = tasks.filter(
    (task) => task.status !== 'completed' && task.status !== 'closed' && task.createdAt && dayjs(task.createdAt).isBefore(period.start),
  );
  const periodSessions = sessions.filter((session) => session.completed && inRange(session.startedAt));
  const focusSeconds = periodSessions.reduce((total, session) => total + Math.max(0, session.durationSeconds), 0);
  const checkDays = new Set(
    allCheckIns
      .filter((item) => inRange(item.date))
      .filter((item) => item.count > 0)
      .map((item) => item.date),
  );
  const goalAnalysis: GoalAnalysis[] = goals
    .filter((goal) => goal.status === 'active')
    .map((goal) => {
      const delta = goal.keyResults.reduce((total, kr) => {
        const krLogs = logs[kr.id] || [];
        const startProgress = keyResultProgressAt(kr, krLogs, period.start);
        const endProgress = keyResultProgressAt(kr, krLogs, period.end);
        return total + (endProgress - startProgress) * (kr.weight / 100);
      }, 0);
      const updated = goal.keyResults.some((kr) => (logs[kr.id] || []).some((log) => inRange(log.createdAt)));
      return {
        goal,
        delta: Math.max(-1, Math.min(1, delta)),
        updated,
        risk: worstHealth(goal),
      };
    })
    .sort((a, b) => b.delta - a.delta);
  const buckets = makeBuckets(period, periodType, copy).map((bucket) => ({
    ...bucket,
    completed: completed.filter((task) => inRange(task.completedAt, bucket.start, bucket.end)).length,
    due: dueTasks.filter((task) => inRange(task.dueAt, bucket.start, bucket.end)).length,
    focusSeconds: periodSessions
      .filter((session) => inRange(session.startedAt, bucket.start, bucket.end))
      .reduce((total, session) => total + session.durationSeconds, 0),
  }));
  const weekdayLabels = copy.overview === 'Overview'
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : copy.overview === '總覽'
      ? ['週一', '週二', '週三', '週四', '週五', '週六', '週日']
      : ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const weekdayLoad = weekdayLabels.map((label, index) => ({
    label,
    count: dueTasks.filter((task) => task.dueAt && dayjs(task.dueAt).isoWeekday() === index + 1).length,
  }));
  const busiestDay = buckets.reduce<(typeof buckets)[number] | null>(
    (best, bucket) => !best || bucket.due > best.due ? bucket : best,
    null,
  );
  const goalDelta = goalAnalysis.reduce((total, item) => total + item.delta, 0) /
    Math.max(1, goalAnalysis.length);
  const onTimeRate = completedDue.length > 0 ? onTime.length / completedDue.length : 0;
  const dueCompletionRate = dueTasks.length > 0 ? completedDue.length / dueTasks.length : 0;
  const linkedFocusRate = periodSessions.length > 0
    ? periodSessions.filter((session) => Boolean(session.taskId)).length / periodSessions.length
    : 0;
  const riskGoals = goalAnalysis.filter((item) => item.risk !== 'normal').length;
  const stagnantGoals = goalAnalysis.filter((item) => !item.updated).length;
  const advancedGoals = goalAnalysis.filter((item) => item.delta > 0.0001).length;
  const priorityItems = buildPriorityItems(tasks, goalAnalysis, period, copy);
  const insights = [
    {
      tone: completed.length >= previousCompleted.length ? 'success' : 'normal',
      text: copy.insightTasks
        .replace('{{completed}}', String(completed.length))
        .replace('{{comparison}}', comparisonText(completed.length, previousCompleted.length, copy))
        .replace('{{rate}}', formatPercent(onTimeRate)),
    },
    {
      tone: overdue.length > 0 ? 'danger' : 'success',
      text: overdue.length > 0
        ? copy.insightOverdue.replace('{{count}}', String(overdue.length))
        : copy.insightNoOverdue,
    },
    {
      tone: stagnantGoals > 0 ? 'danger' : 'success',
      text: stagnantGoals > 0
        ? copy.insightStagnant.replace('{{stagnant}}', String(stagnantGoals)).replace('{{risk}}', String(riskGoals))
        : copy.insightGoalsOk.replace('{{delta}}', signedPercent(goalDelta)),
    },
    {
      tone: focusSeconds > 0 ? 'success' : 'normal',
      text: copy.insightFocus
        .replace('{{sessions}}', String(periodSessions.length))
        .replace('{{duration}}', formatDuration(focusSeconds, copy))
        .replace('{{rate}}', formatPercent(linkedFocusRate)),
    },
  ];

  return {
    streak: checkIns?.streak || 0,
    activeDays: checkDays.size,
    periodDays: rangeDays(period.start.startOf('day'), minDate(period.end, dayjs()).startOf('day')).length,
    completedTasks: completed.length,
    previousCompletedTasks: previousCompleted.length,
    createdTasks: tasks.filter((task) => inRange(task.createdAt)).length,
    dueTasks: dueTasks.length,
    overdueTasks: overdue.length,
    carryoverTasks: carryover.length,
    onTimeRate,
    dueCompletionRate,
    focusSeconds,
    focusSessions: periodSessions.length,
    averageFocusSeconds: periodSessions.length ? Math.round(focusSeconds / periodSessions.length) : 0,
    linkedFocusRate,
    goalDelta,
    goalAnalysis,
    advancedGoals,
    stagnantGoals,
    riskGoals,
    buckets,
    weekdayLoad,
    maxWeekdayLoad: Math.max(0, ...weekdayLoad.map((item) => item.count)),
    busiestDay: busiestDay && busiestDay.due > 0 ? { label: busiestDay.label, count: busiestDay.due } : null,
    priorityItems,
    insights,
  };
}

function buildPriorityItems(
  tasks: Task[],
  goalAnalysis: GoalAnalysis[],
  period: PeriodRange,
  copy: typeof overviewCopy[AppSettings['language']],
): PriorityItem[] {
  const today = dayjs().startOf('day');
  const upcomingEnd = today.add(3, 'day').endOf('day');
  const krCheckEnd = today.add(7, 'day').endOf('day');
  const activeTask = (task: Task) => task.status !== 'completed' && task.status !== 'closed';
  const relativeDue = (value: string) => {
    const due = dayjs(value).startOf('day');
    const diff = due.diff(today, 'day');
    if (diff < 0) return copy.overdueDays.replace('{{days}}', String(Math.abs(diff)));
    if (diff === 0) return copy.dueToday;
    if (diff === 1) return copy.dueTomorrow;
    return copy.dueInDays.replace('{{days}}', String(diff));
  };

  const overdue = tasks
    .filter((task) => activeTask(task) && task.dueAt && dayjs(task.dueAt).isBefore(today))
    .sort((a, b) => dayjs(a.dueAt).valueOf() - dayjs(b.dueAt).valueOf())
    .slice(0, 3)
    .map((task): PriorityItem => ({
      id: `overdue:${task.id}`,
      tone: 'danger',
      kind: copy.priorityOverdue,
      title: task.title,
      detail: relativeDue(task.dueAt!),
      date: task.dueAt,
    }));

  const upcoming = tasks
    .filter((task) => activeTask(task) && task.dueAt && !dayjs(task.dueAt).isBefore(today) && !dayjs(task.dueAt).isAfter(upcomingEnd))
    .sort((a, b) => dayjs(a.dueAt).valueOf() - dayjs(b.dueAt).valueOf())
    .slice(0, 3)
    .map((task): PriorityItem => ({
      id: `upcoming:${task.id}`,
      tone: dayjs(task.dueAt).isSame(today, 'day') ? 'warning' : 'normal',
      kind: copy.priorityUpcoming,
      title: task.title,
      detail: relativeDue(task.dueAt!),
      date: task.dueAt,
    }));

  const goals = goalAnalysis
    .filter((item) => item.risk !== 'normal' || !item.updated)
    .sort((a, b) => {
      const riskRank = (value: GoalAnalysis) => value.risk === 'behind' ? 3 : value.risk === 'risk' ? 2 : 1;
      return riskRank(b) - riskRank(a) || a.delta - b.delta;
    })
    .slice(0, 3)
    .map((item): PriorityItem => ({
      id: `goal:${item.goal.id}`,
      tone: item.risk !== 'normal' ? 'danger' : 'warning',
      kind: copy.priorityGoalRisk,
      title: item.goal.title,
      detail: item.risk !== 'normal' ? copy.riskGoal : copy.stagnantGoal,
      date: item.goal.dueAt,
    }));

  const krChecks = goalAnalysis
    .flatMap((item) => item.goal.keyResults.map((kr) => ({ goal: item.goal, kr })))
    .filter(({ kr }) => kr.checkDate && !dayjs(kr.checkDate).isBefore(today) && !dayjs(kr.checkDate).isAfter(krCheckEnd))
    .sort((a, b) => dayjs(a.kr.checkDate).valueOf() - dayjs(b.kr.checkDate).valueOf())
    .slice(0, 3)
    .map(({ goal, kr }): PriorityItem => ({
      id: `kr:${kr.id}`,
      tone: dayjs(kr.checkDate).isSame(today, 'day') ? 'warning' : 'normal',
      kind: copy.priorityKrCheck,
      title: kr.title,
      detail: goal.title,
      date: kr.checkDate,
    }));

  return [...overdue, ...upcoming, ...goals, ...krChecks].slice(0, 8);
}

function generateAutoReviewDraft(
  analysis: ReturnType<typeof buildAnalysis>,
  copy: typeof overviewCopy[AppSettings['language']],
): ReviewDraft {
  const isEn = copy.overview === 'Overview';
  const isTw = copy.overview === '總覽';
  const focusDuration = formatDuration(analysis.focusSeconds, copy);
  const onTimeRate = formatPercent(analysis.onTimeRate);
  const goalDelta = signedPercent(analysis.goalDelta);
  const linkedFocusRate = formatPercent(analysis.linkedFocusRate);
  const overdueTotal = analysis.overdueTasks + analysis.carryoverTasks;
  const priorityActions = analysis.priorityItems.slice(0, 3).map((item) => `${item.kind}: ${item.title}${item.detail ? ` (${item.detail})` : ''}`);

  const highlights = isEn
    ? [
      `This period closed ${analysis.completedTasks} tasks with an on-time rate of ${onTimeRate}.`,
      `Focus time reached ${focusDuration} across ${analysis.focusSessions} pomodoro sessions, and goal progress moved ${goalDelta}.`,
      analysis.advancedGoals > 0
        ? `${analysis.advancedGoals} goals made visible progress, which is worth carrying into the next period.`
        : 'Goal movement was limited this period, so the next plan should make progress more explicit.',
    ].join('\n')
    : isTw
      ? [
        `本期完成了 ${analysis.completedTasks} 項任務，準時率為 ${onTimeRate}。`,
        `專注投入累計 ${focusDuration}，共完成 ${analysis.focusSessions} 個番茄，目標整體推進 ${goalDelta}。`,
        analysis.advancedGoals > 0
          ? `${analysis.advancedGoals} 個目標有明確進展，這些有效做法值得延續。`
          : '本期目標推進不夠明顯，下個週期需要把關鍵結果拆得更清楚。',
      ].join('\n')
      : [
        `本期完成了 ${analysis.completedTasks} 项任务，准时率为 ${onTimeRate}。`,
        `专注投入累计 ${focusDuration}，共完成 ${analysis.focusSessions} 个番茄，目标整体推进 ${goalDelta}。`,
        analysis.advancedGoals > 0
          ? `${analysis.advancedGoals} 个目标有明确进展，这些有效做法值得延续。`
          : '本期目标推进不够明显，下个周期需要把关键结果拆得更清楚。',
      ].join('\n');

  const blockers = isEn
    ? [
      overdueTotal > 0
        ? `${overdueTotal} tasks are overdue or carried over, so they should be rescheduled before adding more work.`
        : 'There are no overdue tasks right now, and the schedule looks healthy.',
      analysis.stagnantGoals > 0
        ? `${analysis.stagnantGoals} goals did not move this period; ${analysis.riskGoals} goals are already at risk.`
        : 'Active goals all had updates this period.',
    ].join('\n')
    : isTw
      ? [
        overdueTotal > 0
          ? `目前有 ${overdueTotal} 項任務逾期或跨期遺留，應先重新安排，再增加新的任務。`
          : '目前沒有逾期任務，日程執行狀態良好。',
        analysis.stagnantGoals > 0
          ? `${analysis.stagnantGoals} 個目標本期沒有推進，其中 ${analysis.riskGoals} 個已經處於風險狀態。`
          : '進行中的目標本期都有更新。',
      ].join('\n')
      : [
        overdueTotal > 0
          ? `目前有 ${overdueTotal} 项任务逾期或跨期遗留，应先重新安排，再增加新的任务。`
          : '目前没有逾期任务，日程执行状态良好。',
        analysis.stagnantGoals > 0
          ? `${analysis.stagnantGoals} 个目标本期没有推进，其中 ${analysis.riskGoals} 个已经处于风险状态。`
          : '进行中的目标本期都有更新。',
      ].join('\n');

  const lessons = isEn
    ? [
      analysis.insights[0]?.text || 'The current data is still light, so keep reviewing after each period to build a clearer pattern.',
      analysis.focusSessions > 0
        ? `The focus-to-task link rate is ${linkedFocusRate}; linking sessions to concrete tasks will make future reviews more useful.`
        : 'No focus sessions were recorded in this period, so focus data cannot explain output yet.',
    ].join('\n')
    : isTw
      ? [
        analysis.insights[0]?.text || '目前資料還偏少，建議持續復盤，讓規律逐步變清楚。',
        analysis.focusSessions > 0
          ? `專注任務關聯率為 ${linkedFocusRate}；把番茄記錄關聯到具體任務，後續復盤會更有價值。`
          : '本期沒有記錄番茄專注，因此暫時無法用專注資料解釋產出。',
      ].join('\n')
      : [
        analysis.insights[0]?.text || '目前数据还偏少，建议持续复盘，让规律逐步变清楚。',
        analysis.focusSessions > 0
          ? `专注任务关联率为 ${linkedFocusRate}；把番茄记录关联到具体任务，后续复盘会更有价值。`
          : '本期没有记录番茄专注，因此暂时无法用专注数据解释产出。',
      ].join('\n');

  const nextActions = isEn
    ? [
      overdueTotal > 0
        ? `First clear or reschedule the ${overdueTotal} overdue or carried-over tasks.`
        : 'Keep the current schedule rhythm and avoid overloading the next period.',
      ...priorityActions,
      analysis.stagnantGoals > 0
        ? 'Pick one stagnant goal and define the next measurable key-result update.'
        : 'Choose one goal that can create the strongest momentum next.',
      analysis.focusSessions > 0 && analysis.linkedFocusRate < 0.8
        ? 'Before starting a pomodoro, link it to a task so the output trail stays clear.'
        : 'Keep review notes short, specific, and tied to actions that can be checked next period.',
    ].join('\n')
    : isTw
      ? [
        overdueTotal > 0
          ? `先清理或重新安排 ${overdueTotal} 項逾期/遺留任務。`
          : '延續目前的排期節奏，避免下個週期一次塞入過多任務。',
        ...priorityActions,
        analysis.stagnantGoals > 0
          ? '選一個停滯目標，明確下一個可衡量的關鍵結果更新。'
          : '選一個最能帶動節奏的目標作為下期優先項。',
        analysis.focusSessions > 0 && analysis.linkedFocusRate < 0.8
          ? '每次開始番茄前先關聯任務，讓專注投入和產出能對得上。'
          : '復盤結論保持短、具體，並落到下期可檢查的行動上。',
      ].join('\n')
      : [
        overdueTotal > 0
          ? `先清理或重新安排 ${overdueTotal} 项逾期/遗留任务。`
          : '延续目前的排期节奏，避免下个周期一次塞入过多任务。',
        ...priorityActions,
        analysis.stagnantGoals > 0
          ? '选一个停滞目标，明确下一个可衡量的关键结果更新。'
          : '选一个最能带动节奏的目标作为下期优先项。',
        analysis.focusSessions > 0 && analysis.linkedFocusRate < 0.8
          ? '每次开始番茄前先关联任务，让专注投入和产出能对得上。'
          : '复盘结论保持短、具体，并落到下期可检查的行动上。',
      ].join('\n');

  return {
    highlights,
    blockers,
    lessons,
    nextActions,
    score: null,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

function getPeriodRange(
  anchor: dayjs.Dayjs,
  type: ReviewPeriodType,
  weekStart: 'mon' | 'sun',
  copy: typeof overviewCopy[AppSettings['language']],
): PeriodRange {
  let start: dayjs.Dayjs;
  let end: dayjs.Dayjs;
  let previousStart: dayjs.Dayjs;
  let previousEnd: dayjs.Dayjs;
  let label: string;

  if (type === 'day') {
    start = anchor.startOf('day');
    end = anchor.endOf('day');
    previousStart = start.subtract(1, 'day');
    previousEnd = end.subtract(1, 'day');
    label = copy.overview === 'Overview' ? anchor.format('MMM D, YYYY') : anchor.format('YYYY年M月D日');
  } else if (type === 'week') {
    start = startOfWeek(anchor, weekStart);
    end = start.add(6, 'day').endOf('day');
    previousStart = start.subtract(1, 'week');
    previousEnd = end.subtract(1, 'week');
    label = copy.overview === 'Overview'
      ? `${start.format('MMM D, YYYY')} - ${end.format('MMM D')}`
      : `${start.format('YYYY年M月D日')} - ${end.format('M月D日')}`;
  } else if (type === 'month') {
    start = anchor.startOf('month');
    end = anchor.endOf('month');
    previousStart = start.subtract(1, 'month').startOf('month');
    previousEnd = previousStart.endOf('month');
    label = copy.overview === 'Overview' ? anchor.format('MMMM YYYY') : anchor.format('YYYY年M月');
  } else if (type === 'quarter') {
    const quarter = Math.floor(anchor.month() / 3);
    start = anchor.month(quarter * 3).startOf('month');
    end = start.add(2, 'month').endOf('month');
    previousStart = start.subtract(3, 'month');
    previousEnd = previousStart.add(2, 'month').endOf('month');
    label = copy.overview === 'Overview' ? `Q${quarter + 1} ${start.year()}` : `${start.year()}年第${quarter + 1}季度`;
  } else {
    start = anchor.startOf('year');
    end = anchor.endOf('year');
    previousStart = start.subtract(1, 'year');
    previousEnd = previousStart.endOf('year');
    label = copy.overview === 'Overview' ? anchor.format('YYYY') : anchor.format('YYYY年');
  }
  return { start, end, previousStart, previousEnd, label };
}

function makeBuckets(period: PeriodRange, type: ReviewPeriodType, copy: typeof overviewCopy[AppSettings['language']]) {
  if (type === 'day') {
    return Array.from({ length: 6 }).map((_, index) => {
      const start = period.start.add(index * 4, 'hour');
      return { start, end: start.add(4, 'hour').subtract(1, 'millisecond'), label: `${index * 4}:00` };
    });
  }
  if (type === 'week' || type === 'month') {
    return rangeDays(period.start, period.end).map((date) => ({
      start: date.startOf('day'),
      end: date.endOf('day'),
      label: type === 'week' ? date.format('ddd') : date.format('M/D'),
    }));
  }
  if (type === 'quarter') {
    const buckets = [];
    let cursor = period.start;
    while (cursor.isBefore(period.end)) {
      const end = minDate(cursor.add(6, 'day').endOf('day'), period.end);
      buckets.push({ start: cursor, end, label: cursor.format('M/D') });
      cursor = cursor.add(7, 'day');
    }
    return buckets;
  }
  return Array.from({ length: 12 }).map((_, index) => {
    const start = period.start.month(index).startOf('month');
    return { start, end: start.endOf('month'), label: copy.overview === 'Overview' ? start.format('MMM') : `${index + 1}月` };
  });
}

function keyResultProgressAt(
  kr: GoalWithDetails['keyResults'][number],
  logs: ProgressLog[],
  at: dayjs.Dayjs,
) {
  let value = kr.currentValue;
  logs
    .filter((log) => dayjs(log.createdAt).isAfter(at))
    .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf())
    .forEach((log) => {
      value = log.oldValue;
    });
  const span = kr.targetValue - kr.startValue;
  if (span === 0) return kr.isCompleted ? 1 : 0;
  return Math.max(0, Math.min(1, (value - kr.startValue) / span));
}

function flattenGoals(goals: GoalWithDetails[]): GoalWithDetails[] {
  return goals.flatMap((goal) => [goal, ...flattenGoals(goal.subGoals || [])]);
}

function worstHealth(goal: GoalWithDetails): 'normal' | 'risk' | 'behind' {
  if (goal.keyResults.some((kr) => kr.healthStatus === 'behind')) return 'behind';
  if (goal.keyResults.some((kr) => kr.healthStatus === 'risk')) return 'risk';
  return 'normal';
}

function StatCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="card p-4 flex items-center gap-3 min-h-[88px]">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-surface-2">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-text-muted">{label}</div>
        <div className="text-xl font-semibold leading-7 tabular-nums">{value}</div>
        <div className="text-[11px] text-text-muted truncate">{detail}</div>
      </div>
    </div>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-primary mt-0.5">{icon}</span>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  tone = 'normal',
}: {
  label: string;
  value: ReactNode;
  tone?: 'normal' | 'warning' | 'danger';
}) {
  return (
    <div>
      <div className="text-[11px] text-text-muted">{label}</div>
      <div className={`text-sm font-semibold mt-0.5 ${
        tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : ''
      }`}>
        {value}
      </div>
    </div>
  );
}

function InsightLine({
  icon,
  label,
  value,
  warning,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={warning ? 'text-warning' : 'text-primary'}>{icon}</span>
      <div>
        <div className="text-[11px] text-text-muted">{label}</div>
        <div className="text-sm font-medium mt-0.5">{value}</div>
      </div>
    </div>
  );
}

function PriorityRow({ item }: { item: PriorityItem }) {
  const toneClass = item.tone === 'danger'
    ? 'border-danger/30 bg-danger/5 text-danger'
    : item.tone === 'warning'
      ? 'border-warning/30 bg-warning/5 text-warning'
      : 'border-border bg-surface text-primary';
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold">{item.kind}</div>
          <div className="mt-0.5 truncate text-sm font-medium text-text">{item.title}</div>
          <div className="mt-0.5 truncate text-xs text-text-muted">{item.detail}</div>
        </div>
        {item.date && <span className="shrink-0 text-xs tabular-nums text-text-muted">{dayjs(item.date).format('MM-DD')}</span>}
      </div>
    </div>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return <div className="h-[180px] flex items-center justify-center text-sm text-text-muted">{children}</div>;
}

function formatDuration(seconds: number, copy: typeof overviewCopy[AppSettings['language']]) {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours > 0 && minutes > 0) return copy.hoursMinutes.replace('{{hours}}', String(hours)).replace('{{minutes}}', String(minutes));
  if (hours > 0) return copy.hoursOnly.replace('{{hours}}', String(hours));
  return copy.minutes.replace('{{minutes}}', String(minutes));
}

function periodTypeShortLabel(type: ReviewPeriodType, copy: typeof overviewCopy[AppSettings['language']]) {
  return copy.reviewType[type];
}

function periodReviewTitle(type: ReviewPeriodType, copy: typeof overviewCopy[AppSettings['language']]) {
  return copy.reviewType[type];
}

function reviewPeriodLabel(report: ReviewReport, copy: typeof overviewCopy[AppSettings['language']]) {
  const start = dayjs(report.periodStart);
  const end = dayjs(report.periodEnd);
  if (copy.overview === 'Overview') {
    if (report.periodType === 'day') return start.format('MMM D, YYYY');
    if (report.periodType === 'week') return `${start.format('MMM D, YYYY')} - ${end.format('MMM D')}`;
    if (report.periodType === 'month') return start.format('MMMM YYYY');
    if (report.periodType === 'quarter') return `Q${Math.floor(start.month() / 3) + 1} ${start.year()}`;
    return start.format('YYYY');
  }
  const quarterWord = copy.overview === '總覽' ? '季度' : '季度';
  if (report.periodType === 'day') return start.format('YYYY年M月D日');
  if (report.periodType === 'week') return `${start.format('YYYY年M月D日')} - ${end.format('M月D日')}`;
  if (report.periodType === 'month') return start.format('YYYY年M月');
  if (report.periodType === 'quarter') return `${start.year()}年第${Math.floor(start.month() / 3) + 1}${quarterWord}`;
  return start.format('YYYY年');
}

function reviewSummary(report: ReviewReport, copy: typeof overviewCopy[AppSettings['language']]) {
  return [
    report.highlights,
    report.blockers,
    report.lessons,
    report.nextActions,
  ].map((item) => item.trim()).find(Boolean) || copy.savedReviewEmpty;
}

function formatPercent(value: number) {
  return `${(Math.max(0, value) * 100).toFixed(1)}%`;
}

function signedPercent(value: number) {
  const percentage = value * 100;
  return `${percentage > 0 ? '+' : ''}${percentage.toFixed(2)}%`;
}

function comparisonText(current: number, previous: number, copy: typeof overviewCopy[AppSettings['language']]) {
  if (previous === 0) return current > 0 ? copy.compareNew : copy.compareFlat;
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 0.05) return copy.compareFlat;
  return copy.compareChange
    .replace('{{direction}}', change > 0 ? copy.increase : copy.decrease)
    .replace('{{percent}}', Math.abs(change).toFixed(0));
}

function healthClass(health: GoalAnalysis['risk']) {
  return health === 'behind' ? 'bg-danger' : health === 'risk' ? 'bg-warning' : 'bg-success';
}

function healthColor(health: GoalAnalysis['risk']) {
  return health === 'behind' ? 'var(--danger)' : health === 'risk' ? 'var(--warning)' : 'var(--success)';
}

function minDate(left: dayjs.Dayjs, right: dayjs.Dayjs) {
  return left.isBefore(right) ? left : right;
}
