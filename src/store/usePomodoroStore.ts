import { create } from 'zustand';
import { pomodoroApi } from '@/api';
import type { PomodoroSession, PomodoroStats } from '@/types';

interface State {
  history: PomodoroSession[];
  stats: PomodoroStats | null;
  active: PomodoroSession | null;
  mode: 'countdown' | 'countup';
  durationSeconds: number;
  linkedTaskId: string;
  running: boolean;
  paused: boolean;
  startedAtMs: number | null;
  pausedAtMs: number | null;
  accumulatedPauseMs: number;
  completedSession: { mode: 'countdown' | 'countup'; durationSeconds: number; elapsedSeconds: number } | null;
  fetchHistory: () => Promise<void>;
  fetchStats: (days?: number) => Promise<void>;
  configure: (patch: { mode?: 'countdown' | 'countup'; durationSeconds?: number; linkedTaskId?: string }) => void;
  startSession: (taskId?: string | null, mode?: 'countdown' | 'countup', durationSeconds?: number) => Promise<PomodoroSession>;
  endSession: (id: string, durationSeconds: number, completed: boolean) => Promise<void>;
  pause: () => void;
  resume: () => void;
  finishActive: (completed: boolean, elapsedSeconds: number) => Promise<void>;
  dismissCompletion: () => void;
  setActive: (s: PomodoroSession | null) => void;
  clear: () => Promise<void>;
}

export const usePomodoroStore = create<State>((set, get) => ({
  history: [],
  stats: null,
  active: null,
  mode: 'countdown',
  durationSeconds: 25 * 60,
  linkedTaskId: '',
  running: false,
  paused: false,
  startedAtMs: null,
  pausedAtMs: null,
  accumulatedPauseMs: 0,
  completedSession: null,
  fetchHistory: async () => {
    const h = await pomodoroApi.list(200);
    set({ history: h });
  },
  fetchStats: async (days = 14) => {
    const s = await pomodoroApi.stats(days);
    set({ stats: s });
  },
  configure: (patch) => set((state) => {
    if (state.running) {
      if (!patch.mode || patch.mode === state.mode) return state;
      const now = Date.now();
      const currentMs = state.paused && state.pausedAtMs ? state.pausedAtMs : now;
      const elapsedMs = state.startedAtMs
        ? Math.max(0, currentMs - state.startedAtMs - state.accumulatedPauseMs)
        : 0;
      const cappedElapsedMs = patch.mode === 'countdown'
        ? Math.min(elapsedMs, Math.max(0, (state.durationSeconds - 1) * 1000))
        : elapsedMs;
      return {
        mode: patch.mode,
        startedAtMs: state.startedAtMs ? currentMs - state.accumulatedPauseMs - cappedElapsedMs : state.startedAtMs,
      };
    }
    return {
      mode: patch.mode ?? state.mode,
      durationSeconds: patch.durationSeconds ?? state.durationSeconds,
      linkedTaskId: patch.linkedTaskId ?? state.linkedTaskId,
    };
  }),
  startSession: async (taskId, mode = 'countdown', durationSeconds = 25 * 60) => {
    const s = await pomodoroApi.start({ taskId: taskId ?? null, mode, durationSeconds });
    set({
      active: s,
      mode,
      durationSeconds,
      linkedTaskId: taskId ?? '',
      running: true,
      paused: false,
      startedAtMs: Date.now(),
      pausedAtMs: null,
      accumulatedPauseMs: 0,
      completedSession: null,
    });
    return s;
  },
  endSession: async (id, durationSeconds, completed) => {
    await pomodoroApi.end({ id, durationSeconds, completed });
    set({
      active: null,
      running: false,
      paused: false,
      startedAtMs: null,
      pausedAtMs: null,
      accumulatedPauseMs: 0,
    });
    await get().fetchHistory();
  },
  pause: () => set((state) => {
    if (!state.running || state.paused) return state;
    return { paused: true, pausedAtMs: Date.now() };
  }),
  resume: () => set((state) => {
    if (!state.running || !state.paused || !state.pausedAtMs) return state;
    return {
      paused: false,
      pausedAtMs: null,
      accumulatedPauseMs: state.accumulatedPauseMs + (Date.now() - state.pausedAtMs),
    };
  }),
  finishActive: async (completed, elapsedSeconds) => {
    const state = get();
    if (!state.active) return;
    const durationSeconds = state.mode === 'countdown' ? state.durationSeconds : elapsedSeconds;
    await pomodoroApi.end({ id: state.active.id, durationSeconds, completed });
    set({
      active: null,
      running: false,
      paused: false,
      startedAtMs: null,
      pausedAtMs: null,
      accumulatedPauseMs: 0,
      completedSession: completed
        ? { mode: state.mode, durationSeconds: state.durationSeconds, elapsedSeconds }
        : state.completedSession,
    });
    await get().fetchHistory();
    await get().fetchStats(14);
  },
  dismissCompletion: () => set({ completedSession: null }),
  setActive: (s) => set({ active: s }),
  clear: async () => {
    set({
      history: [],
      stats: null,
      active: null,
      running: false,
      paused: false,
      startedAtMs: null,
      pausedAtMs: null,
      accumulatedPauseMs: 0,
      completedSession: null,
    });
  },
}));
