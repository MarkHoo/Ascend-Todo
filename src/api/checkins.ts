import { invoke } from '@tauri-apps/api/core';
import type { CheckIn, CheckInSummary } from '@/types';

export const checkInsApi = {
  checkInToday: () => invoke<CheckIn>('check_in_today'),
  list: (start?: string, end?: string) =>
    invoke<CheckIn[]>('list_check_ins', {
      start: start ?? null,
      end: end ?? null,
    }),
  summary: () => invoke<CheckInSummary>('check_in_summary'),
  upsert: (date: string, count: number) =>
    invoke<CheckIn>('upsert_check_in', { date, count }),
};
