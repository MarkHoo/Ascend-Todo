import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/store/useSettingsStore';
import { setDayjsLocale } from '@/utils/date';
import { settingsApi } from '@/api';
import { AppRouter } from './router';

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
  }, [lang, i18n]);
}

function useReminderPolling() {
  useEffect(() => {
    let timer: number | undefined;
    const tick = async () => {
      try {
        const { remindersApi } = await import('@/api');
        const { isPermissionGranted, requestPermission, sendNotification } = await import(
          '@tauri-apps/plugin-notification'
        );
        const settings = useSettingsStore.getState().settings;
        if (!settings.notificationEnabled) return;
        let granted = await isPermissionGranted();
        if (!granted) {
          const p = await requestPermission();
          granted = p === 'granted';
        }
        if (!granted) return;
        const items = await remindersApi.pending(new Date().toISOString());
        for (const it of items) {
          sendNotification({
            title: '光阶Todo · 任务提醒',
            body: `${it.taskTitle}（${it.boardName} / ${it.listName}）`,
          });
          // play sound
          if (settings.reminderSound !== 'none') {
            try {
              const { playReminderSound } = await import('@/utils/sound');
              playReminderSound(settings.reminderSound);
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* ignore */
      }
    };
    timer = window.setInterval(tick, 60_000);
    tick();
    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);
}

export default function App() {
  useThemeSync();
  useLangSync();
  useReminderPolling();
  return <AppRouter />;
}
