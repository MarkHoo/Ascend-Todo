import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { useSettingsStore } from '@/store/useSettingsStore';
import { usePomodoroStore } from '@/store/usePomodoroStore';
import { setDayjsLocale } from '@/utils/date';
import { settingsApi } from '@/api';
import { AppRouter } from './router';
import type { ReminderItem } from '@/types';
import { checkForAppUpdate, cleanupInstalledUpdate } from '@/utils/appUpdater';
import { detectAppLanguage } from '@/utils/language';
import { defaultHolidayCountryForLanguage } from '@/utils/holidayCountries';

export const REMINDERS_CHANGED_EVENT = 'ascend:reminders-changed';
export const STOP_REMINDER_SOUND_EVENT = 'ascend:stop-reminder-sound';

const REMINDER_FALLBACK_MS = 5 * 60_000;
const REMINDER_MAX_DELAY_MS = 24 * 60 * 60 * 1000;
const UPDATE_INTERVAL_MS = 20 * 60 * 1000;
const CALENDAR_EMAIL_FOREGROUND_SYNC_MS = 10 * 60 * 1000;
const CALENDAR_EMAIL_BACKGROUND_SYNC_MS = 30 * 60 * 1000;
const CALENDAR_EMAIL_RESUME_SYNC_MS = 10 * 60 * 1000;
const STARTUP_BACKGROUND_TASK_DELAY_MS = 12_000;
const STARTUP_SYNC_DELAY_MS = 60_000;
const CALENDAR_EMAIL_BACKOFF_MS = [60_000, 3 * 60_000, 5 * 60_000, 10 * 60_000];

let calendarEmailSyncInFlight = false;
let calendarEmailLastSyncAt = 0;
let calendarEmailFailureCount = 0;

function runWhenIdle(task: () => void, timeout = 2_000) {
  const idleCallback = (window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (idleCallback) {
    idleCallback(task, { timeout });
    return;
  }
  window.setTimeout(task, 0);
}

function useThemeSync() {
  const settings = useSettingsStore((s) => s.settings);
  const setAll = useSettingsStore((s) => s.setAll);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-display-size', settings.displaySize || 'standard');
  }, [settings.displaySize]);

  useEffect(() => {
    (async () => {
      try {
        const remote = await settingsApi.get();
        const hasSavedLanguage = await settingsApi.has('language');
        if (!hasSavedLanguage) {
          const { locale } = await import('@tauri-apps/plugin-os');
          remote.language = detectAppLanguage(await locale());
          await settingsApi.save(remote);
        }
        setAll(remote);
      } catch {
        /* first run */
      }
    })();
  }, [setAll]);
}

function useLangSync() {
  const { i18n } = useTranslation();
  const lang = useSettingsStore((s) => s.settings.language);
  useEffect(() => {
    setDayjsLocale(lang);
    i18n.changeLanguage(lang);
    const name = i18n.getResource(lang, 'translation', 'app.name') || 'Ascend Todo';
    const slogan = i18n.getResource(lang, 'translation', 'app.slogan') || '';
    getCurrentWindow().setTitle(`${name} - ${slogan}`).catch(() => {});
  }, [lang, i18n]);
}

function getNextReminderDelay(item: ReminderItem, now: Date): number | null {
  const candidates: number[] = [];
  if (item.nextReminderAt) {
    const next = new Date(item.nextReminderAt).getTime();
    if (!Number.isNaN(next)) return Math.max(0, next - now.getTime());
  }
  if (item.reminderAt) {
    const at = new Date(item.reminderAt).getTime();
    if (!Number.isNaN(at)) candidates.push(at - now.getTime());
  }
  if (item.reminderTime && /^\d{2}:\d{2}$/.test(item.reminderTime)) {
    const [hours, minutes] = item.reminderTime.split(':').map(Number);
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    candidates.push(next.getTime() - now.getTime());
  }
  const valid = candidates.filter((delay) => delay >= 0).sort((a, b) => a - b);
  return valid[0] ?? null;
}

