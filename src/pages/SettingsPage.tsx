import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Cloud,
  Database,
  HelpCircle,
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
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { settingsApi, syncApi, authApi, calendarApi } from '@/api';
import type { CloudDevice } from '@/api/auth';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Modal } from '@/components/common/Modal';
import { toast } from '@/components/common/Toast';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { APP_VERSION, LANGUAGES, SOUNDS, THEMES } from '@/utils/constants';
import { dayjs, setDayjsLocale } from '@/utils/date';
import { playSoundPreview, stopSound } from '@/utils/sound';
import { HOLIDAY_COUNTRIES, defaultHolidayCountryForLanguage, holidayCountryLabel } from '@/utils/holidayCountries';
import {
  checkForAppUpdate,
  getDownloadedUpdateStatus,
  installDownloadedUpdate,
  type UpdateStatus,
} from '@/utils/appUpdater';
import type { AppSettings, CalendarEmailAccount, CalendarHolidaySource, CalendarSyncStatus, SyncStatus } from '@/types';

type SectionId =
  | 'appearance'
  | 'calendar'
  | 'notifications'
  | 'pomodoro'
  | 'sync'
  | 'window'
  | 'data'
  | 'about';

type CalendarEmailProvider = 'imap' | 'gmail' | 'outlook';

type CalendarOAuthImportMeta = ImportMeta & {
  env?: {
    VITE_GMAIL_OAUTH_CLIENT_ID?: string;
    VITE_OUTLOOK_OAUTH_CLIENT_ID?: string;
  };
};

function defaultCalendarOAuthClientId(provider: CalendarEmailProvider) {
  const env = (import.meta as CalendarOAuthImportMeta).env || {};
  if (provider === 'gmail') return String(env.VITE_GMAIL_OAUTH_CLIENT_ID || '');
  if (provider === 'outlook') return String(env.VITE_OUTLOOK_OAUTH_CLIENT_ID || '');
  return '';
}

function extractOAuthAccessToken(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
    const queryParams = url.searchParams;
    return hashParams.get('access_token') || queryParams.get('access_token') || trimmed;
  } catch {
    const rawParams = trimmed.startsWith('#') || trimmed.startsWith('?') ? trimmed.slice(1) : trimmed;
    const params = new URLSearchParams(rawParams);
    return params.get('access_token') || trimmed;
  }
}

