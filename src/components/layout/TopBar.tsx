import { useTranslation } from 'react-i18next';
import { Cloud, CloudOff, Keyboard, RefreshCw, Loader2, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { syncApi, checkInsApi } from '@/api';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useAuthStore } from '@/store/useAuthStore';
import { toast } from '@/components/common/Toast';
import { formatRelativeDate } from '@/utils/format';
import type { SyncStatus } from '@/types';

export function TopBar() {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const session = useAuthStore((s) => s.session);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshStatus = async () => {
    try {
      const s = await syncApi.status();
      setStatus(s);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refreshStatus();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [settings.syncEnabled, session?.token]);

  const onSync = async (action: 'push' | 'pull') => {
    if (busy) return;
    setBusy(true);
    try {
      if (action === 'push') {
        await syncApi.push();
        toast.success(t('sync.pushed'));
      } else {
        await syncApi.pull();
        toast.success(t('sync.pulled'));
        // refresh check-ins after pull
        await checkInsApi.summary();
      }
      await refreshStatus();
    } catch (e) {
      toast.error(t('sync.failed', { msg: String(e) }));
    } finally {
      setBusy(false);
    }
  };

  if (!settings.syncEnabled) {
    return (
      <div
        className="h-10 px-4 flex items-center justify-end gap-2 text-xs text-text-muted border-b border-border"
        style={{ background: 'var(--surface)' }}
      >
        <button
          className="btn-ghost text-xs"
          title={t('quickSearch.title')}
          onClick={() => window.dispatchEvent(new CustomEvent('ascend:open-quick-search'))}
        >
          <Search size={14} />
        </button>
        <button
          className="btn-ghost text-xs"
          title={t('shortcuts.title')}
          onClick={() => window.dispatchEvent(new CustomEvent('ascend:open-shortcuts'))}
        >
          <Keyboard size={14} />
        </button>
        <div className="flex items-center gap-1.5">
          <CloudOff size={14} />
          {t('settings.syncEnabled')}: {t('common.off')}
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-10 px-4 flex items-center justify-end gap-2 text-xs border-b border-border"
      style={{ background: 'var(--surface)' }}
    >
      <button
        className="btn-ghost text-xs"
        title={t('quickSearch.title')}
        onClick={() => window.dispatchEvent(new CustomEvent('ascend:open-quick-search'))}
      >
        <Search size={14} />
      </button>
      <button
        className="btn-ghost text-xs"
        title={t('shortcuts.title')}
        onClick={() => window.dispatchEvent(new CustomEvent('ascend:open-shortcuts'))}
      >
        <Keyboard size={14} />
      </button>
      {session && status && (
        <div className="flex items-center gap-1.5 text-text-muted">
          <Cloud size={14} className="text-success" />
          {status.lastPushedAt && (
            <span>
              ↑ {formatRelativeDate(status.lastPushedAt, t)}
            </span>
          )}
        </div>
      )}
      <button
        disabled={busy || !session}
        onClick={() => onSync('push')}
        className="btn-ghost text-xs disabled:opacity-50"
        title={t('settings.syncNow')}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
      </button>
    </div>
  );
}
