import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AppSettings } from '@/types';
import { detectAppLanguage } from '@/utils/language';
import { defaultHolidayCountryForLanguage } from '@/utils/holidayCountries';

interface State {
  settings: AppSettings;
  setSettings: (s: Partial<AppSettings>) => void;
  setAll: (s: AppSettings) => void;
}

const detectedLanguage = detectAppLanguage();

const defaultSettings: AppSettings = {
  theme: 'aurora-day',
  displaySize: 'standard',
  language: detectedLanguage,
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
  calendarDefaultTimedReminderMinutes: 10,
  calendarDefaultAllDayReminder: 'same_day_09',
  calendarDefaultDurationMinutes: 30,
  calendarDefaultEventColor: '#2563eb',
  calendarEventDensity: 'comfortable',
  holidayCountry: defaultHolidayCountryForLanguage(detectedLanguage),
};

export function withDefaultSettings(settings: Partial<AppSettings>): AppSettings {
  const language = settings.language || defaultSettings.language;
  return {
    ...defaultSettings,
    holidayCountry: defaultHolidayCountryForLanguage(language),
    ...settings,
  };
}

export const useSettingsStore = create<State>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      setSettings: (s) =>
        set((st) => ({ settings: { ...st.settings, ...s } })),
      setAll: (s) => set({ settings: withDefaultSettings(s) }),
    }),
    {
      name: 'ascend:settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (st) => ({ settings: st.settings }),
      merge: (persisted, current) => {
        const persistedSettings = (persisted as Partial<State> | undefined)?.settings || {};
        return {
          ...current,
          settings: withDefaultSettings(persistedSettings),
        };
      },
    },
  ),
);