function useReminderScheduling() {
  const settings = useSettingsStore((s) => s.settings);

  const tick = useCallback(async () => {
    try {
      const { remindersApi } = await import('@/api');
      const { isPermissionGranted, requestPermission, sendNotification } = await import(
        '@tauri-apps/plugin-notification'
      );
      const currentSettings = useSettingsStore.getState().settings;
      const items = await remindersApi.pending(new Date().toISOString());
      const lang = currentSettings.language;
      const appName =
        lang === 'zh-CN' ? '\u5149\u9636Todo' :
        lang === 'zh-TW' ? '\u5149\u968eTodo' : 'Ascend Todo';
      const title = lang.startsWith('zh') ? '\u4efb\u52a1\u63d0\u9192' : 'Task Reminder';

      for (const it of items) {
        if (currentSettings.notificationEnabled && it.notificationEnabled) {
          let granted = await isPermissionGranted();
          if (!granted) {
            const permission = await requestPermission();
            granted = permission === 'granted';
          }
          if (granted) {
            sendNotification({
              title: `${appName} · ${title}`,
              body: `${it.taskTitle} (${it.boardName} / ${it.listName})`,
            });
          }
        }
        try {
          await remindersApi.markSent(it.taskId);
        } catch {
          /* ignore */
        }
        if (it.soundEnabled && currentSettings.reminderSound !== 'none') {
          try {
            const { playReminderSound } = await import('@/utils/sound');
            playReminderSound(currentSettings.reminderSound);
          } catch {
            /* ignore */
          }
        }
        await remindersApi.showPopup(it);
      }
    } catch (error) {
      console.error('Reminder tick failed', error);
    }
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    let fallbackTimer: number | undefined;
    let disposed = false;

    const clearReminderTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    };

    const scheduleNext = async () => {
      clearReminderTimer();
      if (disposed) return;
      try {
        const { remindersApi } = await import('@/api');
        const upcoming = await remindersApi.upcoming(100);
        const now = new Date();
        const nextDelay = upcoming
          .map((item) => getNextReminderDelay(item, now))
          .filter((delay): delay is number => delay !== null)
          .sort((a, b) => a - b)[0];
        const delay = Math.min(nextDelay ?? REMINDER_FALLBACK_MS, REMINDER_MAX_DELAY_MS);
        timer = window.setTimeout(async () => {
          await tick();
          scheduleNext();
        }, Math.max(0, delay));
      } catch (error) {
        console.error('Reminder scheduling failed', error);
        timer = window.setTimeout(scheduleNext, REMINDER_FALLBACK_MS);
      }
    };

    const handleRemindersChanged = () => {
      scheduleNext();
    };

    const startupTimer = window.setTimeout(() => {
      runWhenIdle(() => {
        tick();
        scheduleNext();
      });
    }, STARTUP_BACKGROUND_TASK_DELAY_MS);
    fallbackTimer = window.setInterval(() => {
      runWhenIdle(() => {
        tick();
        scheduleNext();
      });
    }, REMINDER_FALLBACK_MS);
    window.addEventListener(REMINDERS_CHANGED_EVENT, handleRemindersChanged);

    return () => {
      disposed = true;
      window.clearTimeout(startupTimer);
      clearReminderTimer();
      if (fallbackTimer) clearInterval(fallbackTimer);
      window.removeEventListener(REMINDERS_CHANGED_EVENT, handleRemindersChanged);
    };
  }, [settings.notificationEnabled, settings.reminderSound, settings.language, tick]);
}

function useTrayNavigation() {
  useEffect(() => {
    const unlisten = listen<string>('navigate', (event) => {
      window.location.hash = `#${event.payload}`;
    });
    const unlistenReminder = listen<{ boardId: string; taskId: string }>(
      'open-reminder-task',
      (event) => {
        window.location.hash = `#/boards/${event.payload.boardId}?task=${event.payload.taskId}`;
      },
    );
    return () => {
      unlisten.then((fn) => fn());
      unlistenReminder.then((fn) => fn());
    };
  }, []);
}

