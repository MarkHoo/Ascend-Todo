import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Cloud,
  Database,
  Info,
  MonitorCog,
  Moon,
  Palette,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldCheck,
  Sun,
  Timer,
  User,
  Zap,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { settingsApi, syncApi, authApi } from '@/api';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { toast } from '@/components/common/Toast';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { APP_VERSION, LANGUAGES, SOUNDS, THEMES } from '@/utils/constants';
import { dayjs } from '@/utils/date';
import { playSoundPreview, stopSound } from '@/utils/sound';
import {
  checkForAppUpdate,
  getDownloadedUpdateStatus,
  installDownloadedUpdate,
  type UpdateStatus,
} from '@/utils/appUpdater';
import type { AppSettings, SyncStatus } from '@/types';

type SectionId =
  | 'appearance'
  | 'tasks'
  | 'notifications'
  | 'pomodoro'
  | 'sync'
  | 'window'
  | 'data'
  | 'about';

const navItems: Array<{ id: SectionId; label: string; icon: React.ReactNode }> = [
  { id: 'appearance', label: '外观', icon: <Palette size={16} /> },
  { id: 'tasks', label: '任务与交互', icon: <Zap size={16} /> },
  { id: 'notifications', label: '提醒与通知', icon: <Bell size={16} /> },
  { id: 'pomodoro', label: '番茄钟', icon: <Timer size={16} /> },
  { id: 'sync', label: '同步与账号', icon: <Cloud size={16} /> },
  { id: 'window', label: '启动与窗口', icon: <MonitorCog size={16} /> },
  { id: 'data', label: '数据与隐私', icon: <Database size={16} /> },
  { id: 'about', label: '关于与更新', icon: <Info size={16} /> },
];

const themeSwatches: Record<AppSettings['theme'], [string, string]> = {
  'aurora-day': ['#6366f1', '#eef2ff'],
  'mint-garden': ['#10b981', '#d1fae5'],
  midnight: ['#1c2440', '#818cf8'],
  'amber-dawn': ['#da7756', '#faf0ec'],
  'rose-mist': ['#e05287', '#fde7f0'],
  'sakura-pink': ['#f05f7f', '#fff0ee'],
  'ocean-breeze': ['#0ea5b7', '#d9f5f9'],
  'forest-night': ['#173229', '#38d39f'],
};

const themeLabels: Record<AppSettings['theme'], string> = {
  'aurora-day': '极光白',
  'mint-garden': '薄荷园',
  midnight: '午夜蓝',
  'amber-dawn': '琥珀晨曦',
  'rose-mist': '玫瑰雾',
  'sakura-pink': '樱花粉',
  'ocean-breeze': '海风蓝',
  'forest-night': '深林夜',
};

