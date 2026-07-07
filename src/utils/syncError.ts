type SupportedLanguage = 'en' | 'zh-CN' | 'zh-TW';

const messages = {
  'zh-CN': {
    serviceUnavailable: '云端同步服务暂未开放或暂时不可用。你的数据仍会保存在本机，服务恢复后可直接重试，无需升级软件。',
    authExpired: '登录状态已过期，请重新登录后再同步。',
    emailNotVerified: '邮箱验证完成后才可以使用云同步。',
    remoteChanged: '云端数据已变化，请先使用智能合并后再同步。',
    badResponse: '服务器返回异常，请稍后重试。',
    loginRequired: '请先登录账号后再同步。',
    generic: '同步失败，请稍后重试。',
  },
  'zh-TW': {
    serviceUnavailable: '雲端同步服務暫未開放或暫時不可用。你的資料仍會保存在本機，服務恢復後可直接重試，無需升級軟體。',
    authExpired: '登入狀態已過期，請重新登入後再同步。',
    emailNotVerified: '信箱驗證完成後才可以使用雲端同步。',
    remoteChanged: '雲端資料已變化，請先使用智慧合併後再同步。',
    badResponse: '伺服器返回異常，請稍後重試。',
    loginRequired: '請先登入帳號後再同步。',
    generic: '同步失敗，請稍後重試。',
  },
  en: {
    serviceUnavailable: 'Cloud sync is not open yet or is temporarily unavailable. Your data stays on this device. Try again after the service is online; no app upgrade is required.',
    authExpired: 'Your sign-in has expired. Sign in again before syncing.',
    emailNotVerified: 'Verify your email before using cloud sync.',
    remoteChanged: 'Cloud data changed. Use smart merge before syncing again.',
    badResponse: 'The server returned an unexpected response. Try again later.',
    loginRequired: 'Sign in before syncing.',
    generic: 'Sync failed. Try again later.',
  },
} as const;

function pickLanguage(language?: string): SupportedLanguage {
  if (language === 'zh-CN' || language === 'zh-TW' || language === 'en') return language;
  return 'zh-CN';
}

export function isSyncServiceUnavailable(error: unknown): boolean {
  const raw = String(error ?? '').toLowerCase();
  return [
    'sync_network_failed',
    'request failed',
    'register failed',
    'send verification failed',
    'verify email failed',
    'refresh failed',
    'load devices failed',
    'rename device failed',
    'remove device failed',
    'cleanup failed',
    'error trying to connect',
    'tcp connect error',
    'dns error',
    'operation timed out',
    'connection refused',
    'failed to lookup address information',
    'builder error',
  ].some((token) => raw.includes(token));
}

export function friendlySyncError(error: unknown, language?: string): string {
  const raw = String(error ?? '');
  const lower = raw.toLowerCase();
  const copy = messages[pickLanguage(language)];

  if (isSyncServiceUnavailable(error)) {
    return copy.serviceUnavailable;
  }
  if (raw.includes('SYNC_AUTH_EXPIRED') || lower.includes('unauthorized')) {
    return copy.authExpired;
  }
  if (raw.includes('SYNC_EMAIL_NOT_VERIFIED') || lower.includes('email is not verified')) {
    return copy.emailNotVerified;
  }
  if (raw.includes('SYNC_REMOTE_CHANGED') || lower.includes('remote snapshot changed')) {
    return copy.remoteChanged;
  }
  if (raw.includes('SYNC_BAD_RESPONSE')) {
    return copy.badResponse;
  }
  if (lower.includes('please login before syncing') || lower.includes('not logged in')) {
    return copy.loginRequired;
  }
  return copy.generic;
}
