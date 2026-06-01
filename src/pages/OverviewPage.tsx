import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flame, CheckCircle2, Target, Timer, TrendingUp, Calendar as CalIcon } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { checkInsApi, pomodoroApi, goalsApi, tasksApi } from '@/api';
import { useSettingsStore } from '@/store/useSettingsStore';
import { dayjs, heatmapCells } from '@/utils/date';
import { quoteForToday } from '@/utils/quotes';
import { ProgressBar } from '@/components/common/ProgressBar';
import { Button } from '@/components/common/Button';
import { toast } from '@/components/common/Toast';
import type { CheckIn, CheckInSummary, DailyPomodoroCount, GoalWithMilestones } from '@/types';

export function OverviewPage() {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const [summary, setSummary] = useState<CheckInSummary | null>(null);
  const [pomoStats, setPomoStats] = useState<{ total: number; today: number; last7: DailyPomodoroCount[] } | null>(null);
  const [goals, setGoals] = useState<GoalWithMilestones[]>([]);
  const [weekDone, setWeekDone] = useState(0);

  useEffect(() => {
    (async () => {
      const [s, p, g, allTasks] = await Promise.all([
        checkInsApi.summary(),
        pomodoroApi.stats(7),
        goalsApi.list(),
        tasksApi.listAll(),
      ]);
      setSummary(s);
      setPomoStats({
        total: p.totalSessions,
        today: p.byDay.length ? p.byDay[p.byDay.length - 1].count : 0,
        last7: p.byDay,
      });
      setGoals(g);
      const start = dayjs().startOf('week');
      const done = allTasks.filter((x) => x.isCompleted && x.completedAt && dayjs(x.completedAt).isAfter(start)).length;
      setWeekDone(done);
    })();
  }, []);

  const onCheckIn = async () => {
    await checkInsApi.checkInToday();
    toast.success('+1');
    const s = await checkInsApi.summary();
    setSummary(s);
  };

  const quote = useMemo(() => quoteForToday(settings.language), [settings.language]);

  // Heatmap data: build a map of date -> count
  const dateMap = useMemo(() => {
    const m = new Map<string, number>();
    if (!summary) return m;
    for (const c of summary.byDay) m.set(c.date, c.count);
    return m;
  }, [summary]);

  const cells = useMemo(
    () => heatmapCells(180, settings.weekStart),
    [settings.weekStart],
  );

  // 7-day pomodoro trend chart
  const trendOption = useMemo(() => {
    if (!pomoStats) return null;
    const last7 = pomoStats.last7;
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 30, right: 12, top: 20, bottom: 24 },
      xAxis: {
        type: 'category',
        data: last7.map((d) => d.date.slice(5)),
        axisLine: { lineStyle: { color: 'var(--border)' } },
        axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: 'var(--border)' } },
        axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
        splitLine: { lineStyle: { color: 'var(--border)' } },
      },
      series: [
        {
          type: 'bar',
          data: last7.map((d) => d.count),
          itemStyle: { color: 'var(--primary)', borderRadius: [4, 4, 0, 0] },
        },
      ],
    };
  }, [pomoStats]);

  // Goal progress donut
  const donutOption = useMemo(() => {
    if (goals.length === 0) return null;
    const data = goals.slice(0, 6).map((g) => ({
      name: g.title,
      value: Math.round(g.progress * 100),
    }));
    return {
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 10 } },
      series: [
        {
          type: 'pie',
          radius: ['45%', '70%'],
          avoidLabelOverlap: false,
          label: { show: false },
          data,
          color: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7'],
        },
      ],
    };
  }, [goals]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="card p-6 mb-4 bg-gradient-to-br from-primary-soft to-surface">
        <div className="text-xs text-text-muted">{t('overview.quote')}</div>
        <div className="text-xl font-medium mt-1 italic">「{quote}」</div>
        <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
          <CalIcon size={12} />
          {dayjs().format('YYYY-MM-DD dddd')}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <StatCard
          icon={<Flame size={18} className="text-orange-500" />}
          label={t('overview.streak')}
          value={summary?.streak ?? 0}
          suffix={t('common.today')}
        />
        <StatCard
          icon={<CheckCircle2 size={18} className="text-green-500" />}
          label={t('overview.completedTasks')}
          value={weekDone}
        />
        <StatCard
          icon={<Target size={18} className="text-blue-500" />}
          label={t('overview.activeGoals')}
          value={goals.length}
        />
        <StatCard
          icon={<Timer size={18} className="text-pink-500" />}
          label={t('overview.pomodoros')}
          value={pomoStats?.total ?? 0}
        />
      </div>

      <div className="card p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold">{t('overview.heatmap')}</div>
            <div className="text-xs text-text-muted">{t('overview.heatmapDesc')}</div>
          </div>
          <Button size="sm" onClick={onCheckIn}>
            + Check in
          </Button>
        </div>
        <div className="overflow-x-auto">
          <div
            className="inline-grid gap-0.5"
            style={{ gridTemplateColumns: `repeat(53, minmax(0, 1fr))` }}
          >
            {Array.from({ length: 53 }).map((_, w) => (
              <div key={w} className="flex flex-col gap-0.5">
                {Array.from({ length: 7 }).map((__, d) => {
                  const cell = cells.find((c) => c.week === w && c.dow === d);
                  if (!cell) return <div key={d} className="w-3 h-3" />;
                  const count = dateMap.get(cell.date.format('YYYY-MM-DD')) || 0;
                  const lvl =
                    count === 0
                      ? 'var(--heatmap-0)'
                      : count === 1
                        ? 'var(--heatmap-1)'
                        : count === 2
                          ? 'var(--heatmap-2)'
                          : count === 3
                            ? 'var(--heatmap-3)'
                            : 'var(--heatmap-4)';
                  return (
                    <div
                      key={d}
                      className="w-3 h-3 rounded-sm"
                      style={{ background: lvl }}
                      title={`${cell.date.format('YYYY-MM-DD')} · ${count}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1 text-xs text-text-muted">
          <span>Less</span>
          {['var(--heatmap-0)', 'var(--heatmap-1)', 'var(--heatmap-2)', 'var(--heatmap-3)', 'var(--heatmap-4)'].map(
            (c) => (
              <span key={c} className="w-3 h-3 rounded-sm" style={{ background: c }} />
            ),
          )}
          <span>More</span>
          <span className="ml-auto">
            {t('common.today')}: {summary?.todayCount ?? 0} · {t('overview.streak')}: {summary?.streak ?? 0}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="text-sm font-semibold mb-2 flex items-center gap-2">
            <TrendingUp size={16} />
            {t('pomodoro.stats')} · 7d
          </div>
          {trendOption ? (
            <ReactECharts option={trendOption} style={{ height: 220 }} />
          ) : (
            <div className="text-sm text-text-muted">{t('common.loading')}</div>
          )}
        </div>
        <div className="card p-5">
          <div className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Target size={16} />
            {t('overview.goalProgress')}
          </div>
          {donutOption ? (
            <ReactECharts option={donutOption} style={{ height: 220 }} />
          ) : (
            <div className="text-sm text-text-muted">{t('goal.noGoals')}</div>
          )}
        </div>
      </div>

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

function StatCard({
  icon,
  label,
  value,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--surface-2)' }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-text-muted">{label}</div>
        <div className="text-2xl font-semibold leading-tight">
          {value}
          {suffix && <span className="text-xs text-text-muted ml-1">{suffix}</span>}
        </div>
      </div>
    </div>
  );
}
