import { useEffect, useState } from 'react';
import { BellRing, Clock3, ExternalLink, VolumeX, X } from 'lucide-react';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useTranslation } from 'react-i18next';
import { remindersApi } from '@/api';
import type { ReminderItem } from '@/types';

const STOP_REMINDER_SOUND_EVENT = 'ascend:stop-reminder-sound';

function itemFromQuery(): ReminderItem {
  const params = new URLSearchParams(window.location.search);
  return {
    taskId: params.get('taskId') || '',
    taskTitle: params.get('taskTitle') || '',
    boardId: params.get('boardId') || '',
    boardName: params.get('boardName') || '',
    listName: params.get('listName') || '',
    isCompleted: false,
    soundEnabled: true,
    notificationEnabled: true,
  };
}

export default function ReminderPopupPage() {
  const { t } = useTranslation();
  const [item, setItem] = useState<ReminderItem>(itemFromQuery);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const unlisten = listen<ReminderItem>('reminder-popup-data', (event) => {
      setItem(event.payload);
      setWorking(false);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const stopReminderSound = () => {
    emit(STOP_REMINDER_SOUND_EVENT).catch(() => {});
  };

  const close = async () => {
    stopReminderSound();
    await getCurrentWindow().close();
  };

  const run = async (action: 'view' | 'snooze' | 'today') => {
    stopReminderSound();
    if (!item.taskId || working) return;
    setWorking(true);
    try {
      if (action === 'snooze') {
        await remindersApi.snooze(item.taskId);
      } else if (action === 'today') {
        await remindersApi.silenceToday(item.taskId);
      } else {
        await remindersApi.openTask(item.boardId, item.taskId);
      }
      await close();
    } finally {
      setWorking(false);
    }
  };

  return (
    <main className="relative h-screen overflow-hidden border border-border bg-surface text-text shadow-2xl">
      <div className="h-1 bg-primary" />
      <header className="flex h-12 items-center gap-3 border-b border-border px-4">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary">
          <BellRing size={18} strokeWidth={2} />
        </span>
        <strong className="min-w-0 flex-1 text-sm font-semibold">
          {t('reminder.taskReminder')}
        </strong>
        <button
          type="button"
          className="grid h-8 w-8 place-items-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text"
          onClick={close}
          title={t('reminder.closeCurrent')}
          aria-label={t('reminder.closeCurrent')}
        >
          <X size={17} />
        </button>
      </header>

      <section className="px-4 pb-3 pt-4">
        <div className="truncate text-base font-semibold" title={item.taskTitle}>
          {item.taskTitle}
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-text-muted">
          <span className="truncate">{item.boardName}</span>
          <span aria-hidden="true">/</span>
          <span className="truncate">{item.listName}</span>
        </div>
      </section>

      <footer className="absolute inset-x-0 bottom-0 grid grid-cols-3 gap-2 border-t border-border bg-surface-2 px-3 py-3">
        <button
          type="button"
          className="btn-primary flex h-9 items-center justify-center gap-1.5 px-2 text-xs"
          onClick={() => run('view')}
          disabled={working}
        >
          <ExternalLink size={15} />
          {t('reminder.viewTask')}
        </button>
        <button
          type="button"
          className="btn-outline flex h-9 items-center justify-center gap-1.5 px-2 text-xs"
          onClick={() => run('snooze')}
          disabled={working}
        >
          <Clock3 size={15} />
          {t('reminder.snooze')}
        </button>
        <button
          type="button"
          className="btn-outline flex h-9 items-center justify-center gap-1.5 px-2 text-xs"
          onClick={() => run('today')}
          disabled={working}
        >
          <VolumeX size={15} />
          {t('reminder.silentToday')}
        </button>
      </footer>
    </main>
  );
}
