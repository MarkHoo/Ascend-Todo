import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlarmClock,
  Bold,
  Calendar as CalIcon,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Code,
  Clock3,
  FileText,
  Flag,
  Italic,
  Eye,
  Edit3,
  GripVertical,
  Inbox,
  Link as LinkIcon,
  List as ListIcon,
  ListChecks,
  ListOrdered,
  Mail,
  Minus,
  Plus,
  Quote,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Target,
  Timer,
  Trash2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { calendarApi, boardsApi, remindersApi, tasksApi } from '@/api';
import { useSettingsStore } from '@/store/useSettingsStore';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { Input } from '@/components/common/Input';
import { NativeDateTimeInput } from '@/components/common/NativeDateTimeInput';
import { DeleteConfirmModal } from '@/components/common/DeleteConfirmModal';
import { toast } from '@/components/common/Toast';
import { dayjs, endOfWeek, rangeDays, startOfWeek } from '@/utils/date';
import type { AppSettings, Board, BoardWithLists, CalendarEntry, CalendarSyncStatus, List, Task, TaskWithSubtasks } from '@/types';

type ViewMode = 'day' | 'week' | 'month' | 'agenda';
type SourceType = CalendarEntry['sourceType'];
type CalendarCreateDraft = {
  date: string;
  mode?: 'task' | 'schedule';
  title?: string;
  description?: string | null;
  startAt?: string | null;
  dueAt?: string | null;
  color?: string | null;
  reminderAt?: string | null;
};
type DraggingCalendarEntry = {
  entry: CalendarEntry;
  x: number;
  y: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  active: boolean;
  dropLabel?: string | null;
};

const sourceMeta: Record<SourceType, { label: string; color: string; icon: React.ReactNode }> = {
  task: { label: 'Task', color: '#6366f1', icon: <ListChecks size={14} /> },
  manual: { label: 'Schedule', color: '#64748b', icon: <CalendarDays size={14} /> },
  meeting: { label: 'Meeting', color: '#0ea5e9', icon: <Mail size={14} /> },
  email: { label: 'Meeting', color: '#0ea5e9', icon: <Mail size={14} /> },
  holiday: { label: 'Holiday', color: '#ef4444', icon: <Flag size={14} /> },
  pomodoro_plan: { label: 'Pomodoro plan', color: '#f97316', icon: <Timer size={14} /> },
  pomodoro_record: { label: 'Pomodoro record', color: '#fb923c', icon: <Timer size={14} /> },
  goal: { label: 'Goal', color: '#14b8a6', icon: <Target size={14} /> },
  review: { label: 'Review', color: '#64748b', icon: <FileText size={14} /> },
};

const TOOL_ICON_SIZE = 15;

const formatForDateTimeInput = (value?: string | null) => {
  if (!value) return '';
  return dayjs(value).format('YYYY-MM-DDTHH:mm');
};

const dateTimeInputToIso = (value: string) => {
  if (!value) return null;
  return dayjs(value).format('YYYY-MM-DDTHH:mm:ss');
};

function snapCalendarMinute(minute: number) {
  return Math.min(45, Math.max(0, Math.round(minute / 15) * 15));
}

function formatDropTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function setCalendarEntryDragData(event: React.DragEvent, entry: CalendarEntry) {
  const payload = JSON.stringify(entry);
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/ascend-calendar-entry', payload);
  event.dataTransfer.setData('text/plain', `ascend-calendar-entry:${payload}`);
}

function parseCalendarEntryDragData(dataTransfer: DataTransfer) {
  const raw = dataTransfer.getData('text/ascend-calendar-entry');
  if (raw) return JSON.parse(raw) as CalendarEntry;
  const plain = dataTransfer.getData('text/plain');
  if (!plain.startsWith('ascend-calendar-entry:')) return null;
  return JSON.parse(plain.slice('ascend-calendar-entry:'.length)) as CalendarEntry;
}

function calendarDropTargetFromPoint(x: number, y: number) {
  return document
    .elementsFromPoint(x, y)
    .flatMap((element) => {
      const target = element.closest<HTMLElement>('[data-calendar-drop-date]');
      return target ? [target] : [];
    })[0] || null;
}

function calendarDropLabelFromTarget(target: HTMLElement | null) {
  if (!target) return null;
  const date = target.dataset.calendarDropDate;
  if (!date) return null;
  const hour = Number(target.dataset.calendarDropHour || '9');
  const minute = Number(target.dataset.calendarDropMinute || '0');
  return `${date} ${formatDropTime(hour, minute)}`;
}

function ToolbarBtn({ onClick, title, children }: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-7 w-7 items-center justify-center rounded border border-transparent text-[11px] font-semibold text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
      onClick={onClick}
      title={title}
      onMouseDown={(event) => event.preventDefault()}
    >
      {children}
    </button>
  );
}

