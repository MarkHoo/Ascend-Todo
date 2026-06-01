import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Calendar as CalIcon } from 'lucide-react';
import { calendarApi, boardsApi, tasksApi } from '@/api';
import { useSettingsStore } from '@/store/useSettingsStore';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { Input } from '@/components/common/Input';
import { DateTimePicker } from '@/components/common/DateTimePicker';
import { toast } from '@/components/common/Toast';
import { dayjs, endOfWeek, rangeDays, startOfWeek } from '@/utils/date';
import type { Board, BoardWithLists, CalendarEntry, List } from '@/types';

type ViewMode = 'day' | 'week' | 'month';

export function CalendarPage() {
  const { t } = useTranslation();
  const { settings } = useSettingsStore();
  const [view, setView] = useState<ViewMode>('month');
  const [cursor, setCursor] = useState(dayjs());
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [boards, setBoards] = useState<BoardWithLists[]>([]);
  const [createDate, setCreateDate] = useState<string | null>(null);

  const range = useMemo(() => {
    if (view === 'day') {
      return { start: cursor.format('YYYY-MM-DD'), end: cursor.format('YYYY-MM-DD') };
    }
    if (view === 'week') {
      const s = startOfWeek(cursor, settings.weekStart);
      const e = endOfWeek(cursor, settings.weekStart);
      return { start: s.format('YYYY-MM-DD'), end: e.format('YYYY-MM-DD') };
    }
    const s = cursor.startOf('month').startOf('week');
    const e = cursor.endOf('month').endOf('week');
    return { start: s.format('YYYY-MM-DD'), end: e.format('YYYY-MM-DD') };
  }, [view, cursor, settings.weekStart]);

  useEffect(() => {
    (async () => {
      const [c, bs] = await Promise.all([calendarApi.range(range.start, range.end), boardsApi.list()]);
      setEntries(c);
      const all: BoardWithLists[] = [];
      for (const b of bs as Board[]) {
        const s = await boardsApi.getStructure(b.id);
        all.push(s);
      }
      setBoards(all);
    })();
  }, [range.start, range.end]);

  const byDate = useMemo(() => {
    const m = new Map<string, CalendarEntry[]>();
    for (const e of entries) {
      if (!m.has(e.date)) m.set(e.date, []);
      m.get(e.date)!.push(e);
    }
    return m;
  }, [entries]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <CalIcon size={22} />
          {t('calendar.title')}
        </h1>
        <div className="flex items-center gap-2">
          <div className="card p-0.5 flex items-center text-sm">
            {(['day', 'week', 'month'] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setView(m)}
                className={`px-3 py-1.5 rounded-md transition-colors ${view === m ? 'bg-primary text-white' : 'text-text-muted hover:text-text'}`}
              >
                {t(`calendar.${m}`)}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => setCursor(cursor.subtract(1, view === 'month' ? 'month' : view === 'week' ? 'week' : 'day'))}>
            <ChevronLeft size={14} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(dayjs())}>
            {t('common.today')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(cursor.add(1, view === 'month' ? 'month' : view === 'week' ? 'week' : 'day'))}>
            <ChevronRight size={14} />
          </Button>
          <span className="text-base font-medium ml-2">{cursor.format('YYYY-MM')}</span>
        </div>
      </div>

      {view === 'month' && (
        <MonthView
          cursor={cursor}
          weekStart={settings.weekStart}
          byDate={byDate}
          onPickDate={(d) => setCreateDate(d.format('YYYY-MM-DD'))}
        />
      )}
      {view === 'week' && (
        <WeekView
          cursor={cursor}
          weekStart={settings.weekStart}
          byDate={byDate}
          onPickDate={(d) => setCreateDate(d.format('YYYY-MM-DD'))}
        />
      )}
      {view === 'day' && (
        <DayView
          date={cursor}
          entries={byDate.get(cursor.format('YYYY-MM-DD')) || []}
          onNew={() => setCreateDate(cursor.format('YYYY-MM-DD'))}
        />
      )}

      {createDate && (
        <CreateTaskOnDate
          date={createDate}
          boards={boards}
          onClose={() => setCreateDate(null)}
          onCreated={async () => {
            const c = await calendarApi.range(range.start, range.end);
            setEntries(c);
          }}
        />
      )}
    </div>
  );
}

