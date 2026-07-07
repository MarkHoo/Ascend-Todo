import { invoke } from '@tauri-apps/api/core';
import type { AppSettings } from '@/types';

export const settingsApi = {
  get: () => invoke<AppSettings>('get_settings'),
  set: (key: string, value: string) => invoke<void>('set_setting', { key, value }),
  has: (key: string) => invoke<boolean>('has_setting', { key }),
  save: (settings: AppSettings) => invoke<void>('save_settings', { settings }),
};
