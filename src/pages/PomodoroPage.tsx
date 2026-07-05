import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, CheckCircle, Flame, History, Pause, Play, Square, Target, Timer as TimerIcon, TrendingUp, Volume2, VolumeX } from 'lucide-react';
import { usePomodoroStore } from '@/store/usePomodoroStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { tasksApi } from '@/api';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { formatDuration, formatHM } from '@/utils/format';
import { dayjs } from '@/utils/date';
import { toast } from '@/components/common/Toast';
import { useEChart } from '@/hooks/useEChart';
import { playSoundPreview, stopSound } from '@/utils/sound';
import type { Task } from '@/types';

type Mode = 'countdown' | 'countup';
type TrendDays = 7 | 30;

const pomodoroCopy = {
  'zh-CN': {
    todayFocus: '今日专注',
    todayPomodoros: '今日番茄',
    streak: '连续专注',
    longest: '最长单次',
    completionRate: '完成率',
    interrupted: '中断',
    bestWindow: '高效时段',
    noFocusWindow: '暂无明显高效时段',
    focusTrend: '专注趋势',
    taskContribution: '任务贡献',
    noTaskContribution: '暂无关联任务的专注记录',
    days: '天',
    sessions: '次',
    taskShare: '{{percent}} · {{count}} 次',
    focusMinutes: '专注分钟',
    completedPomodoros: '完成番茄',
    last7Days: '7 天',
    last30Days: '30 天',
  },
  'zh-TW': {
    todayFocus: '今日專注',
    todayPomodoros: '今日番茄',
    streak: '連續專注',
    longest: '最長單次',
    completionRate: '完成率',
    interrupted: '中斷',
    bestWindow: '高效時段',
    noFocusWindow: '暫無明顯高效時段',
    focusTrend: '專注趨勢',
    taskContribution: '任務貢獻',
    noTaskContribution: '暫無關聯任務的專注記錄',
    days: '天',
    sessions: '次',
    taskShare: '{{percent}} · {{count}} 次',
    focusMinutes: '專注分鐘',
    completedPomodoros: '完成番茄',
    last7Days: '7 天',
    last30Days: '30 天',
  },
  en: {
    todayFocus: 'Today focus',
    todayPomodoros: 'Today pomodoros',
    streak: 'Focus streak',
    longest: 'Longest session',
    completionRate: 'Completion rate',
    interrupted: 'Interrupted',
    bestWindow: 'Best window',
    noFocusWindow: 'No clear focus window yet',
    focusTrend: 'Focus trend',
    taskContribution: 'Task contribution',
    noTaskContribution: 'No linked task focus yet',
    days: 'days',
    sessions: 'sessions',
    taskShare: '{{percent}} · {{count}} sessions',
    focusMinutes: 'Focus minutes',
    completedPomodoros: 'Completed',
    last7Days: '7 days',
    last30Days: '30 days',
  },
} as const;