const navItems: Array<{ id: SectionId; icon: React.ReactNode }> = [
  { id: 'appearance', icon: <Palette size={16} /> },
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
      calendar: '日历同步',
      notifications: '提醒与通知',
      pomodoro: '番茄钟',
      sync: '同步与账号',
      window: '窗口行为',
      data: '数据与隐私',
      about: '关于与更新',
    },
    descriptions: {
      appearance: '选择界面风格、语言和总览显示偏好。',
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
      countryCalendarTitle: '国家或地区节假日',
      countryCalendarDesc: '按所选国家或地区自动同步公开节假日。',
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
      provider: '连接方式',
      providerImap: 'IMAP 授权码',
      providerGmail: 'Gmail OAuth',
      providerOutlook: 'Outlook OAuth',
      providerImapDesc: '适合企业邮箱或自定义邮箱，需要 IMAP 服务器和授权码。',
      providerGmailDesc: '使用 Gmail 邮箱会议同步，默认使用 Gmail IMAP。',
      providerOutlookDesc: '使用 Outlook / Microsoft 365 邮箱会议同步，默认使用 Outlook IMAP。',
      email: '邮箱地址',
      imapHost: 'IMAP 服务器',
      port: '端口',
      secret: '授权码/密码',
      oauthToken: 'OAuth 访问令牌',
      add: '添加',
      emptyEmail: '还没有邮箱账号。',
      noImap: '未设置 IMAP',
      authorized: '已授权',
      unauthorized: '未授权',
      authorize: '授权',
      hideAuth: '收起',
      secretPlaceholder: '输入或更新授权码/密码',
      oauthPlaceholder: '粘贴 OAuth 访问令牌',
      saveAuth: '保存授权',
      clearAuth: '清除授权',
      oauthClientRequired: '请先填写 OAuth 客户端 ID',
      oauthClientId: 'OAuth 客户端 ID',
      openAuthorization: '打开授权',
      oauthGuide: '使用正式 OAuth 客户端获取 IMAP 访问令牌，然后在下方保存。',
      exportConfig: '导出配置',
      importConfig: '导入配置',
      diagnostics: '诊断信息',
      enabled: '启用',
      disabled: '停用',
      errorAuth: '未授权或授权已失效，请重新保存授权信息。',
      errorNetwork: '网络或邮箱服务器连接失败，稍后会自动重试。',
      errorLogin: '邮箱登录失败，请检查邮箱地址和授权信息。',
      errorServer: 'IMAP 服务器配置不完整，请检查连接方式。',
      errorUnknown: '同步失败，稍后会自动重试。',
    },
    ui: {
      theme: '主题',
      language: '语言',
      displaySize: '界面大小',
      displaySizeHint: '每个选项都会同步调整字号、间距和控件尺寸，保证界面协调。',
      compact: '紧凑',
      compactDesc: '适合小屏和高信息密度。',
      standard: '标准',
      standardDesc: '默认推荐，平衡信息量和可读性。',
      comfortable: '舒适',
      comfortableDesc: '文字和点击区域更宽松。',
      large: '大字',
      largeDesc: '适合高分屏、远距离或更强可读性。',
      weekStart: '每周开始日',
      monday: '周一',
      sunday: '周日',
      overviewQuote: '总览励志语',
      overviewQuoteHint: '开启后，总览顶部显示每日励志语。',
      taskEditor: '任务描述编辑器',
      taskEditorValue: 'Markdown 固定启用',
      taskEditEntry: '任务描述进入编辑',
      taskEditEntryValue: '双击进入编辑，避免误触',
      markdownEnter: 'Markdown 回车行为',
      markdownEnterValue: '自动延续列表、空列表项回车退出列表、有序列表自动编号',
      quickInsert: '快捷插入行为',
      quickInsertValue: '插入标题、引用、列表、代码块后视图跟随光标',
      afterSave: '保存后展示',
      afterSaveValue: '预览内容必须和 Markdown 编辑结果一致',
      desktopNotification: '桌面通知',
      reminderSound: '提示音',
      focusDuration: '专注时长',
      focusDurationHint: '每轮番茄钟的专注工作时间。',
      longBreak: '长休息',
      longBreakHint: '完成一组专注后进入的较长休息时间。',
      minutesUnit: '分钟',
      syncEnabled: '启用同步',
      serverUrl: '服务器地址',
      account: '账号',
      loggedInAs: '已登录：{{name}}',
      logout: '退出登录',
      login: '登录',
      register: '注册',
      nickname: '邮箱',
      verifyEmail: '验证邮箱',
      devices: '已登录设备',
      verificationCode: '邮箱验证码',
      sendCode: '发送验证码',
      verified: '已验证',
      unverified: '未验证',
      password: '密码',
      syncNow: '立即同步',
      uploadLocal: '上传本机数据',
      restoreCloud: '从云端恢复',
      smartMerge: '智能合并',
      rename: '重命名',
      remove: '移除',
      removeOthers: '移除其他设备',
      requestWipe: '请求清理',
      currentDevice: '当前设备',
      remoteVersion: '云端版本：{{version}}',
      lastSync: '上次同步：{{time}}',
      autoStart: '开机自启',
      minimizeToTray: '关闭时最小化到托盘',
      autoUpdate: '自动检查更新',
      localData: '本地数据',
      localDataValue: '任务、目标、设置和个人资料保存在本机。',
      dataBackup: '数据备份',
      dataBackupValue: '导出或恢复本机完整数据，邮箱授权码不会写入备份文件。',
      exportData: '导出数据',
      importData: '导入数据',
      appName: '软件名称',
      currentVersion: '当前版本',
      softwareUpdate: '软件更新',
      checking: '检查中...',
      updating: '更新中...',
      updateNow: '立即更新',
      checkUpdate: '检查更新',
      latestVersion: '最新版本：v{{version}}',
      builtIn: '已内置',
    },
  },
  'zh-TW': {
    sections: {
      appearance: '外觀',
      calendar: '日曆同步',
      notifications: '提醒與通知',
      pomodoro: '番茄鐘',
      sync: '同步與帳號',
      window: '視窗行為',
      data: '資料與隱私',
      about: '關於與更新',
    },
    descriptions: {
      appearance: '選擇介面風格、語言和總覽顯示偏好。',
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
      countryCalendarTitle: '國家或地區節假日',
      countryCalendarDesc: '按所選國家或地區自動同步公開節假日。',
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
      provider: '連線方式',
      providerImap: 'IMAP 授權碼',
      providerGmail: 'Gmail OAuth',
      providerOutlook: 'Outlook OAuth',
      providerImapDesc: '適合企業郵箱或自訂郵箱，需要 IMAP 伺服器和授權碼。',
      providerGmailDesc: '使用 Gmail 郵箱會議同步，預設使用 Gmail IMAP。',
      providerOutlookDesc: '使用 Outlook / Microsoft 365 郵箱會議同步，預設使用 Outlook IMAP。',
      email: '郵箱地址',
      imapHost: 'IMAP 伺服器',
      port: '埠',
      secret: '授權碼/密碼',
      oauthToken: 'OAuth 存取權杖',
      add: '新增',
      emptyEmail: '還沒有郵箱帳號。',
      noImap: '未設定 IMAP',
      authorized: '已授權',
      unauthorized: '未授權',
      authorize: '授權',
      hideAuth: '收起',
      secretPlaceholder: '輸入或更新授權碼/密碼',
      oauthPlaceholder: '貼上 OAuth 存取權杖',
      saveAuth: '儲存授權',
      clearAuth: '清除授權',
      oauthClientRequired: '請先填寫 OAuth 用戶端 ID',
      oauthClientId: 'OAuth Client ID',
      openAuthorization: '開啟授權',
      oauthGuide: '使用正式 OAuth 用戶端取得 IMAP 存取權杖，然後在下方保存。',
      exportConfig: '匯出設定',
      importConfig: '匯入設定',
      diagnostics: '診斷資訊',
      enabled: '啟用',
      disabled: '停用',
      errorAuth: '未授權或授權已失效，請重新儲存授權資訊。',
      errorNetwork: '網路或郵箱伺服器連線失敗，稍後會自動重試。',
      errorLogin: '郵箱登入失敗，請檢查郵箱地址和授權資訊。',
      errorServer: 'IMAP 伺服器設定不完整，請檢查連線方式。',
      errorUnknown: '同步失敗，稍後會自動重試。',
    },
    ui: {
      theme: '主題',
      language: '語言',
      displaySize: '介面大小',
      displaySizeHint: '每個選項都會同步調整字號、間距和控制項尺寸，確保介面協調。',
      compact: '緊湊',
      compactDesc: '適合小螢幕和高資訊密度。',
      standard: '標準',
      standardDesc: '預設推薦，平衡資訊量和可讀性。',
      comfortable: '舒適',
      comfortableDesc: '文字和點擊區域更寬鬆。',
      large: '大字',
      largeDesc: '適合高解析螢幕、遠距離或更強可讀性。',
      weekStart: '每週開始日',
      monday: '週一',
      sunday: '週日',
      overviewQuote: '總覽勵志語',
      overviewQuoteHint: '開啟後，總覽頂部顯示每日勵志語。',
      taskEditor: '任務描述編輯器',
      taskEditorValue: 'Markdown 固定啟用',
      taskEditEntry: '任務描述進入編輯',
      taskEditEntryValue: '雙擊進入編輯，避免誤觸',
      markdownEnter: 'Markdown Enter 行為',
      markdownEnterValue: '自動延續列表、空列表項 Enter 退出列表、有序列表自動編號',
      quickInsert: '快速插入行為',
      quickInsertValue: '插入標題、引用、列表、程式碼區塊後視圖跟隨游標',
      afterSave: '儲存後展示',
      afterSaveValue: '預覽內容必須和 Markdown 編輯結果一致',
      desktopNotification: '桌面通知',
      reminderSound: '提示音',
      focusDuration: '專注時長',
      focusDurationHint: '每輪番茄鐘的專注工作時間。',
      longBreak: '長休息',
      longBreakHint: '完成一組專注後進入的較長休息時間。',
      minutesUnit: '分鐘',
      syncEnabled: '啟用同步',
      serverUrl: '伺服器地址',
      account: '帳號',
      loggedInAs: '已登入：{{name}}',
      logout: '登出',
      login: '登入',
      register: '註冊',
      nickname: '郵箱',
      verifyEmail: '驗證郵箱',
      devices: '已登入設備',
      verificationCode: '郵箱驗證碼',
      sendCode: '發送驗證碼',
      verified: '已驗證',
      unverified: '未驗證',
      password: '密碼',
      syncNow: '立即同步',
      uploadLocal: '上傳本機資料',
      restoreCloud: '從雲端恢復',
      smartMerge: '智慧合併',
      rename: '重新命名',
      remove: '移除',
      removeOthers: '移除其他設備',
      requestWipe: '請求清理',
      currentDevice: '目前設備',
      remoteVersion: '雲端版本：{{version}}',
      lastSync: '上次同步：{{time}}',
      autoStart: '開機自啟',
      minimizeToTray: '關閉時最小化到系統匣',
      autoUpdate: '自動檢查更新',
      localData: '本機資料',
      localDataValue: '任務、目標、設定和個人資料儲存在本機。',
      dataBackup: '資料備份',
      dataBackupValue: '匯出或恢復本機完整資料，郵箱授權碼不會寫入備份檔案。',
      exportData: '匯出資料',
      importData: '匯入資料',
      appName: '軟體名稱',
      currentVersion: '目前版本',
      softwareUpdate: '軟體更新',
      checking: '檢查中...',
      updating: '更新中...',
      updateNow: '立即更新',
      checkUpdate: '檢查更新',
      latestVersion: '最新版本：v{{version}}',
      builtIn: '已內建',
    },
  },
  en: {
    sections: {
      appearance: 'Appearance',
      calendar: 'Calendar Sync',
      notifications: 'Reminders',
      pomodoro: 'Pomodoro',
      sync: 'Sync & Account',
      window: 'Window behavior',
      data: 'Data & Privacy',
      about: 'About & Updates',
    },
    descriptions: {
      appearance: 'Choose visual style, language, and overview preferences.',
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
      countryCalendarTitle: 'Country or region holidays',
      countryCalendarDesc: 'Sync public holidays for the selected country or region.',
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
      provider: 'Connection',
      providerImap: 'IMAP app password',
      providerGmail: 'Gmail OAuth',
      providerOutlook: 'Outlook OAuth',
      providerImapDesc: 'For custom or work mailboxes. Requires an IMAP server and app password.',
      providerGmailDesc: 'Sync Gmail meeting invites with the Gmail IMAP defaults.',
      providerOutlookDesc: 'Sync Outlook / Microsoft 365 meeting invites with Outlook IMAP defaults.',
      email: 'Email',
      imapHost: 'IMAP server',
      port: 'Port',
      secret: 'App password',
      oauthToken: 'OAuth access token',
      add: 'Add',
      emptyEmail: 'No email accounts yet.',
      noImap: 'No IMAP server',
      authorized: 'Authorized',
      unauthorized: 'Not authorized',
      authorize: 'Authorize',
      hideAuth: 'Collapse',
      secretPlaceholder: 'Enter or update app password',
      oauthPlaceholder: 'Paste OAuth access token',
      saveAuth: 'Save',
      clearAuth: 'Clear',
      oauthClientRequired: 'OAuth Client ID is required',
      oauthClientId: 'OAuth Client ID',
      openAuthorization: 'Open authorization',
      oauthGuide: 'Use your official OAuth client to obtain an IMAP access token, then save it below.',
      exportConfig: 'Export config',
      importConfig: 'Import config',
      diagnostics: 'Diagnostics',
      enabled: 'Enabled',
      disabled: 'Disabled',
      errorAuth: 'Authorization is missing or expired. Save the authorization again.',
      errorNetwork: 'Network or mailbox server connection failed. The app will retry automatically.',
      errorLogin: 'Mailbox sign-in failed. Check the email address and authorization.',
      errorServer: 'IMAP server settings are incomplete. Check the connection type.',
      errorUnknown: 'Sync failed. The app will retry automatically.',
    },
    ui: {
      theme: 'Theme',
      language: 'Language',
      displaySize: 'Interface size',
      displaySizeHint: 'Each option adjusts font size, spacing, and controls together so the interface stays balanced.',
      compact: 'Compact',
      compactDesc: 'For small screens and dense information.',
      standard: 'Standard',
      standardDesc: 'Recommended default, balancing density and readability.',
      comfortable: 'Comfortable',
      comfortableDesc: 'Roomier text and click targets.',
      large: 'Large text',
      largeDesc: 'For high-DPI screens, distance viewing, or stronger readability.',
      weekStart: 'Week starts on',
      monday: 'Monday',
      sunday: 'Sunday',
      overviewQuote: 'Overview quote',
      overviewQuoteHint: 'Show the daily motivational quote at the top of Overview.',
      taskEditor: 'Task description editor',
      taskEditorValue: 'Markdown is always enabled',
      taskEditEntry: 'Enter description editing',
      taskEditEntryValue: 'Double-click to edit, reducing accidental edits',
      markdownEnter: 'Markdown Enter behavior',
      markdownEnterValue: 'Continue lists automatically, exit empty list items, and auto-number ordered lists',
      quickInsert: 'Quick insert behavior',
      quickInsertValue: 'After inserting headings, quotes, lists, or code blocks, the view follows the cursor',
      afterSave: 'After saving',
      afterSaveValue: 'Preview must match the Markdown editor result',
      desktopNotification: 'Desktop notifications',
      reminderSound: 'Reminder sound',
      focusDuration: 'Focus duration',
      focusDurationHint: 'Focused work time for each Pomodoro round.',
      longBreak: 'Long break',
      longBreakHint: 'Longer break time after completing a focus set.',
      minutesUnit: 'min',
      syncEnabled: 'Enable sync',
      serverUrl: 'Server URL',
      account: 'Account',
      loggedInAs: 'Signed in as {{name}}',
      logout: 'Sign out',
      login: 'Sign in',
      register: 'Sign up',
      nickname: 'Email',
      verifyEmail: 'Verify email',
      devices: 'Signed-in devices',
      verificationCode: 'Email code',
      sendCode: 'Send code',
      verified: 'Verified',
      unverified: 'Unverified',
      password: 'Password',
      syncNow: 'Sync now',
      uploadLocal: 'Upload local data',
      restoreCloud: 'Restore from cloud',
      smartMerge: 'Smart merge',
      rename: 'Rename',
      remove: 'Remove',
      removeOthers: 'Remove others',
      requestWipe: 'Request wipe',
      currentDevice: 'Current device',
      remoteVersion: 'Remote version: {{version}}',
      lastSync: 'Last sync: {{time}}',
      autoStart: 'Launch at startup',
      minimizeToTray: 'Minimize to tray on close',
      autoUpdate: 'Check for updates automatically',
      localData: 'Local data',
      localDataValue: 'Tasks, goals, settings, and profile are stored on this device.',
      dataBackup: 'Data backup',
      dataBackupValue: 'Export or restore all local data. Email app passwords are not written to backup files.',
      exportData: 'Export data',
      importData: 'Import data',
      appName: 'App name',
      currentVersion: 'Current version',
      softwareUpdate: 'Software update',
      checking: 'Checking...',
      updating: 'Updating...',
      updateNow: 'Update now',
      checkUpdate: 'Check for updates',
      latestVersion: 'Latest version: v{{version}}',
      builtIn: 'Built in',
    },
  },
} satisfies Record<AppSettings['language'], {
  sections: Record<SectionId, string>;
  descriptions: Record<SectionId, string>;
  saved: string;
  saving: string;
  autoSave: string;
  calendar: Record<string, string>;
  ui: Record<string, string>;
}>;

