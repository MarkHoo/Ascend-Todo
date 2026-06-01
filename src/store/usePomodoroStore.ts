import { create } from 'zustand';
import { pomodoroApi } from '@/api';
import type { PomodoroSession, PomodoroStats } from '@/types';

interface State {
  history: PomodoroSession[];
  stats: PomodoroStats | null;
  active: PomodoroSession | null;
  fetchHistory: () => Promise<void>;
  fetchStats: (days?: number) => Promise<void>;
  startSession: (taskId?: string | null, mode?: 'countdown' | 'countup', durationSeconds?: number) => Promise<PomodoroSession>;
  endSession: (id: string, durationSeconds: number, completed: boolean) => Promise<void>;
  setActive: (s: PomodoroSession | null) => void;
  clear: () => Promise<void>;
}

export const usePomodoroStore = create<State>((set, get) => ({
  history: [],
  stats: null,
  active: null,
  fetchHistory: async () => {
    const h = await pomodoroApi.list(200);
    set({ history: h });
  },
  fetchStats: async (days = 14) => {
    const s = await pomodoroApi.stats(days);
    set({ stats: s });
  },
  startSession: async (taskId, mode = 'countdown', durationSeconds = 25 * 60) => {
    const s = await pomodoroApi.start({ taskId: taskId ?? null, mode, durationSeconds });
    set({ active: s });
    return s;
  },
  endSession: async (id, durationSeconds, completed) => {
    await pomodoroApi.end({ id, durationSeconds, completed });
    set({ active: null });
    await get().fetchHistory();
  },
  setActive: (s) => set({ active: s }),
  clear: async () => {
    set({ history: [], stats: null, active: null });
  },
}));
