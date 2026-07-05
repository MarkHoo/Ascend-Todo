import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, DatabaseBackup, FileText, LayoutDashboard, ListChecks, Search, Settings, Sparkles, Target, Timer, Trello, User } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { dayjs } from '@/utils/date';
import type { Board, CalendarEntry, GoalWithDetails, KeyResult, ReviewReport, Task } from '@/types';

type SearchKind = 'page' | 'command' | 'board' | 'task' | 'goal' | 'event' | 'keyResult' | 'review';

type SearchItem = {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string;
  path: string;
};

const PAGE_ICON: Record<SearchKind, ReactNode> = {
  page: <LayoutDashboard size={15} />,
  command: <Sparkles size={15} />,
  board: <Trello size={15} />,
  task: <Search size={15} />,
  goal: <Target size={15} />,
  event: <CalendarDays size={15} />,
  keyResult: <ListChecks size={15} />,
  review: <FileText size={15} />,
};

const RECENT_SEARCH_KEY = 'ascend.quickSearch.recent';

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

function scoreItem(item: SearchItem, query: string) {
  const haystack = `${item.title} ${item.subtitle}`.toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 1;
  if (item.title.toLowerCase().startsWith(normalizedQuery)) return 100;
  if (item.title.toLowerCase().includes(normalizedQuery)) return 80;
  if (haystack.includes(normalizedQuery)) return 50;
  return 0;
}