const settingsMessages = {
  'zh-CN': {
    saveFailed: '设置保存失败：{{error}}',
    countryCalendarSynced: '国家日历已同步',
    enterIcs: '请输入 ICS URL',
    icsImported: 'ICS 日历源已导入并同步',
    sourceDeleted: '日历源已删除',
    sourceSynced: '日历源已同步',
    enterEmail: '请输入邮箱地址',
    emailAdded: '邮箱账号已添加',
    emailDeleted: '邮箱账号已删除',
    enterSecret: '请输入邮箱授权码或密码',
    authSaved: '邮箱授权信息已保存到系统凭据管理',
    authCleared: '邮箱授权信息已清除',
    emailSyncResult: '扫描 {{scanned}} 封邮件，新增 {{imported}} 个会议',
    calendarConfigExported: '日历同步配置已导出',
    calendarConfigImported: '日历同步配置已导入，请在本机重新授权邮箱账号',
    calendarDiagnosticsExported: '日历同步诊断信息已导出',
    enterAccount: '请输入邮箱和密码',
    loginSuccess: '登录成功',
    registerSuccess: '注册成功',
    pushSuccess: '本机数据已上传',
    pullSuccess: '云端数据已恢复到本机',
    exportSuccess: '数据备份已导出',
    importSuccess: '数据已恢复，正在刷新应用',
    importConfirm: '导入备份会覆盖当前本机数据，确定继续吗？\n\n{{summary}}',
    importPreviewTitle: '导入数据备份',
    importOverwriteWarning: '导入备份会覆盖当前本机数据。继续前会自动保存一份导入前备份。',
    backupVersion: '备份版本',
    backupGeneratedAt: '生成时间',
    backupTasks: '任务',
    backupGoals: '目标',
    backupEvents: '日历事件',
    backupBoards: '看板',
    backupLists: '列表',
    backupPomodoros: '番茄记录',
    backupReviews: '复盘记录',
    backupSettings: '设置项',
    backupScope: '将覆盖当前本地数据',
    backupLegacy: '旧版备份，部分统计可能不完整',
    continueImport: '确认导入',
    preImportBackupSaved: '已自动保存导入前备份',
    backupSummary: '备份版本：{{version}}\n生成时间：{{time}}\n任务：{{tasks}} 个，目标：{{goals}} 个，日历事件：{{events}} 个',
    installingUpdate: '正在启动更新安装程序，应用即将退出',
    latestAlready: '当前已经是最新版本',
    updateCheckFailed: '更新检查失败',
  },
  'zh-TW': {
    saveFailed: '設定儲存失敗：{{error}}',
    countryCalendarSynced: '國家日曆已同步',
    enterIcs: '請輸入 ICS URL',
    icsImported: 'ICS 日曆源已匯入並同步',
    sourceDeleted: '日曆源已刪除',
    sourceSynced: '日曆源已同步',
    enterEmail: '請輸入郵箱地址',
    emailAdded: '郵箱帳號已新增',
    emailDeleted: '郵箱帳號已刪除',
    enterSecret: '請輸入郵箱授權碼或密碼',
    authSaved: '郵箱授權資訊已儲存到系統憑據管理',
    authCleared: '郵箱授權資訊已清除',
    emailSyncResult: '掃描 {{scanned}} 封郵件，新增 {{imported}} 個會議',
    calendarConfigExported: '日曆同步設定已匯出',
    calendarConfigImported: '日曆同步設定已匯入，請在本機重新授權郵箱帳號',
    calendarDiagnosticsExported: '日曆同步診斷資訊已匯出',
    enterAccount: '請輸入郵箱和密碼',
    loginSuccess: '登入成功',
    registerSuccess: '註冊成功',
    pushSuccess: '本機資料已上傳',
    pullSuccess: '雲端資料已恢復到本機',
    exportSuccess: '資料備份已匯出',
    importSuccess: '資料已恢復，正在重新整理應用',
    importConfirm: '匯入備份會覆蓋目前本機資料，確定繼續嗎？\n\n{{summary}}',
    importPreviewTitle: '匯入資料備份',
    importOverwriteWarning: '匯入備份會覆蓋目前本機資料。繼續前會自動儲存一份匯入前備份。',
    backupVersion: '備份版本',
    backupGeneratedAt: '生成時間',
    backupTasks: '任務',
    backupGoals: '目標',
    backupEvents: '日曆事件',
    backupBoards: '看板',
    backupLists: '列表',
    backupPomodoros: '番茄記錄',
    backupReviews: '復盤記錄',
    backupSettings: '設定項',
    backupScope: '將覆蓋目前本機資料',
    backupLegacy: '舊版備份，部分統計可能不完整',
    continueImport: '確認匯入',
    preImportBackupSaved: '已自動儲存匯入前備份',
    backupSummary: '備份版本：{{version}}\n生成時間：{{time}}\n任務：{{tasks}} 個，目標：{{goals}} 個，日曆事件：{{events}} 個',
    installingUpdate: '正在啟動更新安裝程式，應用即將退出',
    latestAlready: '目前已經是最新版本',
    updateCheckFailed: '更新檢查失敗',
  },
  en: {
    saveFailed: 'Failed to save settings: {{error}}',
    countryCalendarSynced: 'National calendar synced',
    enterIcs: 'Enter an ICS URL',
    icsImported: 'ICS calendar imported and synced',
    sourceDeleted: 'Calendar source deleted',
    sourceSynced: 'Calendar source synced',
    enterEmail: 'Enter an email address',
    emailAdded: 'Email account added',
    emailDeleted: 'Email account deleted',
    enterSecret: 'Enter the email app password or password',
    authSaved: 'Email authorization saved to system credentials',
    authCleared: 'Email authorization cleared',
    emailSyncResult: 'Scanned {{scanned}} messages, added {{imported}} meetings',
    calendarConfigExported: 'Calendar sync config exported',
    calendarConfigImported: 'Calendar sync config imported. Re-authorize email accounts on this device.',
    calendarDiagnosticsExported: 'Calendar sync diagnostics exported',
    enterAccount: 'Enter email and password',
    loginSuccess: 'Signed in',
    registerSuccess: 'Signed up',
    pushSuccess: 'Local data uploaded',
    pullSuccess: 'Cloud data restored locally',
    exportSuccess: 'Data backup exported',
    importSuccess: 'Data restored. Refreshing the app',
    importConfirm: 'Importing a backup will overwrite current local data. Continue?\n\n{{summary}}',
    importPreviewTitle: 'Import data backup',
    importOverwriteWarning: 'Importing a backup will overwrite current local data. A pre-import backup will be saved first.',
    backupVersion: 'Backup version',
    backupGeneratedAt: 'Generated',
    backupTasks: 'Tasks',
    backupGoals: 'Goals',
    backupEvents: 'Calendar events',
    backupBoards: 'Boards',
    backupLists: 'Lists',
    backupPomodoros: 'Pomodoro records',
    backupReviews: 'Review records',
    backupSettings: 'Settings',
    backupScope: 'Will overwrite current local data',
    backupLegacy: 'Legacy backup. Some counts may be incomplete',
    continueImport: 'Import',
    preImportBackupSaved: 'Pre-import backup saved automatically',
    backupSummary: 'Backup version: {{version}}\nGenerated: {{time}}\nTasks: {{tasks}}, goals: {{goals}}, calendar events: {{events}}',
    installingUpdate: 'Starting the update installer. The app will exit shortly',
    latestAlready: 'You are already on the latest version',
    updateCheckFailed: 'Update check failed',
  },
} satisfies Record<AppSettings['language'], Record<string, string>>;

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

const localizedThemeLabels: Record<AppSettings['language'], Record<AppSettings['theme'], string>> = {
  'zh-CN': themeLabels,
  'zh-TW': {
    'aurora-day': '極光白',
    'mint-garden': '薄荷園',
    midnight: '午夜藍',
    'amber-dawn': '琥珀晨曦',
    'rose-mist': '玫瑰霧',
    'sakura-pink': '櫻花粉',
    'ocean-breeze': '海風藍',
    'forest-night': '深林夜',
    'lime-pop': '青檸律動',
    'coral-glow': '珊瑚晨光',
    'graphite-neon': '石墨霓光',
    'lavender-frost': '薰衣草霜',
  },
  en: Object.fromEntries(THEMES.map((theme) => [theme.id, theme.name])) as Record<AppSettings['theme'], string>,
};

const localizedSoundLabels: Record<AppSettings['language'], Record<(typeof SOUNDS)[number]['id'], string>> = {
  'zh-CN': {
    bell: '铃声',
    chime: '风铃',
    digital: '电子音',
    waiting: '等候音',
    'marimba-waiting': '马林巴',
    none: '无',
  },
  'zh-TW': {
    bell: '鈴聲',
    chime: '風鈴',
    digital: '電子音',
    waiting: '等候音',
    'marimba-waiting': '馬林巴',
    none: '無',
  },
  en: Object.fromEntries(SOUNDS.map((sound) => [sound.id, sound.name])) as Record<(typeof SOUNDS)[number]['id'], string>,
};

const displaySizeIds: AppSettings['displaySize'][] = ['compact', 'standard', 'comfortable', 'large'];

const calendarTimedReminderOptions = [-1, 0, 5, 10, 15, 30, 60, 1440];
const calendarDurationOptions = [15, 30, 45, 60, 90, 120];
const calendarAllDayReminderOptions: AppSettings['calendarDefaultAllDayReminder'][] = [
  'none',
  'same_day_09',
  'previous_day_18',
  'previous_day_20',
  'previous_day_09',
];
const calendarColorOptions = ['#2563eb', '#16a34a', '#7c3aed', '#ea580c', '#dc2626', '#0891b2', '#db2777', '#64748b'];