function useReminderSoundStopListener() {
  useEffect(() => {
    const unlisten = listen(STOP_REMINDER_SOUND_EVENT, async () => {
      try {
        const { stopAllSounds } = await import('@/utils/sound');
        stopAllSounds();
      } catch {
        /* sound cleanup is best effort */
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}

function useAutoUpdater() {
  const autoUpdate = useSettingsStore((s) => s.settings.autoUpdate);

  useEffect(() => {
    cleanupInstalledUpdate().catch((error) => {
      console.error('Update cache cleanup failed', error);
    });
  }, []);

  useEffect(() => {
    if (!autoUpdate) return;
    let disposed = false;

    const runCheck = () => {
      if (disposed) return;
      checkForAppUpdate({ silent: true }).catch((error) => {
        console.error('Auto update check failed', error);
      });
    };

    const startupTimer = window.setTimeout(() => runWhenIdle(runCheck), STARTUP_BACKGROUND_TASK_DELAY_MS);
    const interval = window.setInterval(() => runWhenIdle(runCheck), UPDATE_INTERVAL_MS);
    return () => {
      disposed = true;
      window.clearTimeout(startupTimer);
      window.clearInterval(interval);
    };
  }, [autoUpdate]);
}

function useCalendarHolidayAutoSync() {
  const language = useSettingsStore((s) => s.settings.language);
  const holidayCountry = useSettingsStore((s) => s.settings.holidayCountry);

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    const targetCountry = holidayCountry || defaultHolidayCountryForLanguage(language);
    const runSync = async () => {
      try {
        const { calendarApi } = await import('@/api');
        const status = await calendarApi.syncStatus();
        const hasFreshHolidayCalendar =
          status.holidayCountry === targetCountry &&
          status.holidayEventCount > 0 &&
          status.holidayLastSyncAt &&
          Date.now() - new Date(status.holidayLastSyncAt).getTime() < 24 * 60 * 60 * 1000;

        if (hasFreshHolidayCalendar) {
          return;
        }
        await calendarApi.syncHolidayCountry({ countryCode: targetCountry, language });
        if (!disposed) {
          window.dispatchEvent(new CustomEvent('ascend:calendar-sync-finished'));
        }
      } catch (error) {
        console.error('Calendar holiday auto sync failed', error);
      }
    };
    timer = window.setTimeout(() => runWhenIdle(runSync), STARTUP_BACKGROUND_TASK_DELAY_MS);
    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [holidayCountry, language]);
}

function useCalendarEmailAutoSync() {
  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;

    const currentDelay = () => {
      if (calendarEmailFailureCount > 0) {
        return CALENDAR_EMAIL_BACKOFF_MS[Math.min(calendarEmailFailureCount - 1, CALENDAR_EMAIL_BACKOFF_MS.length - 1)];
      }
      return document.visibilityState === 'visible'
        ? CALENDAR_EMAIL_FOREGROUND_SYNC_MS
        : CALENDAR_EMAIL_BACKGROUND_SYNC_MS;
    };

    const runSync = async (force = false) => {
      if (disposed || calendarEmailSyncInFlight) return;
      if (!force && Date.now() - calendarEmailLastSyncAt < CALENDAR_EMAIL_RESUME_SYNC_MS) return;
      calendarEmailSyncInFlight = true;
      try {
        const { calendarApi } = await import('@/api');
        const status = await calendarApi.syncStatus();
        if (status.emailEnabledCount <= 0) return;
        const lastSyncAt = status.emailLastSyncAt ? new Date(status.emailLastSyncAt).getTime() : 0;
        const minInterval = document.visibilityState === 'visible'
          ? CALENDAR_EMAIL_FOREGROUND_SYNC_MS
          : CALENDAR_EMAIL_BACKGROUND_SYNC_MS;
        if (!force && lastSyncAt > 0 && Date.now() - lastSyncAt < minInterval) return;
        await calendarApi.syncEmailAccounts();
        calendarEmailLastSyncAt = Date.now();
        calendarEmailFailureCount = 0;
        window.dispatchEvent(new CustomEvent('ascend:calendar-sync-finished'));
      } catch (error) {
        calendarEmailFailureCount += 1;
        console.error('Calendar email auto sync failed', error);
      } finally {
        calendarEmailSyncInFlight = false;
      }
    };

    const scheduleNext = (delay: number) => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        await new Promise<void>((resolve) => runWhenIdle(() => {
          runSync().finally(resolve);
        }));
        scheduleNext(currentDelay());
      }, delay);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && Date.now() - calendarEmailLastSyncAt >= CALENDAR_EMAIL_RESUME_SYNC_MS) {
        runWhenIdle(() => runSync(false));
      }
      scheduleNext(currentDelay());
    };

    const startupTimer = window.setTimeout(() => {
      runWhenIdle(() => runSync(false));
      scheduleNext(currentDelay());
    }, STARTUP_SYNC_DELAY_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      disposed = true;
      window.clearTimeout(startupTimer);
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}

function usePomodoroRuntime() {
  const {
    running,
    paused,
    mode,
    durationSeconds,
    startedAtMs,
    pausedAtMs,
    accumulatedPauseMs,
    finishActive,
  } = usePomodoroStore();

  useEffect(() => {
    if (!running || paused || mode !== 'countdown' || !startedAtMs) return;
    let finishing = false;
    const check = () => {
      if (finishing) return;
      const currentMs = paused && pausedAtMs ? pausedAtMs : Date.now();
      const elapsedSeconds = Math.max(0, Math.floor((currentMs - startedAtMs - accumulatedPauseMs) / 1000));
      if (elapsedSeconds >= durationSeconds) {
        finishing = true;
        finishActive(true, elapsedSeconds).catch((error) => {
          finishing = false;
          console.error('Pomodoro finish failed', error);
        });
      }
    };
    check();
    const interval = window.setInterval(check, 1_000);
    return () => window.clearInterval(interval);
  }, [accumulatedPauseMs, durationSeconds, finishActive, mode, paused, pausedAtMs, running, startedAtMs]);
}

export default function App() {
  useThemeSync();
  useLangSync();
  useReminderScheduling();
  useReminderSoundStopListener();
  useTrayNavigation();
  useAutoUpdater();
  useCalendarHolidayAutoSync();
  useCalendarEmailAutoSync();
  usePomodoroRuntime();
  return <AppRouter />;
}
