import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import zhTW from 'antd/locale/zh_TW';

export type AdminLanguage = 'zh-CN' | 'zh-TW' | 'en';

type Dictionary = {
  appName: string;
  operations: string;
  login: string;
  email: string;
  password: string;
  passwordPlaceholder: string;
  logout: string;
  dashboard: string;
  users: string;
  devices: string;
  syncLogs: string;
  systemHealth: string;
  totalUsers: string;
  verifiedUsers: string;
  totalDevices: string;
  syncFailedToday: string;
  syncOverviewToday: string;
  success: string;
  failed: string;
  clientVersionDistribution: string;
  userCount: string;
  deviceCount: string;
  nickname: string;
  userId: string;
  deviceId: string;
  emailVerification: string;
  verified: string;
  unverified: string;
  clientVersion: string;
  currentClientVersion: string;
  role: string;
  status: string;
  lastLogin: string;
  action: string;
  details: string;
  userDetails: string;
  registeredAt: string;
  deviceName: string;
  platform: string;
  version: string;
  lastSync: string;
  normal: string;
  removed: string;
  cleanupRequest: string;
  requested: string;
  time: string;
  syncAction: string;
  remoteVersion: string;
  size: string;
  error: string;
  database: string;
  api: string;
  abnormal: string;
  serviceVersion: string;
  language: string;
};

const dictionaries: Record<AdminLanguage, Dictionary> = {
  'zh-CN': {
    appName: '光阶 Todo 管理后台',
    operations: 'Ascend Todo 运营中心',
    login: '管理员登录',
    email: '邮箱',
    password: '密码',
    passwordPlaceholder: '请输入密码',
    logout: '退出',
    dashboard: '运营概览',
    users: '用户管理',
    devices: '设备管理',
    syncLogs: '同步日志',
    systemHealth: '系统健康',
    totalUsers: '总用户数',
    verifiedUsers: '已验证邮箱',
    totalDevices: '设备数',
    syncFailedToday: '今日同步失败',
    syncOverviewToday: '今日同步概况',
    success: '成功',
    failed: '失败',
    clientVersionDistribution: '客户端版本分布',
    userCount: '用户数',
    deviceCount: '设备数',
    nickname: '昵称',
    userId: '用户 ID',
    deviceId: '设备 ID',
    emailVerification: '邮箱验证',
    verified: '已验证',
    unverified: '未验证',
    clientVersion: '客户端版本',
    currentClientVersion: '当前客户端版本',
    role: '角色',
    status: '状态',
    lastLogin: '最近登录',
    action: '操作',
    details: '详情',
    userDetails: '用户详情',
    registeredAt: '注册时间',
    deviceName: '设备名',
    platform: '平台',
    version: '版本',
    lastSync: '最近同步',
    normal: '正常',
    removed: '已移除',
    cleanupRequest: '清理请求',
    requested: '已请求',
    time: '时间',
    syncAction: '动作',
    remoteVersion: '远端版本',
    size: '大小',
    error: '错误',
    database: '数据库',
    api: 'API',
    abnormal: '异常',
    serviceVersion: '服务版本',
    language: '语言',
  },
  'zh-TW': {
    appName: '光階 Todo 管理後台',
    operations: 'Ascend Todo 營運中心',
    login: '管理員登入',
    email: '信箱',
    password: '密碼',
    passwordPlaceholder: '請輸入密碼',
    logout: '登出',
    dashboard: '營運概覽',
    users: '使用者管理',
    devices: '裝置管理',
    syncLogs: '同步日誌',
    systemHealth: '系統健康',
    totalUsers: '總使用者數',
    verifiedUsers: '已驗證信箱',
    totalDevices: '裝置數',
    syncFailedToday: '今日同步失敗',
    syncOverviewToday: '今日同步概況',
    success: '成功',
    failed: '失敗',
    clientVersionDistribution: '客戶端版本分布',
    userCount: '使用者數',
    deviceCount: '裝置數',
    nickname: '暱稱',
    userId: '使用者 ID',
    deviceId: '裝置 ID',
    emailVerification: '信箱驗證',
    verified: '已驗證',
    unverified: '未驗證',
    clientVersion: '客戶端版本',
    currentClientVersion: '目前客戶端版本',
    role: '角色',
    status: '狀態',
    lastLogin: '最近登入',
    action: '操作',
    details: '詳情',
    userDetails: '使用者詳情',
    registeredAt: '註冊時間',
    deviceName: '裝置名稱',
    platform: '平台',
    version: '版本',
    lastSync: '最近同步',
    normal: '正常',
    removed: '已移除',
    cleanupRequest: '清理請求',
    requested: '已請求',
    time: '時間',
    syncAction: '動作',
    remoteVersion: '遠端版本',
    size: '大小',
    error: '錯誤',
    database: '資料庫',
    api: 'API',
    abnormal: '異常',
    serviceVersion: '服務版本',
    language: '語言',
  },
  en: {
    appName: 'Ascend Todo Admin',
    operations: 'Ascend Todo Operations',
    login: 'Admin Login',
    email: 'Email',
    password: 'Password',
    passwordPlaceholder: 'Enter password',
    logout: 'Log out',
    dashboard: 'Overview',
    users: 'Users',
    devices: 'Devices',
    syncLogs: 'Sync Logs',
    systemHealth: 'System Health',
    totalUsers: 'Total Users',
    verifiedUsers: 'Verified Emails',
    totalDevices: 'Devices',
    syncFailedToday: 'Sync Failures Today',
    syncOverviewToday: 'Today Sync Overview',
    success: 'Success',
    failed: 'Failed',
    clientVersionDistribution: 'Client Version Distribution',
    userCount: 'Users',
    deviceCount: 'Devices',
    nickname: 'Nickname',
    userId: 'User ID',
    deviceId: 'Device ID',
    emailVerification: 'Email Verification',
    verified: 'Verified',
    unverified: 'Unverified',
    clientVersion: 'Client Version',
    currentClientVersion: 'Current Client Version',
    role: 'Role',
    status: 'Status',
    lastLogin: 'Last Login',
    action: 'Action',
    details: 'Details',
    userDetails: 'User Details',
    registeredAt: 'Registered At',
    deviceName: 'Device Name',
    platform: 'Platform',
    version: 'Version',
    lastSync: 'Last Sync',
    normal: 'Normal',
    removed: 'Removed',
    cleanupRequest: 'Cleanup Request',
    requested: 'Requested',
    time: 'Time',
    syncAction: 'Action',
    remoteVersion: 'Remote Version',
    size: 'Size',
    error: 'Error',
    database: 'Database',
    api: 'API',
    abnormal: 'Abnormal',
    serviceVersion: 'Service Version',
    language: 'Language',
  },
};

