import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AppSettings } from '@/types';

interface State {
  settings: AppSettings;
  setSettings: (s: Partial<AppSettings>) => void;
  setAll: (s: AppSettings) => void;
}

const defaultSettings: AppSettings = {
  theme: 'aurora-day',
  language: 'en',
  weekStart: 'mon',
  pomodoroDuration: 25 * 60,
  pomodoroLongBreak: 5 * 60,
  autoUpdate: true,
  syncEnabled: false,
  syncServerUrl: null,
  reminderSound: 'bell',
  notificationEnabled: true,
  motivationalQuotes: true,
  autoStart: true,
  minimizeToTray: true,
};

export const useSettingsStore = create<State>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      setSettings: (s) =>
        set((st) => ({ settings: { ...st.settings, ...s } })),
      setAll: (s) => set({ settings: s }),
    }),
    {
      name: 'ascend:settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (st) => ({ settings: st.settings }),
    },
  ),
);
