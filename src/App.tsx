import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { useSettingsStore } from '@/store/useSettingsStore';
import { setDayjsLocale } from '@/utils/date';
import { settingsApi } from '@/api';
import { AppRouter } from './router';
import type { ReminderItem } from '@/types';
import { checkForAppUpdate, cleanupInstalledUpdate } from '@/utils/appUpdater';
import { detectAppLanguage } from '@/utils/language';

export const REMINDERS_CHANGED_EVENT = 'ascend:reminders-changed';

const REMINDER_FALLBACK_MS = 60_000;
const REMINDER_MAX_DELAY_MS = 24 * 60 * 60 * 1000;
const UPDATE_FIRST_CHECK_MS = 6_000;
const UPDATE_INTERVAL_MS = 20 * 60 * 1000;

function useThemeSync() {
  const settings = useSettingsStore((s) => s.settings);
  const setAll = useSettingsStore((s) => s.setAll);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

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

    tick();
    scheduleNext();
    fallbackTimer = window.setInterval(() => {
      tick();
      scheduleNext();
    }, REMINDER_FALLBACK_MS);
    window.addEventListener(REMINDERS_CHANGED_EVENT, handleRemindersChanged);

    return () => {
      disposed = true;
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

    const firstTimer = window.setTimeout(runCheck, UPDATE_FIRST_CHECK_MS);
    const interval = window.setInterval(runCheck, UPDATE_INTERVAL_MS);
    return () => {
      disposed = true;
      window.clearTimeout(firstTimer);
      window.clearInterval(interval);
    };
  }, [autoUpdate]);
}

export default function App() {
  useThemeSync();
  useLangSync();
  useReminderScheduling();
  useTrayNavigation();
  useAutoUpdater();
  return <AppRouter />;
}
