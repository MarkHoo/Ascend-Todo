import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Pause, Square, Timer as TimerIcon, History, BarChart3 } from 'lucide-react';
import { usePomodoroStore } from '@/store/usePomodoroStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { tasksApi } from '@/api';
import { Button } from '@/components/common/Button';
import { formatDuration, formatHM } from '@/utils/format';
import { playPomodoroEnd } from '@/utils/sound';
import { dayjs } from '@/utils/date';
import { toast } from '@/components/common/Toast';
import { useEChart } from '@/hooks/useEChart';
import type { Task } from '@/types';

type Mode = 'countdown' | 'countup';

export function PomodoroPage() {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const { history, stats, active, fetchHistory, fetchStats, startSession, endSession, setActive } = usePomodoroStore();

  const [mode, setMode] = useState<Mode>('countdown');
  const [durationMin, setDurationMin] = useState<number>(Math.round(settings.pomodoroDuration / 60));
  const [linkedTaskId, setLinkedTaskId] = useState<string>('');
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const intervalRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    fetchHistory();
    fetchStats(14);
    (async () => {
      const ts = await tasksApi.listAll();
      setTasks(ts.filter((x) => !x.isCompleted));
    })();
  }, [fetchHistory, fetchStats]);

  useEffect(() => {
    if (mode === 'countdown') {
      setElapsed(durationMin * 60);
    } else {
      setElapsed(0);
    }
  }, [mode, durationMin]);

  useEffect(() => {
    if (running && !paused) {
      const tick = () => {
        const now = Date.now();
        if (startedAtRef.current == null) return;
        const sec = Math.floor((now - startedAtRef.current) / 1000);
        if (mode === 'countdown') {
          const total = durationMin * 60;
          setElapsed(Math.max(0, total - sec));
          if (total - sec <= 0) {
            handleStop(true);
          }
        } else {
          setElapsed(sec);
        }
      };
      tick();
      intervalRef.current = window.setInterval(tick, 250);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, paused, mode, durationMin]);

  const handleStart = async () => {
    startedAtRef.current = Date.now();
    const sess = await startSession(linkedTaskId || undefined, mode, durationMin * 60);
    setRunning(true);
    setPaused(false);
  };

  const handleStop = async (completed = false) => {
    setRunning(false);
    setPaused(false);
    if (active) {
      const dur = mode === 'countdown' ? durationMin * 60 : elapsed;
      await endSession(active.id, dur, completed);
    }
    if (completed) {
      playPomodoroEnd();
      if (settings.reminderSound !== 'none') {
        try {
          const { playReminderSound } = await import('@/utils/sound');
          playReminderSound(settings.reminderSound);
        } catch {
          /* */
        }
      }
      toast.success(t('pomodoro.notifyFinished'));
    }
    startedAtRef.current = null;
  };

  const trendOption = useMemo(() => {
    if (!stats) return null;
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 30, right: 12, top: 20, bottom: 24 },
      xAxis: {
        type: 'category',
        data: stats.byDay.map((d) => d.date.slice(5)),
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
          type: 'line',
          smooth: true,
          symbol: 'circle',
          data: stats.byDay.map((d) => d.count),
          lineStyle: { color: 'var(--primary)' },
          itemStyle: { color: 'var(--primary)' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(99,102,241,0.3)' },
                { offset: 1, color: 'rgba(99,102,241,0)' },
              ],
            },
          },
        },
      ],
    };
  }, [stats]);

  const trendRef = useEChart(trendOption, [stats]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold flex items-center gap-2 mb-4">
        <TimerIcon size={22} />
        {t('pomodoro.title')}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-6 md:col-span-2 flex flex-col items-center justify-center">
          <div className="flex items-center gap-2 mb-4">
            <div className="card p-0.5 flex items-center text-sm">
              {(['countdown', 'countup'] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                  }}
                  className={`px-3 py-1.5 rounded-md transition-colors ${mode === m ? 'bg-primary text-white' : 'text-text-muted hover:text-text'}`}
                >
                  {t(`pomodoro.${m}`)}
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
                onChange={(e) => setDurationMin(Math.max(1, Number(e.target.value) || 25))}
                className="input w-20 py-1"
              />
              <span>{t('pomodoro.minutes')}</span>
            </div>
          </div>

          <div
            className="w-56 h-56 rounded-full flex items-center justify-center text-5xl font-mono font-semibold tracking-tight"
            style={{
              background: `conic-gradient(var(--primary) ${mode === 'countdown' ? ((durationMin * 60 - elapsed) / (durationMin * 60)) * 360 : (elapsed % 3600) / 10}deg, var(--surface-2) 0deg)`,
            }}
          >
            <div
              className="w-44 h-44 rounded-full flex items-center justify-center"
              style={{ background: 'var(--surface)' }}
            >
              {formatDuration(elapsed)}
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
                  <Button onClick={() => setPaused(false)}>
                    <Play size={16} />
                    {t('pomodoro.resume')}
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setPaused(true)}>
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
              onChange={(e) => setLinkedTaskId(e.target.value)}
              disabled={running}
            >
              <option value="">{t('pomodoro.noTask')}</option>
              {tasks.map((tk) => (
                <option key={tk.id} value={tk.id}>
                  {tk.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="card p-5">
          <div className="text-sm font-semibold mb-2 flex items-center gap-2">
            <BarChart3 size={16} />
            {t('pomodoro.stats')}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label={t('pomodoro.total')} value={stats?.totalSessions ?? 0} />
            <Stat label={t('pomodoro.completed')} value={stats?.completedSessions ?? 0} />
            <Stat label="time" value={formatHM(stats?.totalSeconds ?? 0)} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="card p-5">
          <div className="text-sm font-semibold mb-2 flex items-center gap-2">
            <BarChart3 size={16} />
            14d trend
          </div>
          <div ref={trendRef} style={{ width: '100%', height: 200 }} />
        </div>
        <div className="card p-5">
          <div className="text-sm font-semibold mb-2 flex items-center gap-2">
            <History size={16} />
            {t('pomodoro.history')}
          </div>
          <div className="space-y-1 max-h-[260px] overflow-y-auto">
            {history.length === 0 && <div className="text-text-muted text-sm">{t('common.empty')}</div>}
            {history.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between text-sm border-b border-border last:border-0 py-1.5"
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate">
                    {dayjs(h.startedAt).format('MM-DD HH:mm')} ·{' '}
                    <span className="text-text-muted">
                      {h.mode === 'countdown' ? t('pomodoro.countdown') : t('pomodoro.countup')}
                    </span>{' '}
                    · {formatHM(h.durationSeconds)}
                  </div>
                  {tasks.find((tk) => tk.id === h.taskId) && (
                    <div className="text-xs text-text-muted truncate">
                      {tasks.find((tk) => tk.id === h.taskId)?.title}
                    </div>
                  )}
                </div>
                <span className="chip ml-2">{h.completed ? '✓' : '—'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-2xl font-semibold leading-tight">{value}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  );
}
