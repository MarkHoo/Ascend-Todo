import type { AppSettings } from '@/types';

export function detectAppLanguage(locale?: string | null): AppSettings['language'] {
  const value = (locale || navigator.language || '').toLowerCase();
  if (value.startsWith('zh')) {
    if (
      value.includes('tw') ||
      value.includes('hk') ||
      value.includes('mo') ||
      value.includes('hant')
    ) {
      return 'zh-TW';
    }
    return 'zh-CN';
  }
  return 'en';
}