const calendarPreferenceCopy = {
  'zh-CN': {
    defaults: '日程默认设置',
    timedReminder: '非全天日程提醒时间',
    allDayReminder: '全天日程提醒时间',
    defaultDuration: '日程默认时长',
    defaultColor: '日程颜色',
    displayMode: '日周月显示方式',
    minutesBefore: '提前 {{minutes}} 分钟',
    hoursBefore: '提前 {{hours}} 小时',
    daysBefore: '提前 1 天',
    atStart: '准时',
    noReminder: '不提醒',
    sameDay09: '当天 09:00',
    previousDay18: '前一天 18:00',
    previousDay20: '前一天 20:00',
    previousDay09: '前一天 09:00',
    minutes: '{{minutes}} 分钟',
    compact: '紧凑',
    comfortable: '舒展',
  },
  'zh-TW': {
    defaults: '日程預設',
    timedReminder: '非全天日程提醒時間',
    allDayReminder: '全天日程提醒時間',
    defaultDuration: '日程預設時長',
    defaultColor: '日程顏色',
    displayMode: '日週月顯示方式',
    minutesBefore: '提前 {{minutes}} 分鐘',
    hoursBefore: '提前 {{hours}} 小時',
    daysBefore: '提前 1 天',
    atStart: '準時',
    noReminder: '不提醒',
    sameDay09: '當天 09:00',
    previousDay18: '前一天 18:00',
    previousDay20: '前一天 20:00',
    previousDay09: '前一天 09:00',
    minutes: '{{minutes}} 分鐘',
    compact: '緊湊',
    comfortable: '舒展',
  },
  en: {
    defaults: 'Schedule defaults',
    timedReminder: 'Timed event reminder',
    allDayReminder: 'All-day event reminder',
    defaultDuration: 'Default duration',
    defaultColor: 'Event color',
    displayMode: 'Day/week/month display',
    minutesBefore: '{{minutes}} min before',
    hoursBefore: '{{hours}} hr before',
    daysBefore: '1 day before',
    atStart: 'At start',
    noReminder: 'No reminder',
    sameDay09: 'Same day 09:00',
    previousDay18: 'Previous day 18:00',
    previousDay20: 'Previous day 20:00',
    previousDay09: 'Previous day 09:00',
    minutes: '{{minutes}} min',
    compact: 'Compact',
    comfortable: 'Comfortable',
  },
} satisfies Record<AppSettings['language'], Record<string, string>>;

const calendarPreferenceOverrides = {
  'zh-CN': {
    defaults: '日程默认设置',
    timedReminder: '非全天日程提醒时间',
    allDayReminder: '全天日程提醒时间',
    defaultDuration: '日程默认时长',
    defaultColor: '日程颜色',
    displayMode: '日/周/月显示',
    minutesBefore: '提前 {{minutes}} 分钟',
    hoursBefore: '提前 {{hours}} 小时',
    daysBefore: '提前 1 天',
    atStart: '准时',
    noReminder: '不提醒',
    sameDay09: '当天 09:00',
    previousDay18: '前一天 18:00',
    previousDay20: '前一天 20:00',
    previousDay09: '前一天 09:00',
    minutes: '{{minutes}} 分钟',
    compact: '紧凑',
    comfortable: '舒展',
  },
  'zh-TW': {
    defaults: '日程預設設定',
    timedReminder: '非全天日程提醒時間',
    allDayReminder: '全天日程提醒時間',
    defaultDuration: '日程預設時長',
    defaultColor: '日程顏色',
    displayMode: '日/週/月顯示',
    minutesBefore: '提前 {{minutes}} 分鐘',
    hoursBefore: '提前 {{hours}} 小時',
    daysBefore: '提前 1 天',
    atStart: '準時',
    noReminder: '不提醒',
    sameDay09: '當天 09:00',
    previousDay18: '前一天 18:00',
    previousDay20: '前一天 20:00',
    previousDay09: '前一天 09:00',
    minutes: '{{minutes}} 分鐘',
    compact: '緊湊',
    comfortable: '舒展',
  },
  en: {},
} satisfies Record<AppSettings['language'], Record<string, string>>;

const calendarCopyOverrides = {
  'zh-CN': {
    holidayCalendar: '节假日日历',
    holidayEvents: '节假日事件',
    autoSync: '启动后自动同步',
    recentSync: '最近同步',
    addHolidayCalendar: '添加节假日日历',
    holidayCountry: '国家或地区',
    holidayCountryDesc: '根据所选国家或地区自动同步公开节假日；数据来自在线节假日服务。',
    syncCountry: '同步所选地区',
    countrySynced: '节假日日历已同步',
    sync: '同步',
    delete: '删除',
    selected: '已选择',
    userSource: '已添加的 ICS 日历',
    noUserSource: '还没有添加自定义 ICS 日历。',
    icsUrl: 'ICS 订阅地址',
    icsPlaceholder: 'https://example.com/calendar.ics',
    addIcs: '添加 ICS 日历',
  },
  'zh-TW': {
    holidayCalendar: '節假日日曆',
    holidayEvents: '節假日事件',
    autoSync: '啟動後自動同步',
    recentSync: '最近同步',
    addHolidayCalendar: '新增節假日日曆',
    holidayCountry: '國家或地區',
    holidayCountryDesc: '根據所選國家或地區自動同步公開節假日；資料來自線上節假日服務。',
    syncCountry: '同步所選地區',
    countrySynced: '節假日日曆已同步',
    sync: '同步',
    delete: '刪除',
    selected: '已選擇',
    userSource: '已新增的 ICS 日曆',
    noUserSource: '還沒有新增自訂 ICS 日曆。',
    icsUrl: 'ICS 訂閱地址',
    icsPlaceholder: 'https://example.com/calendar.ics',
    addIcs: '新增 ICS 日曆',
  },
  en: {
    holidayCountry: 'Country or region',
    holidayCountryDesc: 'Sync public holidays automatically for the selected country or region. Data is loaded from an online holiday service.',
    syncCountry: 'Sync selected region',
    countrySynced: 'Holiday calendar synced',
  },
} satisfies Record<AppSettings['language'], Record<string, string>>;

function buildIcsSourceName(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '') || 'ICS Calendar';
  } catch {
    return 'ICS Calendar';
  }
}

