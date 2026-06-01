import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings as SettingsIcon, Sun, Moon, Bell, Cloud, User, Info, RefreshCw } from 'lucide-react';
import { settingsApi, syncApi, authApi } from '@/api';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useAuthStore } from '@/store/useAuthStore';
import { THEMES, LANGUAGES, SOUNDS, APP_VERSION } from '@/utils/constants';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { toast } from '@/components/common/Toast';
import { dayjs } from '@/utils/date';
import type { SyncStatus } from '@/types';

export function SettingsPage() {
  const { t } = useTranslation();
  const { settings, setSettings, setAll } = useSettingsStore();
  const { session, setSession } = useAuthStore();
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [serverUrl, setServerUrl] = useState('');
  const [nick, setNick] = useState('');
  const [pw, setPw] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await syncApi.status();
        setSyncStatus(s);
        setServerUrl(s.serverUrl || '');
      } catch {
        /* */
      }
      try {
        const sess = await authApi.current();
        if (sess) setSession(sess);
      } catch {
        /* */
      }
    })();
  }, [setSession]);

  const onSaveSettings = async (patch: Partial<typeof settings>) => {
    const next = { ...settings, ...patch };
    setSettings(patch);
    try {
      await settingsApi.save(next);
    } catch (e) {
      console.error(e);
    }
  };

  const onAuth = async () => {
    if (!nick || !pw) {
      toast.error('!');
      return;
    }
    setBusy(true);
    try {
      const s = authMode === 'login'
        ? await authApi.login({ nickname: nick, password: pw, serverUrl: serverUrl || undefined })
        : await authApi.register({ nickname: nick, password: pw, serverUrl: serverUrl || undefined });
      setSession(s);
      toast.success('✓');
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onLogout = async () => {
    try {
      await authApi.logout();
      setSession(null);
      toast.info(t('sync.loggedOut'));
    } catch (e) {
      toast.error(String(e));
    }
  };

  const onSync = async (action: 'push' | 'pull') => {
    setBusy(true);
    try {
      if (action === 'push') {
        await syncApi.push();
        toast.success(t('sync.pushed'));
      } else {
        await syncApi.pull();
        toast.success(t('sync.pulled'));
      }
      const s = await syncApi.status();
      setSyncStatus(s);
    } catch (e) {
      toast.error(t('sync.failed', { msg: String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const onCheckUpdate = async () => {
    // Tauri updater plugin is not initialized in this build (no public update
    // server configured). Show a friendly placeholder.
    toast.info('Update check unavailable: no update server configured');
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold flex items-center gap-2 mb-4">
        <SettingsIcon size={22} />
        {t('settings.title')}
      </h1>

      <Section icon={<Sun size={16} />} title={t('settings.appearance')}>
        <Row label={t('settings.themes')}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {THEMES.map((th) => (
              <button
                key={th.id}
                onClick={() => onSaveSettings({ theme: th.id as any })}
                className={`card p-3 text-left ${settings.theme === th.id ? 'ring-2 ring-primary' : ''}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {th.id === 'midnight' || th.id === 'forest' ? <Moon size={12} /> : <Sun size={12} />}
                  <span className="text-sm font-medium">{t(`settings.theme_${th.id.split('-')[0]}`)}</span>
                </div>
                <div className="flex gap-1">
                  <span
                    className="w-3 h-3 rounded"
                    style={{
                      background:
                        th.id === 'aurora-day'
                          ? '#6366f1'
                          : th.id === 'mint-garden'
                            ? '#10b981'
                            : th.id === 'midnight'
                              ? '#1c2440'
                              : '#22c55e',
                    }}
                  />
                  <span
                    className="w-3 h-3 rounded"
                    style={{
                      background:
                        th.id === 'aurora-day'
                          ? '#eef2ff'
                          : th.id === 'mint-garden'
                            ? '#d1fae5'
                            : th.id === 'midnight'
                              ? '#312e81'
                              : '#15803d',
                    }}
                  />
                </div>
              </button>
            ))}
          </div>
        </Row>
        <Row label={t('settings.language')}>
          <div className="card p-0.5 flex items-center text-sm">
            {LANGUAGES.map((l) => (
              <button
                key={l.id}
                onClick={() => onSaveSettings({ language: l.id as any })}
                className={`px-3 py-1.5 rounded-md transition-colors ${settings.language === l.id ? 'bg-primary text-white' : 'text-text-muted hover:text-text'}`}
              >
                {l.name}
              </button>
            ))}
          </div>
        </Row>
        <Row label={t('settings.weekStart')}>
          <div className="card p-0.5 flex items-center text-sm">
            <button
              onClick={() => onSaveSettings({ weekStart: 'mon' })}
              className={`px-3 py-1.5 rounded-md ${settings.weekStart === 'mon' ? 'bg-primary text-white' : 'text-text-muted'}`}
            >
              {t('settings.monday')}
            </button>
            <button
              onClick={() => onSaveSettings({ weekStart: 'sun' })}
              className={`px-3 py-1.5 rounded-md ${settings.weekStart === 'sun' ? 'bg-primary text-white' : 'text-text-muted'}`}
            >
              {t('settings.sunday')}
            </button>
          </div>
        </Row>
      </Section>

      <Section icon={<SettingsIcon size={16} />} title={t('settings.pomodoroSettings')}>
        <Row label={t('settings.defaultDuration')}>
          <Input
            type="number"
            value={Math.round(settings.pomodoroDuration / 60)}
            onChange={(e) => onSaveSettings({ pomodoroDuration: (Number(e.target.value) || 25) * 60 })}
            className="w-24"
          />
        </Row>
        <Row label={t('settings.longBreak')}>
          <Input
            type="number"
            value={Math.round(settings.pomodoroLongBreak / 60)}
            onChange={(e) => onSaveSettings({ pomodoroLongBreak: (Number(e.target.value) || 5) * 60 })}
            className="w-24"
          />
        </Row>
      </Section>

      <Section icon={<Bell size={16} />} title={t('settings.reminder')}>
        <Row label={t('settings.notification')}>
          <Toggle
            value={settings.notificationEnabled}
            onChange={(v) => onSaveSettings({ notificationEnabled: v })}
          />
        </Row>
        <Row label={t('settings.quote')}>
          <Toggle
            value={settings.motivationalQuotes}
            onChange={(v) => onSaveSettings({ motivationalQuotes: v })}
          />
        </Row>
        <Row label={t('settings.reminderSound')}>
          <div className="card p-0.5 flex items-center text-sm">
            {SOUNDS.map((s) => (
              <button
                key={s.id}
                onClick={() => onSaveSettings({ reminderSound: s.id as any })}
                className={`px-3 py-1.5 rounded-md ${settings.reminderSound === s.id ? 'bg-primary text-white' : 'text-text-muted'}`}
              >
                {t(`settings.${s.id}`)}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      <Section icon={<Cloud size={16} />} title={t('settings.sync')}>
        <Row label={t('settings.syncEnabled')}>
          <Toggle
            value={settings.syncEnabled}
            onChange={async (v) => {
              await onSaveSettings({ syncEnabled: v });
              if (v) {
                const s = await syncApi.status();
                setSyncStatus(s);
              }
            }}
          />
        </Row>
        <Row label={t('settings.syncServer')}>
          <Input
            value={settings.syncServerUrl || ''}
            onChange={(e) => onSaveSettings({ syncServerUrl: e.target.value || null })}
            placeholder="https://..."
            className="flex-1"
          />
        </Row>
        <Row label={t('settings.syncNow')}>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onSync('push')} disabled={busy || !session}>
              ↑ push
            </Button>
            <Button size="sm" variant="outline" onClick={() => onSync('pull')} disabled={busy || !session}>
              ↓ pull
            </Button>
            {syncStatus?.lastPushedAt && (
              <span className="text-xs text-text-muted self-center">
                {t('settings.lastSync')}: {dayjs(syncStatus.lastPushedAt).format('YYYY-MM-DD HH:mm')}
              </span>
            )}
          </div>
        </Row>
      </Section>

      <Section icon={<User size={16} />} title={t('settings.account')}>
        {session ? (
          <>
            <div className="text-sm">
              {t('settings.loggedInAs', { name: session.nickname })}
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="danger" onClick={onLogout}>
                {t('settings.logout')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="card p-0.5 flex items-center text-sm w-fit mb-3">
              {(['login', 'register'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setAuthMode(m)}
                  className={`px-3 py-1.5 rounded-md ${authMode === m ? 'bg-primary text-white' : 'text-text-muted'}`}
                >
                  {t(`settings.${m}`)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
              <Input
                label={t('settings.nickname')}
                value={nick}
                onChange={(e) => setNick(e.target.value)}
              />
              <Input
                label={t('settings.password')}
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
            </div>
            <Button onClick={onAuth} disabled={busy}>
              {t(`settings.${authMode}`)}
            </Button>
          </>
        )}
      </Section>

      <Section icon={<Info size={16} />} title={t('settings.about')}>
        <Row label={t('settings.version')}>
          <span className="text-sm text-text-muted">v{APP_VERSION}</span>
        </Row>
        <Row label={t('settings.autoUpdate')}>
          <Toggle
            value={settings.autoUpdate}
            onChange={(v) => onSaveSettings({ autoUpdate: v })}
          />
        </Row>
        <Row label={t('settings.checkUpdate')}>
          <Button size="sm" variant="outline" onClick={onCheckUpdate}>
            <RefreshCw size={14} />
            {t('settings.checkUpdate')}
          </Button>
        </Row>
      </Section>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5 mb-4">
      <div className="text-sm font-semibold mb-3 flex items-center gap-2">
        {icon}
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <div className="w-32 shrink-0 text-sm text-text-muted">{label}</div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="w-11 h-6 rounded-full transition-colors relative"
      style={{ background: value ? 'var(--primary)' : 'var(--surface-2)' }}
    >
      <span
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform shadow"
        style={{ left: value ? '22px' : '2px' }}
      />
    </button>
  );
}