function MarkdownEditor({
  label,
  value,
  onChange,
  placeholder,
  previewLabel,
  editLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  previewLabel: string;
  editLabel: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [preview, setPreview] = useState(false);
  const [renderedHtml, setRenderedHtml] = useState('');
  const replaceMdRange = (
    textarea: HTMLTextAreaElement,
    start: number,
    end: number,
    text: string,
    cursorOffset = text.length,
  ) => {
    const nextValue = value.slice(0, start) + text + value.slice(end);
    onChange(nextValue);
    window.setTimeout(() => {
      textarea.focus();
      const next = start + cursorOffset;
      textarea.setSelectionRange(next, next);
    }, 0);
  };
  const insertMd = (before: string, after = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);
    const inserted = before + selected + after;
    const cursorOffset = before === '```\n' ? before.length : before.length + selected.length;
    replaceMdRange(textarea, start, end, inserted, cursorOffset);
  };
  const handleMdKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      const textarea = event.currentTarget;
      replaceMdRange(textarea, textarea.selectionStart, textarea.selectionEnd, '  ');
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const currentLine = value.substring(lineStart, start);
    const olMatch = currentLine.match(/^(\s*)(\d+)\.\s(.*)$/);
    const ulMatch = currentLine.match(/^(\s*)([-*+])\s(.*)$/);
    const quoteMatch = currentLine.match(/^(\s*)>\s?(.*)$/);
    const headingMatch = currentLine.match(/^(#{1,6})\s*$/);

    let insert = '\n';
    if (olMatch) {
      const [, indent, number, rest] = olMatch;
      if (rest.trim() === '') {
        replaceMdRange(textarea, lineStart, start, '');
        return;
      }
      insert = `\n${indent}${parseInt(number, 10) + 1}. `;
    } else if (ulMatch) {
      const [, indent, marker, rest] = ulMatch;
      if (rest.trim() === '') {
        replaceMdRange(textarea, lineStart, start, '');
        return;
      }
      insert = `\n${indent}${marker} `;
    } else if (quoteMatch) {
      const [, indent, rest] = quoteMatch;
      insert = rest.trim() ? `\n${indent}> ` : '\n';
    } else if (headingMatch) {
      insert = '\n\n';
    }
    replaceMdRange(textarea, start, end, insert);
  };

  useEffect(() => {
    if (!preview) return;
    let disposed = false;
    import('@/utils/markdownRenderer')
      .then(({ renderMarkdown }) => {
        if (!disposed) setRenderedHtml(renderMarkdown(value));
      })
      .catch(() => {
        if (!disposed) setRenderedHtml(value);
      });
    return () => {
      disposed = true;
    };
  }, [preview, value]);

  return (
    <div>
      <label className="label">{label}</label>
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex min-h-10 flex-wrap items-center gap-0.5 border-b border-border bg-surface-2/40 px-2 py-1.5">
          <ToolbarBtn onClick={() => insertMd('**', '**')} title="Bold"><Bold size={TOOL_ICON_SIZE} /></ToolbarBtn>
          <ToolbarBtn onClick={() => insertMd('*', '*')} title="Italic"><Italic size={TOOL_ICON_SIZE} /></ToolbarBtn>
          <ToolbarBtn onClick={() => insertMd('~~', '~~')} title="Strikethrough"><Minus size={TOOL_ICON_SIZE} /></ToolbarBtn>
          <div className="mx-0.5 h-4 w-px bg-border" />
          <ToolbarBtn onClick={() => insertMd('# ')} title="H1"><span className="text-xs font-bold">H1</span></ToolbarBtn>
          <ToolbarBtn onClick={() => insertMd('## ')} title="H2"><span className="text-xs font-bold">H2</span></ToolbarBtn>
          <ToolbarBtn onClick={() => insertMd('### ')} title="H3"><span className="text-xs font-bold">H3</span></ToolbarBtn>
          <div className="mx-0.5 h-4 w-px bg-border" />
          <ToolbarBtn onClick={() => insertMd('- ')} title="Bullet List"><ListIcon size={TOOL_ICON_SIZE} /></ToolbarBtn>
          <ToolbarBtn onClick={() => insertMd('1. ')} title="Ordered List"><ListOrdered size={TOOL_ICON_SIZE} /></ToolbarBtn>
          <div className="mx-0.5 h-4 w-px bg-border" />
          <ToolbarBtn onClick={() => insertMd('[', '](url)')} title="Link"><LinkIcon size={TOOL_ICON_SIZE} /></ToolbarBtn>
          <ToolbarBtn onClick={() => insertMd('> ')} title="Quote"><Quote size={TOOL_ICON_SIZE} /></ToolbarBtn>
          <ToolbarBtn onClick={() => insertMd('`', '`')} title="Inline Code"><Code size={TOOL_ICON_SIZE} /></ToolbarBtn>
          <ToolbarBtn onClick={() => insertMd('```\n', '\n```')} title="Code Block"><span className="font-mono text-[10px]">```</span></ToolbarBtn>
          <div className="mx-0.5 h-4 w-px bg-border" />
          <button
            type="button"
            className={`inline-flex h-7 items-center gap-1 rounded border px-2 text-xs font-medium transition-colors ${
              preview ? 'border-primary bg-primary text-white' : 'border-transparent text-text-muted hover:bg-surface-2 hover:text-text'
            }`}
            onClick={() => setPreview((value) => !value)}
          >
            {preview ? <Edit3 size={TOOL_ICON_SIZE} /> : <Eye size={TOOL_ICON_SIZE} />}
            {preview ? editLabel : previewLabel}
          </button>
        </div>
        {preview ? (
          <div
            className="prose prose-sm max-w-none min-h-[260px] overflow-y-auto bg-surface-2 p-4 text-sm"
            dangerouslySetInnerHTML={{ __html: renderedHtml || '' }}
          />
        ) : (
          <textarea
            ref={textareaRef}
            className="min-h-[260px] w-full resize-none overflow-y-auto bg-surface-2 p-4 font-mono text-sm outline-none"
            style={{ fontFamily: 'ui-monospace, monospace' }}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleMdKeyDown}
            placeholder={placeholder}
          />
        )}
      </div>
    </div>
  );
}

function MarkdownPreview({ value }: { value: string }) {
  const [html, setHtml] = useState('');

  useEffect(() => {
    let disposed = false;
    import('@/utils/markdownRenderer')
      .then(({ renderMarkdown }) => {
        if (!disposed) setHtml(renderMarkdown(value));
      })
      .catch(() => {
        if (!disposed) setHtml(value);
      });
    return () => {
      disposed = true;
    };
  }, [value]);

  return (
    <div
      className="prose prose-sm max-w-none rounded-lg bg-surface-2 p-3 text-sm"
      dangerouslySetInnerHTML={{ __html: html || value }}
    />
  );
}

const calendarCopy = {
  'zh-CN': {
    title: '日历',
    subtitle: '统一安排任务、会议、节假日、目标和复盘',
    sources: {
      task: '任务',
      manual: '日程',
      meeting: '会议',
      email: '会议',
      holiday: '节假日',
      pomodoro_plan: '番茄计划',
      pomodoro_record: '番茄记录',
      goal: '目标',
      review: '复盘',
    },
    weekdaysShort: ['一', '二', '三', '四', '五', '六', '日'],
    weekdaysShortSun: ['日', '一', '二', '三', '四', '五', '六'],
    weekdaysLong: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    weekdaysLongSun: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
    views: { day: '日', week: '周', month: '月', agenda: '日程' },
    today: '今天',
    refresh: '刷新',
    syncMeetings: '同步会议',
    syncingMeetings: '同步中',
    syncedJustNow: '刚刚同步',
    lastSyncedAt: '上次同步 {{time}}',
    syncFailed: '同步失败',
    newTask: '新建任务',
    search: '搜索',
    searchPlaceholder: '任务、会议、地点',
    items: '事项',
    tasks: '任务',
    unscheduledTasks: '未安排任务',
    noUnscheduledTasks: '暂无未安排任务',
    dragToCalendar: '拖到日历中安排时间',
    calendarSources: '日历源',
    itemCount: '{{count}} 个事项',
    noSchedule: '暂无安排',
    noScheduleDesc: '双击日历空白处或点 + 新建任务。',
    moreItems: '还有 {{count}} 个事项',
    mainHint: '单击查看事项，双击空白时间快速新建任务',
    todayChip: '今天 {{date}}',
    dueSoonTasks: '{{count}} 个未过期任务',
    cannotLocateTask: '无法定位任务所属看板',
    scheduled: '已安排到日历',
    timeUpdated: '日历时间已更新',
    pomodoroCreated: '已生成关联番茄记录',
    location: '地点',
    source: '来源',
    originalTitle: '原始标题',
    originalTime: '原始时间',
    originalLocation: '原始地点',
    originalSource: '原始来源',
    calendar: '日历',
    allDay: '全天',
    noAllDay: '无全天事项',
    noRangeEvents: '当前范围没有事项',
    noRangeEventsDesc: '可以新建任务，或后续开启会议与节假日同步。',
    readonly: '只读',
    readonlyEvent: '只读事件',
    completed: '已完成',
    workday: '班',
    holiday: '休',
    detailTitle: '日历详情',
    date: '日期',
    time: '时间',
    allDayOrUnset: '全天或未设置',
    board: '看板',
    status: '状态',
    statusText: {
      confirmed: '已确认',
      tentative: '待确认',
      cancelled: '已取消',
      completed: '已完成',
      running: '进行中',
      active: '进行中',
      draft: '草稿',
      archived: '已归档',
      abandoned: '已放弃',
      not_started: '未开始',
      in_progress: '进行中',
      long_term: '长期',
      closed: '已关闭',
      normal: '正常',
      risk: '有风险',
      behind: '滞后',
    },
    subtasks: '子任务',
    description: '说明',
    adjustTime: '调整时间',
    startTime: '开始时间',
    endTime: '结束时间',
    saveTime: '保存时间',
    openTask: '打开任务详情',
    openGoal: '打开目标详情',
    convertToTask: '转为任务',
    createPomodoro: '生成番茄记录',
    createTaskTitle: '新建任务',
    cancel: '取消',
    create: '创建',
    taskTitle: '标题',
    taskDescPlaceholder: '可填写会议纪要、执行事项或补充说明',
    list: '列表',
    dueAt: '截至时间',
    createTaskError: '请输入任务标题并选择列表',
    taskCreated: '任务已创建',
  },
  'zh-TW': {
    title: '日曆',
    subtitle: '統一安排任務、會議、節假日、目標和復盤',
    sources: {
      task: '任務',
      manual: '日程',
      meeting: '會議',
      email: '會議',
      holiday: '節假日',
      pomodoro_plan: '番茄計劃',
      pomodoro_record: '番茄記錄',
      goal: '目標',
      review: '復盤',
    },
    weekdaysShort: ['一', '二', '三', '四', '五', '六', '日'],
    weekdaysShortSun: ['日', '一', '二', '三', '四', '五', '六'],
    weekdaysLong: ['週一', '週二', '週三', '週四', '週五', '週六', '週日'],
    weekdaysLongSun: ['週日', '週一', '週二', '週三', '週四', '週五', '週六'],
    views: { day: '日', week: '週', month: '月', agenda: '日程' },
    today: '今天',
    refresh: '重新整理',
    syncMeetings: '同步會議',
    syncingMeetings: '同步中',
    syncedJustNow: '剛剛同步',
    lastSyncedAt: '上次同步 {{time}}',
    syncFailed: '同步失敗',
    newTask: '新增任務',
    search: '搜尋',
    searchPlaceholder: '任務、會議、地點',
    items: '事項',
    tasks: '任務',
    unscheduledTasks: '未安排任務',
    noUnscheduledTasks: '暫無未安排任務',
    dragToCalendar: '拖到日曆中安排時間',
    calendarSources: '日曆源',
    itemCount: '{{count}} 個事項',
    noSchedule: '暫無安排',
    noScheduleDesc: '雙擊日曆空白處或點 + 新增任務。',
    moreItems: '還有 {{count}} 個事項',
    mainHint: '單擊查看事項，雙擊空白時間快速新增任務',
    todayChip: '今天 {{date}}',
    dueSoonTasks: '{{count}} 個未過期任務',
    cannotLocateTask: '無法定位任務所屬看板',
    scheduled: '已安排到日曆',
    timeUpdated: '日曆時間已更新',
    pomodoroCreated: '已生成關聯番茄記錄',
    location: '地點',
    source: '來源',
    originalTitle: '原始標題',
    originalTime: '原始時間',
    originalLocation: '原始地點',
    originalSource: '原始來源',
    calendar: '日曆',
    allDay: '全天',
    noAllDay: '無全天事項',
    noRangeEvents: '目前範圍沒有事項',
    noRangeEventsDesc: '可以新增任務，或後續開啟會議與節假日同步。',
    readonly: '只讀',
    readonlyEvent: '只讀事件',
    completed: '已完成',
    workday: '班',
    holiday: '休',
    detailTitle: '日曆詳情',
    date: '日期',
    time: '時間',
    allDayOrUnset: '全天或未設定',
    board: '看板',
    status: '狀態',
    statusText: {
      confirmed: '已確認',
      tentative: '待確認',
      cancelled: '已取消',
      completed: '已完成',
      running: '進行中',
      active: '進行中',
      draft: '草稿',
      archived: '已封存',
      abandoned: '已放棄',
      not_started: '未開始',
      in_progress: '進行中',
      long_term: '長期',
      closed: '已關閉',
      normal: '正常',
      risk: '有風險',
      behind: '落後',
    },
    subtasks: '子任務',
    description: '說明',
    adjustTime: '調整時間',
    startTime: '開始時間',
    endTime: '結束時間',
    saveTime: '儲存時間',
    openTask: '開啟任務詳情',
    openGoal: '開啟目標詳情',
    convertToTask: '轉為任務',
    createPomodoro: '生成番茄記錄',
    createTaskTitle: '新增任務',
    cancel: '取消',
    create: '建立',
    taskTitle: '標題',
    taskDescPlaceholder: '可填寫會議紀要、執行事項或補充說明',
    list: '列表',
    dueAt: '截止時間',
    createTaskError: '請輸入任務標題並選擇列表',
    taskCreated: '任務已建立',
  },
  en: {
    title: 'Calendar',
    subtitle: 'Plan tasks, meetings, holidays, goals, and reviews in one place',
    sources: {
      task: 'Task',
      manual: 'Schedule',
      meeting: 'Meeting',
      email: 'Meeting',
      holiday: 'Holiday',
      pomodoro_plan: 'Pomodoro plan',
      pomodoro_record: 'Pomodoro record',
      goal: 'Goal',
      review: 'Review',
    },
    weekdaysShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    weekdaysShortSun: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    weekdaysLong: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    weekdaysLongSun: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    views: { day: 'Day', week: 'Week', month: 'Month', agenda: 'Agenda' },
    today: 'Today',
    refresh: 'Refresh',
    syncMeetings: 'Sync meetings',
    syncingMeetings: 'Syncing',
    syncedJustNow: 'Just synced',
    lastSyncedAt: 'Last synced {{time}}',
    syncFailed: 'Sync failed',
    newTask: 'New task',
    search: 'Search',
    searchPlaceholder: 'Tasks, meetings, locations',
    items: 'Items',
    tasks: 'Tasks',
    unscheduledTasks: 'Unscheduled tasks',
    noUnscheduledTasks: 'No unscheduled tasks',
    dragToCalendar: 'Drag to the calendar to schedule',
    calendarSources: 'Calendar sources',
    itemCount: '{{count}} items',
    noSchedule: 'No schedule',
    noScheduleDesc: 'Double-click an empty slot or press + to create a task.',
    moreItems: '{{count}} more items',
    mainHint: 'Click an item to view it, double-click empty time to create a task',
    todayChip: 'Today {{date}}',
    dueSoonTasks: '{{count}} upcoming tasks',
    cannotLocateTask: 'Cannot locate the task board',
    scheduled: 'Scheduled on calendar',
    timeUpdated: 'Calendar time updated',
    pomodoroCreated: 'Linked Pomodoro record created',
    location: 'Location',
    source: 'Source',
    originalTitle: 'Original title',
    originalTime: 'Original time',
    originalLocation: 'Original location',
    originalSource: 'Original source',
    calendar: 'Calendar',
    allDay: 'All day',
    noAllDay: 'No all-day items',
    noRangeEvents: 'No items in this range',
    noRangeEventsDesc: 'Create a task, or enable meeting and holiday sync later.',
    readonly: 'Readonly',
    readonlyEvent: 'Readonly event',
    completed: 'Completed',
    workday: 'Work',
    holiday: 'Off',
    detailTitle: 'Calendar details',
    date: 'Date',
    time: 'Time',
    allDayOrUnset: 'All day or not set',
    board: 'Board',
    status: 'Status',
    statusText: {
      confirmed: 'Confirmed',
      tentative: 'Tentative',
      cancelled: 'Cancelled',
      completed: 'Completed',
      running: 'Running',
      active: 'Active',
      draft: 'Draft',
      archived: 'Archived',
      abandoned: 'Abandoned',
      not_started: 'Not started',
      in_progress: 'In progress',
      long_term: 'Long term',
      closed: 'Closed',
      normal: 'Normal',
      risk: 'At risk',
      behind: 'Behind',
    },
    subtasks: 'Subtasks',
    description: 'Description',
    adjustTime: 'Adjust time',
    startTime: 'Start time',
    endTime: 'End time',
    saveTime: 'Save time',
    openTask: 'Open task details',
    openGoal: 'Open goal details',
    convertToTask: 'Convert to task',
    createPomodoro: 'Create Pomodoro record',
    createTaskTitle: 'New task',
    cancel: 'Cancel',
    create: 'Create',
    taskTitle: 'Title',
    taskDescPlaceholder: 'Add meeting notes, action items, or extra details',
    list: 'List',
    dueAt: 'Due time',
    createTaskError: 'Enter a task title and select a list',
    taskCreated: 'Task created',
  },
} satisfies Record<AppSettings['language'], Record<string, any>>;

const calendarCopyOverrides = {
  'zh-CN': {
    title: '日历',
    subtitle: '统一安排任务、会议、节假日、目标和复盘',
    sources: {
      task: '任务',
      manual: '日程',
      meeting: '会议',
      email: '会议',
      holiday: '节假日',
      pomodoro_plan: '番茄计划',
      pomodoro_record: '番茄记录',
      goal: '目标',
      review: '复盘',
    },
    weekdaysShort: ['一', '二', '三', '四', '五', '六', '日'],
    weekdaysShortSun: ['日', '一', '二', '三', '四', '五', '六'],
    weekdaysLong: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    weekdaysLongSun: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
    views: { day: '日', week: '周', month: '月', agenda: '日程' },
    today: '今天',
    refresh: '刷新',
    syncMeetings: '同步会议',
    syncingMeetings: '同步中',
    syncedJustNow: '刚刚同步',
    lastSyncedAt: '上次同步 {{time}}',
    syncFailed: '同步失败',
    newTask: '新建任务',
    newSchedule: '新建日程',
    createScheduleTitle: '新建日程',
    createModeTask: '任务',
    createModeSchedule: '日程',
    search: '搜索',
    searchPlaceholder: '任务、会议、地点',
    items: '事项',
    tasks: '任务',
    unscheduledTasks: '未安排任务',
    noUnscheduledTasks: '暂无未安排任务',
    dragToCalendar: '拖到日历中安排时间',
    calendarSources: '日历来源',
    itemCount: '{{count}} 个事项',
    noSchedule: '暂无安排',
    noScheduleDesc: '双击日历空白处，或点击新建按钮创建任务/日程。',
    moreItems: '还有 {{count}} 个事项',
    mainHint: '单击查看事项，双击空白时间快速新建',
    todayChip: '今天 {{date}}',
    dueSoonTasks: '{{count}} 个即将到期任务',
    cannotLocateTask: '无法定位任务所属看板',
    scheduled: '已安排到日历',
    timeUpdated: '日历时间已更新',
    invalidTimeRange: '结束时间必须晚于开始时间',
    scheduleCreated: '日程已创建',
    pomodoroCreated: '已生成关联番茄记录',
    location: '地点',
    source: '来源',
    originalTitle: '原始标题',
    originalTime: '原始时间',
    originalLocation: '原始地点',
    originalSource: '原始来源',
    calendar: '日历',
    allDay: '全天',
    noAllDay: '无全天事项',
    noRangeEvents: '当前范围没有事项',
    noRangeEventsDesc: '可以新建任务，或启用会议与节假日同步。',
    readonly: '只读',
    readonlyEvent: '只读事件',
    completed: '已完成',
    workday: '班',
    holiday: '休',
    detailTitle: '日历详情',
    date: '日期',
    time: '时间',
    allDayOrUnset: '全天或未设置',
    board: '看板',
    status: '状态',
    statusText: {
      confirmed: '已确认',
      tentative: '待确认',
      cancelled: '已取消',
      completed: '已完成',
      running: '进行中',
      active: '进行中',
      draft: '草稿',
      archived: '已归档',
      abandoned: '已放弃',
      not_started: '未开始',
      in_progress: '进行中',
      long_term: '长期',
      closed: '已关闭',
      normal: '正常',
      risk: '有风险',
      behind: '滞后',
    },
    subtasks: '子任务',
    description: '说明',
    adjustTime: '调整时间',
    startTime: '开始时间',
    endTime: '结束时间',
    saveTime: '保存时间',
    openTask: '打开任务详情',
    openGoal: '打开目标详情',
    convertToTask: '转为任务',
    createPomodoro: '生成番茄记录',
    createPomodoroPlan: '创建番茄计划',
    createTaskTitle: '新建任务',
    cancel: '取消',
    create: '创建',
    taskTitle: '标题',
    taskDescPlaceholder: '可填写会议纪要、执行事项或补充说明',
    meetingNotes: '会议说明',
    actionItems: '待办事项',
    actionItemPlaceholder: '补充需要跟进的事项',
    list: '列表',
    dueAt: '截止时间',
    createTaskError: '请输入任务标题并选择列表',
    taskCreated: '任务已创建',
  },
  'zh-TW': {
    title: '日曆',
    subtitle: '統一安排任務、會議、節假日、目標和復盤',
    sources: {
      task: '任務',
      manual: '日程',
      meeting: '會議',
      email: '會議',
      holiday: '節假日',
      pomodoro_plan: '番茄計畫',
      pomodoro_record: '番茄記錄',
      goal: '目標',
      review: '復盤',
    },
    weekdaysShort: ['一', '二', '三', '四', '五', '六', '日'],
    weekdaysShortSun: ['日', '一', '二', '三', '四', '五', '六'],
    weekdaysLong: ['週一', '週二', '週三', '週四', '週五', '週六', '週日'],
    weekdaysLongSun: ['週日', '週一', '週二', '週三', '週四', '週五', '週六'],
    views: { day: '日', week: '週', month: '月', agenda: '日程' },
    today: '今天',
    refresh: '重新整理',
    syncMeetings: '同步會議',
    syncingMeetings: '同步中',
    syncedJustNow: '剛剛同步',
    lastSyncedAt: '上次同步 {{time}}',
    syncFailed: '同步失敗',
    newTask: '新增任務',
    newSchedule: '新增日程',
    createScheduleTitle: '新增日程',
    createModeTask: '任務',
    createModeSchedule: '日程',
    scheduleCreated: '日程已建立',
    invalidTimeRange: '結束時間必須晚於開始時間',
    createPomodoroPlan: '建立番茄計畫',
    meetingNotes: '會議說明',
    actionItems: '待辦事項',
    actionItemPlaceholder: '補充需要跟進的事項',
  },
  en: {
    newSchedule: 'New schedule',
    createScheduleTitle: 'New schedule',
    createModeTask: 'Task',
    createModeSchedule: 'Schedule',
    scheduleCreated: 'Schedule created',
    invalidTimeRange: 'End time must be later than start time',
    createPomodoroPlan: 'Create Pomodoro plan',
    meetingNotes: 'Meeting notes',
    actionItems: 'Action items',
    actionItemPlaceholder: 'Add follow-up items',
  },
} satisfies Record<AppSettings['language'], Record<string, any>>;

function useCalendarText() {
  const language = useSettingsStore((state) => state.settings.language);
  const override = language === 'zh-TW'
    ? { ...calendarCopyOverrides['zh-CN'], ...calendarCopyOverrides['zh-TW'] }
    : calendarCopyOverrides[language];
  const quickSettings = language === 'en'
    ? {
      calendarSettings: 'Calendar settings',
      createCalendarItem: 'New schedule/task',
      previewMarkdown: 'Preview',
      editMarkdown: 'Edit',
      relation: 'Relation',
      sourceEntryId: 'Source ID',
      sourceMeeting: 'Source meeting',
      sourceSchedule: 'Source schedule',
      createdTaskWillLink: 'The new task keeps the source title, time, location, and source ID in its description.',
      dragHandle: 'Drag',
      dragDropHint: 'Drag this card to a day or time slot to schedule it.',
      readOnlyHint: 'This item comes from a synced or generated source. You can open the related item or create follow-up work.',
      editableHint: 'You can drag this item on the calendar or adjust the time below.',
      saveChanges: 'Save',
      deleteSchedule: 'Delete',
      deleteScheduleTitle: 'Delete schedule',
      deleteScheduleMessage: 'Delete this schedule? This cannot be undone.',
      scheduleDeleted: 'Schedule deleted',
    }
    : language === 'zh-TW'
      ? {
        calendarSettings: '日曆設定',
        createCalendarItem: '新增日程/任務',
        previewMarkdown: '預覽',
        editMarkdown: '編輯',
        relation: '關聯',
        sourceEntryId: '來源 ID',
        sourceMeeting: '來源會議',
        sourceSchedule: '來源日程',
        createdTaskWillLink: '新任務會在說明中保留來源標題、時間、地點與來源 ID。',
        dragHandle: '拖動',
        dragDropHint: '將此卡片拖到日期或時間格即可安排。',
        readOnlyHint: '此事項來自同步或系統生成來源，可打開關聯項或建立跟進工作。',
        editableHint: '此事項可在日曆上拖動，也可在下方調整時間。',
        saveChanges: '儲存',
        deleteSchedule: '刪除',
        deleteScheduleTitle: '刪除日程',
        deleteScheduleMessage: '確認刪除此日程嗎？此操作無法復原。',
        scheduleDeleted: '日程已刪除',
      }
      : {
        calendarSettings: '日历设置',
        createCalendarItem: '新建日程/任务',
        previewMarkdown: '预览',
        editMarkdown: '编辑',
        relation: '关联',
        sourceEntryId: '来源 ID',
        sourceMeeting: '来源会议',
        sourceSchedule: '来源日程',
        createdTaskWillLink: '新任务会在说明中保留来源标题、时间、地点和来源 ID。',
        dragHandle: '拖动',
        dragDropHint: '将这张卡片拖到日期或时间格即可安排。',
        readOnlyHint: '此事项来自同步或系统生成来源，可以打开关联项或创建跟进工作。',
        editableHint: '此事项可在日历上拖动，也可在下方调整时间。',
        saveChanges: '保存',
        deleteSchedule: '删除',
        deleteScheduleTitle: '删除日程',
        deleteScheduleMessage: '确认删除此日程吗？此操作无法撤销。',
        scheduleDeleted: '日程已删除',
      };
  return { ...calendarCopy[language], ...override, ...quickSettings };
}

function settingsWeekdayLabels(text: ReturnType<typeof useCalendarText>, weekStart: 'mon' | 'sun', long: boolean) {
  if (long) return weekStart === 'mon' ? text.weekdaysLong : text.weekdaysLongSun;
  return weekStart === 'mon' ? text.weekdaysShort : text.weekdaysShortSun;
}

function formatCalendarMonth(date: dayjs.Dayjs, text: ReturnType<typeof useCalendarText>) {
  if (text.title === 'Calendar') return date.format('MMMM YYYY');
  return date.format('YYYY ? MM ?');
}
export function CalendarPage() {
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const text = useCalendarText();
  const [view, setView] = useState<ViewMode>('week');
  const [cursor, setCursor] = useState(dayjs());
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [boards, setBoards] = useState<BoardWithLists[]>([]);
  const [createDraft, setCreateDraft] = useState<CalendarCreateDraft | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<CalendarEntry | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [syncStatus, setSyncStatus] = useState<CalendarSyncStatus | null>(null);
  const [emailSyncing, setEmailSyncing] = useState(false);
  const [draggingTask, setDraggingTask] = useState<{ id: string; title: string; x: number; y: number } | null>(null);
  const [draggingCalendarEntry, setDraggingCalendarEntry] = useState<DraggingCalendarEntry | null>(null);
  const [manualEntryToDelete, setManualEntryToDelete] = useState<CalendarEntry | null>(null);
  const suppressEntryClickRef = useRef(false);
  const emailSyncingRef = useRef(false);
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

  const load = useCallback(async () => {
    const [calendarEntries, boardList, status] = await Promise.all([
      calendarApi.range(range.start, range.end),
      boardsApi.list(),
      calendarApi.syncStatus(),
    ]);
    setEntries(calendarEntries);
    setSyncStatus(status);
    Promise.allSettled((boardList as Board[]).map((board) => boardsApi.getStructure(board.id)))
      .then((structures) => {
        setBoards(structures.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []));
      })
      .catch(() => {});
  }, [range.start, range.end]);

  const syncEmailMeetings = useCallback(async (manual = false) => {
    if (emailSyncingRef.current) return;
    if (!manual && syncStatus && syncStatus.emailEnabledCount <= 0) return;
    emailSyncingRef.current = true;
    setEmailSyncing(true);
    try {
      await calendarApi.syncEmailAccounts();
      const [status, calendarEntries] = await Promise.all([
        calendarApi.syncStatus(),
        calendarApi.range(range.start, range.end),
      ]);
      setSyncStatus(status);
      setEntries(calendarEntries);
      if (manual) toast.success(text.syncedJustNow);
      window.dispatchEvent(new CustomEvent('ascend:calendar-sync-finished'));
    } catch (error) {
      if (manual) toast.error(String(error));
      await calendarApi.syncStatus().then(setSyncStatus).catch(() => {});
    } finally {
      emailSyncingRef.current = false;
      setEmailSyncing(false);
    }
  }, [range.start, range.end, syncStatus, text.syncedJustNow]);

  useEffect(() => {
    load().catch((e) => toast.error(String(e)));
  }, [load]);

  useEffect(() => {
    const onCalendarSyncFinished = () => {
      load().catch((e) => toast.error(String(e)));
    };
    window.addEventListener('ascend:calendar-sync-finished', onCalendarSyncFinished);
    return () => window.removeEventListener('ascend:calendar-sync-finished', onCalendarSyncFinished);
  }, [load]);

  useEffect(() => {
    if (!syncStatus || syncStatus.emailEnabledCount <= 0) return;
    const last = syncStatus.emailLastSyncAt ? dayjs(syncStatus.emailLastSyncAt) : null;
    const shouldSync = !last || dayjs().diff(last, 'minute') >= 10;
    if (!shouldSync) return;
    const timer = window.setTimeout(() => {
      syncEmailMeetings(false);
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [syncEmailMeetings, syncStatus?.emailEnabledCount, syncStatus?.emailLastSyncAt]);

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
  const expandedEntries = expandedDate ? byDate.get(expandedDate) || [] : [];
  const taskCount = filteredEntries.filter((e) => e.sourceType === 'task').length;
  const dueSoon = filteredEntries.filter((e) => e.sourceType === 'task' && e.date >= dayjs().format('YYYY-MM-DD')).length;
  const emailSyncLabel = emailSyncing
    ? text.syncingMeetings
    : syncStatus?.emailLastError
      ? text.syncFailed
      : syncStatus?.emailLastSyncAt
        ? (
          dayjs().diff(dayjs(syncStatus.emailLastSyncAt), 'minute') < 1
            ? text.syncedJustNow
            : text.lastSyncedAt.replace('{{time}}', dayjs(syncStatus.emailLastSyncAt).format('MM-DD HH:mm'))
        )
        : text.syncMeetings;
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

  useEffect(() => {
    if (!draggingTask) return;
    const onMove = (event: PointerEvent) => {
      setDraggingTask((current) => current ? { ...current, x: event.clientX, y: event.clientY } : current);
    };
    const onUp = async (event: PointerEvent) => {
      const current = draggingTask;
      setDraggingTask(null);
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>('[data-calendar-drop-date]');
      if (!current || !target) return;
      const date = target.dataset.calendarDropDate;
      if (!date) return;
      const hour = Number(target.dataset.calendarDropHour || '9');
      let minute = Number(target.dataset.calendarDropMinute || '0');
      if (target.dataset.calendarDropTimeline === 'true') {
        const rect = target.getBoundingClientRect();
        const ratio = Math.min(0.999, Math.max(0, (event.clientY - rect.top) / rect.height));
        minute = snapCalendarMinute(ratio * 60);
      }
      try {
        await scheduleTaskAt(current.id, date, hour, minute);
      } catch (error) {
        toast.error(String(error));
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onUp, { once: true });
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.userSelect = '';
    };
  }, [draggingTask]);

  useEffect(() => {
    if (!draggingCalendarEntry) return;
    const onMove = (event: PointerEvent) => {
      setDraggingCalendarEntry((current) => {
        if (!current) return current;
        const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
        const dropTarget = calendarDropTargetFromPoint(event.clientX, event.clientY);
        return {
          ...current,
          x: event.clientX,
          y: event.clientY,
          active: current.active || distance > 6,
          dropLabel: calendarDropLabelFromTarget(dropTarget),
        };
      });
    };
    const onUp = async (event: PointerEvent) => {
      const current = draggingCalendarEntry;
      setDraggingCalendarEntry(null);
      if (!current?.active) return;
      suppressEntryClickRef.current = true;
      window.setTimeout(() => {
        suppressEntryClickRef.current = false;
      }, 0);
      const target = calendarDropTargetFromPoint(event.clientX, event.clientY);
      if (!target) return;
      const date = target.dataset.calendarDropDate;
      if (!date) return;
      const hour = Number(target.dataset.calendarDropHour || '9');
      let minute = Number(target.dataset.calendarDropMinute || '0');
      if (target.dataset.calendarDropTimeline === 'true') {
        const rect = target.getBoundingClientRect();
        const ratio = Math.min(0.999, Math.max(0, (event.clientY - rect.top) / rect.height));
        minute = snapCalendarMinute(ratio * 60);
      }
      try {
        await moveEntryAt(current.entry, date, hour, minute);
      } catch (error) {
        toast.error(String(error));
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onUp, { once: true });
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.userSelect = '';
    };
  }, [draggingCalendarEntry]);

  const startCalendarEntryDrag = (entry: CalendarEntry, event: React.PointerEvent) => {
    if (!canDragCalendarEntry(entry) || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingCalendarEntry({
      entry,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      active: false,
      dropLabel: null,
    });
  };

  const openCalendarEntry = (entry: CalendarEntry) => {
    if (suppressEntryClickRef.current) return;
    setSelectedEntry(entry);
  };

  const moveCursor = (direction: -1 | 1) => {
    const unit = view === 'month' ? 'month' : view === 'day' ? 'day' : 'week';
    setCursor(cursor.add(direction, unit));
  };

  const openCreateTask = (date: string, seed?: Omit<CalendarCreateDraft, 'date'>) => {
    const defaults = calendarDraftDefaults({ date, ...seed }, settings);
    setCreateDraft({ date, ...seed, ...defaults });
  };

  const openEntryTask = async (entry: CalendarEntry) => {
    const taskId = entry.linkedTaskId || entry.id;
    if (!entry.boardId || !taskId) {
      toast.error(text.cannotLocateTask);
      return;
    }
    try {
      await remindersApi.openTask(entry.boardId, taskId);
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
      `<!-- ascend-calendar-source:${JSON.stringify({ id: entry.id, type: entry.sourceType, title: entry.title })} -->`,
      `### ${text.meetingNotes}`,
      `- ${text.originalTitle}: ${entry.title}`,
      `- ${text.originalTime}: ${timeLabel}`,
      entry.location ? `- ${text.originalLocation}: ${entry.location}` : null,
      `- ${text.originalSource}: ${text.sources[entry.sourceType] || text.calendar}`,
      `- ${text.sourceEntryId}: ${entry.id}`,
      entry.description,
      `### ${text.actionItems}`,
      `- ${text.actionItemPlaceholder}`,
    ].filter(Boolean).join('\n\n');
    openCreateTask(entry.date, {
      title: entry.title,
      description,
      startAt: entry.startAt || dayjs(entry.date).hour(hour).minute(minute).toISOString(),
      dueAt: entry.dueAt || (
        entry.endTime
          ? dayjs(entry.date).hour(Number(entry.endTime.slice(0, 2))).minute(Number(entry.endTime.slice(3, 5))).toISOString()
          : undefined
      ),
      color: entry.color || entryColor(entry, settings.calendarDefaultEventColor),
    });
    setSelectedEntry(null);
  };

  const openGoalFromEntry = (entry: CalendarEntry) => {
    const goalId = entry.id.startsWith('kr-check:')
      ? entry.id.split(':')[1]
      : entry.id;
    navigate(`/goals/${goalId}`);
    setSelectedEntry(null);
  };

  const scheduleTaskAt = async (taskId: string, date: string, hour = 9, minute = 0) => {
    const start = dayjs(date).hour(hour).minute(minute).second(0).millisecond(0);
    const end = start.add(settings.calendarDefaultDurationMinutes, 'minute');
    await tasksApi.update({
      id: taskId,
      startAt: start.toISOString(),
      dueAt: end.toISOString(),
      reminderAt: buildTimedReminderAt(start, settings),
    });
    await load();
    toast.success(text.scheduled);
  };

  const moveEntryAt = async (entry: CalendarEntry, date: string, hour = 9, minute = 0) => {
    const start = dayjs(date).hour(hour).minute(minute).second(0).millisecond(0);
    const originalStart = entry.startAt ? dayjs(entry.startAt) : null;
    const originalEnd = entry.dueAt ? dayjs(entry.dueAt) : null;
    const durationMinutes = originalStart && originalEnd && originalEnd.isAfter(originalStart)
      ? originalEnd.diff(originalStart, 'minute')
      : settings.calendarDefaultDurationMinutes;
    await calendarApi.updateEntryTime({
      entryId: entry.id,
      sourceType: entry.sourceType,
      startAt: start.toISOString(),
      endAt: start.add(durationMinutes, 'minute').toISOString(),
    });
    await load();
    toast.success(text.timeUpdated);
  };

  const saveEntryTime = async (entry: CalendarEntry, startAt: string, endAt?: string | null) => {
    if (endAt && !dayjs(endAt).isAfter(dayjs(startAt))) {
      toast.error(text.invalidTimeRange);
      return;
    }
    await calendarApi.updateEntryTime({
      entryId: entry.id,
      sourceType: entry.sourceType,
      startAt,
      endAt,
    });
    await load();
    setSelectedEntry(null);
    toast.success(text.timeUpdated);
  };

  const saveManualEntry = async (entry: CalendarEntry, patch: {
    title: string;
    description?: string | null;
    location?: string | null;
    startAt: string;
    endAt?: string | null;
    color?: string | null;
  }) => {
    if (!patch.title.trim()) {
      toast.error(text.createTaskError);
      return;
    }
    if (patch.endAt && !dayjs(patch.endAt).isAfter(dayjs(patch.startAt))) {
      toast.error(text.invalidTimeRange);
      return;
    }
    await calendarApi.updateManualEvent({
      id: entry.id,
      title: patch.title.trim(),
      description: patch.description?.trim() || null,
      startAt: patch.startAt,
      endAt: patch.endAt || null,
      allDay: false,
      location: patch.location?.trim() || null,
      color: patch.color || entry.color || settings.calendarDefaultEventColor,
    });
    await load();
    setSelectedEntry(null);
    toast.success(text.timeUpdated);
  };

  const deleteManualEntry = async (entry: CalendarEntry) => {
    if (entry.sourceType !== 'manual' || entry.readonly) return;
    await calendarApi.deleteManualEvent(entry.id);
    await load();
    setSelectedEntry(null);
    setManualEntryToDelete(null);
    toast.success(text.scheduleDeleted);
  };

  const handleCalendarDrop = async (event: React.DragEvent, date: string, hour = 9, minute = 0) => {
    event.preventDefault();
    event.stopPropagation();
    const snappedMinute = snapCalendarMinute(minute);
    const plain = event.dataTransfer.getData('text/plain');
    const taskId = event.dataTransfer.getData('text/ascend-task-id')
      || (plain.startsWith('ascend-task:') ? plain.slice('ascend-task:'.length) : '');
    const entry = parseCalendarEntryDragData(event.dataTransfer);
    try {
      if (taskId) {
        await scheduleTaskAt(taskId, date, hour, snappedMinute);
      } else if (entry) {
        await moveEntryAt(entry, date, hour, snappedMinute);
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
              {text.title}
            </h1>
            <div className="text-xs text-text-muted mt-0.5">{text.subtitle}</div>
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
                  {text.views[m]}
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
              {text.today}
            </Button>
            <Button variant="outline" size="sm" onClick={() => moveCursor(1)}>
              <ChevronRight size={14} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => load().catch((e) => toast.error(String(e)))}>
              <RefreshCw size={14} />
              {text.refresh}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncEmailMeetings(true)}
              disabled={emailSyncing || (syncStatus?.emailAccountCount || 0) === 0}
            >
              <RefreshCw size={14} className={emailSyncing ? 'animate-spin' : ''} />
              {text.syncMeetings}
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/settings?section=calendar')}>
              <Settings size={14} />
              {text.calendarSettings}
            </Button>
            <Button size="sm" onClick={() => openCreateTask(selectedDate)}>
              <Plus size={14} />
              {text.createCalendarItem}
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
                {text.search}
              </label>
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={text.searchPlaceholder} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <StatCard label={text.items} value={filteredEntries.length} />
              <StatCard label={text.tasks} value={taskCount} />
            </div>
            <div className="mt-3">
              <div className="text-sm font-semibold mb-2">{text.unscheduledTasks}</div>
              <div className="space-y-1.5">
                {unscheduledTasks.length === 0 ? (
                  <div className="text-xs text-text-muted rounded-lg border border-dashed border-border p-3">{text.noUnscheduledTasks}</div>
                ) : unscheduledTasks.map((task) => (
                  <div
                    key={task.id}
                    role="button"
                    tabIndex={0}
                    draggable={false}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setDraggingTask({ id: task.id, title: task.title, x: event.clientX, y: event.clientY });
                    }}
                    onDragStart={(event) => {
                      event.preventDefault();
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/ascend-task-id', task.id);
                      event.dataTransfer.setData('text/plain', `ascend-task:${task.id}`);
                    }}
                    className="group rounded-md border border-border bg-surface px-2 py-1.5 text-xs cursor-grab active:cursor-grabbing shadow-sm ring-1 ring-black/5 transition-colors hover:border-primary/50 hover:bg-surface-2"
                    title={text.dragDropHint}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-6 w-6 shrink-0 rounded-md bg-primary/10 text-primary inline-flex items-center justify-center">
                        <GripVertical size={13} />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{task.title}</div>
                        <div className="truncate text-[11px] text-text-muted">{text.dragToCalendar}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <div className="text-sm font-semibold mb-2">{text.calendarSources}</div>
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
                      {text.sources[source]}
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
                  <div className="text-xs text-text-muted">{text.itemCount.replace('{{count}}', String(selectedEntries.length))}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => openCreateTask(selectedDate)}>
                  <Plus size={14} />
                </Button>
              </div>
              <div className="space-y-2">
                {selectedEntries.length === 0 ? (
                  <EmptyState title={text.noSchedule} description={text.noScheduleDesc} compact />
                ) : (
                  selectedEntries.slice(0, 6).map((entry) => (
                    <EventCard
                      key={entry.id}
                      entry={entry}
                      onClick={() => openCalendarEntry(entry)}
                      onPointerDragStart={startCalendarEntryDrag}
                      compact
                    />
                  ))
                )}
                {selectedEntries.length > 6 && (
                  <div className="text-xs text-text-muted text-center">{text.moreItems.replace('{{count}}', String(selectedEntries.length - 6))}</div>
                )}
              </div>
            </div>
          </aside>

          <main className="min-w-0 min-h-0">
            <div className="card h-full overflow-hidden flex flex-col shadow-sm">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{range.title}</div>
                  <div className="text-xs text-text-muted flex items-center gap-2 flex-wrap">
                    <span>{text.mainHint}</span>
                    {(syncStatus?.emailAccountCount || 0) > 0 && (
                      <span className={syncStatus?.emailLastError ? 'text-danger' : ''}>
                        {emailSyncLabel}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <span className="chip">{text.todayChip.replace('{{date}}', dayjs().format('MM-DD'))}</span>
                  <span className="chip">{text.itemCount.replace('{{count}}', String(filteredEntries.length))}</span>
                  <span className="chip">{text.dueSoonTasks.replace('{{count}}', String(dueSoon))}</span>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                {view === 'month' && (
                  <MonthView
                    cursor={cursor}
                    weekStart={settings.weekStart}
                    density={settings.calendarEventDensity}
                    byDate={byDate}
                    selectedDate={selectedDate}
                    onSelectDate={setSelectedDate}
                    onShowDateEntries={(date) => {
                      setSelectedDate(date);
                      setExpandedDate(date);
                    }}
                    onCreate={openCreateTask}
                    onOpenEntry={openCalendarEntry}
                    onEntryPointerDragStart={startCalendarEntryDrag}
                    onDropItem={handleCalendarDrop}
                  />
                )}
                {view === 'week' && (
                  <WeekView
                    cursor={cursor}
                    weekStart={settings.weekStart}
                    displaySize={settings.displaySize}
                    density={settings.calendarEventDensity}
                    byDate={byDate}
                    onSelectDate={setSelectedDate}
                    onCreate={openCreateTask}
                    onOpenEntry={openCalendarEntry}
                    onEntryPointerDragStart={startCalendarEntryDrag}
                    onDropItem={handleCalendarDrop}
                  />
                )}
                {view === 'day' && (
                  <DayView
                    date={cursor}
                    displaySize={settings.displaySize}
                    density={settings.calendarEventDensity}
                    entries={byDate.get(cursor.format('YYYY-MM-DD')) || []}
                    onCreate={openCreateTask}
                    onOpenEntry={openCalendarEntry}
                    onEntryPointerDragStart={startCalendarEntryDrag}
                    onDropItem={handleCalendarDrop}
                  />
                )}
                {view === 'agenda' && (
                  <AgendaView
                    entries={filteredEntries}
                    onOpenEntry={openCalendarEntry}
                    onEntryPointerDragStart={startCalendarEntryDrag}
                  />
                )}
              </div>
            </div>
          </main>
        </div>
      </div>

      {draggingTask && (
        <div
          className="pointer-events-none fixed z-[1000] max-w-[240px] rounded-lg border border-primary/40 bg-surface px-3 py-2 text-xs shadow-xl ring-2 ring-primary/20"
          style={{ left: draggingTask.x + 12, top: draggingTask.y + 12 }}
        >
          <div className="flex items-center gap-2">
            <GripVertical size={14} className="text-primary" />
            <span className="truncate font-medium">{draggingTask.title}</span>
          </div>
          <div className="mt-1 text-[11px] text-text-muted">{text.dragToCalendar}</div>
        </div>
      )}

      {draggingCalendarEntry?.active && (
        <div
          className="pointer-events-none fixed z-[1000] overflow-hidden rounded-lg border border-primary/50 bg-surface px-3 py-2 text-xs opacity-95 shadow-2xl ring-2 ring-primary/20"
          style={{
            left: draggingCalendarEntry.x - draggingCalendarEntry.offsetX,
            top: draggingCalendarEntry.y - draggingCalendarEntry.offsetY,
            width: Math.max(160, draggingCalendarEntry.width),
            minHeight: Math.max(42, draggingCalendarEntry.height),
          }}
        >
          <div className="flex items-center gap-2 text-text-muted">
            <GripVertical size={14} className="text-primary" />
            <span className="truncate">
              {draggingCalendarEntry.entry.time}{draggingCalendarEntry.entry.endTime ? ` - ${draggingCalendarEntry.entry.endTime}` : ''}
            </span>
          </div>
          <div className="mt-1 truncate font-medium">{draggingCalendarEntry.entry.title}</div>
          <div className={`mt-1 text-[11px] ${draggingCalendarEntry.dropLabel ? 'text-primary' : 'text-text-muted'}`}>
            {draggingCalendarEntry.dropLabel || text.dragToCalendar}
          </div>
        </div>
      )}

      {createDraft && (
        <CreateTaskOnDate
          draft={createDraft}
          boards={boards}
          onClose={() => setCreateDraft(null)}
          onCreated={async (task, boardId) => {
            await load();
            setCreateDraft(null);
            if (task && boardId) {
              try {
                await remindersApi.openTask(boardId, task.id);
              } catch (error) {
                toast.error(String(error));
              }
            }
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
          onSaveTime={(startAt, endAt) => saveEntryTime(selectedEntry, startAt, endAt)}
          onSaveManual={(patch) => saveManualEntry(selectedEntry, patch)}
          onDeleteManual={() => setManualEntryToDelete(selectedEntry)}
          onCreatePomodoro={async () => {
            await calendarApi.createPomodoroFromEntry(selectedEntry.id);
            await load();
            setSelectedEntry(null);
            toast.success(text.pomodoroCreated);
          }}
        />
      )}
      <DateEntriesModal
        date={expandedDate}
        entries={expandedEntries}
        onClose={() => setExpandedDate(null)}
        onOpenEntry={(entry) => {
          setExpandedDate(null);
          openCalendarEntry(entry);
        }}
        onEntryPointerDragStart={startCalendarEntryDrag}
      />
      <DeleteConfirmModal
        open={Boolean(manualEntryToDelete)}
        onClose={() => setManualEntryToDelete(null)}
        onConfirm={() => {
          if (manualEntryToDelete) void deleteManualEntry(manualEntryToDelete);
        }}
        title={text.deleteScheduleTitle}
        message={text.deleteScheduleMessage}
        confirmLabel={text.deleteSchedule}
      />
    </div>
  );
}

function useCurrentMinute() {
  const [now, setNow] = useState(() => dayjs());

  useEffect(() => {
    const tick = () => setNow(dayjs());
    tick();
    const interval = window.setInterval(tick, 3_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return now;
}

function useCenterCurrentTime(showNowLine: boolean, centerKey: string) {
  const markerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showNowLine) return;
    const timer = window.setTimeout(() => {
      markerRef.current?.scrollIntoView({ block: 'center', inline: 'nearest' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [showNowLine, centerKey]);

  return markerRef;
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
  const s = startOfWeek(cursor.startOf('month'), weekStart);
  const e = endOfWeek(cursor.endOf('month'), weekStart);
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
  const text = useCalendarText();
  const start = startOfWeek(cursor.startOf('month'), weekStart);
  const end = endOfWeek(cursor.endOf('month'), weekStart);
  const days = rangeDays(start, end);
  const wd = weekStart === 'mon' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const localizedWd = settingsWeekdayLabels(text, weekStart, false);
  return (
    <div>
      <div className="text-sm font-semibold mb-2">{formatCalendarMonth(cursor, text)}</div>
      <div className="grid grid-cols-7 gap-1 text-[11px] text-center text-text-muted mb-1">
        {wd.map((d, index) => <div key={d}>{localizedWd[index]}</div>)}
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
              className={`h-7 rounded-md text-xs transition-colors flex items-center justify-center ${
                active && !today ? 'ring-2 ring-primary bg-primary-soft/40' : today ? 'bg-primary-soft/40' : 'hover:bg-surface-2'
              }`}
              style={{ opacity: d.month() === cursor.month() ? 1 : 0.42 }}
            >
              <span className={today ? 'h-5 min-w-5 rounded-full bg-primary px-1.5 leading-5 text-white font-semibold' : ''}>
                {d.date()}
              </span>
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
  density,
  byDate,
  selectedDate,
  onSelectDate,
  onShowDateEntries,
  onCreate,
  onOpenEntry,
  onEntryPointerDragStart,
  onDropItem,
}: {
  cursor: dayjs.Dayjs;
  weekStart: 'mon' | 'sun';
  density: AppSettings['calendarEventDensity'];
  byDate: Map<string, CalendarEntry[]>;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onShowDateEntries: (date: string) => void;
  onCreate: (date: string) => void;
  onOpenEntry: (entry: CalendarEntry) => void;
  onEntryPointerDragStart: (entry: CalendarEntry, event: React.PointerEvent) => void;
  onDropItem: (event: React.DragEvent, date: string, hour?: number, minute?: number) => void;
}) {
  const text = useCalendarText();
  const start = startOfWeek(cursor.startOf('month'), weekStart);
  const end = endOfWeek(cursor.endOf('month'), weekStart);
  const days = rangeDays(start, end);
  const wd = settingsWeekdayLabels(text, weekStart, true);
  const maxVisibleItems = density === 'compact' ? 5 : 4;

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
          const today = d.isSame(dayjs(), 'day');
          return (
            <div
              key={key}
              data-calendar-drop-date={key}
              data-calendar-drop-hour="9"
              data-calendar-drop-minute="0"
              onClick={() => onSelectDate(key)}
              onDoubleClick={() => onCreate(key)}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => {
                event.stopPropagation();
                onDropItem(event, key, 9);
              }}
              className={`${density === 'compact' ? 'min-h-[104px]' : 'min-h-[118px]'} border-r border-b border-border p-2 text-left transition-colors ${
                active ? 'bg-primary-soft/50 ring-1 ring-inset ring-primary/50' : today ? 'bg-primary-soft/20' : 'hover:bg-surface-2'
              }`}
              style={{ opacity: d.month() === cursor.month() ? 1 : 0.45 }}
            >
              <div className="mb-1 flex items-center justify-between gap-1">
                <span className={`text-xs ${today ? 'h-6 min-w-6 rounded-full bg-primary px-1.5 text-center leading-6 text-white font-semibold shadow-sm' : 'text-text'}`}>
                  {d.date()}
                </span>
                {today && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              </div>
              <div className="space-y-1">
                {list.slice(0, maxVisibleItems).map((e) => (
                  <EventPill key={e.id} entry={e} onClick={() => onOpenEntry(e)} onPointerDragStart={onEntryPointerDragStart} />
                ))}
                {list.length > maxVisibleItems && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onShowDateEntries(key);
                    }}
                    onDoubleClick={(event) => event.stopPropagation()}
                    className="w-full rounded-md px-1.5 py-1 text-left text-[11px] font-medium text-primary transition-colors hover:bg-primary-soft/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {text.moreItems.replace('{{count}}', String(list.length - maxVisibleItems))}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DateEntriesModal({
  date,
  entries,
  onClose,
  onOpenEntry,
  onEntryPointerDragStart,
}: {
  date: string | null;
  entries: CalendarEntry[];
  onClose: () => void;
  onOpenEntry: (entry: CalendarEntry) => void;
  onEntryPointerDragStart: (entry: CalendarEntry, event: React.PointerEvent) => void;
}) {
  const text = useCalendarText();
  const title = date
    ? `${dayjs(date).format(text.title === 'Calendar' ? 'MMM D, YYYY dddd' : 'YYYY-MM-DD dddd')} · ${text.itemCount.replace('{{count}}', String(entries.length))}`
    : '';

  return (
    <Modal open={Boolean(date)} onClose={onClose} title={title} size="lg" closeOnBackdrop>
      <div className="space-y-2">
        {entries.length === 0 ? (
          <EmptyState title={text.noSchedule} description={text.noScheduleDesc} compact />
        ) : (
          entries.map((entry) => (
            <EventCard
              key={entry.id}
              entry={entry}
              onClick={() => onOpenEntry(entry)}
              onPointerDragStart={onEntryPointerDragStart}
            />
          ))
        )}
      </div>
    </Modal>
  );
}

function WeekView({
  cursor,
  weekStart,
  displaySize,
  density,
  byDate,
  onSelectDate,
  onCreate,
  onOpenEntry,
  onEntryPointerDragStart,
  onDropItem,
}: {
  cursor: dayjs.Dayjs;
  weekStart: 'mon' | 'sun';
  displaySize: AppSettings['displaySize'];
  density: AppSettings['calendarEventDensity'];
  byDate: Map<string, CalendarEntry[]>;
  onSelectDate: (date: string) => void;
  onCreate: (date: string) => void;
  onOpenEntry: (entry: CalendarEntry) => void;
  onEntryPointerDragStart: (entry: CalendarEntry, event: React.PointerEvent) => void;
  onDropItem: (event: React.DragEvent, date: string, hour?: number, minute?: number) => void;
}) {
  const text = useCalendarText();
  const start = startOfWeek(cursor, weekStart);
  const days = rangeDays(start, start.add(6, 'day'));
  const hours = calendarHours();
  const hourRowHeight = calendarHourHeight(displaySize);
  const timelineHeight = timelineHeightPx(hours.length, hourRowHeight);
  const now = useCurrentMinute();
  const showNowLine = days.some((d) => d.isSame(now, 'day')) && now.hour() >= hours[0] && now.hour() <= hours[hours.length - 1];
  const nowTop = currentTimeTop(now, hours[0], hourRowHeight);
  const nowLineRef = useCenterCurrentTime(showNowLine, `week-${start.format('YYYY-MM-DD')}-${displaySize}`);
  return (
    <div className="w-full min-w-0">
      <div className="grid sticky top-0 z-40 bg-surface-2 border-b border-border shadow-sm" style={{ gridTemplateColumns: '52px repeat(7, minmax(0, 1fr))' }}>
        <div />
        {days.map((d) => (
          (() => {
            const today = d.isSame(now, 'day');
            return (
          <button
            key={d.format()}
            onClick={() => onSelectDate(d.format('YYYY-MM-DD'))}
            onDoubleClick={() => onCreate(d.format('YYYY-MM-DD'))}
            className={`px-2 py-2 text-center hover:bg-surface ${today ? 'bg-primary-soft/30' : ''}`}
          >
            <div className="text-[11px] text-text-muted">{d.format('ddd')}</div>
            <div className="mt-1 flex justify-center">
              <span className={today ? 'rounded-full bg-primary px-2 py-0.5 text-sm font-semibold text-white shadow-sm' : 'text-sm'}>
                {d.format('MM-DD')}
              </span>
            </div>
          </button>
            );
          })()
        ))}
      </div>
      <div className="grid border-b border-border bg-surface/80" style={{ gridTemplateColumns: '52px repeat(7, minmax(0, 1fr))' }}>
        <div className="text-[11px] text-text-muted px-2 py-2 text-right border-r border-border">{text.allDay}</div>
        {days.map((d) => {
          const key = d.format('YYYY-MM-DD');
          const allDay = (byDate.get(key) || []).filter(isAllDayEntry);
          return (
            <div
              key={`all-${key}`}
              data-calendar-drop-date={key}
              data-calendar-drop-hour="9"
              data-calendar-drop-minute="0"
              className={`border-r border-border px-1.5 py-1 space-y-1 ${density === 'compact' ? 'min-h-[30px]' : 'min-h-[34px]'} ${d.isSame(now, 'day') ? 'bg-primary-soft/10' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => {
                event.stopPropagation();
                onDropItem(event, key, 9);
              }}
            >
              {allDay.slice(0, density === 'compact' ? 1 : 2).map((e) => (
                <EventPill key={e.id} entry={e} onClick={() => onOpenEntry(e)} onPointerDragStart={onEntryPointerDragStart} />
              ))}
              {allDay.length > (density === 'compact' ? 1 : 2) && <div className="text-[10px] text-text-muted">+{allDay.length - (density === 'compact' ? 1 : 2)}</div>}
            </div>
          );
        })}
      </div>
      <div className="relative" style={{ height: timelineHeight }}>
        <div className="absolute inset-0">
          {hours.map((h) => (
            <div
              key={h}
              className="grid border-b border-border"
              style={{ gridTemplateColumns: '52px repeat(7, minmax(0, 1fr))', height: hourRowHeight }}
            >
              <div className="text-[11px] text-text-muted px-2 pt-1.5 text-right border-r border-border">
                {String(h).padStart(2, '0')}:00
              </div>
              {days.map((d) => (
                <TimelineDropCell
                  key={`${d.format('YYYY-MM-DD')}-${h}`}
                  date={d}
                  hour={h}
                  onSelectDate={onSelectDate}
                  onCreate={onCreate}
                  onDropItem={onDropItem}
                  className={d.isSame(now, 'day') ? 'bg-primary-soft/10 hover:bg-primary-soft/20' : 'hover:bg-surface-2'}
                />
              ))}
            </div>
          ))}
        </div>
        {showNowLine && (
          <div ref={nowLineRef} className="pointer-events-none absolute left-[52px] right-0 z-10" style={{ top: nowTop }}>
            <div className="h-px bg-danger" />
            <span className="absolute -left-[45px] -top-2 rounded bg-danger px-1.5 py-0.5 text-[10px] text-white">
              {now.format('HH:mm')}
            </span>
          </div>
        )}
        <div className="absolute top-0 bottom-0 left-[52px] right-0 grid pointer-events-none" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
          {days.map((d) => {
            const key = d.format('YYYY-MM-DD');
            const timed = (byDate.get(key) || []).filter((entry) => !isAllDayEntry(entry));
            return (
              <div key={`events-${key}`} className="relative border-r border-border">
                {layoutTimedEntries(timed, hours[0], hours[hours.length - 1] + 1, hourRowHeight).map((item) => (
                  <TimedEventBlock
                    key={item.entry.id}
                    item={item}
                    onClick={() => onOpenEntry(item.entry)}
                    onPointerDragStart={onEntryPointerDragStart}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayView({
  date,
  displaySize,
  density,
  entries,
  onCreate,
  onOpenEntry,
  onEntryPointerDragStart,
  onDropItem,
}: {
  date: dayjs.Dayjs;
  displaySize: AppSettings['displaySize'];
  density: AppSettings['calendarEventDensity'];
  entries: CalendarEntry[];
  onCreate: (date: string) => void;
  onOpenEntry: (entry: CalendarEntry) => void;
  onEntryPointerDragStart: (entry: CalendarEntry, event: React.PointerEvent) => void;
  onDropItem: (event: React.DragEvent, date: string, hour?: number, minute?: number) => void;
}) {
  const text = useCalendarText();
  const hours = calendarHours();
  const hourRowHeight = calendarHourHeight(displaySize);
  const timelineHeight = timelineHeightPx(hours.length, hourRowHeight);
  const allDayEntries = entries.filter(isAllDayEntry);
  const timedEntries = entries.filter((entry) => !isAllDayEntry(entry));
  const timedLayout = layoutTimedEntries(timedEntries, hours[0], hours[hours.length - 1] + 1, hourRowHeight);
  const now = useCurrentMinute();
  const showNowLine = date.isSame(now, 'day') && now.hour() >= hours[0] && now.hour() <= hours[hours.length - 1];
  const nowTop = currentTimeTop(now, hours[0], hourRowHeight);
  const nowLineRef = useCenterCurrentTime(showNowLine, `day-${date.format('YYYY-MM-DD')}-${displaySize}`);
  const isToday = date.isSame(now, 'day');
  return (
    <div>
      <div className={`p-3 border-b border-border flex items-center justify-between ${isToday ? 'bg-primary-soft/20' : ''}`}>
        <div>
          <div className="font-semibold flex items-center gap-2">
            {isToday && <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-white">{text.today}</span>}
            {date.format('YYYY-MM-DD dddd')}
          </div>
          <div className="text-xs text-text-muted">{text.itemCount.replace('{{count}}', String(entries.length))}</div>
        </div>
        <Button size="sm" onClick={() => onCreate(date.format('YYYY-MM-DD'))}>
          <Plus size={14} />
          {text.createCalendarItem}
        </Button>
      </div>
      <div className="grid grid-cols-[72px_1fr] border-b border-border bg-surface/80">
        <div className="text-[11px] text-text-muted px-2 py-2 text-right border-r border-border">{text.allDay}</div>
        <div
          data-calendar-drop-date={date.format('YYYY-MM-DD')}
          data-calendar-drop-hour="9"
          data-calendar-drop-minute="0"
          className={`${density === 'compact' ? 'min-h-[34px]' : 'min-h-[38px]'} p-2 space-y-1`}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(event) => {
            event.stopPropagation();
            onDropItem(event, date.format('YYYY-MM-DD'), 9);
          }}
        >
          {allDayEntries.length === 0 ? (
            <div className="text-[11px] text-text-muted">{text.noAllDay}</div>
          ) : (
            allDayEntries.map((entry) => (
              <EventCard
                key={entry.id}
                entry={entry}
                onClick={() => onOpenEntry(entry)}
                onPointerDragStart={onEntryPointerDragStart}
                compact
              />
            ))
          )}
        </div>
      </div>
      <div className="relative" style={{ height: timelineHeight }}>
        <div className="absolute inset-0">
          {hours.map((h) => (
            <div key={h} className="grid grid-cols-[72px_1fr] border-b border-border" style={{ height: hourRowHeight }}>
              <div className="text-[11px] text-text-muted px-2 pt-1.5 text-right border-r border-border">
                {String(h).padStart(2, '0')}:00
              </div>
              <TimelineDropCell
                date={date}
                hour={h}
                onSelectDate={() => undefined}
                onCreate={onCreate}
                onDropItem={onDropItem}
                className={isToday ? 'bg-primary-soft/10 hover:bg-primary-soft/20' : 'hover:bg-surface-2'}
              />
            </div>
          ))}
        </div>
        {showNowLine && (
          <div ref={nowLineRef} className="pointer-events-none absolute left-[72px] right-0 z-10" style={{ top: nowTop }}>
            <div className="h-px bg-danger" />
            <span className="absolute -left-[54px] -top-2 rounded bg-danger px-1.5 py-0.5 text-[10px] text-white">
              {now.format('HH:mm')}
            </span>
          </div>
        )}
        <div className="absolute top-0 bottom-0 left-[72px] right-0 pointer-events-none">
          {timedLayout.map((item) => (
            <TimedEventBlock
              key={item.entry.id}
              item={item}
              onClick={() => onOpenEntry(item.entry)}
              onPointerDragStart={onEntryPointerDragStart}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AgendaView({
  entries,
  onOpenEntry,
  onEntryPointerDragStart,
}: {
  entries: CalendarEntry[];
  onOpenEntry: (entry: CalendarEntry) => void;
  onEntryPointerDragStart: (entry: CalendarEntry, event: React.PointerEvent) => void;
}) {
  const text = useCalendarText();
  const grouped = groupByDate(entries);
  return (
    <div className="p-4 space-y-4">
      {grouped.length === 0 ? (
        <EmptyState title={text.noRangeEvents} description={text.noRangeEventsDesc} />
      ) : grouped.map(([date, list]) => {
        const today = dayjs(date).isSame(dayjs(), 'day');
        return (
        <section key={date} className={today ? 'rounded-lg bg-primary-soft/20 p-3 -mx-3' : ''}>
          <div className={`text-sm font-semibold mb-2 flex items-center gap-2 ${today ? 'text-primary' : ''}`}>
            {today && <span className="h-5 w-1 rounded-full bg-primary" />}
            <Clock3 size={14} />
            {today ? `${text.today} · ${dayjs(date).format('YYYY-MM-DD dddd')}` : dayjs(date).format('YYYY-MM-DD dddd')}
          </div>
          <div className="space-y-2">
            {list.map((entry) => (
              <EventCard
                key={entry.id}
                entry={entry}
                onClick={() => onOpenEntry(entry)}
                onPointerDragStart={onEntryPointerDragStart}
              />
            ))}
          </div>
        </section>
        );
      })}
    </div>
  );
}

const MIN_TIMED_EVENT_HEIGHT = 44;

type TimedEntryLayout = {
  entry: CalendarEntry;
  top: number;
  height: number;
  left: number;
  width: number;
};

function TimelineDropCell({
  date,
  hour,
  onSelectDate,
  onCreate,
  onDropItem,
  className,
}: {
  date: dayjs.Dayjs;
  hour: number;
  onSelectDate: (date: string) => void;
  onCreate: (date: string) => void;
  onDropItem: (event: React.DragEvent, date: string, hour?: number, minute?: number) => void;
  className?: string;
}) {
  const dateKey = date.format('YYYY-MM-DD');
  const [hoverMinute, setHoverMinute] = useState<number | null>(null);
  const minuteFromEvent = (event: React.DragEvent | React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(0.999, Math.max(0, (event.clientY - rect.top) / rect.height));
    return snapCalendarMinute(ratio * 60);
  };
  return (
    <div
      data-calendar-drop-date={dateKey}
      data-calendar-drop-hour={hour}
      data-calendar-drop-minute={hoverMinute ?? 0}
      data-calendar-drop-timeline="true"
      onClick={() => onSelectDate(dateKey)}
      onDoubleClick={(event) => {
        const minute = minuteFromEvent(event);
        onCreate(dayjs(dateKey).hour(hour).minute(minute).toISOString());
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        setHoverMinute(minuteFromEvent(event));
      }}
      onDragLeave={() => setHoverMinute(null)}
      onDrop={(event) => {
        event.stopPropagation();
        const minute = minuteFromEvent(event);
        setHoverMinute(null);
        onDropItem(event, dateKey, hour, minute);
      }}
      className={`relative border-r border-border ${className || ''}`}
    >
      {hoverMinute !== null && (
        <div
          className="pointer-events-none absolute left-1 right-1 z-20 flex items-center"
          style={{ top: `${(hoverMinute / 60) * 100}%` }}
        >
          <span className="h-px flex-1 bg-primary/70" />
          <span className="ml-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium leading-none text-white shadow-sm">
            {formatDropTime(hour, hoverMinute)}
          </span>
        </div>
      )}
    </div>
  );
}

function TimedEventBlock({
  item,
  onClick,
  onPointerDragStart,
}: {
  item: TimedEntryLayout;
  onClick: () => void;
  onPointerDragStart: (entry: CalendarEntry, event: React.PointerEvent) => void;
}) {
  const { entry } = item;
  const meta = sourceMeta[entry.sourceType] || sourceMeta.manual;
  const text = useCalendarText();
  const defaultColor = useSettingsStore((state) => state.settings.calendarDefaultEventColor);
  const draggable = canDragCalendarEntry(entry);
  const color = entryColor(entry, defaultColor);
  return (
    <button
      draggable={false}
      onPointerDown={(event) => onPointerDragStart(entry, event)}
      onDragStart={(event) => {
        if (draggable) setCalendarEntryDragData(event, entry);
      }}
      onDragEnd={(event) => event.currentTarget.blur()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`absolute pointer-events-auto overflow-hidden rounded-md border bg-surface px-2 py-1 text-left shadow-md ring-1 ring-black/5 transition-colors hover:bg-surface-2 ${
        draggable ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
      style={{
        top: item.top,
        height: item.height,
        left: `${item.left}%`,
        width: `calc(${item.width}% - 4px)`,
        borderColor: `${color}66`,
        borderLeft: `4px solid ${color}`,
        background: `${color}12`,
      }}
      title={`${entry.time || ''}${entry.endTime ? ` - ${entry.endTime}` : ''} ${entry.title}`}
    >
      <div className="flex items-center gap-1 text-[10px] leading-4 text-text-muted">
        {meta.icon}
        <span className="truncate">{entry.time}{entry.endTime ? ` - ${entry.endTime}` : ''}</span>
        {entry.readonly && <span className="shrink-0">{text.readonly}</span>}
      </div>
      <div className={`truncate text-xs font-medium leading-4 ${entry.isCompleted ? 'line-through text-text-muted' : ''}`}>
        {entry.title}
      </div>
      {item.height >= 54 && entry.location && (
        <div className="truncate text-[10px] leading-4 text-text-muted">{entry.location}</div>
      )}
    </button>
  );
}

function EventPill({
  entry,
  onClick,
  onPointerDragStart,
}: {
  entry: CalendarEntry;
  onClick: () => void;
  onPointerDragStart: (entry: CalendarEntry, event: React.PointerEvent) => void;
}) {
  const draggable = canDragCalendarEntry(entry);
  const text = useCalendarText();
  const defaultColor = useSettingsStore((state) => state.settings.calendarDefaultEventColor);
  const color = entryColor(entry, defaultColor);
  return (
    <button
      draggable={false}
      onPointerDown={(event) => onPointerDragStart(entry, event)}
      onDragStart={(event) => {
        if (draggable) setCalendarEntryDragData(event, entry);
      }}
      onDragEnd={(event) => event.currentTarget.blur()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`w-full truncate rounded-md border px-1.5 py-1 text-left text-[11px] shadow-sm ring-1 ring-black/5 transition-colors hover:shadow-md flex items-center gap-1 ${
        draggable ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
      style={{
        background: `linear-gradient(90deg, ${color}22, ${color}10)`,
        color,
        borderColor: `${color}55`,
        borderLeft: `3px solid ${color}`,
        textDecoration: entry.isCompleted ? 'line-through' : 'none',
      }}
      title={entry.title}
    >
      {sourceMeta[entry.sourceType]?.icon}
      {entry.time && <span className="shrink-0">{entry.time}</span>}
      <span className="truncate">{entry.title}</span>
      {entry.holidayType === 'workday' && <span className="shrink-0">{text.workday}</span>}
      {entry.holidayType === 'holiday' && <span className="shrink-0">{text.holiday}</span>}
    </button>
  );
}

function EventCard({
  entry,
  onClick,
  onPointerDragStart,
  compact,
}: {
  entry: CalendarEntry;
  onClick: () => void;
  onPointerDragStart: (entry: CalendarEntry, event: React.PointerEvent) => void;
  compact?: boolean;
}) {
  const meta = sourceMeta[entry.sourceType] || sourceMeta.manual;
  const draggable = canDragCalendarEntry(entry);
  const text = useCalendarText();
  const defaultColor = useSettingsStore((state) => state.settings.calendarDefaultEventColor);
  const color = entryColor(entry, defaultColor);
  return (
    <button
      draggable={false}
      onPointerDown={(event) => onPointerDragStart(entry, event)}
      onDragStart={(event) => {
        if (draggable) setCalendarEntryDragData(event, entry);
      }}
      onDragEnd={(event) => event.currentTarget.blur()}
      onClick={onClick}
      className={`w-full text-left rounded-lg border bg-surface shadow-sm ring-1 ring-black/5 hover:bg-surface-2 hover:shadow-md transition-colors ${compact ? 'p-2' : 'p-3'} ${
        draggable ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
      style={{ borderColor: `${color}44`, borderLeft: `4px solid ${color}`, background: `linear-gradient(90deg, ${color}10, var(--surface) 42%)` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-text-muted mb-1">
            {meta.icon}
            <span>{text.sources[entry.sourceType]}</span>
            {entry.time && <span>{entry.time}{entry.endTime ? ` - ${entry.endTime}` : ''}</span>}
            {entry.readonly && <span className="chip">{text.readonly}</span>}
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
  onSaveManual,
  onDeleteManual,
  onCreatePomodoro,
}: {
  entry: CalendarEntry;
  onClose: () => void;
  onOpenTask: () => void;
  onCreateTask: () => void;
  onOpenGoal: () => void;
  onSaveTime: (startAt: string, endAt?: string | null) => void;
  onSaveManual: (patch: {
    title: string;
    description?: string | null;
    location?: string | null;
    startAt: string;
    endAt?: string | null;
    color?: string | null;
  }) => void;
  onDeleteManual: () => void;
  onCreatePomodoro: () => void;
}) {
  const meta = sourceMeta[entry.sourceType] || sourceMeta.manual;
  const text = useCalendarText();
  const canCreateTask = entry.sourceType === 'meeting' || entry.sourceType === 'email' || entry.sourceType === 'manual';
  const canEditTime = canDragCalendarEntry(entry);
  const canCreatePomodoro = entry.sourceType === 'meeting' || entry.sourceType === 'email' || entry.sourceType === 'manual';
  const sourceLabel = text.sources[entry.sourceType] || meta.label;
  const relationTitle = entry.sourceType === 'meeting' || entry.sourceType === 'email'
    ? text.sourceMeeting
    : entry.sourceType === 'manual'
      ? text.sourceSchedule
      : sourceLabel;
  const [startAt, setStartAt] = useState<string | null>(entry.startAt || entry.dueAt || dayjs(entry.date).hour(entry.time ? Number(entry.time.slice(0, 2)) : 9).minute(entry.time ? Number(entry.time.slice(3, 5)) : 0).toISOString());
  const [endAt, setEndAt] = useState<string | null>(entry.sourceType === 'task' ? null : entry.dueAt || null);
  const [manualTitle, setManualTitle] = useState(entry.title);
  const [manualDescription, setManualDescription] = useState(entry.description || '');
  const [manualLocation, setManualLocation] = useState(entry.location || '');
  const [manualColor, setManualColor] = useState(entry.color || entryColor(entry));
  const isManualEditable = entry.sourceType === 'manual' && !entry.readonly;
  const [isEditingManual, setIsEditingManual] = useState(false);
  const saveManualEdit = () => {
    if (!startAt) return;
    onSaveManual({
      title: manualTitle,
      description: manualDescription,
      location: manualLocation,
      startAt,
      endAt,
      color: manualColor,
    });
  };
  return (
    <Modal open onClose={onClose} title={text.detailTitle} size="lg">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white" style={{ background: entryColor(entry) }}>
            {meta.icon}
          </div>
          <div className="min-w-0">
            {isEditingManual ? (
              <Input label={text.taskTitle} value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} />
            ) : (
              <div className="text-xl font-semibold">{entry.title}</div>
            )}
            <div className="text-sm text-text-muted mt-1 flex items-center gap-2 flex-wrap">
              <span>{text.sources[entry.sourceType]}</span>
              {entry.readonly && <span className="chip">{text.readonlyEvent}</span>}
              {entry.isCompleted && <span className="chip">{text.completed}</span>}
            </div>
          </div>
        </div>
        {isEditingManual ? (
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <NativeDateTimeInput
              label={text.startTime}
              value={formatForDateTimeInput(startAt)}
              onChange={(value) => setStartAt(dateTimeInputToIso(value))}
            />
            <NativeDateTimeInput
              label={text.endTime}
              value={formatForDateTimeInput(endAt)}
              onChange={(value) => setEndAt(dateTimeInputToIso(value))}
            />
            <Input label={text.location} value={manualLocation} onChange={(event) => setManualLocation(event.target.value)} />
            <label className="block">
              <span className="label">{(text as any).color || 'Color'}</span>
              <input
                type="color"
                className="h-10 w-full rounded-md border border-border bg-surface px-2"
                value={manualColor}
                onChange={(event) => setManualColor(event.target.value)}
              />
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <InfoRow label={text.date} value={entry.date} icon={<CalendarDays size={15} />} />
            <InfoRow label={text.time} value={entry.time ? `${entry.time}${entry.endTime ? ` - ${entry.endTime}` : ''}` : text.allDayOrUnset} icon={<Clock3 size={15} />} />
            <InfoRow label={text.source} value={sourceLabel} icon={meta.icon} />
            {entry.boardName && <InfoRow label={text.board} value={`${entry.boardName} / ${entry.listName || ''}`} icon={<Inbox size={15} />} />}
            {entry.location && <InfoRow label={text.location} value={entry.location} icon={<Flag size={15} />} />}
            {entry.status && <InfoRow label={text.status} value={formatEntryStatus(entry.status, text)} icon={<Sparkles size={15} />} />}
            {entry.hasSubtasks && <InfoRow label={text.subtasks} value={`${entry.subtaskDone}/${entry.subtaskCount}`} icon={<ListChecks size={15} />} />}
          </div>
        )}
        <div className="rounded-lg border border-border bg-surface p-3 text-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="font-medium flex items-center gap-2">
              {meta.icon}
              {text.relation}
            </div>
            <span className="chip">{relationTitle}</span>
          </div>
          <div className="space-y-1.5 text-text-muted">
            <div className="break-all">{text.sourceEntryId}: {entry.id}</div>
            <div>{canEditTime ? text.editableHint : text.readOnlyHint}</div>
            {canCreateTask && <div>{text.createdTaskWillLink}</div>}
          </div>
        </div>
        {isEditingManual ? (
          <MarkdownEditor
            label={text.description}
            value={manualDescription}
            onChange={setManualDescription}
            placeholder={text.taskDescPlaceholder}
            previewLabel={text.previewMarkdown}
            editLabel={text.editMarkdown}
          />
        ) : entry.description && (
          <div>
            <div className="text-sm font-medium mb-1">{text.description}</div>
            <MarkdownPreview value={entry.description} />
          </div>
        )}
        {canEditTime && !isManualEditable && (
          <div className="rounded-lg border border-border p-3">
            <div className="text-sm font-medium mb-2">{text.adjustTime}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <NativeDateTimeInput
                  label={text.startTime}
                  value={formatForDateTimeInput(startAt)}
                  onChange={(value) => setStartAt(dateTimeInputToIso(value))}
                />
              </div>
              {entry.sourceType !== 'task' && (
                <div>
                  <NativeDateTimeInput
                    label={text.endTime}
                    value={formatForDateTimeInput(endAt)}
                    onChange={(value) => setEndAt(dateTimeInputToIso(value))}
                  />
                </div>
              )}
            </div>
          </div>
        )}
        {(entry.sourceType === 'task' || entry.sourceType === 'goal' || canCreateTask || entry.linkedTaskId || isManualEditable) && (
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
            <div>
              {isManualEditable && (
                <div className="flex items-center gap-2">
                  <Button
                    size="md"
                    variant="primary"
                    className={`gap-1.5 shadow-md shadow-primary/20 ring-2 ring-primary/15 hover:shadow-lg ${
                      isEditingManual ? 'bg-emerald-600 hover:bg-emerald-700' : ''
                    }`}
                    onClick={() => isEditingManual ? saveManualEdit() : setIsEditingManual(true)}
                  >
                    {isEditingManual ? <CheckCircle2 size={16} /> : <Edit3 size={16} />}
                    {isEditingManual ? (text as any).saveChanges : text.editMarkdown}
                  </Button>
                  {!isEditingManual && (
                    <Button
                      size="md"
                      variant="danger"
                      className="gap-1.5 shadow-sm"
                      onClick={onDeleteManual}
                    >
                      <Trash2 size={16} />
                      {text.deleteSchedule}
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2">
            {canEditTime && !isManualEditable && startAt && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onSaveTime(startAt, endAt)}
              >
                <Clock3 size={14} />
                {text.saveTime}
              </Button>
            )}
            {(entry.sourceType === 'task' || entry.linkedTaskId) && (
              <Button size="sm" onClick={onOpenTask}>
                <ListChecks size={14} />
                {text.openTask}
              </Button>
            )}
            {entry.sourceType === 'goal' && (
              <Button size="sm" onClick={onOpenGoal}>
                <Target size={14} />
                {text.openGoal}
              </Button>
            )}
            {canCreateTask && (
              <Button size="sm" onClick={onCreateTask}>
                <Plus size={14} />
                {text.convertToTask}
              </Button>
            )}
            {canCreatePomodoro && (
              <Button size="sm" variant="outline" onClick={onCreatePomodoro}>
                <Timer size={14} />
                {text.createPomodoroPlan}
              </Button>
            )}
            </div>
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

function formatEntryStatus(status: string, text: ReturnType<typeof useCalendarText>) {
  const key = status.trim().toLowerCase();
  const labels = text.statusText as Record<string, string>;
  return labels[key] || status;
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
  onCreated: (task?: Task, boardId?: string | null) => void | Promise<void>;
}) {
  const text = useCalendarText();
  const { settings } = useSettingsStore();
  const [mode, setMode] = useState<'task' | 'schedule'>(draft.mode || 'schedule');
  const [title, setTitle] = useState(draft.title || '');
  const [description, setDescription] = useState(draft.description || '');
  const [location, setLocation] = useState('');
  const [listId, setListId] = useState<string>('');
  const [startAt, setStartAt] = useState<string | null>(draft.startAt || dayjs(draft.date).hour(9).minute(0).second(0).millisecond(0).toISOString());
  const [dueAt, setDueAt] = useState<string | null>(draft.dueAt || initialDraftDueAt(draft.date, settings));
  const allLists: { list: List; board: Board }[] = boards.flatMap((b) => b.lists.map((l) => ({ list: l.list, board: b.board })));

  useEffect(() => {
    if (!listId && allLists.length > 0) setListId(allLists[0].list.id);
  }, [allLists, listId]);

  const onCreate = async () => {
    if (!title.trim() || (mode === 'task' && !listId)) {
      toast.error(text.createTaskError);
      return;
    }
    if (mode === 'schedule') {
      await calendarApi.createManualEvent({
        title: title.trim(),
        description: description.trim() || null,
        startAt: startAt || dayjs(draft.date).hour(9).minute(0).toISOString(),
        endAt: dueAt || null,
        allDay: false,
        location: location.trim() || null,
        color: draft.color || settings.calendarDefaultEventColor,
      });
      toast.success(text.scheduleCreated);
      await onCreated(undefined, null);
      return;
    }
    const created = await tasksApi.create({
      listId,
      title: title.trim(),
      description: description.trim() || undefined,
      startAt: startAt || undefined,
      dueAt: dueAt || undefined,
      reminderAt: draft.reminderAt || undefined,
      color: draft.color || undefined,
    });
    const selectedList = allLists.find((item) => item.list.id === listId);
    toast.success(text.taskCreated);
    await onCreated(created, selectedList?.board.id ?? null);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'schedule' ? text.createScheduleTitle : text.createTaskTitle}
      size="2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{text.cancel}</Button>
          <Button onClick={onCreate}>{text.create}</Button>
        </>
      }
    >
      <div className="min-h-[520px] space-y-4">
        <div className="flex rounded-lg border border-border bg-surface-2 p-0.5 text-sm">
          {(['schedule', 'task'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={`flex-1 rounded-md px-3 py-1.5 transition-colors ${mode === item ? 'bg-primary text-white' : 'text-text-muted hover:bg-surface'}`}
            >
              {item === 'schedule' ? text.createModeSchedule : text.createModeTask}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)]">
          <div className="space-y-3">
            <Input label={text.taskTitle} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            <MarkdownEditor
              label={text.description}
              value={description}
              onChange={setDescription}
              placeholder={text.taskDescPlaceholder}
              previewLabel={text.previewMarkdown}
              editLabel={text.editMarkdown}
            />
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-4">
            {mode === 'schedule' && (
              <Input label={text.location} value={location} onChange={(event) => setLocation(event.target.value)} />
            )}
            {mode === 'task' && (
              <div>
                <label className="label">{text.list}</label>
                <select className="input" value={listId} onChange={(e) => setListId(e.target.value)}>
                  {allLists.map((x) => (
                    <option key={x.list.id} value={x.list.id}>
                      {x.board.name} / {x.list.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <NativeDateTimeInput
                label={text.startTime}
                value={formatForDateTimeInput(startAt)}
                onChange={(value) => {
                  const nextStartAt = dateTimeInputToIso(value);
                  setStartAt(nextStartAt);
                  if (nextStartAt) {
                    setDueAt(dayjs(nextStartAt).add(settings.calendarDefaultDurationMinutes, 'minute').toISOString());
                  }
                }}
              />
            </div>
            <div>
              <NativeDateTimeInput
                label={text.endTime}
                value={formatForDateTimeInput(dueAt)}
                onChange={(value) => setDueAt(dateTimeInputToIso(value))}
              />
            </div>
          </div>
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

function calendarDraftDefaults(draft: CalendarCreateDraft, settings: AppSettings): Pick<CalendarCreateDraft, 'startAt' | 'dueAt' | 'reminderAt' | 'color'> {
  const parsed = dayjs(draft.startAt || draft.dueAt || draft.date);
  const hasExplicitTime = Boolean(draft.startAt || draft.dueAt || draft.date.includes('T'));
  const start = parsed.isValid() && hasExplicitTime
    ? parsed.second(0).millisecond(0)
    : dayjs(draft.date).hour(9).minute(0).second(0).millisecond(0);
  const due = draft.dueAt
    ? dayjs(draft.dueAt)
    : start.add(settings.calendarDefaultDurationMinutes, 'minute');
  return {
    startAt: draft.startAt || start.toISOString(),
    dueAt: due.isValid() ? due.toISOString() : start.add(settings.calendarDefaultDurationMinutes, 'minute').toISOString(),
    reminderAt: draft.reminderAt || (hasExplicitTime ? buildTimedReminderAt(start, settings) : buildAllDayReminderAt(dayjs(draft.date), settings)),
    color: draft.color || settings.calendarDefaultEventColor,
  };
}

function buildTimedReminderAt(start: dayjs.Dayjs, settings: AppSettings) {
  const minutes = settings.calendarDefaultTimedReminderMinutes;
  if (minutes < 0) return null;
  return start.subtract(minutes, 'minute').toISOString();
}

function buildAllDayReminderAt(date: dayjs.Dayjs, settings: AppSettings) {
  switch (settings.calendarDefaultAllDayReminder) {
    case 'same_day_09':
      return date.hour(9).minute(0).second(0).millisecond(0).toISOString();
    case 'previous_day_18':
      return date.subtract(1, 'day').hour(18).minute(0).second(0).millisecond(0).toISOString();
    case 'previous_day_20':
      return date.subtract(1, 'day').hour(20).minute(0).second(0).millisecond(0).toISOString();
    case 'previous_day_09':
      return date.subtract(1, 'day').hour(9).minute(0).second(0).millisecond(0).toISOString();
    default:
      return null;
  }
}

function initialDraftDueAt(value: string, settings: AppSettings) {
  const parsed = dayjs(value);
  if (parsed.isValid() && value.includes('T')) return parsed.toISOString();
  return dayjs(value).hour(9).minute(0).second(0).millisecond(0).add(settings.calendarDefaultDurationMinutes, 'minute').toISOString();
}

function canDragCalendarEntry(entry: CalendarEntry) {
  return !entry.readonly && (entry.sourceType === 'task' || entry.sourceType === 'manual');
}

function calendarHours() {
  return Array.from({ length: 24 }, (_, i) => i);
}

function calendarHourHeight(displaySize: AppSettings['displaySize']) {
  const map: Record<AppSettings['displaySize'], number> = {
    compact: 56,
    standard: 64,
    comfortable: 72,
    large: 82,
  };
  return map[displaySize] || map.standard;
}

function timelineHeightPx(hourCount: number, hourRowHeight: number) {
  return hourCount * hourRowHeight;
}

function currentTimeTop(now: dayjs.Dayjs, startHour: number, hourRowHeight: number) {
  return (((now.hour() - startHour) * 60 + now.minute()) / 60) * hourRowHeight;
}

function layoutTimedEntries(
  entries: CalendarEntry[],
  startHour: number,
  endHour: number,
  hourRowHeight: number,
): TimedEntryLayout[] {
  const minDisplayMinutes = pxToMinutes(MIN_TIMED_EVENT_HEIGHT + 4, hourRowHeight);
  const items = entries
    .map((entry) => {
      const startMinute = entryStartMinute(entry, startHour);
      const endMinute = entryEndMinute(entry, startMinute, startHour);
      const start = clamp(startMinute, 0, (endHour - startHour) * 60 - 15);
      const end = clamp(Math.max(endMinute, startMinute + 30), 15, (endHour - startHour) * 60);
      return {
        entry,
        start,
        end,
        displayEnd: Math.min((endHour - startHour) * 60, Math.max(end, start + minDisplayMinutes)),
      };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const layouts: TimedEntryLayout[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -1;
  const flushCluster = () => {
    if (cluster.length === 0) return;
    const columns: number[] = [];
    const placed = cluster.map((item) => {
      const column = columns.findIndex((end) => end <= item.start);
      const nextColumn = column >= 0 ? column : columns.length;
      columns[nextColumn] = item.displayEnd;
      return { ...item, column: nextColumn };
    });
    const columnCount = Math.max(1, columns.length);
    for (const item of placed) {
      layouts.push({
        entry: item.entry,
        top: minutesToPx(item.start, hourRowHeight),
        height: Math.max(MIN_TIMED_EVENT_HEIGHT, minutesToPx(item.displayEnd - item.start, hourRowHeight) - 4),
        left: (item.column / columnCount) * 100,
        width: 100 / columnCount,
      });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const item of items) {
    if (cluster.length > 0 && item.start >= clusterEnd) {
      flushCluster();
    }
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.displayEnd);
  }
  flushCluster();
  return layouts;
}

function entryStartMinute(entry: CalendarEntry, startHour: number) {
  const value = entry.sourceType === 'task'
    ? entry.startAt || entry.dueAt || `${entry.date}T${entry.time || '09:00'}:00`
    : entry.startAt || entry.dueAt || `${entry.date}T${entry.time || '09:00'}:00`;
  const parsed = dayjs(value);
  if (parsed.isValid()) {
    return (parsed.hour() - startHour) * 60 + parsed.minute();
  }
  const [hour = 9, minute = 0] = (entry.time || '09:00').split(':').map(Number);
  return (hour - startHour) * 60 + minute;
}

function entryEndMinute(entry: CalendarEntry, startMinute: number, startHour: number) {
  if (entry.endTime) {
    const [hour = 10, minute = 0] = entry.endTime.split(':').map(Number);
    const endMinute = hour * 60 + minute - startHour * 60;
    return endMinute > startMinute ? endMinute : endMinute + 24 * 60;
  }

  const end = entry.dueAt;
  if (end) {
    const parsed = dayjs(end);
    if (parsed.isValid()) {
      const minutes = parsed.diff(dayjs(entry.date).startOf('day'), 'minute');
      if (minutes > startMinute) return minutes;
    }
  }
  return startMinute + 60;
}

function minutesToPx(minutes: number, hourRowHeight: number) {
  return (minutes / 60) * hourRowHeight;
}

function pxToMinutes(px: number, hourRowHeight: number) {
  return (px / hourRowHeight) * 60;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function entryColor(entry: CalendarEntry, defaultColor = sourceMeta.manual.color) {
  if (entry.isCompleted) return '#94a3b8';
  if (entry.color) return entry.color;
  if (entry.boardColor) return entry.boardColor;
  if (entry.sourceType === 'manual' || entry.sourceType === 'task') return defaultColor;
  return sourceMeta[entry.sourceType]?.color || defaultColor;
}
