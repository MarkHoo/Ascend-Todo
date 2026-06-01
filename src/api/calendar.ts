import { invoke } from '@tauri-apps/api/core';
import type { CalendarEntry } from '@/types';

export const calendarApi = {
  range: (start: string, end: string) =>
    invoke<CalendarEntry[]>('calendar_range', { start, end }),
};
