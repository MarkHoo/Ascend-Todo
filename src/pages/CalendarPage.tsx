import { useEffect, useMemo, useState } from 'react';
import {
  AlarmClock,
  Calendar as CalIcon,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Flag,
  Inbox,
  ListChecks,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  Timer,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { calendarApi, boardsApi, remindersApi, tasksApi } from '@/api';
import { useSettingsStore } from '@/store/useSettingsStore';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { Input } from '@/components/common/Input';
import { DateTimePicker } from '@/components/common/DateTimePicker';
import { toast } from '@/components/common/Toast';
import { dayjs, endOfWeek, rangeDays, startOfWeek } from '@/utils/date';
import type { Board, BoardWithLists, CalendarEntry, CalendarSyncStatus, List, TaskWithSubtasks } from '@/types';

type ViewMode = 'day' | 'week' | 'month' | 'agenda';
type SourceType = CalendarEntry['sourceType'];
type CalendarCreateDraft = {
  date: string;
  title?: string;
  description?: string | null;
  dueAt?: string | null;
};

const sourceMeta: Record<SourceType, { label: string; color: string; icon: React.ReactNode }> = {
  task: { label: '任务', color: '#6366f1', icon: <ListChecks size={14} /> },
  manual: { label: '日程', color: '#64748b', icon: <CalendarDays size={14} /> },
  meeting: { label: '会议', color: '#0ea5e9', icon: <Mail size={14} /> },
  email: { label: '会议', color: '#0ea5e9', icon: <Mail size={14} /> },
  holiday: { label: '节假日', color: '#ef4444', icon: <Flag size={14} /> },
  pomodoro_plan: { label: '番茄计划', color: '#f97316', icon: <Timer size={14} /> },
  pomodoro_record: { label: '番茄记录', color: '#fb923c', icon: <Timer size={14} /> },
  goal: { label: '目标', color: '#14b8a6', icon: <Target size={14} /> },
  review: { label: '复盘', color: '#64748b', icon: <FileText size={14} /> },
};

const viewLabels: Record<ViewMode, string> = {
  day: '日',
  week: '周',
  month: '月',
  agenda: '日程',
};

export function CalendarPage() {
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const [view, setView] = useState<ViewMode>('week');
  const [cursor, setCursor] = useState(dayjs());
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [boards, setBoards] = useState<BoardWithLists[]>([]);
  const [createDraft, setCreateDraft] = useState<CalendarCreateDraft | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<CalendarEntry | null>(null);
  const [query, setQuery] = useState('');
  const [syncStatus, setSyncStatus] = useState<CalendarSyncStatus | null>(null);
  const [enabledSources, setEnabledSources] = useState<Record<SourceType, boolean>>({
    task: true,
    manual: true,
    meeting: true,
    email: true,
    holiday: true,
    pomodoro_plan: true,
    pomodoro_record: true,
    goal: true,
    review: true,
  });

  const range = useMemo(() => getRange(view, cursor, settings.weekStart), [view, cursor, settings.weekStart]);

  const load = async () => {
    const [calendarEntries, boardList, status] = await Promise.all([
      calendarApi.range(range.start, range.end),
      boardsApi.list(),
      calendarApi.syncStatus(),
    ]);
    setEntries(calendarEntries);
    setSyncStatus(status);
    const all: BoardWithLists[] = [];
    for (const b of boardList as Board[]) {
      const s = await boardsApi.getStructure(b.id);
      all.push(s);
    }
    setBoards(all);
  };

  useEffect(() => {
    load().catch((e) => toast.error(String(e)));
  }, [range.start, range.end]);

  useEffect(() => {
    const onCalendarSyncFinished = () => {
      load().catch((e) => toast.error(String(e)));
    };
    window.addEventListener('ascend:calendar-sync-finished', onCalendarSyncFinished);
    return () => window.removeEventListener('ascend:calendar-sync-finished', onCalendarSyncFinished);
  }, [range.start, range.end]);

  useEffect(() => {
    if (!syncStatus || syncStatus.emailEnabledCount <= 0) return;
    const last = syncStatus.emailLastSyncAt ? dayjs(syncStatus.emailLastSyncAt) : null;
    const shouldSync = !last || dayjs().diff(last, 'minute') >= 3;
    if (!shouldSync) return;
    calendarApi.syncEmailAccounts()
      .then(async () => {
        const [status, calendarEntries] = await Promise.all([
          calendarApi.syncStatus(),
          calendarApi.range(range.start, range.end),
        ]);
        setSyncStatus(status);
        setEntries(calendarEntries);
      })
      .catch(() => {
        /* status card will expose failures after manual refresh */
      });
  }, [syncStatus?.emailEnabledCount, syncStatus?.emailLastSyncAt, range.start, range.end]);

  const filteredEntries = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (!enabledSources[entry.sourceType]) return false;
      if (!keyword) return true;
      const haystack = [
        entry.title,
        entry.boardName,
        entry.listName,
        entry.location,
        entry.description,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(keyword);
    });
  }, [entries, enabledSources, query]);

  const byDate = useMemo(() => {
    const m = new Map<string, CalendarEntry[]>();
    for (const e of filteredEntries) {
      if (!m.has(e.date)) m.set(e.date, []);
      m.get(e.date)!.push(e);
    }
    return m;
  }, [filteredEntries]);

  const selectedEntries = byDate.get(selectedDate) || [];
  const taskCount = filteredEntries.filter((e) => e.sourceType === 'task').length;
  const dueSoon = filteredEntries.filter((e) => e.sourceType === 'task' && e.date >= dayjs().format('YYYY-MM-DD')).length;
  const unscheduledTasks = useMemo(() => {
    const out: TaskWithSubtasks[] = [];
    const visit = (tasks: TaskWithSubtasks[]) => {
      for (const task of tasks) {
        if (!task.dueAt && task.status !== 'completed' && task.status !== 'closed') out.push(task);
        if (task.subtasks?.length) visit(task.subtasks);
      }
    };
    boards.forEach((board) => board.lists.forEach((list) => visit(list.tasks)));
    return out.slice(0, 12);
  }, [boards]);

  const moveCursor = (direction: -1 | 1) => {
    const unit = view === 'month' ? 'month' : view === 'day' ? 'day' : 'week';
    setCursor(cursor.add(direction, unit));
  };

  const openCreateTask = (date: string, seed?: Omit<CalendarCreateDraft, 'date'>) => {
    setCreateDraft({ date, ...seed });
  };

  const openEntryTask = async (entry: CalendarEntry) => {
    if (!entry.boardId) {
      toast.error('无法定位任务所属看板');
      return;
    }
    try {
      await remindersApi.openTask(entry.boardId, entry.id);
      setSelectedEntry(null);
    } catch (error) {
      toast.error(String(error));
    }
  };

  const createTaskFromEntry = (entry: CalendarEntry) => {
    const hour = entry.time ? Number(entry.time.slice(0, 2)) : 9;
    const minute = entry.time ? Number(entry.time.slice(3, 5)) : 0;
    const timeLabel = entry.time ? `${entry.date} ${entry.time}${entry.endTime ? ` - ${entry.endTime}` : ''}` : entry.date;
    const description = [
      entry.description,
      entry.location ? `地点：${entry.location}` : null,
      `来源：${sourceMeta[entry.sourceType]?.label || '日历'} · ${timeLabel}`,
    ].filter(Boolean).join('\n\n');
    openCreateTask(entry.date, {
      title: entry.title,
      description,
      dueAt: entry.startAt || entry.dueAt || dayjs(entry.date).hour(hour).minute(minute).toISOString(),
    });
    setSelectedEntry(null);
  };

  const openGoalFromEntry = (entry: CalendarEntry) => {
    navigate(`/goals/${entry.id}`);
    setSelectedEntry(null);
  };

  const scheduleTaskAt = async (taskId: string, date: string, hour = 9) => {
    await tasksApi.update({ id: taskId, dueAt: dayjs(date).hour(hour).minute(0).second(0).millisecond(0).toISOString() });
    await load();
    toast.success('已安排到日历');
  };

  const moveEntryAt = async (entry: CalendarEntry, date: string, hour = 9) => {
    const start = dayjs(date).hour(hour).minute(0).second(0).millisecond(0);
    const originalStart = entry.startAt ? dayjs(entry.startAt) : null;
    const originalEnd = entry.dueAt ? dayjs(entry.dueAt) : null;
    const durationMinutes = originalStart && originalEnd && originalEnd.isAfter(originalStart)
      ? originalEnd.diff(originalStart, 'minute')
      : 60;
    await calendarApi.updateEntryTime({
      entryId: entry.id,
      sourceType: entry.sourceType,
      startAt: start.toISOString(),
      endAt: entry.sourceType === 'task' ? null : start.add(durationMinutes, 'minute').toISOString(),
    });
    await load();
    toast.success('日历时间已更新');
  };

  const handleCalendarDrop = async (event: React.DragEvent, date: string, hour = 9) => {
    event.preventDefault();
    const taskId = event.dataTransfer.getData('text/ascend-task-id');
    const entryRaw = event.dataTransfer.getData('text/ascend-calendar-entry');
    try {
      if (taskId) {
        await scheduleTaskAt(taskId, date, hour);
      } else if (entryRaw) {
        await moveEntryAt(JSON.parse(entryRaw) as CalendarEntry, date, hour);
      }
    } catch (error) {
      toast.error(String(error));
    }
  };

  return (
    <div className="h-full overflow-hidden bg-surface-2/40 p-4">
      <div className="max-w-[1680px] mx-auto h-full flex flex-col gap-3">
        <header className="card px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <CalIcon size={20} />
              日历
            </h1>
            <div className="text-xs text-text-muted mt-0.5">统一安排任务、会议、节假日、目标和复盘</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="bg-surface-2 border border-border rounded-lg p-0.5 flex items-center text-sm">
              {(['day', 'week', 'month', 'agenda'] as ViewMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setView(m)}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    view === m ? 'bg-primary text-white' : 'text-text-muted hover:text-text hover:bg-surface-2'
                  }`}
                >
                  {viewLabels[m]}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => moveCursor(-1)}>
              <ChevronLeft size={14} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              const now = dayjs();
              setCursor(now);
              setSelectedDate(now.format('YYYY-MM-DD'));
            }}>
              今天
            </Button>
            <Button variant="outline" size="sm" onClick={() => moveCursor(1)}>
              <ChevronRight size={14} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => load().catch((e) => toast.error(String(e)))}>
              <RefreshCw size={14} />
              刷新
            </Button>
            <Button size="sm" onClick={() => openCreateTask(selectedDate)}>
              <Plus size={14} />
              新建任务
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-[268px_minmax(0,1fr)] gap-3 min-h-0 flex-1">
          <aside className="card p-3 overflow-auto">
            <MiniMonth
              cursor={cursor}
              selectedDate={selectedDate}
              weekStart={settings.weekStart}
              onSelect={(date) => {
                setSelectedDate(date);
                setCursor(dayjs(date));
              }}
            />
            <div className="mt-3">
              <label className="label flex items-center gap-1.5">
                <Search size={13} />
                搜索
              </label>
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="任务、会议、地点" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <StatCard label="事项" value={filteredEntries.length} />
              <StatCard label="任务" value={taskCount} />
            </div>
            <div className="mt-3">
              <div className="text-sm font-semibold mb-2">未安排任务</div>
              <div className="space-y-1.5">
                {unscheduledTasks.length === 0 ? (
                  <div className="text-xs text-text-muted rounded-lg border border-dashed border-border p-3">暂无未安排任务</div>
                ) : unscheduledTasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData('text/ascend-task-id', task.id)}
                    className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs cursor-grab active:cursor-grabbing hover:bg-surface-2"
                    title="拖到日历中安排时间"
                  >
                    <div className="truncate font-medium">{task.title}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <div className="text-sm font-semibold mb-2">日历源</div>
              <div className="space-y-1">
                {(Object.keys(sourceMeta) as SourceType[]).map((source) => (
                  <button
                    key={source}
                    onClick={() => setEnabledSources((prev) => ({ ...prev, [source]: !prev[source] }))}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-surface-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm" style={{ background: sourceMeta[source].color }} />
                      {sourceMeta[source].icon}
                      {sourceMeta[source].label}
                    </span>
                    <span className={`w-4 h-4 rounded border flex items-center justify-center ${
                      enabledSources[source] ? 'bg-primary border-primary text-white' : 'border-border'
                    }`}>
                      {enabledSources[source] && <CheckCircle2 size={12} />}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div>
                  <div className="text-sm font-semibold">{dayjs(selectedDate).format('MM-DD')}</div>
                  <div className="text-xs text-text-muted">{selectedEntries.length} 个事项</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => openCreateTask(selectedDate)}>
                  <Plus size={14} />
                </Button>
              </div>
              <div className="space-y-2">
                {selectedEntries.length === 0 ? (
                  <EmptyState title="暂无安排" description="双击日历空白处或点 + 新建任务。" compact />
                ) : (
                  selectedEntries.slice(0, 6).map((entry) => (
                    <EventCard key={entry.id} entry={entry} onClick={() => setSelectedEntry(entry)} compact />
                  ))
                )}
                {selectedEntries.length > 6 && (
                  <div className="text-xs text-text-muted text-center">还有 {selectedEntries.length - 6} 个事项</div>
                )}
              </div>
            </div>
          </aside>

          <main className="min-w-0 min-h-0">
            <div className="card h-full overflow-hidden flex flex-col shadow-sm">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{range.title}</div>
                  <div className="text-xs text-text-muted">单击查看事项，双击空白时间快速新建任务</div>
                </div>
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <span className="chip">今天 {dayjs().format('MM-DD')}</span>
                  <span className="chip">{filteredEntries.length} 个事项</span>
                  <span className="chip">{dueSoon} 个未过期任务</span>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                {view === 'month' && (
                  <MonthView
                    cursor={cursor}
                    weekStart={settings.weekStart}
                    byDate={byDate}
                    selectedDate={selectedDate}
                    onSelectDate={setSelectedDate}
                    onCreate={openCreateTask}
                    onOpenEntry={setSelectedEntry}
                    onDropItem={handleCalendarDrop}
                  />
                )}
                {view === 'week' && (
                  <WeekView
                    cursor={cursor}
                    weekStart={settings.weekStart}
                    byDate={byDate}
                    onSelectDate={setSelectedDate}
                    onCreate={openCreateTask}
                    onOpenEntry={setSelectedEntry}
                    onDropItem={handleCalendarDrop}
                  />
                )}
                {view === 'day' && (
                  <DayView
                    date={cursor}
                    entries={byDate.get(cursor.format('YYYY-MM-DD')) || []}
                    onCreate={openCreateTask}
                    onOpenEntry={setSelectedEntry}
                    onDropItem={handleCalendarDrop}
                  />
                )}
                {view === 'agenda' && (
                  <AgendaView entries={filteredEntries} onOpenEntry={setSelectedEntry} />
                )}
              </div>
            </div>
          </main>
        </div>
      </div>

      {createDraft && (
        <CreateTaskOnDate
          draft={createDraft}
          boards={boards}
          onClose={() => setCreateDraft(null)}
          onCreated={async () => {
            await load();
            setCreateDraft(null);
          }}
        />
      )}
      {selectedEntry && (
        <EntryDetailModal
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          onOpenTask={() => openEntryTask(selectedEntry)}
          onCreateTask={() => createTaskFromEntry(selectedEntry)}
          onOpenGoal={() => openGoalFromEntry(selectedEntry)}
          onSaveTime={async (startAt, endAt) => {
            await calendarApi.updateEntryTime({
              entryId: selectedEntry.id,
              sourceType: selectedEntry.sourceType,
              startAt,
              endAt,
            });
            await load();
            setSelectedEntry(null);
            toast.success('日历时间已更新');
          }}
          onCreatePomodoro={async () => {
            await calendarApi.createPomodoroFromEntry(selectedEntry.id);
            await load();
            setSelectedEntry(null);
            toast.success('已生成番茄记录');
          }}
        />
      )}
    </div>
  );
}

function getRange(view: ViewMode, cursor: dayjs.Dayjs, weekStart: 'mon' | 'sun') {
  if (view === 'day') {
    return {
      start: cursor.format('YYYY-MM-DD'),
      end: cursor.format('YYYY-MM-DD'),
      title: cursor.format('YYYY-MM-DD'),
    };
  }
  if (view === 'week') {
    const s = startOfWeek(cursor, weekStart);
    const e = endOfWeek(cursor, weekStart);
    return { start: s.format('YYYY-MM-DD'), end: e.format('YYYY-MM-DD'), title: `${s.format('MM-DD')} - ${e.format('MM-DD')}` };
  }
  if (view === 'agenda') {
    const s = cursor.startOf('month');
    const e = cursor.endOf('month');
    return { start: s.format('YYYY-MM-DD'), end: e.format('YYYY-MM-DD'), title: cursor.format('YYYY-MM') };
  }
  const s = cursor.startOf('month').startOf('week');
  const e = cursor.endOf('month').endOf('week');
  return { start: s.format('YYYY-MM-DD'), end: e.format('YYYY-MM-DD'), title: cursor.format('YYYY-MM') };
}

function MiniMonth({
  cursor,
  selectedDate,
  weekStart,
  onSelect,
}: {
  cursor: dayjs.Dayjs;
  selectedDate: string;
  weekStart: 'mon' | 'sun';
  onSelect: (date: string) => void;
}) {
  const start = cursor.startOf('month').startOf('week');
  const end = cursor.endOf('month').endOf('week');
  const days = rangeDays(start, end);
  const wd = weekStart === 'mon' ? ['一', '二', '三', '四', '五', '六', '日'] : ['日', '一', '二', '三', '四', '五', '六'];
  return (
    <div>
      <div className="text-sm font-semibold mb-2">{cursor.format('YYYY 年 MM 月')}</div>
      <div className="grid grid-cols-7 gap-1 text-[11px] text-center text-text-muted mb-1">
        {wd.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const key = d.format('YYYY-MM-DD');
          const active = key === selectedDate;
          const today = d.isSame(dayjs(), 'day');
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={`h-7 rounded-md text-xs transition-colors ${
                active ? 'bg-primary text-white' : today ? 'bg-primary-soft text-primary font-semibold' : 'hover:bg-surface-2'
              }`}
              style={{ opacity: d.month() === cursor.month() ? 1 : 0.42 }}
            >
              {d.date()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MonthView({
  cursor,
  weekStart,
  byDate,
  selectedDate,
  onSelectDate,
  onCreate,
  onOpenEntry,
  onDropItem,
}: {
  cursor: dayjs.Dayjs;
  weekStart: 'mon' | 'sun';
  byDate: Map<string, CalendarEntry[]>;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onCreate: (date: string) => void;
  onOpenEntry: (entry: CalendarEntry) => void;
  onDropItem: (event: React.DragEvent, date: string, hour?: number) => void;
}) {
  const start = cursor.startOf('month').startOf('week');
  const end = cursor.endOf('month').endOf('week');
  const days = rangeDays(start, end);
  const wd = weekStart === 'mon' ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] : ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-border bg-surface-2 sticky top-0 z-10">
        {wd.map((d) => <div key={d} className="px-3 py-2 text-xs font-semibold text-text-muted">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const key = d.format('YYYY-MM-DD');
          const list = byDate.get(key) || [];
          const active = key === selectedDate;
          return (
            <div
              key={key}
              onClick={() => onSelectDate(key)}
              onDoubleClick={() => onCreate(key)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => onDropItem(event, key, 9)}
              className={`min-h-[118px] border-r border-b border-border p-2 text-left transition-colors ${
                active ? 'bg-primary-soft/40' : 'hover:bg-surface-2'
              }`}
              style={{ opacity: d.month() === cursor.month() ? 1 : 0.45 }}
            >
              <div className={`text-xs mb-1 ${d.isSame(dayjs(), 'day') ? 'font-bold text-primary' : 'text-text'}`}>
                {d.date()}
              </div>
              <div className="space-y-1">
                {list.slice(0, 4).map((e) => (
                  <EventPill key={e.id} entry={e} onClick={() => onOpenEntry(e)} />
                ))}
                {list.length > 4 && <div className="text-[11px] text-text-muted">+{list.length - 4} 更多</div>}
              </div>
            </div>
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
  onSelectDate,
  onCreate,
  onOpenEntry,
  onDropItem,
}: {
  cursor: dayjs.Dayjs;
  weekStart: 'mon' | 'sun';
  byDate: Map<string, CalendarEntry[]>;
  onSelectDate: (date: string) => void;
  onCreate: (date: string) => void;
  onOpenEntry: (entry: CalendarEntry) => void;
  onDropItem: (event: React.DragEvent, date: string, hour?: number) => void;
}) {
  const start = startOfWeek(cursor, weekStart);
  const days = rangeDays(start, start.add(6, 'day'));
  const hours = Array.from({ length: 15 }, (_, i) => i + 7);
  const now = dayjs();
  const showNowLine = days.some((d) => d.isSame(now, 'day')) && now.hour() >= hours[0] && now.hour() <= hours[hours.length - 1];
  const nowTop = currentTimeTop(now, hours[0], 54);
  return (
    <div className="w-full min-w-0">
      <div className="grid sticky top-0 z-10 bg-surface-2 border-b border-border" style={{ gridTemplateColumns: '52px repeat(7, minmax(0, 1fr))' }}>
        <div />
        {days.map((d) => (
          <button
            key={d.format()}
            onClick={() => onSelectDate(d.format('YYYY-MM-DD'))}
            onDoubleClick={() => onCreate(d.format('YYYY-MM-DD'))}
            className="px-2 py-2 text-center hover:bg-surface"
          >
            <div className="text-[11px] text-text-muted">{d.format('ddd')}</div>
            <div className={`text-sm ${d.isSame(dayjs(), 'day') ? 'font-bold text-primary' : ''}`}>{d.format('MM-DD')}</div>
          </button>
        ))}
      </div>
      <div className="grid border-b border-border bg-surface/80" style={{ gridTemplateColumns: '52px repeat(7, minmax(0, 1fr))' }}>
        <div className="text-[11px] text-text-muted px-2 py-2 text-right border-r border-border">全天</div>
        {days.map((d) => {
          const key = d.format('YYYY-MM-DD');
          const allDay = (byDate.get(key) || []).filter(isAllDayEntry);
          return (
            <div
              key={`all-${key}`}
              className="min-h-[34px] border-r border-border px-1.5 py-1 space-y-1"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => onDropItem(event, key, 9)}
            >
              {allDay.slice(0, 2).map((e) => <EventPill key={e.id} entry={e} onClick={() => onOpenEntry(e)} />)}
              {allDay.length > 2 && <div className="text-[10px] text-text-muted">+{allDay.length - 2}</div>}
            </div>
          );
        })}
      </div>
      <div className="relative">
        {showNowLine && (
          <div className="pointer-events-none absolute left-[52px] right-0 z-20" style={{ top: nowTop }}>
            <div className="h-px bg-danger" />
            <span className="absolute -left-[45px] -top-2 rounded bg-danger px-1.5 py-0.5 text-[10px] text-white">
              {now.format('HH:mm')}
            </span>
          </div>
        )}
      {hours.map((h) => (
        <div key={h} className="grid border-b border-border" style={{ gridTemplateColumns: '52px repeat(7, minmax(0, 1fr))' }}>
          <div className="text-[11px] text-text-muted px-2 py-2 text-right border-r border-border">
            {String(h).padStart(2, '0')}:00
          </div>
          {days.map((d) => {
            const key = d.format('YYYY-MM-DD');
            const cell = (byDate.get(key) || []).filter((e) => {
              if (isAllDayEntry(e) || !e.time) return false;
              return parseInt(e.time.slice(0, 2), 10) === h;
            });
            return (
              <div
                key={key + h}
                onClick={() => onSelectDate(key)}
                onDoubleClick={() => onCreate(d.hour(h).minute(0).format('YYYY-MM-DD'))}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => onDropItem(event, key, h)}
                className={`min-h-[54px] border-r border-border px-1.5 py-1 text-left ${
                  d.isSame(now, 'day') ? 'bg-primary-soft/10 hover:bg-primary-soft/20' : 'hover:bg-surface-2'
                }`}
              >
                {cell.map((e) => <EventPill key={e.id} entry={e} onClick={() => onOpenEntry(e)} />)}
              </div>
            );
          })}
        </div>
      ))}
      </div>
    </div>
  );
}

function DayView({
  date,
  entries,
  onCreate,
  onOpenEntry,
  onDropItem,
}: {
  date: dayjs.Dayjs;
  entries: CalendarEntry[];
  onCreate: (date: string) => void;
  onOpenEntry: (entry: CalendarEntry) => void;
  onDropItem: (event: React.DragEvent, date: string, hour?: number) => void;
}) {
  const hours = Array.from({ length: 16 }, (_, i) => i + 6);
  const allDayEntries = entries.filter(isAllDayEntry);
  const timedEntries = entries.filter((entry) => !isAllDayEntry(entry));
  const now = dayjs();
  const showNowLine = date.isSame(now, 'day') && now.hour() >= hours[0] && now.hour() <= hours[hours.length - 1];
  const nowTop = currentTimeTop(now, hours[0], 58);
  return (
    <div>
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div>
          <div className="font-semibold">{date.format('YYYY-MM-DD dddd')}</div>
          <div className="text-xs text-text-muted">{entries.length} 个事项</div>
        </div>
        <Button size="sm" onClick={() => onCreate(date.format('YYYY-MM-DD'))}>
          <Plus size={14} />
          新建任务
        </Button>
      </div>
      <div className="grid grid-cols-[72px_1fr] border-b border-border bg-surface/80">
        <div className="text-[11px] text-text-muted px-2 py-2 text-right border-r border-border">全天</div>
        <div
          className="min-h-[38px] p-2 space-y-1"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => onDropItem(event, date.format('YYYY-MM-DD'), 9)}
        >
          {allDayEntries.length === 0 ? (
            <div className="text-[11px] text-text-muted">无全天事项</div>
          ) : (
            allDayEntries.map((entry) => (
              <EventCard key={entry.id} entry={entry} onClick={() => onOpenEntry(entry)} compact />
            ))
          )}
        </div>
      </div>
      <div className="relative">
        {showNowLine && (
          <div className="pointer-events-none absolute left-[72px] right-0 z-20" style={{ top: nowTop }}>
            <div className="h-px bg-danger" />
            <span className="absolute -left-[54px] -top-2 rounded bg-danger px-1.5 py-0.5 text-[10px] text-white">
              {now.format('HH:mm')}
            </span>
          </div>
        )}
        {hours.map((h) => {
          const cell = timedEntries.filter((e) => parseInt(e.time!.slice(0, 2), 10) === h);
          return (
            <div key={h} className="grid grid-cols-[72px_1fr] border-b border-border min-h-[58px]">
              <div className="text-[11px] text-text-muted px-2 py-2 text-right border-r border-border">
                {String(h).padStart(2, '0')}:00
              </div>
              <div
                className="p-2 space-y-1 hover:bg-surface-2"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => onDropItem(event, date.format('YYYY-MM-DD'), h)}
              >
                {cell.map((e) => <EventCard key={e.id} entry={e} onClick={() => onOpenEntry(e)} compact />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgendaView({ entries, onOpenEntry }: { entries: CalendarEntry[]; onOpenEntry: (entry: CalendarEntry) => void }) {
  const grouped = groupByDate(entries);
  return (
    <div className="p-4 space-y-4">
      {grouped.length === 0 ? (
        <EmptyState title="当前范围没有事项" description="可以新建任务，或后续开启会议与节假日同步。" />
      ) : grouped.map(([date, list]) => (
        <section key={date}>
          <div className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Clock3 size={14} />
            {dayjs(date).format('YYYY-MM-DD dddd')}
          </div>
          <div className="space-y-2">
            {list.map((entry) => <EventCard key={entry.id} entry={entry} onClick={() => onOpenEntry(entry)} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function EventPill({ entry, onClick }: { entry: CalendarEntry; onClick: () => void }) {
  const draggable = canDragCalendarEntry(entry);
  return (
    <button
      draggable={draggable}
      onDragStart={(event) => {
        if (draggable) event.dataTransfer.setData('text/ascend-calendar-entry', JSON.stringify(entry));
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="w-full text-left text-[11px] truncate rounded px-1.5 py-0.5 flex items-center gap-1"
      style={{
        background: `${entryColor(entry)}22`,
        color: entryColor(entry),
        textDecoration: entry.isCompleted ? 'line-through' : 'none',
      }}
      title={entry.title}
    >
      {sourceMeta[entry.sourceType]?.icon}
      {entry.time && <span className="shrink-0">{entry.time}</span>}
      <span className="truncate">{entry.title}</span>
      {entry.holidayType === 'workday' && <span className="shrink-0">班</span>}
      {entry.holidayType === 'holiday' && <span className="shrink-0">休</span>}
    </button>
  );
}

function EventCard({ entry, onClick, compact }: { entry: CalendarEntry; onClick: () => void; compact?: boolean }) {
  const meta = sourceMeta[entry.sourceType] || sourceMeta.manual;
  const draggable = canDragCalendarEntry(entry);
  return (
    <button
      draggable={draggable}
      onDragStart={(event) => {
        if (draggable) event.dataTransfer.setData('text/ascend-calendar-entry', JSON.stringify(entry));
      }}
      onClick={onClick}
      className={`w-full text-left rounded-lg border border-border bg-surface hover:bg-surface-2 transition-colors ${compact ? 'p-2' : 'p-3'}`}
      style={{ borderLeft: `4px solid ${entryColor(entry)}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-text-muted mb-1">
            {meta.icon}
            <span>{meta.label}</span>
            {entry.time && <span>{entry.time}{entry.endTime ? ` - ${entry.endTime}` : ''}</span>}
            {entry.readonly && <span className="chip">只读</span>}
          </div>
          <div className={`font-medium truncate ${entry.isCompleted ? 'line-through text-text-muted' : ''}`}>{entry.title}</div>
          {!compact && entry.boardName && (
            <div className="text-xs text-text-muted mt-1 truncate">{entry.boardName} / {entry.listName}</div>
          )}
        </div>
        {entry.hasReminder && <AlarmClock size={14} className="text-primary shrink-0" />}
      </div>
    </button>
  );
}

