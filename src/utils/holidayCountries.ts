import type { AppSettings } from '@/types';

export type HolidayCountryOption = {
  code: string;
  nameZh: string;
  nameZhTw: string;
  nameEn: string;
};

export const HOLIDAY_COUNTRIES: HolidayCountryOption[] = [
  { code: 'CN', nameZh: '中国大陆', nameZhTw: '中國大陸', nameEn: 'China' },
  { code: 'HK', nameZh: '中国香港', nameZhTw: '中國香港', nameEn: 'Hong Kong (China)' },
  { code: 'TW', nameZh: '中国台湾', nameZhTw: '中國台灣', nameEn: 'Taiwan (China)' },
  { code: 'US', nameZh: '美国', nameZhTw: '美國', nameEn: 'United States' },
  { code: 'GB', nameZh: '英国', nameZhTw: '英國', nameEn: 'United Kingdom' },
  { code: 'JP', nameZh: '日本', nameZhTw: '日本', nameEn: 'Japan' },
  { code: 'KR', nameZh: '韩国', nameZhTw: '韓國', nameEn: 'South Korea' },
  { code: 'SG', nameZh: '新加坡', nameZhTw: '新加坡', nameEn: 'Singapore' },
  { code: 'MY', nameZh: '马来西亚', nameZhTw: '馬來西亞', nameEn: 'Malaysia' },
  { code: 'TH', nameZh: '泰国', nameZhTw: '泰國', nameEn: 'Thailand' },
  { code: 'VN', nameZh: '越南', nameZhTw: '越南', nameEn: 'Vietnam' },
  { code: 'AU', nameZh: '澳大利亚', nameZhTw: '澳洲', nameEn: 'Australia' },
  { code: 'CA', nameZh: '加拿大', nameZhTw: '加拿大', nameEn: 'Canada' },
  { code: 'DE', nameZh: '德国', nameZhTw: '德國', nameEn: 'Germany' },
  { code: 'FR', nameZh: '法国', nameZhTw: '法國', nameEn: 'France' },
  { code: 'IT', nameZh: '意大利', nameZhTw: '義大利', nameEn: 'Italy' },
  { code: 'ES', nameZh: '西班牙', nameZhTw: '西班牙', nameEn: 'Spain' },
  { code: 'NL', nameZh: '荷兰', nameZhTw: '荷蘭', nameEn: 'Netherlands' },
  { code: 'BR', nameZh: '巴西', nameZhTw: '巴西', nameEn: 'Brazil' },
  { code: 'IN', nameZh: '印度', nameZhTw: '印度', nameEn: 'India' },
];

export function defaultHolidayCountryForLanguage(language: AppSettings['language']) {
  if (language === 'en') return 'US';
  if (language === 'zh-TW') return 'HK';
  return 'CN';
}

export function holidayCountryLabel(countryCode: string, language: AppSettings['language']) {
  const country = HOLIDAY_COUNTRIES.find((item) => item.code === countryCode);
  if (!country) return countryCode;
  if (language === 'zh-CN') return country.nameZh;
  if (language === 'zh-TW') return country.nameZhTw;
  return country.nameEn;
}
