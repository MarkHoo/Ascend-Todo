import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Cloud,
  Database,
  Info,
  KeyRound,
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
import { settingsApi, syncApi, authApi, calendarApi } from '@/api';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { toast } from '@/components/common/Toast';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { APP_VERSION, LANGUAGES, SOUNDS, THEMES } from '@/utils/constants';
import { dayjs, setDayjsLocale } from '@/utils/date';
import { playSoundPreview, stopSound } from '@/utils/sound';
import {
  checkForAppUpdate,
  getDownloadedUpdateStatus,
  installDownloadedUpdate,
  type UpdateStatus,
} from '@/utils/appUpdater';
import type { AppSettings, CalendarEmailAccount, CalendarHolidaySource, CalendarSyncStatus, SyncStatus } from '@/types';

type SectionId =
  | 'appearance'
  | 'tasks'
  | 'calendar'
  | 'notifications'
  | 'pomodoro'
  | 'sync'
  | 'window'
  | 'data'
  | 'about';

const navItems: Array<{ id: SectionId; icon: React.ReactNode }> = [
  { id: 'appearance', icon: <Palette size={16} /> },
  { id: 'tasks', icon: <Zap size={16} /> },
  { id: 'calendar', icon: <CalendarDays size={16} /> },
  { id: 'notifications', icon: <Bell size={16} /> },
  { id: 'pomodoro', icon: <Timer size={16} /> },
  { id: 'sync', icon: <Cloud size={16} /> },
  { id: 'window', icon: <MonitorCog size={16} /> },
  { id: 'data', icon: <Database size={16} /> },
  { id: 'about', icon: <Info size={16} /> },
];