export function PomodoroPage() {
  const { t } = useTranslation();
  const settings = useSettingsStore((state) => state.settings);
  const copy = pomodoroCopy[settings.language];
  const {
    history,
    stats,
    mode,
    durationSeconds,
    linkedTaskId,
    running,
    paused,
    startedAtMs,
    pausedAtMs,
    accumulatedPauseMs,
    completedSession,
    fetchHistory,
    fetchStats,
    configure,
    startSession,
    pause,
    resume,
    finishActive,
    dismissCompletion: clearCompletedSession,
  } = usePomodoroStore();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [trendDays, setTrendDays] = useState<TrendDays>(30);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [soundPlaying, setSoundPlaying] = useState(false);
  const pomodoroAudioRef = useRef<HTMLAudioElement | null>(null);
  const completionHandledRef = useRef(false);

  const durationMin = Math.round(durationSeconds / 60);

  const stopPomodoroSound = useCallback(() => {
    if (pomodoroAudioRef.current) {
      stopSound(pomodoroAudioRef.current);
      pomodoroAudioRef.current = null;
    }
    setSoundPlaying(false);
  }, []);

  const dismissCompletion = useCallback(() => {
    stopPomodoroSound();
    clearCompletedSession();
  }, [clearCompletedSession, stopPomodoroSound]);

  useEffect(() => {
    fetchHistory();
    fetchStats(trendDays);
    (async () => {
      const allTasks = await tasksApi.listAll();
      setTasks(allTasks);
    })().catch((error) => toast.error(String(error)));
  }, [fetchHistory, fetchStats, trendDays]);

  useEffect(() => {
    if (!running) {
      configure({ durationSeconds: settings.pomodoroDuration });
    }
  }, [configure, running, settings.pomodoroDuration]);

  useEffect(() => {
    if (!running || paused) return;
    const interval = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [paused, running]);

  const elapsedSeconds = useMemo(() => {
    if (!running || !startedAtMs) return 0;
    const currentMs = paused && pausedAtMs ? pausedAtMs : nowMs;
    return Math.max(0, Math.floor((currentMs - startedAtMs - accumulatedPauseMs) / 1000));
  }, [accumulatedPauseMs, nowMs, paused, pausedAtMs, running, startedAtMs]);

  const displaySeconds = mode === 'countdown'
    ? Math.max(0, durationSeconds - elapsedSeconds)
    : elapsedSeconds;

  const progressDegrees = useMemo(() => {
    if (mode === 'countdown') {
      return durationSeconds > 0 ? ((durationSeconds - displaySeconds) / durationSeconds) * 360 : 0;
    }
    return ((displaySeconds % 3600) / 3600) * 360;
  }, [displaySeconds, durationSeconds, mode]);

  useEffect(() => {
    if (!running || paused || mode !== 'countdown') {
      completionHandledRef.current = false;
      return;
    }
    if (durationSeconds - elapsedSeconds > 0 || completionHandledRef.current) return;
    completionHandledRef.current = true;
    finishActive(true, elapsedSeconds).catch((error) => toast.error(String(error)));
  }, [durationSeconds, elapsedSeconds, finishActive, mode, paused, running]);

  useEffect(() => {
    if (!completedSession) return;
    stopPomodoroSound();
    if (settings.reminderSound !== 'none') {
      const audio = playSoundPreview(settings.reminderSound, 0.7);
      if (audio) {
        pomodoroAudioRef.current = audio;
        setSoundPlaying(true);
        audio.addEventListener('ended', () => setSoundPlaying(false));
      }
    }
    (async () => {
      try {
        const { isPermissionGranted, requestPermission, sendNotification } = await import('@tauri-apps/plugin-notification');
        let granted = await isPermissionGranted();
        if (!granted) {
          const permission = await requestPermission();
          granted = permission === 'granted';
        }
        if (granted) {
          const appName = settings.language === 'zh-CN' ? '光阶Todo' : settings.language === 'zh-TW' ? '光階Todo' : 'Ascend Todo';
          sendNotification({
            title: `${appName} · ${t('pomodoro.notifyFinished')}`,
            body: `${t('pomodoro.title')} ${t('pomodoro.completed')}!`,
          });
        }
      } catch {
        // Notification permissions are best-effort.
      }
    })();
  }, [completedSession, settings.language, settings.reminderSound, stopPomodoroSound, t]);

  const handleStart = async () => {
    await startSession(linkedTaskId || undefined, mode, durationSeconds);
    setNowMs(Date.now());
  };

  const handleStop = async (completed = false) => {
    await finishActive(completed, elapsedSeconds);
  };

  const analytics = useMemo(() => buildPomodoroAnalytics(history, tasks), [history, tasks]);
  const selectableTasks = useMemo(() => tasks.filter((task) => !task.isCompleted), [tasks]);

  const trendOption = useMemo(() => {
    if (!stats) return null;
    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: Array<{ axisValue: string; marker: string; seriesName: string; value: number }>) => {
          const title = params[0]?.axisValue ?? '';
          return [
            title,
            ...params.map((item) => `${item.marker}${item.seriesName}: ${item.seriesName === copy.focusMinutes ? `${item.value}m` : item.value}`),
          ].join('<br/>');
        },
      },
      legend: { top: 0, right: 0, textStyle: { color: 'var(--text-muted)', fontSize: 11 } },
      grid: { left: 38, right: 38, top: 42, bottom: 28 },
      xAxis: {
        type: 'category',
        data: stats.byDay.map((item) => item.date.slice(5)),
        axisLine: { lineStyle: { color: 'var(--border)' } },
        axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
      },
      yAxis: [
        {
          type: 'value',
          axisLine: { lineStyle: { color: 'var(--border)' } },
          axisLabel: { color: 'var(--text-muted)', fontSize: 10, formatter: '{value}m' },
          splitLine: { lineStyle: { color: 'var(--border)' } },
        },
        {
          type: 'value',
          minInterval: 1,
          axisLine: { lineStyle: { color: 'var(--border)' } },
          axisLabel: { color: 'var(--text-muted)', fontSize: 10 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: copy.focusMinutes,
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          data: stats.byDay.map((item) => Math.round(item.seconds / 60)),
          lineStyle: { color: 'var(--primary)', width: 2.5 },
          itemStyle: { color: 'var(--primary)' },
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
          name: copy.completedPomodoros,
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          data: stats.byDay.map((item) => item.count),
          lineStyle: { color: '#10b981', width: 2 },
          itemStyle: { color: '#10b981' },
        },
      ],
    };
  }, [copy, stats]);

  const trendRef = useEChart(trendOption, [stats, trendDays, settings.language]);
  const completedDuration = completedSession
    ? completedSession.mode === 'countdown' ? completedSession.durationSeconds : completedSession.elapsedSeconds
    : displaySeconds;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
        <TimerIcon size={22} />
        {t('pomodoro.title')}
      </h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="card flex flex-col items-center justify-center p-6 md:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <div className="card flex items-center p-0.5 text-sm">
              {(['countdown', 'countup'] as Mode[]).map((item) => (
                <button
                  key={item}
                  onClick={() => configure({ mode: item })}
                  className={`rounded-md px-3 py-1.5 transition-colors ${
                    mode === item ? 'bg-primary text-white' : 'text-text-muted hover:text-text'
                  }`}
                >
                  {t(`pomodoro.${item}`)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 text-sm">
              <span>{t('pomodoro.duration')}</span>
              <input
                type="number"
                min={1}
                max={120}
                value={durationMin}
                onChange={(event) => configure({ durationSeconds: Math.max(1, Number(event.target.value) || 25) * 60 })}
                disabled={running}
                className="input w-20 py-1 disabled:bg-surface-2 disabled:text-text-muted"
              />
              <span>{t('pomodoro.minutes')}</span>
            </div>
          </div>

          <div
            className="flex h-56 w-56 items-center justify-center rounded-full text-5xl font-semibold tracking-tight"
            style={{
              fontFamily: 'ui-monospace, monospace',
              background: `conic-gradient(var(--primary) ${progressDegrees}deg, var(--surface-2) 0deg)`,
              transform: 'translateZ(0)',
            }}
          >
            <div className="flex h-44 w-44 items-center justify-center rounded-full" style={{ background: 'var(--surface)' }}>
              {formatDuration(displaySeconds)}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            {!running ? (
              <Button onClick={handleStart}>
                <Play size={16} />
                {t('pomodoro.start')}
              </Button>
            ) : (
              <>
                {paused ? (
                  <Button onClick={resume}>
                    <Play size={16} />
                    {t('pomodoro.resume')}
                  </Button>
                ) : (
                  <Button variant="outline" onClick={pause}>
                    <Pause size={16} />
                    {t('pomodoro.pause')}
                  </Button>
                )}
                <Button variant="danger" onClick={() => handleStop(false)}>
                  <Square size={16} />
                  {t('pomodoro.stop')}
                </Button>
              </>
            )}
          </div>

          <div className="mt-3 w-full max-w-md">
            <label className="label">{t('pomodoro.linkTask')}</label>
            <select
              className="input"
              value={linkedTaskId}
              onChange={(event) => configure({ linkedTaskId: event.target.value })}
              disabled={running}
            >
              <option value="">{t('pomodoro.noTask')}</option>
              {selectableTasks.map((task) => (
                <option key={task.id} value={task.id}>{task.title}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <BarChart3 size={16} />
            {t('pomodoro.stats')}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label={copy.todayFocus} value={formatHM(analytics.todaySeconds)} />
            <Stat label={copy.todayPomodoros} value={analytics.todayCompleted} />
            <Stat label={copy.streak} value={`${analytics.streakDays} ${copy.days}`} />
            <Stat label={copy.longest} value={formatHM(analytics.longestSeconds)} />
          </div>
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <QualityRow label={copy.completionRate} value={formatPercent(analytics.completionRate)} percent={analytics.completionRate} />
            <QualityRow label={copy.interrupted} value={`${analytics.interruptedSessions} ${copy.sessions}`} percent={analytics.interruptionRate} muted />
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-1.5 text-text-muted"><Flame size={14} />{copy.bestWindow}</span>
              <span className="font-medium">{analytics.bestWindow || copy.noFocusWindow}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp size={16} />
              {copy.focusTrend}
            </div>
            <div className="rounded-lg border border-border bg-surface p-0.5 text-xs">
              {([7, 30] as TrendDays[]).map((days) => (
                <button
                  key={days}
                  className={`rounded-md px-2.5 py-1 transition-colors ${trendDays === days ? 'bg-primary text-white' : 'text-text-muted hover:text-text'}`}
                  onClick={() => setTrendDays(days)}
                >
                  {days === 7 ? copy.last7Days : copy.last30Days}
                </button>
              ))}
            </div>
          </div>
          <div ref={trendRef} style={{ width: '100%', height: 200 }} />
        </div>
        <div className="card p-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Target size={16} />
            {copy.taskContribution}
          </div>
          <div className="max-h-[200px] space-y-3 overflow-y-auto pr-1">
            {analytics.taskContributions.length === 0 && <div className="text-sm text-text-muted">{copy.noTaskContribution}</div>}
            {analytics.taskContributions.map((item) => (
              <div key={item.taskId} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{item.title}</span>
                  <span className="shrink-0 text-text-muted">{formatHM(item.seconds)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(item.share * 100)}%` }} />
                </div>
                <div className="text-xs text-text-muted">
                  {copy.taskShare.replace('{{percent}}', formatPercent(item.share)).replace('{{count}}', String(item.count))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1">
        <div className="card p-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <History size={16} />
            {t('pomodoro.history')}
          </div>
          <div className="max-h-[260px] space-y-1 overflow-y-auto">
            {history.length === 0 && <div className="text-sm text-text-muted">{t('common.empty')}</div>}
            {history.map((item) => (
              <div key={item.id} className="flex items-center justify-between border-b border-border py-1.5 text-sm last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    {dayjs(item.startedAt).format('MM-DD HH:mm')} ·{' '}
                    <span className="text-text-muted">
                      {item.mode === 'countdown' ? t('pomodoro.countdown') : t('pomodoro.countup')}
                    </span>{' '}
                    · {formatHM(item.durationSeconds)}
                  </div>
                  {tasks.find((task) => task.id === item.taskId) && (
                    <div className="truncate text-xs text-text-muted">
                      {tasks.find((task) => task.id === item.taskId)?.title}
                    </div>
                  )}
                </div>
                <span className="chip ml-2">{item.completed ? '✓' : '-'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal
        open={!!completedSession}
        onClose={dismissCompletion}
        title={t('pomodoro.notifyFinished')}
        size="sm"
        footer={(
          <>
            {soundPlaying && (
              <Button variant="outline" onClick={stopPomodoroSound}>
                <VolumeX size={16} />
                {t('pomodoro.stopSound')}
              </Button>
            )}
            <Button onClick={dismissCompletion}>
              <CheckCircle size={16} />
              {t('common.confirm')}
            </Button>
          </>
        )}
      >
        <div className="py-4 text-center">
          <CheckCircle size={48} className="mx-auto mb-3" style={{ color: 'var(--primary)' }} />
          <p className="mb-1 text-lg font-semibold">{t('pomodoro.completed')}!</p>
          <p className="text-sm text-text-muted">
            {t('pomodoro.title')} {formatHM(completedDuration)}
          </p>
          {soundPlaying && (
            <div className="mt-3 flex items-center justify-center gap-2 text-sm text-text-muted">
              <Volume2 size={16} className="animate-pulse" />
              {t('pomodoro.playingSound')}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-center">
      <div className="text-2xl font-semibold leading-tight">{value}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  );
}

function QualityRow({
  label,
  value,
  percent,
  muted,
}: {
  label: string;
  value: string;
  percent: number;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-text-muted">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${muted ? 'bg-warning' : 'bg-success'}`}
          style={{ width: `${Math.round(Math.max(0, Math.min(1, percent)) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function buildPomodoroAnalytics(history: TaskPomodoroSession[], tasks: Task[]) {
  const today = dayjs().format('YYYY-MM-DD');
  const taskTitleMap = new Map(tasks.map((task) => [task.id, task.title]));
  const completed = history.filter((item) => item.completed);
  const todaySessions = completed.filter((item) => dayjs(item.startedAt).format('YYYY-MM-DD') === today);
  const todaySeconds = todaySessions.reduce((total, item) => total + Math.max(0, item.durationSeconds), 0);
  const longestSeconds = completed.reduce((max, item) => Math.max(max, item.durationSeconds), 0);
  const totalSessions = history.length;
  const completionRate = totalSessions > 0 ? completed.length / totalSessions : 0;
  const interruptedSessions = history.filter((item) => !item.completed).length;
  const interruptionRate = totalSessions > 0 ? interruptedSessions / totalSessions : 0;
  const activeDates = new Set(completed.map((item) => dayjs(item.startedAt).format('YYYY-MM-DD')));
  let streakDays = 0;
  let cursor = dayjs().startOf('day');
  while (activeDates.has(cursor.format('YYYY-MM-DD'))) {
    streakDays += 1;
    cursor = cursor.subtract(1, 'day');
  }

  const taskTotals = new Map<string, { taskId: string; title: string; seconds: number; count: number }>();
  for (const item of completed) {
    if (!item.taskId) continue;
    const current = taskTotals.get(item.taskId) ?? {
      taskId: item.taskId,
      title: taskTitleMap.get(item.taskId) || item.sourceTitle || item.taskId,
      seconds: 0,
      count: 0,
    };
    current.seconds += Math.max(0, item.durationSeconds);
    current.count += 1;
    taskTotals.set(item.taskId, current);
  }
  const linkedSeconds = Array.from(taskTotals.values()).reduce((total, item) => total + item.seconds, 0);
  const taskContributions = Array.from(taskTotals.values())
    .map((item) => ({ ...item, share: linkedSeconds > 0 ? item.seconds / linkedSeconds : 0 }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 5);

  const windows = new Map<string, number>();
  for (const item of completed) {
    const startHour = dayjs(item.startedAt).hour();
    const windowStart = Math.floor(startHour / 2) * 2;
    const label = `${String(windowStart).padStart(2, '0')}:00-${String(windowStart + 2).padStart(2, '0')}:00`;
    windows.set(label, (windows.get(label) ?? 0) + Math.max(0, item.durationSeconds));
  }
  const bestWindow = Array.from(windows.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

  return {
    todaySeconds,
    todayCompleted: todaySessions.length,
    streakDays,
    longestSeconds,
    completionRate,
    interruptedSessions,
    interruptionRate,
    bestWindow,
    taskContributions,
  };
}

function formatPercent(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

type TaskPomodoroSession = {
  id: string;
  taskId?: string | null;
  mode: 'countdown' | 'countup';
  durationSeconds: number;
  startedAt: string;
  endedAt?: string | null;
  completed: boolean;
  sourceTitle?: string | null;
};