export function GlobalQuickSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [boards, setBoards] = useState<Board[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<GoalWithDetails[]>([]);
  const [events, setEvents] = useState<CalendarEntry[]>([]);
  const [reviews, setReviews] = useState<ReviewReport[]>([]);
  const [recentItems, setRecentItems] = useState<SearchItem[]>([]);
  const [taskBoardMap, setTaskBoardMap] = useState<Record<string, string>>({});

  const openSearch = useCallback(() => setOpen(true), []);
  const closeSearch = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const primary = event.ctrlKey || event.metaKey;
      if (primary && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openSearch();
        return;
      }
      if (event.key === '/' && !isEditableTarget(event.target)) {
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openSearch]);

  useEffect(() => {
    const openFromEvent = () => openSearch();
    window.addEventListener('ascend:open-quick-search', openFromEvent);
    return () => window.removeEventListener('ascend:open-quick-search', openFromEvent);
  }, [openSearch]);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 30);
    try {
      setRecentItems(JSON.parse(window.localStorage.getItem(RECENT_SEARCH_KEY) || '[]'));
    } catch {
      setRecentItems([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !query.trim()) return;
    let disposed = false;
    const timer = window.setTimeout(() => {
    (async () => {
      const { boardsApi, calendarApi, goalsApi, reviewsApi, tasksApi } = await import('@/api');
      const today = dayjs();
      const [nextBoards, nextTasks, nextGoals, nextEvents, nextReviews] = await Promise.all([
        boardsApi.list(),
        tasksApi.listAll(),
        goalsApi.list(),
        calendarApi.range(today.subtract(30, 'day').format('YYYY-MM-DD'), today.add(120, 'day').format('YYYY-MM-DD')),
        reviewsApi.list(),
      ]);
      if (disposed) return;
      setBoards(nextBoards);
      setTasks(nextTasks);
      setGoals(nextGoals);
      setEvents(nextEvents);
      setReviews(nextReviews);

      const structures = await Promise.allSettled(nextBoards.map((board) => boardsApi.getStructure(board.id)));
      if (disposed) return;
      const nextMap: Record<string, string> = {};
      structures.forEach((result) => {
        if (result.status !== 'fulfilled') return;
        result.value.lists.forEach((list) => {
          list.tasks.forEach((task) => {
            nextMap[task.id] = result.value.board.id;
            task.subtasks.forEach((subtask) => {
              nextMap[subtask.id] = result.value.board.id;
            });
          });
        });
      });
      setTaskBoardMap(nextMap);
    })().catch(() => {});
    }, 180);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  const pageItems = useMemo<SearchItem[]>(() => [
    { id: 'page-overview', kind: 'page', title: t('nav.overview'), subtitle: t('quickSearch.page'), path: '/overview' },
    { id: 'page-boards', kind: 'page', title: t('nav.boards'), subtitle: t('quickSearch.page'), path: '/boards' },
    { id: 'page-goals', kind: 'page', title: t('nav.goals'), subtitle: t('quickSearch.page'), path: '/goals' },
    { id: 'page-calendar', kind: 'page', title: t('nav.calendar'), subtitle: t('quickSearch.page'), path: '/calendar' },
    { id: 'page-pomodoro', kind: 'page', title: t('nav.pomodoro'), subtitle: t('quickSearch.page'), path: '/pomodoro' },
    { id: 'page-settings', kind: 'page', title: t('nav.settings'), subtitle: t('quickSearch.page'), path: '/settings' },
    { id: 'page-profile', kind: 'page', title: t('nav.profile'), subtitle: t('quickSearch.page'), path: '/profile' },
  ], [t]);

  const commandItems = useMemo<SearchItem[]>(() => [
    {
      id: 'command-calendar-settings',
      kind: 'command',
      title: t('quickSearch.calendarSettings', { defaultValue: '日历设置' }),
      subtitle: t('quickSearch.command', { defaultValue: '命令' }),
      path: '/settings?section=calendar',
    },
    {
      id: 'command-data-backup',
      kind: 'command',
      title: t('quickSearch.dataBackup', { defaultValue: '数据备份' }),
      subtitle: t('quickSearch.command', { defaultValue: '命令' }),
      path: '/settings?section=data',
    },
    {
      id: 'command-update',
      kind: 'command',
      title: t('quickSearch.aboutUpdate', { defaultValue: '关于与更新' }),
      subtitle: t('quickSearch.command', { defaultValue: '命令' }),
      path: '/settings?section=about',
    },
    {
      id: 'command-today-calendar',
      kind: 'command',
      title: t('quickSearch.todayCalendar', { defaultValue: '查看今天日历' }),
      subtitle: t('quickSearch.command', { defaultValue: '命令' }),
      path: '/calendar',
    },
  ], [t]);

  const items = useMemo(() => {
    const boardItems = boards.map<SearchItem>((board) => ({
      id: `board-${board.id}`,
      kind: 'board',
      title: board.name,
      subtitle: t('quickSearch.board'),
      path: `/boards/${board.id}`,
    }));
    const taskItems = tasks.map<SearchItem>((task) => {
      const boardId = taskBoardMap[task.id];
      return {
        id: `task-${task.id}`,
        kind: 'task',
        title: task.title,
        subtitle: task.isCompleted ? t('quickSearch.completedTask') : t('quickSearch.task'),
        path: boardId ? `/boards/${boardId}?task=${task.id}` : '/boards',
      };
    });
    const goalItems = goals.map<SearchItem>((goal) => ({
      id: `goal-${goal.id}`,
      kind: 'goal',
      title: goal.title,
      subtitle: t('quickSearch.goal'),
      path: `/goals/${goal.id}`,
    }));
    const keyResultItems = goals.flatMap((goal) => goal.keyResults.map<SearchItem>((keyResult: KeyResult) => ({
      id: `kr-${keyResult.id}`,
      kind: 'keyResult',
      title: keyResult.title,
      subtitle: `${t('quickSearch.keyResult')} · ${goal.title}`,
      path: `/goals/${goal.id}`,
    })));
    const eventItems = events.map<SearchItem>((event) => ({
      id: `event-${event.id}`,
      kind: 'event',
      title: event.title,
      subtitle: `${t('quickSearch.event')} · ${event.date}${event.time ? ` ${event.time}` : ''}`,
      path: '/calendar',
    }));
    const reviewItems = reviews.map<SearchItem>((review) => ({
      id: `review-${review.id}`,
      kind: 'review',
      title: `${t('quickSearch.review')} · ${review.periodStart}`,
      subtitle: [review.highlights, review.nextActions, review.lessons].map((item) => item.trim()).find(Boolean) || t('quickSearch.review'),
      path: '/overview',
    }));
    const recent = query.trim()
      ? []
      : recentItems.map((item) => ({ ...item, subtitle: `${t('quickSearch.recent')} · ${item.subtitle}` }));

    return [...recent, ...commandItems, ...pageItems, ...boardItems, ...taskItems, ...goalItems, ...keyResultItems, ...eventItems, ...reviewItems]
      .map((item, index) => ({
        item,
        score: scoreItem(item, query) + (!query.trim() && index < recent.length ? 20 : 0),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
      .slice(0, 12)
      .map(({ item }) => item);
  }, [boards, commandItems, events, goals, pageItems, query, recentItems, reviews, t, taskBoardMap, tasks]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const openItem = useCallback((item: SearchItem | undefined) => {
    if (!item) return;
    try {
      const nextRecent = [item, ...recentItems.filter((recent) => recent.id !== item.id)].slice(0, 6);
      window.localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(nextRecent));
      setRecentItems(nextRecent);
    } catch {
      /* recent items are optional */
    }
    navigate(item.path);
    closeSearch();
  }, [closeSearch, navigate, recentItems]);

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, Math.max(items.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      openItem(items[activeIndex]);
    }
  };

  return (
    <Modal open={open} onClose={closeSearch} size="lg" closeOnBackdrop>
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <Search size={17} className="text-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={t('quickSearch.placeholder')}
            className="w-full bg-transparent outline-none text-sm"
          />
          <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-text-muted">Esc</kbd>
        </div>

        <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-border bg-surface">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-muted">{t('quickSearch.empty')}</div>
          ) : items.map((item, index) => (
            <button
              key={item.id}
              onClick={() => openItem(item)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-border last:border-b-0 ${
                index === activeIndex ? 'bg-primary/10 text-primary' : 'hover:bg-surface-2'
              }`}
            >
              <span className="h-8 w-8 rounded-lg bg-surface-2 flex items-center justify-center text-text-muted">
                {item.kind === 'page' && item.path === '/calendar' ? <CalendarDays size={15} /> :
                  item.kind === 'page' && item.path === '/pomodoro' ? <Timer size={15} /> :
                    item.kind === 'page' && item.path === '/settings' ? <Settings size={15} /> :
                      item.kind === 'page' && item.path === '/profile' ? <User size={15} /> :
                        item.id === 'command-data-backup' ? <DatabaseBackup size={15} /> :
                        PAGE_ICON[item.kind]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.title}</span>
                <span className="block truncate text-xs text-text-muted">{item.subtitle}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