const settingsCopy = {
  'zh-CN': {
    sections: {
      appearance: '外观',
      tasks: '任务与交互',
      calendar: '日历同步',
      notifications: '提醒与通知',
      pomodoro: '番茄钟',
      sync: '同步与账号',
      window: '启动与窗口',
      data: '数据与隐私',
      about: '关于与更新',
    },
    descriptions: {
      appearance: '选择界面风格、语言和总览显示偏好。',
      tasks: '保持任务输入和编辑体验稳定高效。',
      calendar: '添加节假日日历，管理邮箱会议同步账号。',
      notifications: '管理提醒通知和提示音。',
      pomodoro: '调整专注和休息节奏。',
      sync: '管理账号登录和数据同步。',
      window: '设置启动、关闭和后台运行方式。',
      data: '查看本机数据和缓存说明。',
      about: '查看版本并安装可用更新。',
    },
    saved: '已保存',
    saving: '保存中...',
    autoSave: '修改后自动保存',
    calendar: {
      status: '同步状态',
      holidayCalendar: '节假日日历',
      holidayEvents: '节假日事件',
      emailMeeting: '邮箱会议',
      enabledAccounts: '已启用 / 全部账号',
      normal: '正常',
      needsAction: '需处理',
      autoSync: '启动后自动同步',
      recentSync: '最近同步',
      addHolidayCalendar: '添加节假日日历',
      builtinChina: '中国大陆节假日',
      builtinChinaDesc: '内置节假日与调休补班，随软件更新。',
      selected: '已选择',
      use: '使用',
      sync: '同步',
      delete: '删除',
      userSource: '已添加的 ICS 日历',
      noUserSource: '还没有添加自定义 ICS 日历。',
      icsUrl: 'ICS 订阅地址',
      icsPlaceholder: 'https://example.com/calendar.ics',
      addIcs: '添加 ICS 日历',
      emailAccounts: '邮箱会议',
      syncAllEmail: '同步全部邮箱',
      emailHint: '自动读取会议邀请并写入日历',
      email: '邮箱地址',
      imapHost: 'IMAP 服务器',
      port: '端口',
      secret: '授权码/密码',
      add: '添加',
      emptyEmail: '还没有邮箱账号。',
      noImap: '未设置 IMAP',
      authorized: '已授权',
      unauthorized: '未授权',
      authorize: '授权',
      hideAuth: '收起',
      secretPlaceholder: '输入或更新授权码/密码',
      saveAuth: '保存授权',
      clearAuth: '清除授权',
      enabled: '启用',
      disabled: '停用',
    },
  },
  'zh-TW': {
    sections: {
      appearance: '外觀',
      tasks: '任務與互動',
      calendar: '日曆同步',
      notifications: '提醒與通知',
      pomodoro: '番茄鐘',
      sync: '同步與帳號',
      window: '啟動與視窗',
      data: '資料與隱私',
      about: '關於與更新',
    },
    descriptions: {
      appearance: '選擇介面風格、語言和總覽顯示偏好。',
      tasks: '保持任務輸入和編輯體驗穩定高效。',
      calendar: '新增節假日日曆，管理郵箱會議同步帳號。',
      notifications: '管理提醒通知和提示音。',
      pomodoro: '調整專注和休息節奏。',
      sync: '管理帳號登入和資料同步。',
      window: '設定啟動、關閉和背景執行方式。',
      data: '查看本機資料和快取說明。',
      about: '查看版本並安裝可用更新。',
    },
    saved: '已儲存',
    saving: '儲存中...',
    autoSave: '修改後自動儲存',
    calendar: {
      status: '同步狀態',
      holidayCalendar: '節假日日曆',
      holidayEvents: '節假日事件',
      emailMeeting: '郵箱會議',
      enabledAccounts: '已啟用 / 全部帳號',
      normal: '正常',
      needsAction: '需處理',
      autoSync: '啟動後自動同步',
      recentSync: '最近同步',
      addHolidayCalendar: '新增節假日日曆',
      builtinChina: '中國大陸節假日',
      builtinChinaDesc: '內建節假日與調休補班，隨軟體更新。',
      selected: '已選擇',
      use: '使用',
      sync: '同步',
      delete: '刪除',
      userSource: '已新增的 ICS 日曆',
      noUserSource: '還沒有新增自訂 ICS 日曆。',
      icsUrl: 'ICS 訂閱地址',
      icsPlaceholder: 'https://example.com/calendar.ics',
      addIcs: '新增 ICS 日曆',
      emailAccounts: '郵箱會議',
      syncAllEmail: '同步全部郵箱',
      emailHint: '自動讀取會議邀請並寫入日曆',
      email: '郵箱地址',
      imapHost: 'IMAP 伺服器',
      port: '埠',
      secret: '授權碼/密碼',
      add: '新增',
      emptyEmail: '還沒有郵箱帳號。',
      noImap: '未設定 IMAP',
      authorized: '已授權',
      unauthorized: '未授權',
      authorize: '授權',
      hideAuth: '收起',
      secretPlaceholder: '輸入或更新授權碼/密碼',
      saveAuth: '儲存授權',
      clearAuth: '清除授權',
      enabled: '啟用',
      disabled: '停用',
    },
  },
  en: {
    sections: {
      appearance: 'Appearance',
      tasks: 'Tasks & Editing',
      calendar: 'Calendar Sync',
      notifications: 'Reminders',
      pomodoro: 'Pomodoro',
      sync: 'Sync & Account',
      window: 'Startup & Window',
      data: 'Data & Privacy',
      about: 'About & Updates',
    },
    descriptions: {
      appearance: 'Choose visual style, language, and overview preferences.',
      tasks: 'Keep task input and editing stable and efficient.',
      calendar: 'Add holiday calendars and manage email meeting sync.',
      notifications: 'Manage reminder notifications and sounds.',
      pomodoro: 'Adjust focus and break rhythm.',
      sync: 'Manage sign-in and data sync.',
      window: 'Set startup, close, and background behavior.',
      data: 'View local data and cache information.',
      about: 'View version and install available updates.',
    },
    saved: 'Saved',
    saving: 'Saving...',
    autoSave: 'Auto-save after changes',
    calendar: {
      status: 'Sync status',
      holidayCalendar: 'Holiday calendar',
      holidayEvents: 'Holiday events',
      emailMeeting: 'Email meetings',
      enabledAccounts: 'Enabled / all accounts',
      normal: 'OK',
      needsAction: 'Needs action',
      autoSync: 'Auto sync on startup',
      recentSync: 'Last sync',
      addHolidayCalendar: 'Add holiday calendar',
      builtinChina: 'China holidays',
      builtinChinaDesc: 'Built-in holidays and adjusted workdays, updated with the app.',
      selected: 'Selected',
      use: 'Use',
      sync: 'Sync',
      delete: 'Delete',
      userSource: 'Added ICS calendars',
      noUserSource: 'No custom ICS calendar yet.',
      icsUrl: 'ICS subscription URL',
      icsPlaceholder: 'https://example.com/calendar.ics',
      addIcs: 'Add ICS calendar',
      emailAccounts: 'Email meetings',
      syncAllEmail: 'Sync all mailboxes',
      emailHint: 'Read meeting invites automatically and add them to Calendar',
      email: 'Email',
      imapHost: 'IMAP server',
      port: 'Port',
      secret: 'App password',
      add: 'Add',
      emptyEmail: 'No email accounts yet.',
      noImap: 'No IMAP server',
      authorized: 'Authorized',
      unauthorized: 'Not authorized',
      authorize: 'Authorize',
      hideAuth: 'Collapse',
      secretPlaceholder: 'Enter or update app password',
      saveAuth: 'Save',
      clearAuth: 'Clear',
      enabled: 'Enabled',
      disabled: 'Disabled',
    },
  },
} satisfies Record<AppSettings['language'], {
  sections: Record<SectionId, string>;
  descriptions: Record<SectionId, string>;
  saved: string;
  saving: string;
  autoSave: string;
  calendar: Record<string, string>;
}>;