function EntryDetailModal({
  entry,
  onClose,
  onOpenTask,
  onCreateTask,
  onOpenGoal,
  onSaveTime,
  onCreatePomodoro,
}: {
  entry: CalendarEntry;
  onClose: () => void;
  onOpenTask: () => void;
  onCreateTask: () => void;
  onOpenGoal: () => void;
  onSaveTime: (startAt: string, endAt?: string | null) => void;
  onCreatePomodoro: () => void;
}) {
  const meta = sourceMeta[entry.sourceType] || sourceMeta.manual;
  const canCreateTask = entry.sourceType === 'meeting' || entry.sourceType === 'email' || entry.sourceType === 'manual';
  const canEditTime = canDragCalendarEntry(entry);
  const canCreatePomodoro = entry.sourceType === 'meeting' || entry.sourceType === 'email' || entry.sourceType === 'manual';
  const [startAt, setStartAt] = useState<string | null>(entry.startAt || entry.dueAt || dayjs(entry.date).hour(entry.time ? Number(entry.time.slice(0, 2)) : 9).minute(entry.time ? Number(entry.time.slice(3, 5)) : 0).toISOString());
  const [endAt, setEndAt] = useState<string | null>(entry.sourceType === 'task' ? null : entry.dueAt || null);
  return (
    <Modal open onClose={onClose} title="日历详情" size="lg">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white" style={{ background: entryColor(entry) }}>
            {meta.icon}
          </div>
          <div className="min-w-0">
            <div className="text-xl font-semibold">{entry.title}</div>
            <div className="text-sm text-text-muted mt-1 flex items-center gap-2 flex-wrap">
              <span>{meta.label}</span>
              {entry.readonly && <span className="chip">只读事件</span>}
              {entry.isCompleted && <span className="chip">已完成</span>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <InfoRow label="日期" value={entry.date} icon={<CalendarDays size={15} />} />
          <InfoRow label="时间" value={entry.time ? `${entry.time}${entry.endTime ? ` - ${entry.endTime}` : ''}` : '全天或未设置'} icon={<Clock3 size={15} />} />
          {entry.boardName && <InfoRow label="看板" value={`${entry.boardName} / ${entry.listName || ''}`} icon={<Inbox size={15} />} />}
          {entry.location && <InfoRow label="地点" value={entry.location} icon={<Flag size={15} />} />}
          {entry.status && <InfoRow label="状态" value={entry.status} icon={<Sparkles size={15} />} />}
          {entry.hasSubtasks && <InfoRow label="子任务" value={`${entry.subtaskDone}/${entry.subtaskCount}`} icon={<ListChecks size={15} />} />}
        </div>
        {entry.description && (
          <div>
            <div className="text-sm font-medium mb-1">说明</div>
            <div className="text-sm text-text-muted whitespace-pre-wrap rounded-lg bg-surface-2 p-3">{entry.description}</div>
          </div>
        )}
        {canEditTime && (
          <div className="rounded-lg border border-border p-3">
            <div className="text-sm font-medium mb-2">调整时间</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">开始时间</label>
                <DateTimePicker value={startAt} onChange={setStartAt} withTime />
              </div>
              {entry.sourceType !== 'task' && (
                <div>
                  <label className="label">结束时间</label>
                  <DateTimePicker value={endAt} onChange={setEndAt} withTime />
                </div>
              )}
            </div>
          </div>
        )}
        {(entry.sourceType === 'task' || entry.sourceType === 'goal' || canCreateTask) && (
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            {canEditTime && startAt && (
              <Button size="sm" variant="outline" onClick={() => onSaveTime(startAt, endAt)}>
                <Clock3 size={14} />
                保存时间
              </Button>
            )}
            {entry.sourceType === 'task' && (
              <Button size="sm" onClick={onOpenTask}>
                <ListChecks size={14} />
                打开任务详情
              </Button>
            )}
            {entry.sourceType === 'goal' && (
              <Button size="sm" onClick={onOpenGoal}>
                <Target size={14} />
                打开目标详情
              </Button>
            )}
            {canCreateTask && (
              <Button size="sm" onClick={onCreateTask}>
                <Plus size={14} />
                转为任务
              </Button>
            )}
            {canCreatePomodoro && (
              <Button size="sm" variant="outline" onClick={onCreatePomodoro}>
                <Timer size={14} />
                生成番茄记录
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <div className="text-xs text-text-muted flex items-center gap-1.5 mb-1">{icon}{label}</div>
      <div className="font-medium break-words">{value}</div>
    </div>
  );
}

function CreateTaskOnDate({
  draft,
  boards,
  onClose,
  onCreated,
}: {
  draft: CalendarCreateDraft;
  boards: BoardWithLists[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState(draft.title || '');
  const [description, setDescription] = useState(draft.description || '');
  const [listId, setListId] = useState<string>('');
  const [dueAt, setDueAt] = useState<string | null>(draft.dueAt || dayjs(draft.date).hour(9).minute(0).toISOString());
  const allLists: { list: List; board: Board }[] = boards.flatMap((b) => b.lists.map((l) => ({ list: l.list, board: b.board })));

  useEffect(() => {
    if (!listId && allLists.length > 0) setListId(allLists[0].list.id);
  }, [allLists, listId]);

  const onCreate = async () => {
    if (!title.trim() || !listId) {
      toast.error('请输入任务标题并选择列表');
      return;
    }
    await tasksApi.create({
      listId,
      title: title.trim(),
      description: description.trim() || undefined,
      dueAt: dueAt || undefined,
    });
    toast.success('任务已创建');
    onCreated();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="新建任务"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={onCreate}>创建</Button>
        </>
      }
    >
        <div className="space-y-3">
          <Input label="标题" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <div>
            <label className="label">说明</label>
            <textarea
              className="input min-h-[96px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="可填写会议纪要、执行事项或补充说明"
            />
          </div>
          <div>
            <label className="label">列表</label>
          <select className="input" value={listId} onChange={(e) => setListId(e.target.value)}>
            {allLists.map((x) => (
              <option key={x.list.id} value={x.list.id}>
                {x.board.name} / {x.list.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">截至时间</label>
          <DateTimePicker value={dueAt} onChange={setDueAt} withTime />
        </div>
      </div>
    </Modal>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}

function EmptyState({ title, description, compact }: { title: string; description: string; compact?: boolean }) {
  return (
    <div className={`rounded-lg border border-dashed border-border text-center ${compact ? 'p-3' : 'p-5'}`}>
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-text-muted mt-1 leading-5">{description}</div>
    </div>
  );
}

function groupByDate(entries: CalendarEntry[]) {
  const map = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    if (!map.has(entry.date)) map.set(entry.date, []);
    map.get(entry.date)!.push(entry);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}

function isAllDayEntry(entry: CalendarEntry) {
  return !entry.time || entry.sourceType === 'holiday';
}

function canDragCalendarEntry(entry: CalendarEntry) {
  return !entry.readonly && (entry.sourceType === 'task' || entry.sourceType === 'manual');
}

function currentTimeTop(now: dayjs.Dayjs, startHour: number, rowHeight: number) {
  return (((now.hour() - startHour) * 60 + now.minute()) / 60) * rowHeight;
}

function entryColor(entry: CalendarEntry) {
  if (entry.isCompleted) return '#94a3b8';
  if (entry.color) return entry.color;
  if (entry.boardColor) return entry.boardColor;
  return sourceMeta[entry.sourceType]?.color || sourceMeta.manual.color;
}