type BackupSummary = {
  appVersion: string;
  generatedAt: string;
  boards: number;
  lists: number;
  tasks: number;
  goals: number;
  calendarEvents: number;
  pomodoros: number;
  reviews: number;
  settings: number;
};

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { settings, setSettings, setAll } = useSettingsStore();
  const copy = settingsCopy[settings.language];
  const ui = copy.ui;
  const messages = settingsMessages[settings.language];
  const themeText = localizedThemeLabels[settings.language];
  const soundText = localizedSoundLabels[settings.language];
  const msg = (key: keyof typeof messages, params: Record<string, string | number> = {}) => {
    let value = messages[key];
    Object.entries(params).forEach(([name, replacement]) => {
      value = value.replace(`{{${name}}}`, String(replacement));
    });
    return value;
  };
  const calendarText = { ...copy.calendar, ...calendarCopyOverrides[settings.language] };
  const calendarPrefs = { ...calendarPreferenceCopy[settings.language], ...calendarPreferenceOverrides[settings.language] };
  const selectedHolidayCountry = settings.holidayCountry || defaultHolidayCountryForLanguage(settings.language);
  const timedReminderLabel = (minutes: number) => {
    if (minutes < 0) return calendarPrefs.noReminder;
    if (minutes === 0) return calendarPrefs.atStart;
    if (minutes === 60) return calendarPrefs.hoursBefore.replace('{{hours}}', '1');
    if (minutes === 1440) return calendarPrefs.daysBefore;
    return calendarPrefs.minutesBefore.replace('{{minutes}}', String(minutes));
  };
  const durationLabel = (minutes: number) => calendarPrefs.minutes.replace('{{minutes}}', String(minutes));
  const allDayReminderLabel = (value: AppSettings['calendarDefaultAllDayReminder']) => {
    const labels: Record<AppSettings['calendarDefaultAllDayReminder'], string> = {
      none: calendarPrefs.noReminder,
      same_day_09: calendarPrefs.sameDay09,
      previous_day_18: calendarPrefs.previousDay18,
      previous_day_20: calendarPrefs.previousDay20,
      previous_day_09: calendarPrefs.previousDay09,
    };
    return labels[value];
  };
  const calendarProviderLabel = (provider: string) => {
    if (provider === 'gmail') return calendarText.providerGmail;
    if (provider === 'outlook') return calendarText.providerOutlook;
    return calendarText.providerImap;
  };
  const calendarProviderDescription = (provider: CalendarEmailProvider) => {
    if (provider === 'gmail') return calendarText.providerGmailDesc;
    if (provider === 'outlook') return calendarText.providerOutlookDesc;
    return calendarText.providerImapDesc;
  };
  const openCalendarOAuthGuide = () => {
    const clientId = calendarOAuthClientId.trim();
    if (!clientId || calendarEmailProvider === 'imap') return;
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'token',
      redirect_uri: 'https://localhost',
      scope: calendarEmailProvider === 'gmail'
        ? 'https://mail.google.com/'
        : 'https://outlook.office.com/IMAP.AccessAsUser.All offline_access',
      prompt: 'consent',
    });
    const url = calendarEmailProvider === 'gmail'
      ? `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
      : `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const calendarErrorMessage = (error?: string | null) => {
    if (!error) return '';
    const normalized = error.toLowerCase();
    if (normalized.includes('授权') || normalized.includes('auth') || normalized.includes('credential') || normalized.includes('token')) {
      return calendarText.errorAuth;
    }
    if (normalized.includes('登录') || normalized.includes('login') || normalized.includes('xoauth')) {
      return calendarText.errorLogin;
    }
    if (normalized.includes('imap 服务器') || normalized.includes('imap server') || normalized.includes('server settings')) {
      return calendarText.errorServer;
    }
    if (normalized.includes('连接') || normalized.includes('network') || normalized.includes('connect') || normalized.includes('tls')) {
      return calendarText.errorNetwork;
    }
    return calendarText.errorUnknown;
  };
  const withCalendarAccountBusy = async (accountId: string, action: () => Promise<void>) => {
    setCalendarAccountBusy((prev) => ({ ...prev, [accountId]: true }));
    try {
      await action();
    } finally {
      setCalendarAccountBusy((prev) => ({ ...prev, [accountId]: false }));
    }
  };
  const { session, setSession } = useAuthStore();
  const [active, setActive] = useState<SectionId>('appearance');
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [calendarStatus, setCalendarStatus] = useState<CalendarSyncStatus | null>(null);
  const [holidaySources, setHolidaySources] = useState<CalendarHolidaySource[]>([]);
  const [holidayIcsUrl, setHolidayIcsUrl] = useState('');
  const [calendarAccounts, setCalendarAccounts] = useState<CalendarEmailAccount[]>([]);
  const [calendarEmailProvider, setCalendarEmailProvider] = useState<CalendarEmailProvider>('imap');
  const [calendarEmail, setCalendarEmail] = useState('');
  const [calendarImapHost, setCalendarImapHost] = useState('');
  const [calendarImapPort, setCalendarImapPort] = useState('993');
  const [calendarSecret, setCalendarSecret] = useState('');
  const [calendarOAuthClientId, setCalendarOAuthClientId] = useState('');
  const [calendarAccountSecrets, setCalendarAccountSecrets] = useState<Record<string, string>>({});
  const [calendarCredentialStatus, setCalendarCredentialStatus] = useState<Record<string, boolean>>({});
  const [credentialEditorAccountId, setCredentialEditorAccountId] = useState<string | null>(null);
  const [calendarSyncAllBusy, setCalendarSyncAllBusy] = useState(false);
  const [calendarAccountBusy, setCalendarAccountBusy] = useState<Record<string, boolean>>({});
  const [calendarConfigBusy, setCalendarConfigBusy] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [pw, setPw] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [cloudDevices, setCloudDevices] = useState<CloudDevice[]>([]);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  useEffect(() => {
    if (calendarEmailProvider === 'imap') return;
    const configuredClientId = defaultCalendarOAuthClientId(calendarEmailProvider);
    if (configuredClientId && !calendarOAuthClientId.trim()) {
      setCalendarOAuthClientId(configuredClientId);
    }
  }, [calendarEmailProvider, calendarOAuthClientId]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    path: string;
    content: string;
    summary: BackupSummary;
  } | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateInstallRequested, setUpdateInstallRequested] = useState(false);
  const installingUpdateRef = useRef(false);
  const updateInstallRequestedRef = useRef(false);
  const updateCheckPromiseRef = useRef<Promise<UpdateStatus> | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const section = new URLSearchParams(location.search).get('section') as SectionId | null;
    if (section && navItems.some((item) => item.id === section)) {
      setActive(section);
    }
  }, [location.search]);

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
        setServerUrl(s.serverUrl || 'http://127.0.0.1:11911');
      } catch {
        /* status is optional */
      }
      try {
        const sess = await authApi.current();
        if (sess) {
          setSession(sess);
          authApi.listDevices().then(setCloudDevices).catch(() => setCloudDevices([]));
        }
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
      toast.error(msg('saveFailed', { error: String(e) }));
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

  const onSyncHolidayCountry = async (countryCode = selectedHolidayCountry) => {
    setBusy(true);
    try {
      const status = await calendarApi.syncHolidayCountry({ countryCode, language: settings.language });
      setCalendarStatus(status);
      setHolidaySources(await calendarApi.holidaySources());
      window.dispatchEvent(new CustomEvent('ascend:calendar-sync-finished'));
      toast.success(calendarText.countrySynced);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const onHolidayCountryChange = async (countryCode: string) => {
    await onSaveSettings({ holidayCountry: countryCode });
    await onSyncHolidayCountry(countryCode);
  };

  const onImportHolidayIcsSource = async () => {
    if (!holidayIcsUrl.trim()) {
      toast.error(msg('enterIcs'));
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
      toast.success(msg('icsImported'));
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
      toast.success(msg('sourceDeleted'));
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
      toast.success(msg('sourceSynced'));
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
      toast.error(msg('enterEmail'));
      return;
    }
    setBusy(true);
    try {
      const account = await calendarApi.createEmailAccount({
        provider: calendarEmailProvider,
        email: calendarEmail.trim(),
        imapHost: calendarEmailProvider === 'imap' ? calendarImapHost.trim() || null : null,
        imapPort: calendarEmailProvider === 'imap' ? Number(calendarImapPort) || 993 : null,
        syncIntervalMinutes: 10,
      });
      if (calendarSecret.trim()) {
        await calendarApi.saveEmailCredential({ accountId: account.id, secret: calendarSecret.trim() });
      } else if (calendarEmailProvider !== 'imap' && calendarOAuthClientId.trim()) {
        await calendarApi.authorizeEmailOAuth({ accountId: account.id, clientId: calendarOAuthClientId.trim() });
        await calendarApi.syncEmailAccount(account.id).catch(() => null);
      }
      setCalendarEmail('');
      setCalendarEmailProvider('imap');
      setCalendarImapHost('');
      setCalendarImapPort('993');
      setCalendarSecret('');
      setCalendarOAuthClientId('');
      await refreshCalendarSync();
      toast.success(msg('emailAdded'));
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
    toast.success(msg('emailDeleted'));
  };

  const onSaveCalendarEmailCredential = async (accountId: string) => {
    const secret = calendarAccountSecrets[accountId]?.trim();
    if (!secret) {
      toast.error(msg('enterSecret'));
      return;
    }
    await withCalendarAccountBusy(accountId, async () => {
      await calendarApi.saveEmailCredential({ accountId, secret });
      setCalendarAccountSecrets((prev) => ({ ...prev, [accountId]: '' }));
      setCredentialEditorAccountId(null);
      await refreshCalendarSync();
      toast.success(msg('authSaved'));
    }).catch((error) => {
      toast.error(String(error));
    });
  };

  const onAuthorizeCalendarEmailOAuth = async (account: CalendarEmailAccount) => {
    const clientId = calendarOAuthClientId.trim() || defaultCalendarOAuthClientId(account.provider as CalendarEmailProvider);
    if (!clientId) {
      toast.error(calendarText.oauthClientRequired);
      return;
    }
    await withCalendarAccountBusy(account.id, async () => {
      await calendarApi.authorizeEmailOAuth({ accountId: account.id, clientId });
      await calendarApi.syncEmailAccount(account.id).catch(() => null);
      await refreshCalendarSync();
      toast.success(msg('authSaved'));
    }).catch((error) => {
      toast.error(String(error));
    });
  };

  const onDeleteCalendarEmailCredential = async (accountId: string) => {
    await withCalendarAccountBusy(accountId, async () => {
      await calendarApi.deleteEmailCredential(accountId);
      setCredentialEditorAccountId(null);
      await refreshCalendarSync();
      toast.success(msg('authCleared'));
    }).catch((error) => {
      toast.error(String(error));
    });
  };

  const onSyncCalendarEmailAccount = async (accountId: string) => {
    await withCalendarAccountBusy(accountId, async () => {
      const result = await calendarApi.syncEmailAccount(accountId);
      await refreshCalendarSync();
      toast.success(msg('emailSyncResult', { scanned: result.scannedMessages, imported: result.importedEvents }));
    }).catch(async (error) => {
      await refreshCalendarSync().catch(() => {});
      toast.error(String(error));
    });
  };

  const onSyncAllCalendarEmailAccounts = async () => {
    setCalendarSyncAllBusy(true);
    try {
      const results = await calendarApi.syncEmailAccounts();
      await refreshCalendarSync();
      const imported = results.reduce((sum, item) => sum + item.importedEvents, 0);
      const scanned = results.reduce((sum, item) => sum + item.scannedMessages, 0);
      toast.success(msg('emailSyncResult', { scanned, imported }));
    } catch (error) {
      await refreshCalendarSync().catch(() => {});
      toast.error(String(error));
    } finally {
      setCalendarSyncAllBusy(false);
    }
  };

  const onExportCalendarSyncConfig = async () => {
    setCalendarConfigBusy(true);
    try {
      const content = await calendarApi.exportSyncConfig();
      const filePath = await save({
        defaultPath: `ascend-calendar-sync-config-${dayjs().format('YYYYMMDD-HHmm')}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (filePath) {
        await writeTextFile(filePath, content);
        toast.success(msg('calendarConfigExported'));
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setCalendarConfigBusy(false);
    }
  };

  const onImportCalendarSyncConfig = async () => {
    setCalendarConfigBusy(true);
    try {
      const selected = await open({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (typeof selected === 'string') {
        const content = await readTextFile(selected);
        await calendarApi.importSyncConfig(content);
        await refreshCalendarSync();
        toast.success(msg('calendarConfigImported'));
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setCalendarConfigBusy(false);
    }
  };

  const onExportCalendarSyncDiagnostics = async () => {
    setCalendarConfigBusy(true);
    try {
      const diagnostics = {
        exportedAt: new Date().toISOString(),
        status: calendarStatus,
        accounts: calendarAccounts.map((account) => ({
          provider: account.provider,
          email: account.email,
          enabled: account.enabled,
          hasCredential: Boolean(calendarCredentialStatus[account.id]),
          lastSyncAt: account.lastSyncAt,
          lastError: account.lastError ? calendarErrorMessage(account.lastError) : null,
        })),
        holidaySources,
      };
      const filePath = await save({
        defaultPath: `ascend-calendar-sync-diagnostics-${dayjs().format('YYYYMMDD-HHmm')}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (filePath) {
        await writeTextFile(filePath, JSON.stringify(diagnostics, null, 2));
        toast.success(msg('calendarDiagnosticsExported'));
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setCalendarConfigBusy(false);
    }
  };

  const onAuth = async () => {
    if (!accountEmail.trim() || !pw) {
      toast.error(msg('enterAccount'));
      return;
    }
    setBusy(true);
    try {
      const s = authMode === 'login'
        ? await authApi.login({ email: accountEmail.trim(), password: pw, serverUrl: serverUrl || undefined })
        : await authApi.register({ email: accountEmail.trim(), password: pw, serverUrl: serverUrl || undefined });
      setSession(s);
      setCloudDevices(await authApi.listDevices().catch(() => []));
      setPw('');
      toast.success(authMode === 'login' ? msg('loginSuccess') : msg('registerSuccess'));
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onSendEmailCode = async () => {
    setBusy(true);
    try {
      await authApi.sendEmailVerificationCode();
      toast.success(settings.language === 'en' ? 'Verification code sent' : settings.language === 'zh-TW' ? '驗證碼已發送' : '验证码已发送');
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onVerifyEmail = async () => {
    if (!verificationCode.trim()) return;
    setBusy(true);
    try {
      const s = await authApi.verifyEmailCode(verificationCode.trim());
      setSession(s);
      setCloudDevices(await authApi.listDevices().catch(() => []));
      setVerificationCode('');
      toast.success(settings.language === 'en' ? 'Email verified' : settings.language === 'zh-TW' ? '郵箱已驗證' : '邮箱已验证');
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
      setCloudDevices([]);
      toast.info(t('sync.loggedOut'));
    } catch (e) {
      toast.error(String(e));
    }
  };

  const refreshCloudDevices = async () => {
    setCloudDevices(await authApi.listDevices().catch(() => []));
  };

  const onSync = async (action: 'push' | 'pull' | 'merge') => {
    setBusy(true);
    try {
      if (action === 'push') {
        await syncApi.push();
        toast.success(msg('pushSuccess'));
      } else if (action === 'pull') {
        await syncApi.pull();
        toast.success(msg('pullSuccess'));
      } else {
        await syncApi.merge();
        toast.success(settings.language === 'en' ? 'Data merged and uploaded' : settings.language === 'zh-TW' ? '資料已合併並上傳' : '数据已合并并上传');
      }
      setSyncStatus(await syncApi.status());
    } catch (e) {
      toast.error(t('sync.failed', { msg: String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const onRenameCloudDevice = async (device: CloudDevice) => {
    const nextName = window.prompt(ui.rename, device.deviceName);
    if (!nextName?.trim() || nextName.trim() === device.deviceName) return;
    setBusy(true);
    try {
      await authApi.renameDevice(device.id, nextName.trim());
      await refreshCloudDevices();
      toast.success(settings.language === 'en' ? 'Device renamed' : settings.language === 'zh-TW' ? '設備已重新命名' : '设备已重命名');
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const onRevokeCloudDevice = async (device: CloudDevice) => {
    if (device.id === session?.deviceId) return;
    if (!window.confirm(`${ui.remove}: ${device.deviceName}?`)) return;
    setBusy(true);
    try {
      await authApi.revokeDevice(device.id);
      await refreshCloudDevices();
      toast.success(settings.language === 'en' ? 'Device removed' : settings.language === 'zh-TW' ? '設備已移除' : '设备已移除');
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const onRequestCloudDeviceWipe = async (device: CloudDevice) => {
    if (device.id === session?.deviceId) return;
    if (!window.confirm(`${ui.requestWipe}: ${device.deviceName}?`)) return;
    setBusy(true);
    try {
      await authApi.requestDeviceWipe(device.id);
      await refreshCloudDevices();
      toast.success(settings.language === 'en' ? 'Cleanup requested' : settings.language === 'zh-TW' ? '已請求清理' : '已请求清理');
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const onRevokeOtherCloudDevices = async () => {
    if (!window.confirm(ui.removeOthers)) return;
    setBusy(true);
    try {
      await authApi.revokeOtherDevices();
      await refreshCloudDevices();
      toast.success(settings.language === 'en' ? 'Other devices removed' : settings.language === 'zh-TW' ? '其他設備已移除' : '其他设备已移除');
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const onExportBackup = async () => {
    setBusy(true);
    try {
      const target = await save({
        defaultPath: `Ascend-Todo-backup-${dayjs().format('YYYYMMDD-HHmmss')}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!target) return;
      const content = await syncApi.exportBackup();
      await writeTextFile(target, content);
      toast.success(msg('exportSuccess'));
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const onImportBackup = async () => {
    setBusy(true);
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!selected || Array.isArray(selected)) return;
      const content = await readTextFile(selected);
      const summary = parseBackupSummary(content);
      setPendingImport({ path: selected, content, summary });
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const onConfirmImportBackup = async () => {
    if (!pendingImport) return;
    setBusy(true);
    try {
      const preImportBackup = await syncApi.exportBackup();
      await writeTextFile(backupSiblingPath(pendingImport.path), preImportBackup);
      toast.info(msg('preImportBackupSaved'));
      const status = await syncApi.importBackup(pendingImport.content);
      setSyncStatus(status);
      setPendingImport(null);
      toast.success(msg('importSuccess'));
      window.setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const onInstallUpdate = useCallback(async () => {
    if (installingUpdateRef.current) return;
    installingUpdateRef.current = true;
    updateInstallRequestedRef.current = true;
    setUpdateInstallRequested(true);
    setUpdateBusy(true);
    try {
      await installDownloadedUpdate();
      toast.info(msg('installingUpdate'));
    } catch (error) {
      installingUpdateRef.current = false;
      updateInstallRequestedRef.current = false;
      setUpdateInstallRequested(false);
      toast.error(String(error));
      setUpdateBusy(false);
    }
  }, []);

  const onCheckUpdate = async () => {
    if (updateCheckPromiseRef.current) return;
    setUpdateBusy(true);
    updateInstallRequestedRef.current = false;
    setUpdateInstallRequested(false);
    try {
      const promise = checkForAppUpdate({ onStatus: setUpdateStatus });
      updateCheckPromiseRef.current = promise;
      const status = await promise;
      if (updateInstallRequestedRef.current && status.state === 'downloaded') {
        await onInstallUpdate();
        return;
      }
      updateInstallRequestedRef.current = false;
      setUpdateInstallRequested(false);
      if (status.state === 'not-available') {
        toast.info(msg('latestAlready'));
      } else if (status.state === 'error') {
        toast.error(status.error || msg('updateCheckFailed'));
      }
      setUpdateBusy(false);
    } catch (error) {
      toast.error(String(error));
      setUpdateBusy(false);
    } finally {
      updateCheckPromiseRef.current = null;
    }
  };

  const onUpdateButtonClick = async () => {
    if (['available', 'downloading', 'downloaded'].includes(updateStatus?.state ?? '')) {
      updateInstallRequestedRef.current = true;
      setUpdateInstallRequested(true);
      if (updateStatus?.state === 'downloaded') {
        await onInstallUpdate();
        return;
      }
      try {
        const status = await updateCheckPromiseRef.current;
        if (status?.state === 'downloaded') {
          await onInstallUpdate();
        } else {
          updateInstallRequestedRef.current = false;
          setUpdateInstallRequested(false);
        }
      } catch (error) {
        updateInstallRequestedRef.current = false;
        setUpdateInstallRequested(false);
        toast.error(String(error));
        setUpdateBusy(false);
      }
      return;
    }
    await onCheckUpdate();
  };

  const hasAvailableUpdate = ['available', 'downloading', 'downloaded'].includes(updateStatus?.state ?? '');
  const updateButtonLabel = updateInstallRequested
    ? ui.updating
    : updateBusy && !hasAvailableUpdate
      ? ui.checking
      : hasAvailableUpdate
        ? ui.updateNow
      : ui.checkUpdate;
  const latestVersionLabel = updateStatus?.latestVersion && updateStatus.state !== 'not-available' && updateStatus.state !== 'error'
    ? ui.latestVersion.replace('{{version}}', updateStatus.latestVersion)
    : null;

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

        <div className="grid gap-4 min-h-0 flex-1" style={{ gridTemplateColumns: 'var(--app-settings-nav-width) minmax(0, 1fr)' }}>
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
                <Row label={ui.theme}>
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                    {THEMES.map((theme) => {
                      const [primary, soft] = themeSwatches[theme.id];
                      return (
                        <button
                          key={theme.id}
                          onClick={() => onSaveSettings({ theme: theme.id })}
                          className={`rounded-lg border p-3 text-left shadow-sm transition-all ${
                            settings.theme === theme.id
                              ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-md'
                              : 'border-border/90 bg-surface-2/40 hover:border-primary/40 hover:bg-surface hover:shadow-md'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-sm font-medium">{themeText[theme.id]}</span>
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
                <Row label={ui.language}>
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
                <Row label={ui.displaySize} hint={ui.displaySizeHint}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                    {displaySizeIds.map((id) => (
                      <button
                        key={id}
                        onClick={() => onSaveSettings({ displaySize: id })}
                        className={`rounded-lg border p-3 text-left shadow-sm transition-all ${
                          settings.displaySize === id
                            ? 'border-primary bg-primary/10 ring-2 ring-primary/30 shadow-md'
                            : 'border-border/90 bg-surface-2/40 hover:border-primary/40 hover:bg-surface hover:shadow-md'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold">{ui[id]}</span>
                          {settings.displaySize === id && <Check size={15} className="text-primary" />}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-text-muted">{ui[`${id}Desc`]}</div>
                      </button>
                    ))}
                  </div>
                </Row>
                <Row label={ui.weekStart}>
                  <Segmented>
                    <SegmentButton active={settings.weekStart === 'mon'} onClick={() => onSaveSettings({ weekStart: 'mon' })}>
                      {ui.monday}
                    </SegmentButton>
                    <SegmentButton active={settings.weekStart === 'sun'} onClick={() => onSaveSettings({ weekStart: 'sun' })}>
                      {ui.sunday}
                    </SegmentButton>
                  </Segmented>
                </Row>
                <Row label={ui.overviewQuote} hint={ui.overviewQuoteHint}>
                  <Toggle value={settings.motivationalQuotes} onChange={(v) => onSaveSettings({ motivationalQuotes: v })} />
                </Row>
              </Panel>
            )}

            {active === 'calendar' && (
              <Panel>
                <Row label={calendarPrefs.defaults}>
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border bg-surface divide-y divide-border">
                      <CompactSelectRow
                        label={calendarPrefs.timedReminder}
                        value={String(settings.calendarDefaultTimedReminderMinutes)}
                        onChange={(value) => onSaveSettings({ calendarDefaultTimedReminderMinutes: Number(value) })}
                        options={calendarTimedReminderOptions.map((minutes) => ({
                          value: String(minutes),
                          label: timedReminderLabel(minutes),
                        }))}
                      />
                      <CompactSelectRow
                        label={calendarPrefs.allDayReminder}
                        value={settings.calendarDefaultAllDayReminder}
                        onChange={(value) => onSaveSettings({ calendarDefaultAllDayReminder: value as AppSettings['calendarDefaultAllDayReminder'] })}
                        options={calendarAllDayReminderOptions.map((value) => ({
                          value,
                          label: allDayReminderLabel(value),
                        }))}
                      />
                      <CompactSelectRow
                        label={calendarPrefs.defaultDuration}
                        value={String(settings.calendarDefaultDurationMinutes)}
                        onChange={(value) => onSaveSettings({ calendarDefaultDurationMinutes: Number(value) })}
                        options={calendarDurationOptions.map((minutes) => ({
                          value: String(minutes),
                          label: durationLabel(minutes),
                        }))}
                      />
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    <div>
                      <div className="label mb-1.5">{calendarPrefs.displayMode}</div>
                      <Segmented>
                        <SegmentButton
                          active={settings.calendarEventDensity === 'comfortable'}
                          onClick={() => onSaveSettings({ calendarEventDensity: 'comfortable' })}
                        >
                          {calendarPrefs.comfortable}
                        </SegmentButton>
                        <SegmentButton
                          active={settings.calendarEventDensity === 'compact'}
                          onClick={() => onSaveSettings({ calendarEventDensity: 'compact' })}
                        >
                          {calendarPrefs.compact}
                        </SegmentButton>
                      </Segmented>
                    </div>
                    <div className="xl:col-span-2">
                      <div className="label mb-1.5">{calendarPrefs.defaultColor}</div>
                      <div className="flex flex-wrap gap-2">
                        {calendarColorOptions.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => onSaveSettings({ calendarDefaultEventColor: color })}
                            className={`h-8 w-8 rounded-lg border transition-all ${
                              settings.calendarDefaultEventColor === color ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : 'border-border'
                            }`}
                            style={{ background: color }}
                            aria-label={color}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  </div>
                </Row>

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
                      detail={calendarStatus?.holidayLastError || calendarErrorMessage(calendarStatus?.emailLastError) || calendarText.autoSync}
                      tone={calendarStatus?.holidayLastError || calendarStatus?.emailLastError ? 'danger' : 'success'}
                    />
                  </div>
                </Row>

                <Row label={calendarText.addHolidayCalendar}>
                  <div className="space-y-3">
                    <div className="rounded-xl border border-border bg-surface overflow-hidden">
                      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-sm font-medium">
                            <span className="truncate">{calendarText.holidayCountry}</span>
                            <SettingsHintTooltip text={calendarText.holidayCountryDesc} />
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <select
                            className="input h-9 min-w-[180px]"
                            value={selectedHolidayCountry}
                            onChange={(event) => onHolidayCountryChange(event.target.value)}
                            disabled={busy}
                          >
                            {HOLIDAY_COUNTRIES.map((country) => (
                              <option key={country.code} value={country.code}>
                                {holidayCountryLabel(country.code, settings.language)}
                              </option>
                            ))}
                          </select>
                          <Button size="sm" onClick={() => onSyncHolidayCountry()} disabled={busy}>
                            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
                            {calendarText.syncCountry}
                          </Button>
                        </div>
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
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="outline" onClick={onSyncAllCalendarEmailAccounts} disabled={calendarSyncAllBusy || calendarAccounts.length === 0}>
                          <RefreshCw size={14} className={calendarSyncAllBusy ? 'animate-spin' : ''} />
                          {calendarText.syncAllEmail}
                        </Button>
                        <Button size="sm" variant="outline" onClick={onExportCalendarSyncConfig} disabled={calendarConfigBusy}>{calendarText.exportConfig}</Button>
                        <Button size="sm" variant="outline" onClick={onImportCalendarSyncConfig} disabled={calendarConfigBusy}>{calendarText.importConfig}</Button>
                        <Button size="sm" variant="outline" onClick={onExportCalendarSyncDiagnostics} disabled={calendarConfigBusy}>{calendarText.diagnostics}</Button>
                      </div>
                      <span className="text-xs text-text-muted">{calendarText.emailHint}</span>
                    </div>

                    <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
                      <div>
                        <div className="label mb-1.5">{calendarText.provider}</div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          {(['imap', 'gmail', 'outlook'] as CalendarEmailProvider[]).map((provider) => (
                            <button
                              key={provider}
                              onClick={() => {
                                setCalendarEmailProvider(provider);
                                setCalendarOAuthClientId(defaultCalendarOAuthClientId(provider));
                              }}
                              className={`rounded-lg border p-3 text-left shadow-sm transition-all ${
                                calendarEmailProvider === provider
                                  ? 'border-primary bg-primary/10 text-primary shadow-md'
                                  : 'border-border/90 bg-surface-2/40 hover:border-primary/40 hover:bg-surface hover:shadow-md'
                              }`}
                            >
                              <div className="text-sm font-semibold">{calendarProviderLabel(provider)}</div>
                              <div className="mt-1 text-xs leading-5 text-text-muted">{calendarProviderDescription(provider)}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className={`grid grid-cols-1 gap-2 items-end ${
                        calendarEmailProvider === 'imap'
                          ? 'md:grid-cols-[1.1fr_1fr_90px_1fr_auto]'
                          : 'md:grid-cols-[1.1fr_1.4fr_auto]'
                      }`}>
                        {calendarEmailProvider !== 'imap' && (
                          <div className="md:col-span-3 rounded-lg border border-border bg-surface-2 p-3">
                            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-2 items-end">
                              <Input
                                label={calendarText.oauthClientId}
                                value={calendarOAuthClientId}
                                onChange={(event) => setCalendarOAuthClientId(event.target.value)}
                                placeholder="client_id"
                              />
                              <Button size="sm" variant="outline" onClick={openCalendarOAuthGuide} disabled={!calendarOAuthClientId.trim()}>
                                {calendarText.openAuthorization}
                              </Button>
                            </div>
                            <div className="mt-2 text-xs leading-5 text-text-muted">
                              {calendarText.oauthGuide}
                            </div>
                          </div>
                        )}
                        <Input label={calendarText.email} value={calendarEmail} onChange={(e) => setCalendarEmail(e.target.value)} placeholder="name@example.com" />
                        {calendarEmailProvider === 'imap' && (
                          <>
                            <Input label={calendarText.imapHost} value={calendarImapHost} onChange={(e) => setCalendarImapHost(e.target.value)} placeholder="imap.example.com" />
                            <Input label={calendarText.port} type="number" value={calendarImapPort} onChange={(e) => setCalendarImapPort(e.target.value)} />
                          </>
                        )}
                        <Input
                          label={calendarEmailProvider === 'imap' ? calendarText.secret : calendarText.oauthToken}
                          type="password"
                          value={calendarSecret}
                          onChange={(e) => setCalendarSecret(
                            calendarEmailProvider === 'imap' ? e.target.value : extractOAuthAccessToken(e.target.value),
                          )}
                          placeholder={calendarEmailProvider === 'imap' ? '••••••••' : calendarText.oauthPlaceholder}
                        />
                        <Button size="sm" onClick={onAddCalendarEmailAccount} disabled={busy}>{calendarText.add}</Button>
                      </div>
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
                                <span className="chip text-primary">
                                  {calendarProviderLabel(account.provider)}
                                </span>
                                <span className={`chip ${account.enabled ? 'text-success' : 'text-text-muted'}`}>
                                  {account.enabled ? calendarText.enabled : calendarText.disabled}
                                </span>
                              </div>
                              <div className="text-xs text-text-muted truncate mt-1">
                                {account.imapHost || calendarText.noImap}:{account.imapPort || 993}
                                {account.lastSyncAt ? ` · ${dayjs(account.lastSyncAt).format('MM-DD HH:mm')}` : ''}
                                {calendarCredentialStatus[account.id] ? ` · ${calendarText.authorized}` : ` · ${calendarText.unauthorized}`}
                              </div>
                              {account.lastError && <div className="text-xs text-danger truncate mt-1">{calendarErrorMessage(account.lastError)}</div>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Button size="sm" variant="outline" onClick={() => onSyncCalendarEmailAccount(account.id)} disabled={calendarAccountBusy[account.id] || !account.enabled}>
                                <RefreshCw size={14} className={calendarAccountBusy[account.id] ? 'animate-spin' : ''} />
                                {calendarText.sync}
                              </Button>
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
                          <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 items-end">
                              <Input
                                type="password"
                                value={calendarAccountSecrets[account.id] || ''}
                                onChange={(e) => setCalendarAccountSecrets((prev) => ({
                                  ...prev,
                                  [account.id]: account.provider === 'imap' ? e.target.value : extractOAuthAccessToken(e.target.value),
                                }))}
                                placeholder={account.provider === 'imap' ? calendarText.secretPlaceholder : calendarText.oauthPlaceholder}
                              />
                            <Button size="sm" variant="outline" onClick={() => onSaveCalendarEmailCredential(account.id)} disabled={calendarAccountBusy[account.id]}>{calendarText.saveAuth}</Button>
                            {account.provider !== 'imap' && (
                              <Button size="sm" onClick={() => onAuthorizeCalendarEmailOAuth(account)} disabled={calendarAccountBusy[account.id]}>OAuth</Button>
                            )}
                            {calendarCredentialStatus[account.id] && (
                              <Button size="sm" variant="outline" onClick={() => onDeleteCalendarEmailCredential(account.id)} disabled={calendarAccountBusy[account.id]}>{calendarText.clearAuth}</Button>
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
                <Row label={ui.desktopNotification}>
                  <Toggle value={settings.notificationEnabled} onChange={(v) => onSaveSettings({ notificationEnabled: v })} />
                </Row>
                <Row label={ui.reminderSound}>
                  <Segmented wrap>
                    {SOUNDS.map((sound) => (
                      <SegmentButton
                        key={sound.id}
                        active={settings.reminderSound === sound.id}
                        onClick={() => onPreviewSound(sound.id)}
                      >
                        {soundText[sound.id]}
                      </SegmentButton>
                    ))}
                  </Segmented>
                </Row>
              </Panel>
            )}

            {active === 'pomodoro' && (
              <Panel>
                <Row label={ui.focusDuration} hint={ui.focusDurationHint}>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={Math.round(settings.pomodoroDuration / 60)}
                      onChange={(e) => onSaveSettings({ pomodoroDuration: (Number(e.target.value) || 25) * 60 })}
                      className="w-28"
                    />
                    <span className="text-sm text-text-muted">{ui.minutesUnit}</span>
                  </div>
                </Row>
                <Row label={ui.longBreak} hint={ui.longBreakHint}>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={Math.round(settings.pomodoroLongBreak / 60)}
                      onChange={(e) => onSaveSettings({ pomodoroLongBreak: (Number(e.target.value) || 5) * 60 })}
                      className="w-28"
                    />
                    <span className="text-sm text-text-muted">{ui.minutesUnit}</span>
                  </div>
                </Row>
              </Panel>
            )}

            {active === 'sync' && (
              <Panel>
                <Row label={ui.syncEnabled}>
                  <Toggle
                    value={settings.syncEnabled}
                    onChange={async (v) => {
                      await onSaveSettings({ syncEnabled: v });
                      if (v) setSyncStatus(await syncApi.status());
                    }}
                  />
                </Row>
                <Row label={ui.serverUrl}>
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
                <Row label={ui.account}>
                  {session ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="chip">{ui.loggedInAs.replace('{{name}}', session.email || session.nickname)}</span>
                        <span className={`chip ${session.emailVerified ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {session.emailVerified ? ui.verified : ui.unverified}
                        </span>
                        <Button size="sm" variant="danger" onClick={onLogout}>{ui.logout}</Button>
                      </div>
                      {!session.emailVerified && (
                        <div className="flex flex-wrap items-end gap-2">
                          <Input
                            label={ui.verificationCode}
                            value={verificationCode}
                            onChange={(e) => setVerificationCode(e.target.value)}
                            className="w-44"
                          />
                          <Button size="sm" variant="outline" onClick={onSendEmailCode} disabled={busy}>{ui.sendCode}</Button>
                          <Button size="sm" onClick={onVerifyEmail} disabled={busy || !verificationCode.trim()}>{ui.verifyEmail}</Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Segmented>
                        <SegmentButton active={authMode === 'login'} onClick={() => setAuthMode('login')}>{ui.login}</SegmentButton>
                        <SegmentButton active={authMode === 'register'} onClick={() => setAuthMode('register')}>{ui.register}</SegmentButton>
                      </Segmented>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl">
                        <Input label={ui.nickname} type="email" value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)} />
                        <Input label={ui.password} type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
                      </div>
                      <Button onClick={onAuth} disabled={busy}>{authMode === 'login' ? ui.login : ui.register}</Button>
                    </div>
                  )}
                </Row>
                {session && (
                  <Row label={ui.devices}>
                    <div className="grid gap-2">
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={refreshCloudDevices} disabled={busy}>
                          <RefreshCw size={14} />
                        </Button>
                        <Button size="sm" variant="danger" onClick={onRevokeOtherCloudDevices} disabled={busy || cloudDevices.length <= 1}>
                          {ui.removeOthers}
                        </Button>
                      </div>
                      {cloudDevices.length === 0 ? (
                        <span className="text-xs text-text-muted">-</span>
                      ) : cloudDevices.map((device) => (
                        <div key={device.id} className="rounded-md border border-border/70 bg-surface-subtle px-3 py-2 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-medium">
                              {device.deviceName}
                              {device.id === session.deviceId && (
                                <span className="ml-2 text-xs text-primary">{ui.currentDevice}</span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <Button size="sm" variant="outline" onClick={() => onRenameCloudDevice(device)} disabled={busy}>{ui.rename}</Button>
                              <Button size="sm" variant="outline" onClick={() => onRequestCloudDeviceWipe(device)} disabled={busy || device.id === session.deviceId || Boolean(device.wipeRequestedAt)}>{ui.requestWipe}</Button>
                              <Button size="sm" variant="danger" onClick={() => onRevokeCloudDevice(device)} disabled={busy || device.id === session.deviceId}>{ui.remove}</Button>
                            </div>
                          </div>
                          <div className="text-xs text-text-muted">
                            {[device.platform, device.appVersion].filter(Boolean).join(' · ') || '-'}
                            {device.lastSyncAt ? ` · ${dayjs(device.lastSyncAt).format('YYYY-MM-DD HH:mm')}` : ''}
                            {device.revokedAt ? ` · ${ui.remove}` : ''}
                            {device.wipeRequestedAt ? ` · ${ui.requestWipe}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Row>
                )}
                <Row label={ui.syncNow}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => onSync('push')} disabled={busy || !session || !session.emailVerified}>{ui.uploadLocal}</Button>
                    <Button size="sm" variant="outline" onClick={() => onSync('pull')} disabled={busy || !session || !session.emailVerified}>{ui.restoreCloud}</Button>
                    <Button size="sm" variant="outline" onClick={() => onSync('merge')} disabled={busy || !session || !session.emailVerified}>{ui.smartMerge}</Button>
                    {session && !session.emailVerified && (
                      <span className="text-xs text-amber-600">{ui.verifyEmail}</span>
                    )}
                    {syncStatus?.remoteVersion && (
                      <span className="text-xs text-text-muted">
                        {ui.remoteVersion.replace('{{version}}', String(syncStatus.remoteVersion))}
                      </span>
                    )}
                    {syncStatus?.lastPushedAt && (
                      <span className="text-xs text-text-muted">
                        {ui.lastSync.replace('{{time}}', dayjs(syncStatus.lastPushedAt).format('YYYY-MM-DD HH:mm'))}
                      </span>
                    )}
                  </div>
                </Row>
              </Panel>
            )}

            {active === 'window' && (
              <Panel>
                <Row label={ui.autoStart}>
                  <Toggle value={settings.autoStart} onChange={(v) => onSaveSettings({ autoStart: v })} />
                </Row>
                <Row label={ui.minimizeToTray}>
                  <Toggle value={settings.minimizeToTray} onChange={(v) => onSaveSettings({ minimizeToTray: v })} />
                </Row>
                <Row label={ui.autoUpdate}>
                  <Toggle value={settings.autoUpdate} onChange={(v) => onSaveSettings({ autoUpdate: v })} />
                </Row>
              </Panel>
            )}

            {active === 'data' && (
              <Panel>
                <ReadonlySetting label={ui.localData} value={ui.localDataValue} icon={<ShieldCheck size={15} />} builtInLabel={ui.builtIn} />
                <Row label={ui.dataBackup} hint={ui.dataBackupValue}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={onExportBackup} disabled={busy}>{ui.exportData}</Button>
                    <Button size="sm" variant="danger" onClick={onImportBackup} disabled={busy}>{ui.importData}</Button>
                  </div>
                </Row>
              </Panel>
            )}

            {active === 'about' && (
              <Panel>
                <Row label={ui.appName}>
                  <div className="text-sm font-medium">光阶Todo</div>
                </Row>
                <Row label={ui.currentVersion}>
                  <div className="text-sm font-medium tabular-nums">v{APP_VERSION}</div>
                </Row>
                <Row label={ui.softwareUpdate} hint={latestVersionLabel || undefined}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onUpdateButtonClick}
                    disabled={updateInstallRequested || (updateBusy && !hasAvailableUpdate)}
                    className="min-w-[104px] justify-center"
                  >
                    <RefreshCw size={14} className={updateBusy || updateInstallRequested ? 'animate-spin' : ''} />
                    {updateButtonLabel}
                  </Button>
                </Row>
              </Panel>
            )}
          </main>
        </div>
      </div>
      <Modal
        open={Boolean(pendingImport)}
        onClose={() => {
          if (!busy) setPendingImport(null);
        }}
        title={msg('importPreviewTitle')}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setPendingImport(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={onConfirmImportBackup} disabled={busy}>
              {msg('continueImport')}
            </Button>
          </>
        )}
      >
        {pendingImport && (
          <div className="space-y-4">
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {msg('importOverwriteWarning')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SummaryCard
                label={msg('backupVersion')}
                value={pendingImport.summary.appVersion}
                detail={pendingImport.path}
              />
              <SummaryCard
                label={msg('backupGeneratedAt')}
                value={pendingImport.summary.generatedAt ? dayjs(pendingImport.summary.generatedAt).format('YYYY-MM-DD HH:mm') : '-'}
                detail={ui.dataBackup}
              />
              <SummaryCard
                label={msg('backupBoards')}
                value={String(pendingImport.summary.boards)}
                detail={`${msg('backupLists')}: ${pendingImport.summary.lists}`}
              />
              <SummaryCard
                label={msg('backupTasks')}
                value={String(pendingImport.summary.tasks)}
                detail={ui.localData}
              />
              <SummaryCard
                label={msg('backupGoals')}
                value={String(pendingImport.summary.goals)}
                detail={`${msg('backupEvents')}: ${pendingImport.summary.calendarEvents}`}
              />
              <SummaryCard
                label={msg('backupPomodoros')}
                value={String(pendingImport.summary.pomodoros)}
                detail={`${msg('backupReviews')}: ${pendingImport.summary.reviews}`}
              />
              <SummaryCard
                label={msg('backupSettings')}
                value={String(pendingImport.summary.settings)}
                detail={pendingImport.summary.appVersion === 'legacy' ? msg('backupLegacy') : msg('backupScope')}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function parseBackupSummary(content: string) {
  const parsed = JSON.parse(content);
  const snapshot = parsed.snapshot || parsed;
  const countArray = (...values: unknown[]) => {
    const value = values.find(Array.isArray);
    return Array.isArray(value) ? value.length : 0;
  };
  return {
    appVersion: parsed.appVersion || 'legacy',
    generatedAt: parsed.generatedAt || snapshot.generatedAt || '',
    boards: countArray(snapshot.boards),
    lists: countArray(snapshot.lists),
    tasks: countArray(snapshot.tasks),
    goals: countArray(snapshot.goals),
    calendarEvents: countArray(snapshot.calendarEvents, snapshot.calendar_events),
    pomodoros: countArray(snapshot.pomodoroSessions, snapshot.pomodoro_sessions),
    reviews: countArray(snapshot.reviewReports, snapshot.review_reports),
    settings: snapshot.settings && typeof snapshot.settings === 'object' ? Object.keys(snapshot.settings).length : 0,
  };
}

function backupSiblingPath(sourcePath: string) {
  const stamp = dayjs().format('YYYYMMDD-HHmmss');
  const separatorIndex = Math.max(sourcePath.lastIndexOf('\\'), sourcePath.lastIndexOf('/'));
  const dir = separatorIndex >= 0 ? sourcePath.slice(0, separatorIndex + 1) : '';
  return `${dir}Ascend-Todo-before-import-${stamp}.json`;
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[150px_minmax(0,1fr)] gap-2 lg:gap-4 py-3 border-b border-border last:border-b-0">
      <div>
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {label}
          {hint && <SettingsHintTooltip text={hint} />}
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function CompactSelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-medium">{label}</span>
      <select
        className="input h-9 w-full sm:w-[220px]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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
  builtInLabel = '已内置',
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  builtInLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium flex items-center gap-1.5">
          {icon}
          {label}
          {value && <SettingsHintTooltip text={value} />}
        </div>
      </div>
      <span className="shrink-0 chip">{builtInLabel}</span>
    </div>
  );
}

function SettingsHintTooltip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex group align-middle">
      <HelpCircle size={15} className="text-text-muted transition-colors group-hover:text-primary" />
      <span className="absolute left-0 top-6 z-30 hidden w-72 rounded bg-text px-3 py-2 text-xs leading-5 text-surface shadow-lg group-hover:block whitespace-normal">
        {text}
      </span>
    </span>
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