export function SettingsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const { settings, setSettings, setAll } = useSettingsStore();
  const { session, setSession } = useAuthStore();
  const [active, setActive] = useState<SectionId>('appearance');
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [serverUrl, setServerUrl] = useState('');
  const [nick, setNick] = useState('');
  const [pw, setPw] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const previewTimerRef = useRef<number | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopPreviewSound = useCallback(() => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    if (previewAudioRef.current) {
      stopSound(previewAudioRef.current);
      previewAudioRef.current = null;
    }
  }, []);

  useEffect(() => () => { stopPreviewSound(); }, [location.pathname, stopPreviewSound]);

  useEffect(() => {
    (async () => {
      try {
        const s = await syncApi.status();
        setSyncStatus(s);
        setServerUrl(s.serverUrl || '');
      } catch {
        /* status is optional */
      }
      try {
        const sess = await authApi.current();
        if (sess) setSession(sess);
      } catch {
        /* auth is optional */
      }
    })();
  }, [setSession]);

  useEffect(() => {
    getDownloadedUpdateStatus()
      .then((status) => {
        if (status) setUpdateStatus(status);
      })
      .catch(() => {});
  }, []);

  const onSaveSettings = async (patch: Partial<AppSettings>) => {
    const previous = settings;
    const next = { ...settings, ...patch };
    setSettings(patch);
    setSaving(true);
    try {
      await settingsApi.save(next);
      setLastSavedAt(dayjs().format('HH:mm:ss'));
    } catch (e) {
      setAll(previous);
      toast.error(`设置保存失败：${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const onPreviewSound = (sound: AppSettings['reminderSound']) => {
    onSaveSettings({ reminderSound: sound });
    stopPreviewSound();
    const audio = playSoundPreview(sound);
    if (audio) {
      previewAudioRef.current = audio;
      previewTimerRef.current = window.setTimeout(() => stopPreviewSound(), 3000);
    }
  };

  const onAuth = async () => {
    if (!nick.trim() || !pw) {
      toast.error('请输入昵称和密码');
      return;
    }
    setBusy(true);
    try {
      const s = authMode === 'login'
        ? await authApi.login({ nickname: nick.trim(), password: pw, serverUrl: serverUrl || undefined })
        : await authApi.register({ nickname: nick.trim(), password: pw, serverUrl: serverUrl || undefined });
      setSession(s);
      setPw('');
      toast.success(authMode === 'login' ? '登录成功' : '注册成功');
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
        toast.success('本机数据已上传');
      } else {
        await syncApi.pull();
        toast.success('云端数据已恢复到本机');
      }
      setSyncStatus(await syncApi.status());
    } catch (e) {
      toast.error(t('sync.failed', { msg: String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const onCheckUpdate = async () => {
    setUpdateBusy(true);
    try {
      const status = await checkForAppUpdate({ onStatus: setUpdateStatus });
      if (status.state === 'downloaded') {
        toast.success(status.message || '新版本已下载');
      } else if (status.state === 'not-available') {
        toast.info(status.message || '当前已经是最新版本');
      } else if (status.state === 'error') {
        toast.error(status.error || '更新检查失败');
      }
    } finally {
      setUpdateBusy(false);
    }
  };

  const onInstallUpdate = async () => {
    setUpdateBusy(true);
    try {
      await installDownloadedUpdate();
      toast.info('正在启动更新安装程序，应用即将退出');
    } catch (error) {
      toast.error(String(error));
      setUpdateBusy(false);
    }
  };

  const activeTitle = useMemo(() => navItems.find((item) => item.id === active)?.label || '', [active]);

  return (
    <div className="h-full overflow-hidden p-6">
      <div className="max-w-6xl mx-auto h-full flex flex-col">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <SettingsIcon size={22} />
            {t('settings.title')}
          </h1>
          <div className="text-xs text-text-muted">
            {saving ? '保存中...' : lastSavedAt ? `已保存 ${lastSavedAt}` : '修改后自动保存'}
          </div>
        </div>

        <div className="grid grid-cols-[190px_minmax(0,1fr)] gap-4 min-h-0 flex-1">
          <aside className="card p-2 overflow-auto">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActive(item.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active === item.id ? 'bg-primary text-white' : 'text-text-muted hover:bg-surface-2 hover:text-text'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </aside>

          <main className="card p-5 overflow-auto">
            <div className="mb-5">
              <div className="text-lg font-semibold">{activeTitle}</div>
              <div className="text-xs text-text-muted mt-1">
                {sectionDescriptions[active]}
              </div>
            </div>

            {active === 'appearance' && (
              <Panel>
                <Row label="主题" hint="新增玫瑰雾、樱花粉、海风蓝、深林夜 4 个主题。">
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                    {THEMES.map((theme) => {
                      const [primary, soft] = themeSwatches[theme.id];
                      return (
                        <button
                          key={theme.id}
                          onClick={() => onSaveSettings({ theme: theme.id })}
                          className={`card p-3 text-left transition-all ${
                            settings.theme === theme.id ? 'ring-2 ring-primary' : 'hover:border-primary'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-sm font-medium">{themeLabels[theme.id]}</span>
                            {theme.id.includes('night') || theme.id === 'midnight'
                              ? <Moon size={13} />
                              : <Sun size={13} />}
                          </div>
                          <div className="flex gap-1">
                            <span className="w-8 h-4 rounded" style={{ background: primary }} />
                            <span className="w-8 h-4 rounded" style={{ background: soft }} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </Row>
                <Row label="语言">
                  <Segmented>
                    {LANGUAGES.map((l) => (
                      <SegmentButton
                        key={l.id}
                        active={settings.language === l.id}
                        onClick={() => onSaveSettings({ language: l.id })}
                      >
                        {l.name}
                      </SegmentButton>
                    ))}
                  </Segmented>
                </Row>
                <Row label="每周开始日">
                  <Segmented>
                    <SegmentButton active={settings.weekStart === 'mon'} onClick={() => onSaveSettings({ weekStart: 'mon' })}>
                      周一
                    </SegmentButton>
                    <SegmentButton active={settings.weekStart === 'sun'} onClick={() => onSaveSettings({ weekStart: 'sun' })}>
                      周日
                    </SegmentButton>
                  </Segmented>
                </Row>
                <Row label="总览励志语" hint="开启后，总览顶部显示每日励志语。">
                  <Toggle value={settings.motivationalQuotes} onChange={(v) => onSaveSettings({ motivationalQuotes: v })} />
                </Row>
              </Panel>
            )}

            {active === 'tasks' && (
              <Panel>
                <ReadonlySetting label="任务描述编辑器" value="Markdown 固定启用" />
                <ReadonlySetting label="任务描述进入编辑" value="双击进入编辑，避免误触" />
                <ReadonlySetting label="Markdown 回车行为" value="自动延续列表、空列表项回车退出列表、有序列表自动编号" />
                <ReadonlySetting label="快捷插入行为" value="插入标题、引用、列表、代码块后视图跟随光标" />
                <ReadonlySetting label="保存后展示" value="预览内容必须和 Markdown 编辑结果一致" />
              </Panel>
            )}

            {active === 'notifications' && (
              <Panel>
                <Row label="桌面通知">
                  <Toggle value={settings.notificationEnabled} onChange={(v) => onSaveSettings({ notificationEnabled: v })} />
                </Row>
                <Row label="提示音">
                  <Segmented wrap>
                    {SOUNDS.map((sound) => (
                      <SegmentButton
                        key={sound.id}
                        active={settings.reminderSound === sound.id}
                        onClick={() => onPreviewSound(sound.id)}
                      >
                        {sound.name}
                      </SegmentButton>
                    ))}
                  </Segmented>
                </Row>
                <ReadonlySetting label="提醒弹窗" value="使用软件右下角独立弹窗，任务提醒修改后立即重新注册定时器" />
              </Panel>
            )}

            {active === 'pomodoro' && (
              <Panel>
                <Row label="专注时长" hint="单位：分钟">
                  <Input
                    type="number"
                    min={1}
                    value={Math.round(settings.pomodoroDuration / 60)}
                    onChange={(e) => onSaveSettings({ pomodoroDuration: (Number(e.target.value) || 25) * 60 })}
                    className="w-28"
                  />
                </Row>
                <Row label="长休息" hint="单位：分钟">
                  <Input
                    type="number"
                    min={1}
                    value={Math.round(settings.pomodoroLongBreak / 60)}
                    onChange={(e) => onSaveSettings({ pomodoroLongBreak: (Number(e.target.value) || 5) * 60 })}
                    className="w-28"
                  />
                </Row>
              </Panel>
            )}

            {active === 'sync' && (
              <Panel>
                <Row label="启用同步">
                  <Toggle
                    value={settings.syncEnabled}
                    onChange={async (v) => {
                      await onSaveSettings({ syncEnabled: v });
                      if (v) setSyncStatus(await syncApi.status());
                    }}
                  />
                </Row>
                <Row label="服务器地址">
                  <Input
                    value={settings.syncServerUrl || ''}
                    onChange={(e) => {
                      setServerUrl(e.target.value);
                      onSaveSettings({ syncServerUrl: e.target.value || null });
                    }}
                    placeholder="https://..."
                    className="max-w-xl"
                  />
                </Row>
                <Row label="账号">
                  {session ? (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="chip">已登录：{session.nickname}</span>
                      <Button size="sm" variant="danger" onClick={onLogout}>退出登录</Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Segmented>
                        <SegmentButton active={authMode === 'login'} onClick={() => setAuthMode('login')}>登录</SegmentButton>
                        <SegmentButton active={authMode === 'register'} onClick={() => setAuthMode('register')}>注册</SegmentButton>
                      </Segmented>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl">
                        <Input label="昵称" value={nick} onChange={(e) => setNick(e.target.value)} />
                        <Input label="密码" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
                      </div>
                      <Button onClick={onAuth} disabled={busy}>{authMode === 'login' ? '登录' : '注册'}</Button>
                    </div>
                  )}
                </Row>
                <Row label="立即同步">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => onSync('push')} disabled={busy || !session}>上传本机数据</Button>
                    <Button size="sm" variant="outline" onClick={() => onSync('pull')} disabled={busy || !session}>从云端恢复</Button>
                    {syncStatus?.lastPushedAt && (
                      <span className="text-xs text-text-muted">
                        上次同步：{dayjs(syncStatus.lastPushedAt).format('YYYY-MM-DD HH:mm')}
                      </span>
                    )}
                  </div>
                </Row>
              </Panel>
            )}

            {active === 'window' && (
              <Panel>
                <Row label="开机自动启动">
                  <Toggle value={settings.autoStart} onChange={(v) => onSaveSettings({ autoStart: v })} />
                </Row>
                <Row label="关闭到托盘">
                  <Toggle value={settings.minimizeToTray} onChange={(v) => onSaveSettings({ minimizeToTray: v })} />
                </Row>
                <Row label="自动检查更新">
                  <Toggle value={settings.autoUpdate} onChange={(v) => onSaveSettings({ autoUpdate: v })} />
                </Row>
              </Panel>
            )}

            {active === 'data' && (
              <Panel>
                <ReadonlySetting label="数据存储" value="任务、目标、设置、个人资料存储在本机 SQLite 数据库中" icon={<ShieldCheck size={15} />} />
                <ReadonlySetting label="更新缓存" value="检测到新版本会清理旧安装包并保留最新安装包，安装后自动清理" icon={<ShieldCheck size={15} />} />
                <ReadonlySetting label="危险操作" value="删除数据、清空缓存、恢复备份等操作后续统一放在这里，并全部二次确认" />
              </Panel>
            )}

            {active === 'about' && (
              <Panel>
                <Row label="当前版本">
                  <span className="text-sm text-text-muted">v{APP_VERSION}</span>
                </Row>
                <Row label="检查更新">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={onCheckUpdate} disabled={updateBusy}>
                        <RefreshCw size={14} className={updateBusy ? 'animate-spin' : ''} />
                        {updateBusy ? '检查中' : '检查更新'}
                      </Button>
                      {updateStatus?.state === 'downloaded' && (
                        <Button size="sm" onClick={onInstallUpdate} disabled={updateBusy}>
                          安装 v{updateStatus.latestVersion}
                        </Button>
                      )}
                    </div>
                    <div className="text-xs text-text-muted leading-5">
                      {updateStatus?.message || '启动 6 秒后自动检查更新，之后每 20 分钟自动检查一次。'}
                      {updateStatus?.state === 'downloaded' && updateStatus.packagePath && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-primary">查看高级信息</summary>
                          <div className="break-all mt-1">安装包：{updateStatus.packagePath}</div>
                        </details>
                      )}
                      {updateStatus?.error && <div className="text-danger break-all">{updateStatus.error}</div>}
                    </div>
                  </div>
                </Row>
              </Panel>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

const sectionDescriptions: Record<SectionId, string> = {
  appearance: '控制界面观感、语言和总览展示偏好。',
  tasks: '任务描述固定采用 Markdown，核心编辑行为以一致和高效率为准。',
  notifications: '控制任务提醒、桌面通知和提示音。',
  pomodoro: '调整番茄钟的专注与休息节奏。',
  sync: '管理登录状态、同步服务器和数据同步动作。',
  window: '控制应用启动、关闭窗口和后台运行方式。',
  data: '集中呈现数据安全、缓存和隐私相关信息。',
  about: '查看版本、自动更新状态和安装新版本。',
};

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[150px_minmax(0,1fr)] gap-2 lg:gap-4 py-3 border-b border-border last:border-b-0">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-text-muted mt-1 leading-5">{hint}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Segmented({ children, wrap }: { children: React.ReactNode; wrap?: boolean }) {
  return (
    <div className={`card p-0.5 inline-flex items-center text-sm ${wrap ? 'flex-wrap' : ''}`}>
      {children}
    </div>
  );
}

function SegmentButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md transition-colors ${
        active ? 'bg-primary text-white' : 'text-text-muted hover:text-text hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  );
}

function ReadonlySetting({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium flex items-center gap-1.5">
          {icon}
          {label}
        </div>
        <div className="text-xs text-text-muted mt-1 leading-5">{value}</div>
      </div>
      <span className="shrink-0 chip">已内置</span>
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
