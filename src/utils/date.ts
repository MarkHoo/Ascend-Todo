import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/zh-cn';
import 'dayjs/locale/zh-tw';
import isoWeek from 'dayjs/plugin/isoWeek';
import weekday from 'dayjs/plugin/weekday';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(isoWeek);
dayjs.extend(weekday);
dayjs.extend(customParseFormat);
dayjs.extend(relativeTime);

export { dayjs };

export function setDayjsLocale(lang: string) {
  const map: Record<string, string> = {
    en: 'en',
    'zh-CN': 'zh-cn',
    'zh-TW': 'zh-tw',
  };
  dayjs.locale(map[lang] ?? 'en');
}

export function todayStr() {
  return dayjs().format('YYYY-MM-DD');
}

export function startOfWeek(d: dayjs.Dayjs, weekStart: 'mon' | 'sun') {
  if (weekStart === 'mon') {
    return d.isoWeekday(1).startOf('day');
  }
  return d.day(0).startOf('day');
}

export function endOfWeek(d: dayjs.Dayjs, weekStart: 'mon' | 'sun') {
  if (weekStart === 'mon') {
    return d.isoWeekday(7).endOf('day');
  }
  return d.day(6).endOf('day');
}

export function rangeDays(start: dayjs.Dayjs, end: dayjs.Dayjs) {
  const arr: dayjs.Dayjs[] = [];
  let cur = start.clone();
  while (cur.isBefore(end) || cur.isSame(end, 'day')) {
    arr.push(cur);
    cur = cur.add(1, 'day');
  }
  return arr;
}

export function rangeWeeks(start: dayjs.Dayjs, weeks: number, weekStart: 'mon' | 'sun') {
  const arr: dayjs.Dayjs[][] = [];
  let cur = startOfWeek(start, weekStart);
  for (let i = 0; i < weeks; i++) {
    const col: dayjs.Dayjs[] = [];
    for (let j = 0; j < 7; j++) {
      col.push(cur.clone().add(j, 'day'));
    }
    arr.push(col);
    cur = cur.add(7, 'day');
  }
  return arr;
}

export function heatmapCells(days = 180, weekStart: 'mon' | 'sun' = 'mon') {
  // GitHub-like: 53 weeks x 7 days
  const today = dayjs().startOf('day');
  const endWeek = startOfWeek(today, weekStart).add(6, 'day');
  const start = endWeek.subtract(52 * 7 - 1, 'day');
  const cells: { date: dayjs.Dayjs; week: number; dow: number }[] = [];
  for (let w = 0; w < 53; w++) {
    for (let d = 0; d < 7; d++) {
      const date = start.add(w * 7 + d, 'day');
      if (date.isAfter(today, 'day')) continue;
      cells.push({ date, week: w, dow: d });
    }
  }
  return cells;
}
