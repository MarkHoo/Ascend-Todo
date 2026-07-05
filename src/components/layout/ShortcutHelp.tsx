import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/common/Modal';

type ShortcutItem = {
  keys: string[];
  label: string;
  run?: () => void;
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="min-w-7 h-7 px-2 inline-flex items-center justify-center rounded border border-border bg-surface-2 text-xs font-semibold text-text">
      {children}
    </kbd>
  );
}

export function ShortcutHelp() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const openHelp = useCallback(() => setOpen(true), []);
  const closeHelp = useCallback(() => setOpen(false), []);

  const shortcuts = useMemo<ShortcutItem[]>(() => [
    { keys: ['?'], label: t('shortcuts.openHelp'), run: openHelp },
    { keys: ['Ctrl', 'K'], label: t('quickSearch.title'), run: () => window.dispatchEvent(new CustomEvent('ascend:open-quick-search')) },
    { keys: ['/'], label: t('quickSearch.title'), run: () => window.dispatchEvent(new CustomEvent('ascend:open-quick-search')) },
    { keys: ['Ctrl', '1'], label: t('nav.overview'), run: () => navigate('/overview') },
    { keys: ['Ctrl', '2'], label: t('nav.boards'), run: () => navigate('/boards') },
    { keys: ['Ctrl', '3'], label: t('nav.goals'), run: () => navigate('/goals') },
    { keys: ['Ctrl', '4'], label: t('nav.calendar'), run: () => navigate('/calendar') },
    { keys: ['Ctrl', '5'], label: t('nav.pomodoro'), run: () => navigate('/pomodoro') },
    { keys: ['Ctrl', ','], label: t('nav.settings'), run: () => navigate('/settings') },
    { keys: ['Ctrl', 'Shift', 'P'], label: t('nav.profile'), run: () => navigate('/profile') },
    { keys: ['Ctrl', 'Shift', 'C'], label: t('shortcuts.calendarSettings', { defaultValue: '日历设置' }), run: () => navigate('/settings?section=calendar') },
    { keys: ['Ctrl', 'Shift', 'U'], label: t('shortcuts.aboutUpdate', { defaultValue: '关于与更新' }), run: () => navigate('/settings?section=about') },
    { keys: ['Esc'], label: t('shortcuts.closePanel'), run: closeHelp },
  ], [closeHelp, navigate, openHelp, t]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      const key = event.key.toLowerCase();
      const primary = event.ctrlKey || event.metaKey;
      let match: ShortcutItem | undefined;

      if (key === '?' || (event.shiftKey && key === '/')) {
        match = shortcuts[0];
      } else if (primary && !event.shiftKey && key === 'k') {
        match = shortcuts[1];
      } else if (!primary && !event.shiftKey && event.key === '/') {
        match = shortcuts[2];
      } else if (primary && !event.shiftKey && ['1', '2', '3', '4', '5'].includes(key)) {
        match = shortcuts[Number(key) + 2];
      } else if (primary && !event.shiftKey && event.key === ',') {
        match = shortcuts[8];
      } else if (primary && event.shiftKey && key === 'p') {
        match = shortcuts[9];
      } else if (primary && event.shiftKey && key === 'c') {
        match = shortcuts[10];
      } else if (primary && event.shiftKey && key === 'u') {
        match = shortcuts[11];
      } else if (open && event.key === 'Escape') {
        match = shortcuts[12];
      }

      if (!match?.run) return;
      event.preventDefault();
      match.run();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, shortcuts]);

  useEffect(() => {
    const openFromTopBar = () => openHelp();
    window.addEventListener('ascend:open-shortcuts', openFromTopBar);
    return () => window.removeEventListener('ascend:open-shortcuts', openFromTopBar);
  }, [openHelp]);

  return (
    <Modal open={open} onClose={closeHelp} title={t('shortcuts.title')} size="lg" closeOnBackdrop>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {shortcuts.map((item) => (
          <div key={`${item.keys.join('+')}-${item.label}`} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-3 py-2.5">
            <div className="text-sm font-medium min-w-0 truncate">{item.label}</div>
            <div className="flex items-center gap-1 shrink-0">
              {item.keys.map((key, index) => (
                <span key={`${key}-${index}`} className="inline-flex items-center gap-1">
                  {index > 0 && <span className="text-xs text-text-muted">+</span>}
                  <Kbd>{key}</Kbd>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
