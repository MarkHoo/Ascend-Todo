import { invoke } from '@tauri-apps/api/core';
import type { PomodoroSession, PomodoroStats } from '@/types';

export const pomodoroApi = {
  start: (params: { taskId?: string | null; mode: 'countdown' | 'countup'; durationSeconds: number }) =>
    invoke<PomodoroSession>('start_pomodoro', params),
  end: (params: { id: string; durationSeconds: number; completed: boolean }) =>
    invoke<void>('end_pomodoro', params),
  list: (limit?: number) => invoke<PomodoroSession[]>('list_pomodoros', { limit: limit ?? null }),
  delete: (id: string) => invoke<void>('delete_pomodoro', { id }),
  stats: (days?: number) => invoke<PomodoroStats>('pomodoro_stats', { days: days ?? null }),
};
