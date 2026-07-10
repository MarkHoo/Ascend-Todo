import { invoke } from '@tauri-apps/api/core';
import type { ReminderItem, TaskReminderSettings } from '@/types';

export const remindersApi = {
  pending: (nowIso: string) => invoke<ReminderItem[]>('pending_reminders', { nowIso }),
  markSent: (taskId: string) => invoke<void>('mark_reminder_sent', { taskId }),
  upcoming: (limit?: number) =>
    invoke<ReminderItem[]>('upcoming_reminders', { limit: limit ?? null }),
  getSettings: (taskId: string) =>
    invoke<TaskReminderSettings>('get_task_reminder_settings', { taskId }),
  updateSettings: (settings: TaskReminderSettings) =>
    invoke<TaskReminderSettings>('update_task_reminder_settings', { ...settings }),
  snooze: (taskId: string, minutes?: number) =>
    invoke<void>('snooze_task_reminder', { taskId, minutes: minutes ?? null }),
  silenceToday: (taskId: string) =>
    invoke<void>('silence_task_reminder_today', { taskId }),
  showPopup: (item: ReminderItem) =>
    invoke<void>('show_reminder_popup', { item }),
  dismissPopup: () => invoke<void>('dismiss_reminder_popup'),
  openTask: (boardId: string, taskId: string) =>
    invoke<void>('open_reminder_task', { boardId, taskId }),
};
