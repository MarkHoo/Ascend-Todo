import { invoke } from '@tauri-apps/api/core';
import type { ReminderItem } from '@/types';

export const remindersApi = {
  pending: (nowIso: string) => invoke<ReminderItem[]>('pending_reminders', { nowIso }),
  upcoming: (limit?: number) =>
    invoke<ReminderItem[]>('upcoming_reminders', { limit: limit ?? null }),
};
