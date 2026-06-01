import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Flame, CheckCircle2, Target, Timer, TrendingUp, Calendar as CalIcon, ChevronDown } from 'lucide-react';
import { pomodoroApi, goalsApi, tasksApi } from '@/api';
import { useSettingsStore } from '@/store/useSettingsStore';
import { dayjs, heatmapCells, heatmapCellsForYear, availableYears, startOfWeek } from '@/utils/date';
import { quoteForToday } from '@/utils/quotes';
import { ProgressBar } from '@/components/common/ProgressBar';
import { useEChart } from '@/hooks/useEChart';
import type { DailyPomodoroCount, GoalWithMilestones } from '@/types';

const DAYS_BACK = 365;

export function OverviewPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const settings = useSettingsStore((s) => s.settings);
  const [pomoStats, setPomoStats] = useState<{ total: number; today: number; last7: DailyPomodoroCount[] } | null>(null);
  const [goals, setGoals] = useState<GoalWithMilestones[]>([]);
  const [weekDone, setWeekDone] = useState(0);
  const [streak, setStreak] = useState(0);
  const [dateMap, setDateMap] = useState<Map<string, number>>(new Map());
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);

  const fetchData = useCallback(async () => {
    const [p, g, allTasks] = await Promise.all([
      pomodoroApi.stats(730),
      goalsApi.list(),
      tasksApi.listAll(),
    ]);
    setPomoStats({
      total: p.totalSessions,
      today: p.byDay.length ? p.byDay[p.byDay.length - 1].count : 0,
      last7: p.byDay.slice(-7),
    });
    setGoals(g);
    const start = dayjs().startOf('week');
    const done = allTasks.filter((x) => x.isCompleted && x.completedAt && dayjs(x.completedAt).isAfter(start)).length;
    setWeekDone(done);

    const activityMap = new Map<string, number>();
    for (const task of allTasks) {
      if (task.isCompleted && task.completedAt) {
        const d = dayjs(task.completedAt).format('YYYY-MM-DD');
        activityMap.set(d, (activityMap.get(d) || 0) + 1);
      }
    }
    for (const pd of p.byDay) {
      activityMap.set(pd.date, (activityMap.get(pd.date) || 0) + pd.count);
    }
    setDateMap(activityMap);

    let s = 0;
    const today = dayjs().startOf('day');
    for (let i = 0; i < 730; i++) {
      const d = today.subtract(i, 'day').format('YYYY-MM-DD');
      if ((activityMap.get(d) || 0) > 0) {
        s++;
      } else if (i > 0) {
        break;
      }
    }
    setStreak(s);
  }, []);

  // Refetch data on mount and when navigating to this page
  useEffect(() => {
    fetchData();
  }, [fetchData, location.pathname]);

  const quote = useMemo(() => quoteForToday(settings.language), [settings.language]);

  const years = useMemo(() => availableYears(dateMap), [dateMap]);

  // Heatmap cells: default = last 365 days, or specific year if selected
  const cells = useMemo(() => {
    if (selectedYear !== null) {
      return heatmapCellsForYear(selectedYear, settings.weekStart);
    }
    return heatmapCells(DAYS_BACK, settings.weekStart);
  }, [selectedYear, settings.weekStart]);

  const totalWeeks = useMemo(() => {
    if (cells.length === 0) return 53;
    return Math.max(...cells.map((c) => c.week)) + 1;
  }, [cells]);

  const activityDays = useMemo(() => {
    if (selectedYear !== null) {
      const ys = `${selectedYear}-01-01`;
      const ye = `${selectedYear}-12-31`;
      let count = 0;
      for (const [d, v] of dateMap) {
        if (v > 0 && d >= ys && d <= ye) count++;
      }
      return count;
    }
    // Last 365 days
    const cutoff = dayjs().subtract(DAYS_BACK, 'day').format('YYYY-MM-DD');
    let count = 0;
    for (const [d, v] of dateMap) {
      if (v > 0 && d >= cutoff) count++;
    }
    return count;
  }, [dateMap, selectedYear]);

  const periodLabel = selectedYear !== null
    ? `${selectedYear}`
    : `${t('overview.last365') || 'Last 365 days'}`;

  // ─── ECharts via custom hook ───
  const trendOption = useMemo(() => {
    if (!pomoStats) return null;
    const last7 = pomoStats.last7;
    return {
      tooltip: { trigger: 'axis' as const },
      grid: { left: 40, right: 12, top: 20, bottom: 28 },
      xAxis: {
        type: 'category' as const,
        data: last7.map((d) => d.date.slice(5)),
        axisLine: { lineStyle: { color: '#999' } },
        axisLabel: { color: '#666', fontSize: 10 },
      },
      yAxis: {
        type: 'value' as const,
        axisLine: { lineStyle: { color: '#999' } },
        axisLabel: { color: '#666', fontSize: 10 },
        splitLine: { lineStyle: { color: '#eee' } },
      },
      animation: true,
      animationDuration: 500,
      animationEasing: 'cubicOut' as const,
      series: [
        {
          type: 'bar' as const,
          data: last7.map((d) => d.count),
          itemStyle: { color: '#6366f1', borderRadius: [4, 4, 0, 0] },
        },
      ],
    };
  }, [pomoStats]);

  const donutOption = useMemo(() => {
    if (goals.length === 0) return null;
    const data = goals.slice(0, 6).map((g) => ({
      name: g.title,
      value: Math.round(g.progress * 100) || 1,
    }));
    return {
      tooltip: { trigger: 'item' as const },
      legend: { bottom: 0, textStyle: { color: '#666', fontSize: 10 } },
      animation: true,
      animationDuration: 500,
      animationEasing: 'cubicOut' as const,
      series: [
        {
          type: 'pie' as const,
          radius: ['45%', '70%'],
          avoidLabelOverlap: false,
          label: { show: false },
          data,
          color: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7'],
        },
      ],
    };
  }, [goals]);

  const trendRef = useEChart(trendOption, [pomoStats]);
  const donutRef = useEChart(donutOption, [goals]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Quote */}
      <div className="card p-6 mb-4 bg-gradient-to-br from-primary-soft to-surface">
        <div className="text-xs text-text-muted">{t('overview.quote')}</div>
        <div className="text-xl font-medium mt-1 italic">「{quote}」</div>
        <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
          <CalIcon size={12} />
          {dayjs().format('YYYY-MM-DD dddd')}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <StatCard icon={<Flame size={18} className="text-orange-500" />} label={t('overview.streak')} value={streak} />
        <StatCard icon={<CheckCircle2 size={18} className="text-green-500" />} label={t('overview.completedTasks')} value={weekDone} />
        <StatCard icon={<Target size={18} className="text-blue-500" />} label={t('overview.activeGoals')} value={goals.length} />
        <StatCard icon={<Timer size={18} className="text-pink-500" />} label={t('overview.pomodoros')} value={pomoStats?.total ?? 0} />
      </div>

      {/* Heatmap */}
      <div className="card p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold">{t('overview.heatmap')}</div>
            <div className="text-xs text-text-muted">{t('overview.heatmapDesc')}</div>
          </div>
          <div className="flex items-center gap-3">
            {/* Year selector */}
            <div className="relative">
              <button
                className="btn-ghost text-sm flex items-center gap-1 px-2 py-1 rounded-md"
                onClick={() => setYearDropdownOpen(!yearDropdownOpen)}
              >
                {periodLabel}
                <ChevronDown size={14} />
              </button>
              {yearDropdownOpen && (
                <div
                  className="absolute right-0 top-full mt-1 card py-1 z-20 min-w-[120px]"
                  style={{ boxShadow: '0 8px 24px var(--shadow)' }}
                >
                  <button
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-2 transition-colors"
                    onClick={() => { setSelectedYear(null); setYearDropdownOpen(false); }}
                  >
                    {t('overview.last365') || 'Last 365 days'}
                  </button>
                  {years.map((y) => (
                    <button
                      key={y}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-surface-2 transition-colors ${selectedYear === y ? 'text-primary font-medium' : ''}`}
                      onClick={() => { setSelectedYear(y); setYearDropdownOpen(false); }}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="text-xs text-text-muted">
              {activityDays} {t('overview.activeDays') || 'active days'}
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div
            className="inline-grid gap-0.5"
            style={{ gridTemplateColumns: `repeat(${totalWeeks}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: totalWeeks }).map((_, w) => (
              <div key={w} className="flex flex-col gap-0.5">
                {Array.from({ length: 7 }).map((__, d) => {
                  const cell = cells.find((c) => c.week === w && c.dow === d);
                  if (!cell) return <div key={d} className="w-3 h-3" />;
                  const count = dateMap.get(cell.date.format('YYYY-MM-DD')) || 0;
                  const lvl =
                    count === 0 ? 'var(--heatmap-0)'
                    : count <= 2 ? 'var(--heatmap-1)'
                    : count <= 5 ? 'var(--heatmap-2)'
                    : count <= 8 ? 'var(--heatmap-3)'
                    : 'var(--heatmap-4)';
                  return (
                    <div
                      key={d}
                      className="w-3 h-3 rounded-sm"
                      style={{ background: lvl }}
                      title={`${cell.date.format('YYYY-MM-DD')} · ${count} activities`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1 text-xs text-text-muted">
          <span>{t('goal.less') || 'Less'}</span>
          {['var(--heatmap-0)', 'var(--heatmap-1)', 'var(--heatmap-2)', 'var(--heatmap-3)', 'var(--heatmap-4)'].map(
            (c) => <span key={c} className="w-3 h-3 rounded-sm" style={{ background: c }} />,
          )}
          <span>{t('goal.more') || 'More'}</span>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="text-sm font-semibold mb-2 flex items-center gap-2">
            <TrendingUp size={16} />
            {t('pomodoro.stats')} · 7d
          </div>
          <div ref={trendRef} style={{ width: '100%', height: 220 }} />
        </div>
        <div className="card p-5">
          <div className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Target size={16} />
            {t('overview.goalProgress')}
          </div>
          {goals.length > 0 ? (
            <div ref={donutRef} style={{ width: '100%', height: 220 }} />
          ) : (
            <div className="h-[220px] flex items-center justify-center text-sm text-text-muted">
              {t('goal.noGoals')}
            </div>
          )}
        </div>
      </div>

      {/* Goal list */}
      <div className="card p-5 mt-4">
        <div className="text-sm font-semibold mb-3">{t('overview.activeGoals')}</div>
        <div className="flex flex-col gap-2">
          {goals.length === 0 && (
            <div className="text-sm text-text-muted">{t('goal.noGoals')}</div>
          )}
          {goals.slice(0, 5).map((g) => (
            <div key={g.id}>
              <div className="flex items-center justify-between text-sm">
                <span className="truncate">{g.title}</span>
                <span className="text-text-muted text-xs">{Math.round(g.progress * 100)}%</span>
              </div>
              <ProgressBar value={g.progress} color={g.color || 'var(--primary)'} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-surface-2">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-text-muted">{label}</div>
        <div className="text-2xl font-semibold leading-tight tabular-nums">{value}</div>
      </div>
    </div>
  );
}