const languageLabels: Record<AdminLanguage, string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  en: 'English',
};

function detectLanguage(): AdminLanguage {
  const saved = localStorage.getItem('ascend:admin-language') as AdminLanguage | null;
  if (saved && saved in dictionaries) return saved;
  const locale = navigator.language.toLowerCase();
  if (locale.includes('hant') || locale.includes('tw') || locale.includes('hk') || locale.includes('mo')) return 'zh-TW';
  if (locale.startsWith('zh')) return 'zh-CN';
  return 'en';
}

function antdLocale(language: AdminLanguage) {
  if (language === 'zh-CN') return zhCN;
  if (language === 'zh-TW') return zhTW;
  return enUS;
}

const AdminI18nContext = createContext<{
  language: AdminLanguage;
  setLanguage: (language: AdminLanguage) => void;
  text: Dictionary;
  languageLabels: Record<AdminLanguage, string>;
} | null>(null);

export function AdminI18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AdminLanguage>(detectLanguage);
  const value = useMemo(() => ({
    language,
    text: dictionaries[language],
    languageLabels,
    setLanguage: (next: AdminLanguage) => {
      localStorage.setItem('ascend:admin-language', next);
      setLanguageState(next);
    },
  }), [language]);

  return (
    <AdminI18nContext.Provider value={value}>
      <ConfigProvider locale={antdLocale(language)}>
        {children}
      </ConfigProvider>
    </AdminI18nContext.Provider>
  );
}

export function useAdminI18n() {
  const context = useContext(AdminI18nContext);
  if (!context) throw new Error('useAdminI18n must be used within AdminI18nProvider');
  return context;
}