function MonthView({
  cursor,
  weekStart,
  byDate,
  onPickDate,
}: {
  cursor: dayjs.Dayjs;
  weekStart: 'mon' | 'sun';
  byDate: Map<string, CalendarEntry[]>;
  onPickDate: (d: dayjs.Dayjs) => void;
}) {
  const { t } = useTranslation();
  const start = cursor.startOf('month').startOf('week');
  const end = cursor.endOf('month').endOf('week');
  const days = rangeDays(start, end);
  const wd = weekStart === 'mon'
    ? ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    : ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border bg-surface-2">
        {wd.map((d) => (
          <div key={d} className="px-2 py-1.5 text-xs font-semibold text-text-muted">
            {t(`weekday.${d}`)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const isCurrentMonth = d.month() === cursor.month();
          const isToday = d.isSame(dayjs(), 'day');
          const key = d.format('YYYY-MM-DD');
          const list = byDate.get(key) || [];
          return (
            <button
              key={key}
              onClick={() => onPickDate(d)}
              className="min-h-[100px] border-r border-b border-border p-1.5 text-left hover:bg-surface-2 transition-colors"
              style={{ opacity: isCurrentMonth ? 1 : 0.4 }}
            >
              <div
                className={`text-xs ${isToday ? 'font-bold text-primary' : 'text-text'}`}
              >
                {d.date()}
              </div>
              <div className="mt-0.5 space-y-0.5">
                {list.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    className="text-[10px] truncate rounded px-1"
                    style={{
                      background: e.color ? `${e.color}30` : 'var(--primary-soft)',
                      color: e.color || 'var(--primary)',
                      textDecoration: e.isCompleted ? 'line-through' : 'none',
                    }}
                  >
                    {e.title}
                  </div>
                ))}
                {list.length > 3 && (
                  <div className="text-[10px] text-text-muted">+{list.length - 3}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({
  cursor,
  weekStart,
  byDate,
  onPickDate,
}: {
  cursor: dayjs.Dayjs;
  weekStart: 'mon' | 'sun';
  byDate: Map<string, CalendarEntry[]>;
  onPickDate: (d: dayjs.Dayjs) => void;
}) {
  const { t } = useTranslation();
  const s = startOfWeek(cursor, weekStart);
  const days = rangeDays(s, s.add(6, 'day'));
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const wdMap: Record<number, 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> = {
    1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat', 0: 'sun',
  };

  return (
    <div className="card overflow-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
      <div className="grid sticky top-0 z-10 bg-surface-2 border-b border-border" style={{ gridTemplateColumns: '60px repeat(7, minmax(120px, 1fr))' }}>
        <div></div>
        {days.map((d) => {
          const isToday = d.isSame(dayjs(), 'day');
          return (
            <div key={d.format()} className="px-2 py-1.5 text-center">
              <div className="text-[11px] text-text-muted">{t(`weekday.${wdMap[d.day()]}`)}</div>
              <div className={`text-sm ${isToday ? 'font-bold text-primary' : ''}`}>{d.date()}</div>
            </div>
          );
        })}
      </div>
      {hours.map((h) => (
        <div key={h} className="grid border-b border-border" style={{ gridTemplateColumns: '60px repeat(7, minmax(120px, 1fr))' }}>
          <div className="text-[11px] text-text-muted px-2 py-2 text-right border-r border-border">
            {h.toString().padStart(2, '0')}:00
          </div>
          {days.map((d) => {
            const key = d.format('YYYY-MM-DD');
            const cell = (byDate.get(key) || []).filter((e) => e.time && parseInt(e.time.slice(0, 2)) === h);
            return (
              <button
                key={key + h}
                onClick={() => onPickDate(d.hour(h).minute(0))}
                className="min-h-[44px] border-r border-border hover:bg-surface-2 px-1 py-1 text-left"
              >
                {cell.map((e) => (
                  <div
                    key={e.id}
                    className="text-[11px] truncate rounded px-1.5 py-0.5"
                    style={{
                      background: e.color ? `${e.color}30` : 'var(--primary-soft)',
                      color: e.color || 'var(--primary)',
                      textDecoration: e.isCompleted ? 'line-through' : 'none',
                    }}
                  >
                    {e.title}
                  </div>
                ))}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function DayView({
  date,
  entries,
  onNew,
}: {
  date: dayjs.Dayjs;
  entries: CalendarEntry[];
  onNew: () => void;
}) {
  const { t } = useTranslation();
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div className="card overflow-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
      <div className="p-3 flex items-center justify-between border-b border-border">
        <div className="text-sm font-semibold">{date.format('YYYY-MM-DD dddd')}</div>
        <Button size="sm" onClick={onNew}>
          + {t('calendar.newTask')}
        </Button>
      </div>
      {hours.map((h) => {
        const cell = entries.filter((e) => e.time && parseInt(e.time.slice(0, 2)) === h);
        return (
          <div key={h} className="grid grid-cols-[60px_1fr] border-b border-border min-h-[44px]">
            <div className="text-[11px] text-text-muted px-2 py-2 text-right border-r border-border">
              {h.toString().padStart(2, '0')}:00
            </div>
            <div className="p-1 space-y-1">
              {cell.map((e) => (
                <div
                  key={e.id}
                  className="text-xs rounded px-2 py-1"
                  style={{
                    background: e.color ? `${e.color}30` : 'var(--primary-soft)',
                    color: e.color || 'var(--primary)',
                    textDecoration: e.isCompleted ? 'line-through' : 'none',
                  }}
                >
                  {e.title}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CreateTaskOnDate({
  date,
  boards,
  onClose,
  onCreated,
}: {
  date: string;
  boards: BoardWithLists[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [listId, setListId] = useState<string>('');
  const [dueAt, setDueAt] = useState<string | null>(dayjs(date).hour(9).minute(0).toISOString());

  const allLists: { list: List; board: Board }[] = boards.flatMap((b) => b.lists.map((l) => ({ list: l.list, board: b.board })));

  useEffect(() => {
    if (!listId && allLists.length > 0) setListId(allLists[0].list.id);
  }, [allLists, listId]);

  const onCreate = async () => {
    if (!title.trim() || !listId) {
      toast.error('!');
      return;
    }
    await tasksApi.create({ listId, title: title.trim(), dueAt: dueAt || undefined });
    toast.success(t('common.create'));
    onCreated();
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('calendar.newTask')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={onCreate}>{t('common.create')}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          label={t('profile.nickname')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <div>
          <label className="label">{t('board.list')}</label>
          <select className="input" value={listId} onChange={(e) => setListId(e.target.value)}>
            {allLists.map((x) => (
              <option key={x.list.id} value={x.list.id}>
                {x.board.name} / {x.list.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t('board.due')}</label>
          <DateTimePicker value={dueAt} onChange={setDueAt} withTime />
        </div>
      </div>
    </Modal>
  );
}
