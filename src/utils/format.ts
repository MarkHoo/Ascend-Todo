export function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function formatHM(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

export function formatRelativeDate(iso: string, t: (k: string) => string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return t('common.today');
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return t('common.yesterday');
  const tom = new Date(now);
  tom.setDate(now.getDate() + 1);
  if (d.toDateString() === tom.toDateString()) return t('common.tomorrow');
  return d.toISOString().slice(0, 10);
}

export const PRESET_COLORS = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#a855f7',
  '#ec4899',
  '#84cc16',
  '#f97316',
  '#64748b',
];

export const PRESET_COLORS_LIGHT = PRESET_COLORS;
export const PRESET_COLORS_DARK = PRESET_COLORS;
