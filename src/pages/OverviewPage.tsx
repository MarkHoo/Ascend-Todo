import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import {
  AlertTriangle,
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
  Task,
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
const PERIODS: { value: ReviewPeriodType; label: string }[] = [
  { value: 'day', label: '按天' },
  { value: 'week', label: '按周' },
  { value: 'month', label: '按月' },
  { value: 'quarter', label: '按季度' },
  { value: 'year', label: '按年' },
];

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
  const [view, setView] = useState<'overview' | 'review'>('overview');
  const [periodType, setPeriodType] = useState<ReviewPeriodType>('week');
  const [anchor, setAnchor] = useState(() => dayjs());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<GoalWithDetails[]>([]);
  const [sessions, setSessions] = useState<PomodoroSession[]>([]);
  const [checkInSummary, setCheckInSummary] = useState<CheckInSummary | null>(null);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [dateMap, setDateMap] = useState<Map<string, number>>(new Map());
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);
  const [goalLogs, setGoalLogs] = useState<Record<string, ProgressLog[]>>({});
  const [review, setReview] = useState<ReviewDraft>(EMPTY_REVIEW);
  const [reviewUpdatedAt, setReviewUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const period = useMemo(
    () => getPeriodRange(anchor, periodType, settings.weekStart),
    [anchor, periodType, settings.weekStart],
  );
  const quote = useMemo(
    () => quoteForToday(settings.language),
    [settings.language],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [allTasks, goalTree, allSessions, checks, allCheckIns, activityPomodoros] = await Promise.all([
        tasksApi.listAll(),
        goalsApi.list(),
        pomodoroApi.list(100000),
        checkInsApi.summary(),
        checkInsApi.list(),
        pomodoroApi.stats(730),
      ]);
      const flatGoals = flattenGoals(goalTree).filter((goal) => !goal.deletedAt && goal.status !== 'draft');
      const krIds = flatGoals.flatMap((goal) => goal.keyResults.map((kr) => kr.id));
      const histories = await Promise.all(
        krIds.map(async (id) => [id, await keyResultsApi.history(id, 1000)] as const),
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
      setCheckInSummary(checks);
      setCheckIns(allCheckIns);
      setGoalLogs(nextLogs);
      setDateMap(activity);
    } catch (error) {
      toast.error(`总览数据加载失败：${String(error)}`);
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

  const analysis = useMemo(
    () => buildAnalysis(tasks, goals, sessions, checkInSummary, checkIns, goalLogs, period, periodType),
    [tasks, goals, sessions, checkInSummary, checkIns, goalLogs, period, periodType],
  );

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
      toast.success('本期复盘已保存');
    } catch (error) {
      toast.error(`复盘保存失败：${String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const shiftPeriod = (amount: number) => {
    const unit = periodType === 'quarter' ? 'month' : periodType;
    const step = periodType === 'quarter' ? amount * 3 : amount;
    setAnchor((current) => current.add(step, unit));
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      {settings.motivationalQuotes && (
        <section className="card p-6 bg-gradient-to-br from-primary-soft to-surface">
          <div className="text-xs text-text-muted">今日一句</div>
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
            总览
          </button>
          <button
            className={`px-4 py-1.5 rounded-md text-sm font-medium ${view === 'review' ? 'bg-primary text-white' : 'text-text-muted'}`}
            onClick={() => setView('review')}
          >
            复盘分析
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-surface p-1">
            {PERIODS.map((item) => (
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
          <button className="btn-ghost p-2" title="上一周期" onClick={() => shiftPeriod(-1)}>
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[170px] text-center text-sm font-semibold">{period.label}</span>
          <button
            className="btn-ghost p-2"
            title="下一周期"
            disabled={period.end.isAfter(dayjs(), 'day')}
            onClick={() => shiftPeriod(1)}
          >
            <ChevronRight size={16} />
          </button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(dayjs())}>回到本期</Button>
          <button className="btn-ghost p-2" title="刷新数据" onClick={() => void fetchData()}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard
          icon={<Flame size={18} className="text-orange-500" />}
          label="连续打卡"
          value={`${analysis.streak}天`}
          detail={`本期活跃 ${analysis.activeDays}/${analysis.periodDays} 天`}
        />
        <StatCard
          icon={<CheckCircle2 size={18} className="text-green-500" />}
          label="完成任务"
          value={`${analysis.completedTasks}项`}
          detail={`按时率 ${formatPercent(analysis.onTimeRate)} · ${comparisonText(analysis.completedTasks, analysis.previousCompletedTasks)}`}
        />
        <StatCard
          icon={<Target size={18} className="text-blue-500" />}
          label="目标推进"
          value={`${signedPercent(analysis.goalDelta)}`}
          detail={`推进 ${analysis.advancedGoals} 个 · 风险 ${analysis.riskGoals} 个`}
        />
        <StatCard
          icon={<Timer size={18} className="text-pink-500" />}
          label="专注时长"
          value={formatDuration(analysis.focusSeconds)}
          detail={`${analysis.focusSessions} 个番茄 · 关联任务 ${formatPercent(analysis.linkedFocusRate)}`}
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
        <OverviewAnalysis analysis={analysis} periodType={periodType} />
      ) : (
        <ReviewAnalysis
          analysis={analysis}
          review={review}
          setReview={setReview}
          updatedAt={reviewUpdatedAt}
          saving={saving}
          onSave={saveReview}
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
        name: '到期任务',
        type: 'bar' as const,
        data: analysis.buckets.map((item) => item.due),
        itemStyle: { color: '#94a3b8', borderRadius: [3, 3, 0, 0] },
      },
      {
        name: '完成任务',
        type: 'bar' as const,
        data: analysis.buckets.map((item) => item.completed),
        itemStyle: { color: '#10b981', borderRadius: [3, 3, 0, 0] },
      },
    ],
  }), [analysis.buckets]);

  const focusOption = useMemo(() => ({
    tooltip: { trigger: 'axis' as const },
    legend: { top: 0, right: 0, textStyle: { color: '#64748b', fontSize: 11 } },
    grid: { left: 42, right: 42, top: 42, bottom: 30 },
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
        name: '专注时长',
        type: 'bar' as const,
        data: analysis.buckets.map((item) => Number((item.focusSeconds / 3600).toFixed(2))),
        itemStyle: { color: '#6366f1', borderRadius: [3, 3, 0, 0] },
      },
      {
        name: '完成任务',
        type: 'line' as const,
        yAxisIndex: 1,
        smooth: true,
        data: analysis.buckets.map((item) => item.completed),
        lineStyle: { color: '#f59e0b', width: 2 },
        itemStyle: { color: '#f59e0b' },
      },
    ],
  }), [analysis.buckets]);

  const taskRef = useEChart(taskOption, [periodType]);
  const focusRef = useEChart(focusOption, [periodType]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="card p-5">
          <SectionTitle icon={<ListChecks size={16} />} title="任务执行趋势" subtitle="到期计划与实际完成情况" />
          <div ref={taskRef} className="w-full h-[260px]" />
          <div className="grid grid-cols-4 gap-2 border-t border-border pt-3">
            <MiniMetric label="本期新增" value={analysis.createdTasks} />
            <MiniMetric label="本期到期" value={analysis.dueTasks} />
            <MiniMetric label="当前逾期" value={analysis.overdueTasks} tone={analysis.overdueTasks > 0 ? 'danger' : 'normal'} />
            <MiniMetric label="跨期遗留" value={analysis.carryoverTasks} tone={analysis.carryoverTasks > 0 ? 'warning' : 'normal'} />
          </div>
        </section>

        <section className="card p-5">
          <SectionTitle icon={<Target size={16} />} title="目标推进情况" subtitle="按本期关键结果加权进度变化排序" />
          <div className="space-y-3 mt-4">
            {analysis.goalAnalysis.length === 0 && <EmptyText>暂无进行中的目标</EmptyText>}
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
            <MiniMetric label="本期推进" value={analysis.advancedGoals} />
            <MiniMetric label="本期未更新" value={analysis.stagnantGoals} tone={analysis.stagnantGoals > 0 ? 'warning' : 'normal'} />
            <MiniMetric label="风险/失控" value={analysis.riskGoals} tone={analysis.riskGoals > 0 ? 'danger' : 'normal'} />
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="card p-5">
          <SectionTitle icon={<Focus size={16} />} title="专注与产出" subtitle="专注投入与任务完成趋势，仅表示关联而非因果" />
          <div ref={focusRef} className="w-full h-[260px]" />
          <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
            <MiniMetric label="平均每次" value={formatDuration(analysis.averageFocusSeconds)} />
            <MiniMetric label="完成番茄" value={analysis.focusSessions} />
            <MiniMetric label="任务关联率" value={formatPercent(analysis.linkedFocusRate)} />
          </div>
        </section>

        <section className="card p-5">
          <SectionTitle icon={<CalendarDays size={16} />} title="日程执行" subtitle="基于任务开始时间与截至时间分析" />
          <div className="mt-5 space-y-4">
            <div>
              <div className="flex justify-between text-xs text-text-muted mb-2">
                <span>到期任务完成率</span>
                <span>{formatPercent(analysis.dueCompletionRate)}</span>
              </div>
              <ProgressBar value={analysis.dueCompletionRate} color="var(--success)" height={10} />
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-3">
              {analysis.weekdayLoad.map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span>{item.label}</span>
                    <span className="text-text-muted">{item.count} 项</span>
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
                label="负载最高"
                value={analysis.busiestDay ? `${analysis.busiestDay.label} · ${analysis.busiestDay.count} 项` : '暂无安排'}
              />
              <InsightLine
                icon={<AlertTriangle size={15} />}
                label="需要处理"
                value={`${analysis.overdueTasks + analysis.carryoverTasks} 项逾期或遗留`}
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

function ReviewAnalysis({
  analysis,
  review,
  setReview,
  updatedAt,
  saving,
  onSave,
}: {
  analysis: ReturnType<typeof buildAnalysis>;
  review: ReviewDraft;
  setReview: (review: ReviewDraft) => void;
  updatedAt: string | null;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4">
      <AutomaticInsights insights={analysis.insights} />

      <section className="card p-5">
        <SectionTitle icon={<BarChart3 size={16} />} title="本期复盘" subtitle="将数据结论转化为下一周期可执行的行动" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">
          {[1, 2, 3, 4, 5].map((score) => (
            <button
              key={score}
              className={`h-10 rounded-lg border text-sm font-medium transition-colors ${
                review.score === score ? 'border-primary bg-primary-soft text-primary' : 'border-border hover:bg-surface-2'
              }`}
              onClick={() => setReview({ ...review, score })}
            >
              {score} 分
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          <Textarea
            label="本期成果"
            placeholder="完成了什么，哪些结果值得保留？"
            value={review.highlights}
            onChange={(event) => setReview({ ...review, highlights: event.target.value })}
            className="min-h-[120px]"
          />
          <Textarea
            label="问题与阻碍"
            placeholder="哪些任务逾期，哪些目标停滞，原因是什么？"
            value={review.blockers}
            onChange={(event) => setReview({ ...review, blockers: event.target.value })}
            className="min-h-[120px]"
          />
          <Textarea
            label="经验与规律"
            placeholder="哪些安排有效，专注时间与产出有什么规律？"
            value={review.lessons}
            onChange={(event) => setReview({ ...review, lessons: event.target.value })}
            className="min-h-[120px]"
          />
          <Textarea
            label="下期行动"
            placeholder="下一周期最重要的三件事和具体行动。"
            value={review.nextActions}
            onChange={(event) => setReview({ ...review, nextActions: event.target.value })}
            className="min-h-[120px]"
          />
        </div>
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-text-muted">
            {updatedAt ? `上次保存：${dayjs(updatedAt).format('YYYY-MM-DD HH:mm')}` : '本周期尚未保存复盘'}
          </span>
          <Button onClick={onSave} disabled={saving}>
            <Save size={15} />
            {saving ? '保存中' : '保存复盘'}
          </Button>
        </div>
      </section>
    </div>
  );
}

function AutomaticInsights({ insights }: { insights: { tone: string; text: string }[] }) {
  return (
    <section className="card p-5">
      <SectionTitle icon={<Lightbulb size={16} />} title="本期结论" subtitle="根据当前任务、目标、日程和专注记录自动生成" />
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
          <div className="text-sm font-semibold">活动图</div>
          <div className="text-xs text-text-muted mt-0.5">完成任务和番茄专注形成的活动记录</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              className="btn-ghost text-sm flex items-center gap-1 px-2 py-1"
              onClick={() => setDropdownOpen(!dropdownOpen)}
            >
              {selectedYear === null ? '最近 365 天' : selectedYear}
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
                  最近 365 天
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
          <span className="text-xs text-text-muted">{activityDays} 个活跃日</span>
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
                    title={`${cell.date.format('YYYY-MM-DD')} · ${count} 次活动`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1 text-xs text-text-muted">
        <span>少</span>
        {['var(--heatmap-0)', 'var(--heatmap-1)', 'var(--heatmap-2)', 'var(--heatmap-3)', 'var(--heatmap-4)'].map(
          (color) => <span key={color} className="w-3 h-3 rounded-sm" style={{ background: color }} />,
        )}
        <span>多</span>
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
  const buckets = makeBuckets(period, periodType).map((bucket) => ({
    ...bucket,
    completed: completed.filter((task) => inRange(task.completedAt, bucket.start, bucket.end)).length,
    due: dueTasks.filter((task) => inRange(task.dueAt, bucket.start, bucket.end)).length,
    focusSeconds: periodSessions
      .filter((session) => inRange(session.startedAt, bucket.start, bucket.end))
      .reduce((total, session) => total + session.durationSeconds, 0),
  }));
  const weekdayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
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
  const insights = [
    {
      tone: completed.length >= previousCompleted.length ? 'success' : 'normal',
      text: `本期完成 ${completed.length} 项任务，${comparisonText(completed.length, previousCompleted.length)}，到期任务按时率为 ${formatPercent(onTimeRate)}。`,
    },
    {
      tone: overdue.length > 0 ? 'danger' : 'success',
      text: overdue.length > 0
        ? `当前有 ${overdue.length} 项任务已经逾期，建议优先处理或重新安排截至时间。`
        : '当前没有逾期任务，日程执行状态良好。',
    },
    {
      tone: stagnantGoals > 0 ? 'danger' : 'success',
      text: stagnantGoals > 0
        ? `${stagnantGoals} 个进行中目标本期没有关键结果更新，${riskGoals} 个目标处于有风险或失控状态。`
        : `所有进行中目标本期均有更新，整体加权推进 ${signedPercent(goalDelta)}。`,
    },
    {
      tone: focusSeconds > 0 ? 'success' : 'normal',
      text: `本期完成 ${periodSessions.length} 次专注，共 ${formatDuration(focusSeconds)}，其中 ${formatPercent(linkedFocusRate)} 已关联到具体任务。`,
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
    insights,
  };
}

function getPeriodRange(anchor: dayjs.Dayjs, type: ReviewPeriodType, weekStart: 'mon' | 'sun'): PeriodRange {
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
    label = anchor.format('YYYY年M月D日');
  } else if (type === 'week') {
    start = startOfWeek(anchor, weekStart);
    end = start.add(6, 'day').endOf('day');
    previousStart = start.subtract(1, 'week');
    previousEnd = end.subtract(1, 'week');
    label = `${start.format('YYYY年M月D日')} - ${end.format('M月D日')}`;
  } else if (type === 'month') {
    start = anchor.startOf('month');
    end = anchor.endOf('month');
    previousStart = start.subtract(1, 'month').startOf('month');
    previousEnd = previousStart.endOf('month');
    label = anchor.format('YYYY年M月');
  } else if (type === 'quarter') {
    const quarter = Math.floor(anchor.month() / 3);
    start = anchor.month(quarter * 3).startOf('month');
    end = start.add(2, 'month').endOf('month');
    previousStart = start.subtract(3, 'month');
    previousEnd = previousStart.add(2, 'month').endOf('month');
    label = `${start.year()}年第${quarter + 1}季度`;
  } else {
    start = anchor.startOf('year');
    end = anchor.endOf('year');
    previousStart = start.subtract(1, 'year');
    previousEnd = previousStart.endOf('year');
    label = anchor.format('YYYY年');
  }
  return { start, end, previousStart, previousEnd, label };
}

function makeBuckets(period: PeriodRange, type: ReviewPeriodType) {
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
    return { start, end: start.endOf('month'), label: `${index + 1}月` };
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

function EmptyText({ children }: { children: ReactNode }) {
  return <div className="h-[180px] flex items-center justify-center text-sm text-text-muted">{children}</div>;
}

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours > 0) return `${hours}小时${minutes > 0 ? `${minutes}分` : ''}`;
  return `${minutes}分钟`;
}

function formatPercent(value: number) {
  return `${(Math.max(0, value) * 100).toFixed(1)}%`;
}

function signedPercent(value: number) {
  const percentage = value * 100;
  return `${percentage > 0 ? '+' : ''}${percentage.toFixed(2)}%`;
}

function comparisonText(current: number, previous: number) {
  if (previous === 0) return current > 0 ? '较上期新增' : '与上期持平';
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 0.05) return '与上期持平';
  return `较上期${change > 0 ? '增加' : '减少'} ${Math.abs(change).toFixed(0)}%`;
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