const themeSwatches: Record<AppSettings['theme'], [string, string]> = {
  'aurora-day': ['#6366f1', '#eef2ff'],
  'mint-garden': ['#10b981', '#d1fae5'],
  midnight: ['#1c2440', '#818cf8'],
  'amber-dawn': ['#da7756', '#faf0ec'],
  'rose-mist': ['#e05287', '#fde7f0'],
  'sakura-pink': ['#f05f7f', '#fff0ee'],
  'ocean-breeze': ['#0ea5b7', '#d9f5f9'],
  'forest-night': ['#173229', '#38d39f'],
  'lime-pop': ['#84cc16', '#ecfccb'],
  'coral-glow': ['#ff5a5f', '#fff1ef'],
  'graphite-neon': ['#22c55e', '#18181b'],
  'lavender-frost': ['#8b5cf6', '#f5f3ff'],
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
  'lime-pop': '青柠律动',
  'coral-glow': '珊瑚晨光',
  'graphite-neon': '石墨霓光',
  'lavender-frost': '薰衣草霜',
};

function buildIcsSourceName(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '') || 'ICS 订阅日历';
  } catch {
    return 'ICS 订阅日历';
  }
}

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { settings, setSettings, setAll } = useSettingsStore();
  const copy = settingsCopy[settings.language];
  const calendarText = copy.calendar;
  const { session, setSession } = useAuthStore();
  const [active, setActive] = useState<SectionId>('appearance');
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [calendarStatus, setCalendarStatus] = useState<CalendarSyncStatus | null>(null);
  const [holidaySources, setHolidaySources] = useState<CalendarHolidaySource[]>([]);
  const [holidayIcsUrl, setHolidayIcsUrl] = useState('');
  const [calendarAccounts, setCalendarAccounts] = useState<CalendarEmailAccount[]>([]);
  const [calendarEmail, setCalendarEmail] = useState('');
  const [calendarImapHost, setCalendarImapHost] = useState('');
  const [calendarImapPort, setCalendarImapPort] = useState('993');
  const [calendarSecret, setCalendarSecret] = useState('');
  const [calendarAccountSecrets, setCalendarAccountSecrets] = useState<Record<string, string>>({});
  const [calendarCredentialStatus, setCalendarCredentialStatus] = useState<Record<string, boolean>>({});
  const [credentialEditorAccountId, setCredentialEditorAccountId] = useState<string | null>(null);
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
      try {
        await refreshCalendarSync();
      } catch {
        /* calendar sync is optional */
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
    if (patch.language) {
      setDayjsLocale(patch.language);
      void i18n.changeLanguage(patch.language);
    }
    setSaving(true);
    try {
      await settingsApi.save(next);
      setLastSavedAt(dayjs().format('HH:mm:ss'));
    } catch (e) {
      setAll(previous);
      if (patch.language) {
        setDayjsLocale(previous.language);
        void i18n.changeLanguage(previous.language);
      }
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

  const onSyncBuiltinHolidays = async () => {
    setBusy(true);
    try {
      const status = await calendarApi.syncBuiltinHolidays();
      setCalendarStatus(status);
      setHolidaySources(await calendarApi.holidaySources());
      toast.success('国家日历已同步');
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const onImportHolidayIcsSource = async () => {
    if (!holidayIcsUrl.trim()) {
      toast.error('请输入 ICS URL');
      return;
    }
    setBusy(true);
    try {
      const sourceName = buildIcsSourceName(holidayIcsUrl.trim());
      const status = await calendarApi.syncIcsUrlSource(sourceName, holidayIcsUrl.trim());
      setCalendarStatus(status);
      setHolidaySources(await calendarApi.holidaySources());
      setHolidayIcsUrl('');
      window.dispatchEvent(new CustomEvent('ascend:calendar-sync-finished'));
      toast.success('ICS 日历源已导入并同步');
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const onDeleteHolidaySource = async (id: string) => {
    setBusy(true);
    try {
      const status = await calendarApi.deleteHolidaySource(id);
      setCalendarStatus(status);
      setHolidaySources(await calendarApi.holidaySources());
      window.dispatchEvent(new CustomEvent('ascend:calendar-sync-finished'));
      toast.success('日历源已删除');
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const onSyncHolidayUrlSource = async (source: CalendarHolidaySource) => {
    if (!source.url) return;
    setBusy(true);
    try {
      const status = await calendarApi.syncIcsUrlSource(source.name, source.url);
      setCalendarStatus(status);
      setHolidaySources(await calendarApi.holidaySources());
      window.dispatchEvent(new CustomEvent('ascend:calendar-sync-finished'));
      toast.success('日历源已同步');
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const refreshCalendarSync = async () => {
    const [status, accounts, sources] = await Promise.all([
      calendarApi.syncStatus(),
      calendarApi.listEmailAccounts(),
      calendarApi.holidaySources(),
    ]);
    setCalendarStatus(status);
    setCalendarAccounts(accounts);
    setHolidaySources(sources);
    const credentialPairs = await Promise.all(
      accounts.map(async (account) => {
        try {
          const credential = await calendarApi.emailCredentialStatus(account.id);
          return [account.id, credential.hasCredential] as const;
        } catch {
          return [account.id, false] as const;
        }
      }),
    );
    setCalendarCredentialStatus(Object.fromEntries(credentialPairs));
  };

  const onAddCalendarEmailAccount = async () => {
    if (!calendarEmail.trim()) {
      toast.error('请输入邮箱地址');
      return;
    }
    setBusy(true);
    try {
      const account = await calendarApi.createEmailAccount({
        provider: 'imap',
        email: calendarEmail.trim(),
        imapHost: calendarImapHost.trim() || null,
        imapPort: Number(calendarImapPort) || 993,
        syncIntervalMinutes: 10,
      });
      if (calendarSecret.trim()) {
        await calendarApi.saveEmailCredential({ accountId: account.id, secret: calendarSecret.trim() });
      }
      setCalendarEmail('');
      setCalendarImapHost('');
      setCalendarImapPort('993');
      setCalendarSecret('');
      await refreshCalendarSync();
      toast.success('邮箱账号已添加');
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const onToggleCalendarEmailAccount = async (id: string, enabled: boolean) => {
    await calendarApi.setEmailAccountEnabled(id, enabled);
    await refreshCalendarSync();
  };

  const onDeleteCalendarEmailAccount = async (id: string) => {
    await calendarApi.deleteEmailAccount(id);
    await refreshCalendarSync();
    toast.success('邮箱账号已删除');
  };

  const onSaveCalendarEmailCredential = async (accountId: string) => {
    const secret = calendarAccountSecrets[accountId]?.trim();
    if (!secret) {
      toast.error('请输入邮箱授权码或密码');
      return;
    }
    await calendarApi.saveEmailCredential({ accountId, secret });
    setCalendarAccountSecrets((prev) => ({ ...prev, [accountId]: '' }));
    setCredentialEditorAccountId(null);
    await refreshCalendarSync();
    toast.success('邮箱授权信息已保存到系统凭据管理');
  };

  const onDeleteCalendarEmailCredential = async (accountId: string) => {
    await calendarApi.deleteEmailCredential(accountId);
    setCredentialEditorAccountId(null);
    await refreshCalendarSync();
    toast.success('邮箱授权信息已清除');
  };

  const onSyncCalendarEmailAccount = async (accountId: string) => {
    setBusy(true);
    try {
      const result = await calendarApi.syncEmailAccount(accountId);
      await refreshCalendarSync();
      toast.success(`扫描 ${result.scannedMessages} 封邮件，新增 ${result.importedEvents} 个会议`);
    } catch (error) {
      await refreshCalendarSync().catch(() => {});
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const onSyncAllCalendarEmailAccounts = async () => {
    setBusy(true);
    try {
      const results = await calendarApi.syncEmailAccounts();
      await refreshCalendarSync();
      const imported = results.reduce((sum, item) => sum + item.importedEvents, 0);
      const scanned = results.reduce((sum, item) => sum + item.scannedMessages, 0);
      toast.success(`扫描 ${scanned} 封邮件，新增 ${imported} 个会议`);
    } catch (error) {
      await refreshCalendarSync().catch(() => {});
      toast.error(String(error));
    } finally {
      setBusy(false);
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

  const activeTitle = copy.sections[active];

  return (
    <div className="h-full overflow-hidden p-6">
      <div className="max-w-6xl mx-auto h-full flex flex-col">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <SettingsIcon size={22} />
            {t('settings.title')}
          </h1>
          <div className="text-xs text-text-muted">
            {saving ? copy.saving : lastSavedAt ? `${copy.saved} ${lastSavedAt}` : copy.autoSave}
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
                {copy.sections[item.id]}
              </button>
            ))}
          </aside>

          <main className="card p-5 overflow-auto">
            <div className="mb-5">
              <div className="text-lg font-semibold">{activeTitle}</div>
              <div className="text-xs text-text-muted mt-1">
                {copy.descriptions[active]}
              </div>
            </div>

            {active === 'appearance' && (
              <Panel>
                <Row label="主题">
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

            {active === 'calendar' && (
              <Panel>
                <Row label={calendarText.status}>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <SummaryCard
                      label={calendarText.holidayCalendar}
                      value={`${calendarStatus?.holidayEventCount || 0}`}
                      detail={calendarStatus?.holidayLastSyncAt ? `${calendarText.recentSync} ${dayjs(calendarStatus.holidayLastSyncAt).format('MM-DD HH:mm')}` : calendarText.autoSync}
                    />
                    <SummaryCard
                      label={calendarText.emailMeeting}
                      value={`${calendarStatus?.emailEnabledCount || 0}/${calendarStatus?.emailAccountCount || 0}`}
                      detail={calendarText.enabledAccounts}
                    />
                    <SummaryCard
                      label={calendarText.status}
                      value={calendarStatus?.holidayLastError || calendarStatus?.emailLastError ? calendarText.needsAction : calendarText.normal}
                      detail={calendarStatus?.holidayLastError || calendarStatus?.emailLastError || calendarText.autoSync}
                      tone={calendarStatus?.holidayLastError || calendarStatus?.emailLastError ? 'danger' : 'success'}
                    />
                  </div>
                </Row>

                <Row label={calendarText.addHolidayCalendar}>
                  <div className="space-y-3">
                    <div className="rounded-xl border border-border bg-surface overflow-hidden">
                      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{calendarText.builtinChina}</div>
                          <div className="text-xs text-text-muted mt-0.5">{calendarText.builtinChinaDesc}</div>
                        </div>
                        <Button size="sm" variant={calendarStatus?.holidaySource === 'builtin-cn' ? 'outline' : 'primary'} onClick={onSyncBuiltinHolidays} disabled={busy}>
                          {calendarStatus?.holidaySource === 'builtin-cn' ? <Check size={14} /> : <CalendarDays size={14} />}
                          {calendarStatus?.holidaySource === 'builtin-cn' ? calendarText.selected : calendarText.use}
                        </Button>
                      </div>

                      {holidaySources.filter((source) => !source.builtIn && source.url).map((source) => (
                        <div key={source.id} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-surface-2 transition-colors">
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{source.name}</div>
                            <div className="text-xs text-text-muted truncate mt-0.5">{source.url}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button size="sm" variant="outline" onClick={() => onSyncHolidayUrlSource(source)} disabled={busy}>
                              <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
                              {calendarText.sync}
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => onDeleteHolidaySource(source.id)} disabled={busy}>
                              {calendarText.delete}
                            </Button>
                          </div>
                        </div>
                      ))}

                      {holidaySources.filter((source) => !source.builtIn && source.url).length === 0 && (
                        <div className="px-4 py-3 text-sm text-text-muted">{calendarText.noUserSource}</div>
                      )}
                    </div>

                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-end">
                      <Input
                        label={calendarText.icsUrl}
                        value={holidayIcsUrl}
                        onChange={(e) => setHolidayIcsUrl(e.target.value)}
                        placeholder={calendarText.icsPlaceholder}
                      />
                      <Button size="sm" onClick={onImportHolidayIcsSource} disabled={busy || !holidayIcsUrl.trim()}>
                        {calendarText.addIcs}
                      </Button>
                    </div>
                  </div>
                </Row>

                <Row label={calendarText.emailAccounts}>
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Button size="sm" variant="outline" onClick={onSyncAllCalendarEmailAccounts} disabled={busy || calendarAccounts.length === 0}>
                        <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
                        {calendarText.syncAllEmail}
                      </Button>
                      <span className="text-xs text-text-muted">{calendarText.emailHint}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr_90px_1fr_auto] gap-2 items-end">
                      <Input label={calendarText.email} value={calendarEmail} onChange={(e) => setCalendarEmail(e.target.value)} placeholder="name@example.com" />
                      <Input label={calendarText.imapHost} value={calendarImapHost} onChange={(e) => setCalendarImapHost(e.target.value)} placeholder="imap.example.com" />
                      <Input label={calendarText.port} type="number" value={calendarImapPort} onChange={(e) => setCalendarImapPort(e.target.value)} />
                      <Input label={calendarText.secret} type="password" value={calendarSecret} onChange={(e) => setCalendarSecret(e.target.value)} placeholder="••••••••" />
                      <Button size="sm" onClick={onAddCalendarEmailAccount} disabled={busy}>{calendarText.add}</Button>
                    </div>

                    <div className="rounded-xl border border-border bg-surface overflow-hidden">
                      {calendarAccounts.length === 0 ? (
                        <div className="p-4 text-sm text-text-muted">{calendarText.emptyEmail}</div>
                      ) : calendarAccounts.map((account) => (
                        <div key={account.id} className="border-b border-border last:border-b-0">
                          <div className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-surface-2 transition-colors">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-medium truncate">{account.email}</div>
                                <span className={`chip ${account.enabled ? 'text-success' : 'text-text-muted'}`}>
                                  {account.enabled ? calendarText.enabled : calendarText.disabled}
                                </span>
                              </div>
                              <div className="text-xs text-text-muted truncate mt-1">
                                {account.imapHost || calendarText.noImap}:{account.imapPort || 993}
                                {account.lastSyncAt ? ` · ${dayjs(account.lastSyncAt).format('MM-DD HH:mm')}` : ''}
                                {calendarCredentialStatus[account.id] ? ` · ${calendarText.authorized}` : ` · ${calendarText.unauthorized}`}
                              </div>
                              {account.lastError && <div className="text-xs text-danger truncate mt-1">{account.lastError}</div>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Button size="sm" variant="outline" onClick={() => onSyncCalendarEmailAccount(account.id)} disabled={busy || !account.enabled}>{calendarText.sync}</Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setCredentialEditorAccountId((current) => current === account.id ? null : account.id)}
                              >
                                <KeyRound size={14} />
                                {credentialEditorAccountId === account.id ? calendarText.hideAuth : calendarText.authorize}
                                <ChevronDown size={14} className={`transition-transform ${credentialEditorAccountId === account.id ? 'rotate-180' : ''}`} />
                              </Button>
                              <Toggle value={account.enabled} onChange={(enabled) => onToggleCalendarEmailAccount(account.id, enabled)} />
                              <Button size="sm" variant="danger" onClick={() => onDeleteCalendarEmailAccount(account.id)}>{calendarText.delete}</Button>
                            </div>
                          </div>
                          {credentialEditorAccountId === account.id && (
                          <div className="px-4 pb-4 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 items-end">
                            <Input
                              type="password"
                              value={calendarAccountSecrets[account.id] || ''}
                              onChange={(e) => setCalendarAccountSecrets((prev) => ({ ...prev, [account.id]: e.target.value }))}
                              placeholder={calendarText.secretPlaceholder}
                            />
                            <Button size="sm" variant="outline" onClick={() => onSaveCalendarEmailCredential(account.id)}>{calendarText.saveAuth}</Button>
                            {calendarCredentialStatus[account.id] && (
                              <Button size="sm" variant="outline" onClick={() => onDeleteCalendarEmailCredential(account.id)}>{calendarText.clearAuth}</Button>
                            )}
                          </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </Row>
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
                <ReadonlySetting label="本地数据" value="任务、目标、设置和个人资料保存在本机。" icon={<ShieldCheck size={15} />} />
                <ReadonlySetting label="更新缓存" value="仅保留最新安装包，安装完成后自动清理。" icon={<ShieldCheck size={15} />} />
                <ReadonlySetting label="安全确认" value="删除、清空和恢复类操作都会要求再次确认。" />
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
                      {updateStatus?.message || '启动后自动检查更新，也可以在这里手动检查。'}
                      {updateStatus?.state === 'downloaded' && updateStatus.packagePath && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-primary">安装包位置</summary>
                          <div className="break-all mt-1">{updateStatus.packagePath}</div>
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

function SummaryCard({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'default' | 'success' | 'danger';
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${
        tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-text'
      }`}>
        {value}
      </div>
      <div className="mt-1 text-xs text-text-muted truncate">{detail}</div>
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
