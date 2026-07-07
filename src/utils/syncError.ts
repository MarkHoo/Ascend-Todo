export function friendlySyncError(error: unknown): string {
  const raw = String(error ?? '');
  if (raw.includes('SYNC_AUTH_EXPIRED') || raw.includes('UNAUTHORIZED') || raw.includes('unauthorized')) {
    return '登录状态已过期，请重新登录后再同步。';
  }
  if (raw.includes('SYNC_EMAIL_NOT_VERIFIED')) {
    return '邮箱验证完成后才能使用云同步。';
  }
  if (raw.includes('SYNC_REMOTE_CHANGED') || raw.includes('remote snapshot changed')) {
    return '云端数据已变化，请先使用智能合并后再同步。';
  }
  if (raw.includes('SYNC_NETWORK_FAILED')) {
    return '网络连接失败，请检查网络后重试。';
  }
  if (raw.includes('SYNC_BAD_RESPONSE')) {
    return '服务器返回异常，请稍后重试。';
  }
  if (raw.includes('please login before syncing') || raw.includes('not logged in')) {
    return '请先登录账号后再同步。';
  }
  if (raw.includes('email is not verified')) {
    return '邮箱验证完成后才能使用云同步。';
  }
  return '同步失败，请稍后重试。';
}
