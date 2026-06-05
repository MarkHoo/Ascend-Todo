import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Plus, Pin, PinOff, Trash2, Calendar as CalIcon, Bell, Check, X,
  ChevronRight, Type, FileText, Bold, Italic, Underline, Heading1, Heading2,
  List as ListIcon, ListOrdered, Link as LinkIcon, Code, Quote, Minus,
} from 'lucide-react';
import { marked } from 'marked';
import {
  DndContext, closestCorners, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useBoardStore } from '@/store/useBoardStore';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { DeleteConfirmModal } from '@/components/common/DeleteConfirmModal';
import { Input } from '@/components/common/Input';
import { DateTimePicker } from '@/components/common/DateTimePicker';
import { TimePicker } from '@/components/common/DateTimePicker';
import { ColorPicker } from '@/components/common/ColorPicker';
import { toast } from '@/components/common/Toast';
import { dayjs } from '@/utils/date';
import type { ListWithTasks, TaskWithSubtasks } from '@/types';

// ============ Constants ============

type TaskStatus = 'not_started' | 'in_progress' | 'long_term' | 'completed' | 'closed';
type TaskPriority = 'normal' | 'lowest' | 'lower' | 'higher' | 'highest';

const STATUS_OPTIONS: TaskStatus[] = ['not_started', 'in_progress', 'long_term', 'completed', 'closed'];
const PRIORITY_OPTIONS: (TaskPriority | 'none')[] = ['none', 'normal', 'lowest', 'lower', 'higher', 'highest'];

const STATUS_COLORS: Record<TaskStatus, string> = {
  not_started: 'var(--text-muted)', in_progress: '#3b82f6', long_term: '#f59e0b',
  completed: '#22c55e', closed: '#ef4444',
};
const PRIORITY_COLORS: Record<string, string> = {
  highest: '#ef4444', higher: '#f59e0b', normal: 'var(--text-muted)',
  lower: '#3b82f6', lowest: '#9ca3af',
};

const MAX_NESTING = 5;

function fmtTaskDueDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = dayjs(iso);
  return d.year() === dayjs().year() ? d.format('MM-DD') : d.format('YYYY-MM-DD');
}

function statusLabel(s: TaskStatus, t: (k: string) => string) {
  const m: Record<TaskStatus, string> = {
    not_started: t('board.statusNotStarted'), in_progress: t('board.statusInProgress'),
    long_term: t('board.statusLongTerm'), completed: t('board.statusCompleted'), closed: t('board.statusClosed'),
  };
  return m[s] || s;
}
function priorityLabel(p: string | null | undefined, t: (k: string) => string) {
  if (!p) return '';
  const m: Record<string, string> = {
    normal: t('board.priorityNormal'), lowest: t('board.priorityLowest'),
    lower: t('board.priorityLower'), higher: t('board.priorityHigher'), highest: t('board.priorityHighest'),
  };
  return m[p] || p;
}
function fmtDateTime(iso: string | undefined, lang: string): string {
  if (!iso) return '';
  const d = dayjs(iso);
  return (lang === 'zh-CN' || lang === 'zh-TW') ? d.format('YYYY年M月D日 HH:mm') : d.format('MMM D, YYYY HH:mm');
}

// Configure marked (v15 compatible)
try { marked.use({ breaks: true, gfm: true }); } catch { /* fallback */ }

function decorateCodeBlocks(html: string): string {
  return html.replace(
    /<pre><code( class="language-([^"]+)")?>([\s\S]*?)<\/code><\/pre>/g,
    (_match, classAttr = '', lang = '', code = '') => {
      const normalized = code.endsWith('\n') ? code.slice(0, -1) : code;
      const lines: string[] = normalized.split('\n');
      const numbered = lines.map((line: string, index: number) => (
        `<span class="md-code-line"><span class="md-code-number">${index + 1}</span><span class="md-code-text">${line || ' '}</span></span>`
      )).join('');
      const language = lang ? `<div class="md-code-lang">${lang}</div>` : '';
      return `<div class="md-codeblock">${language}<pre><code${classAttr}>${numbered}</code></pre></div>`;
    },
  );
}

function renderMarkdown(md: string): string {
  try {
    const result = marked.parse(md);
    return typeof result === 'string' ? decorateCodeBlocks(result) : '';
  } catch { return md; }
}

// ============ Auto-save debounce hook ============

function useAutoSave<T extends Record<string, any>>(
  draft: T, original: T, onSave: (patch: Partial<T>) => Promise<void>, delay = 800,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  const originalRef = useRef(original);
  const onSaveRef = useRef(onSave);
  draftRef.current = draft;
  originalRef.current = original;
  onSaveRef.current = onSave;

  // Use serialized key to detect actual content changes (stable across re-renders with same data)
  const draftKey = JSON.stringify(draft, (_, v) => v === undefined ? null : v);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const d = draftRef.current;
      const o = originalRef.current;
      const patch: Record<string, any> = {};
      for (const key of Object.keys(d)) {
        if (key.startsWith('_')) continue;
        if (d[key] !== (o as any)[key]) patch[key] = d[key];
      }
      if (Object.keys(patch).length > 0) {
        await onSaveRef.current(patch as Partial<T>);
      }
    }, delay);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [draftKey, delay]);
}

// ============ Toolbar Button ============

function ToolbarBtn({ active, onClick, title, children }: {
  active?: boolean; onClick: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <button
      className={`p-1.5 rounded border transition-colors ${active ? 'bg-primary text-white border-primary shadow-sm' : 'border-transparent text-text-muted hover:bg-surface-2 hover:text-text'}`}
      onClick={onClick} title={title} onMouseDown={(e) => e.preventDefault()}
    >{children}</button>
  );
}

// ============ Main Page ============

export function BoardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { currentBoard, fetchBoard, createList, togglePin, deleteList, deleteTask,
    reorderLists, moveTask, createTask, getTask, updateTask } = useBoardStore();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'list' | 'task' | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editListName, setEditListName] = useState('');
  const [taskStack, setTaskStack] = useState<{ task: TaskWithSubtasks; depth: number }[]>([]);
  const taskStackRef = useRef(taskStack);
  taskStackRef.current = taskStack;
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; onConfirm: () => void; message?: string }>({
    open: false, onConfirm: () => {},
  });
  const lang = i18n.language;

  useEffect(() => { if (id) fetchBoard(id); }, [id, fetchBoard]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // ALL hooks must be BEFORE any early returns (Rules of Hooks)
  const refreshAllModals = useCallback(async () => {
    const current = taskStackRef.current;
    if (current.length === 0) return;
    const newStack: typeof current = [];
    for (const entry of current) {
      try {
        const fresh = await getTask(entry.task.id);
        newStack.push({ task: fresh, depth: entry.depth });
      } catch {
        newStack.push(entry);
      }
    }
    setTaskStack(newStack);
  }, [getTask]);

  // Early returns AFTER all hooks
  if (!id) return null;
  if (!currentBoard || currentBoard.board.id !== id) {
    return <div className="p-6 text-text-muted">{t('common.loading')}</div>;
  }
  const { board, lists } = currentBoard;

  const openTaskDetail = async (task: TaskWithSubtasks, depth = 0) => {
    if (depth >= MAX_NESTING) { toast.error(t('board.maxDepth') || 'Max nesting depth reached'); return; }
    try {
      const fresh = await getTask(task.id);
      setTaskStack((prev) => {
        const truncated = prev.filter((s) => s.depth < depth);
        return [...truncated, { task: fresh, depth }];
      });
    } catch {
      setTaskStack((prev) => {
        const truncated = prev.filter((s) => s.depth < depth);
        return [...truncated, { task, depth }];
      });
    }
  };

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setActiveType((e.active.data.current?.type as 'list' | 'task') || 'task');
  };
  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null); setActiveType(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const aType = active.data.current?.type as 'list' | 'task';
    if (aType === 'list') {
      const oldIndex = lists.findIndex((l) => l.list.id === active.id);
      const newIndex = lists.findIndex((l) => l.list.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const newOrder = [...lists];
      const [moved] = newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, moved);
      await reorderLists(board.id, newOrder.map((x) => x.list.id));
    } else {
      const oData = over.data.current as { listId: string; index: number } | undefined;
      let targetListId = oData?.listId;
      let targetIndex = oData?.index;
      if (!targetListId) {
        targetListId = String(over.id);
        const lst = lists.find((l) => l.list.id === targetListId);
        targetIndex = lst ? lst.tasks.length : 0;
      }
      await moveTask(String(active.id), targetListId, targetIndex ?? 0);
    }
  };

  const activeList = activeType === 'list' ? lists.find((l) => l.list.id === activeId) : null;
  const activeTask = activeType === 'task' ? lists.flatMap((l) => l.tasks).find((t) => t.id === activeId) : null;

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-3 border-b border-border flex items-center gap-3" style={{ background: 'var(--surface)' }}>
        <button className="btn-ghost p-1" onClick={() => navigate('/boards')}>
          <ArrowLeft size={18} />
        </button>
        <div className="w-3 h-6 rounded-full" style={{ background: board.color || 'var(--primary)' }} />
        <div>
          <h1 className="text-lg font-semibold">{board.name}</h1>
          {board.description && <div className="text-xs text-text-muted">{board.description}</div>}
        </div>
        <button onClick={() => togglePin(board.id)} className="btn-ghost ml-2"
          title={board.isPinned ? t('board.unpin') : t('board.pin')}>
          {board.isPinned ? <PinOff size={16} /> : <Pin size={16} />}
        </button>
      </div>

      <div className="flex-1 overflow-x-auto p-4">
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <SortableContext items={lists.map((l) => l.list.id)} strategy={verticalListSortingStrategy}>
            <div className="flex gap-3 items-start">
              {lists.map((l, idx) => (
                <SortableListColumn
                  key={l.list.id} list={l} index={idx}
                  editingListId={editingListId} editListName={editListName} setEditListName={setEditListName}
                  onStartRenameList={(listId, name) => { setEditingListId(listId); setEditListName(name); }}
                  onConfirmRenameList={async () => {
                    if (editingListId && editListName.trim()) {
                      await useBoardStore.getState().renameList(editingListId, editListName.trim());
                      setEditingListId(null);
                    }
                  }}
                  onCancelRenameList={() => setEditingListId(null)}
                  onAddTask={async (title) => { await createTask(l.list.id, title); }}
                  onToggleTask={(taskId) => useBoardStore.getState().toggleTask(taskId)}
                  onDeleteTask={(taskId) => setDeleteConfirm({ open: true, message: t('board.deleteConfirm'), onConfirm: () => deleteTask(taskId) })}
                  selectedTaskId={selectedTaskId}
                  onViewTask={(taskId) => setSelectedTaskId(taskId)}
                  onEditTask={(task) => openTaskDetail(task, 0)}
                  onDeleteList={() => setDeleteConfirm({ open: true, message: t('goal.deleteConfirm'), onConfirm: () => deleteList(l.list.id) })}
                />
              ))}
              <div className="w-72 shrink-0">
                <div className="card p-2 flex items-center gap-2">
                  <Input value={newListName} onChange={(e) => setNewListName(e.target.value)}
                    placeholder={t('board.addList').replace('+ ', '')}
                    onKeyDown={async (e) => { if (e.key === 'Enter' && newListName.trim()) { await createList(board.id, newListName.trim()); setNewListName(''); } }}
                    className="border-0 bg-transparent" />
                  <Button size="sm" variant="ghost" onClick={async () => { if (newListName.trim()) { await createList(board.id, newListName.trim()); setNewListName(''); } }}>
                    <Plus size={14} />
                  </Button>
                </div>
              </div>
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={{ duration: 250, easing: 'cubic-bezier(0.18, 1, 0.22, 1)' }}>
            {activeList && <div className="card p-3 w-72 shadow-2xl" style={{ transform: 'rotate(3deg) scale(1.02)', opacity: 0.85 }}>
              <div className="font-semibold">{activeList.list.name}</div>
              <div className="text-xs text-text-muted">{activeList.tasks.length} tasks</div>
            </div>}
            {activeTask && <div className="card p-3 w-72 shadow-2xl" style={{ transform: 'rotate(2deg) scale(1.02)', opacity: 0.85 }}>
              <TaskCardContent task={activeTask} />
            </div>}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Task Detail Modals (stacked for nesting) */}
      {taskStack.map((entry, idx) => (
        <TaskDetailModal
          key={entry.task.id}
          task={entry.task}
          depth={entry.depth}
          parentPath={taskStack.slice(0, idx).map((s) => ({ id: s.task.id, title: s.task.title }))}
          onClose={() => setTaskStack((prev) => prev.filter((_, i) => i < idx))}
          onNavigateToDepth={(targetDepth) => setTaskStack((prev) => prev.filter((_, i) => i <= targetDepth))}
          onOpenChild={(child, d) => openTaskDetail(child, d)}
          onDelete={(taskId) => setDeleteConfirm({
            open: true, message: t('board.deleteConfirm'),
            onConfirm: async () => {
              await deleteTask(taskId);
              setTaskStack((prev) => prev.filter((s) => s.task.id !== taskId));
            },
          })}
          onRefresh={refreshAllModals}
        />
      ))}

      <DeleteConfirmModal
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ ...deleteConfirm, open: false })}
        onConfirm={deleteConfirm.onConfirm}
        message={deleteConfirm.message}
      />
    </div>
  );
}

// ============ Task Detail Modal ============

function TaskDetailModal({
  task, depth, parentPath, onClose, onNavigateToDepth, onOpenChild, onDelete, onRefresh,
}: {
  task: TaskWithSubtasks;
  depth: number;
  parentPath: { id: string; title: string }[];
  onClose: () => void;
  onNavigateToDepth: (depth: number) => void;
  onOpenChild: (task: TaskWithSubtasks, depth: number) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { updateTask, createTask, toggleTask } = useBoardStore();
  const lang = i18n.language;

  const [draft, setDraft] = useState({
    title: task.title, description: task.description || '', dueAt: task.dueAt,
    reminderTime: task.reminderTime, color: task.color, status: task.status,
    priority: task.priority, startAt: task.startAt,
  });
  const [detailTab, setDetailTab] = useState<'info' | 'subtask'>('info');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(task.description || '');
  const [descMode, setDescMode] = useState<'richtext' | 'markdown'>('markdown');
  const descEditorRef = useRef<HTMLDivElement>(null);
  const mdTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [newSubtask, setNewSubtask] = useState('');
  const [rtActiveStates, setRtActiveStates] = useState<Record<string, boolean>>({});
  const canHaveSubtasks = depth < MAX_NESTING - 1;

  // Sync draft when task changes
  useEffect(() => {
    setDraft({
      title: task.title, description: task.description || '', dueAt: task.dueAt,
      reminderTime: task.reminderTime, color: task.color, status: task.status,
      priority: task.priority, startAt: task.startAt,
    });
  }, [task.id, task.title, task.description, task.dueAt, task.reminderTime, task.color, task.status, task.priority, task.startAt]);

  useEffect(() => {
    if (!canHaveSubtasks && detailTab === 'subtask') {
      setDetailTab('info');
    }
  }, [canHaveSubtasks, detailTab]);

  // Auto-save
  useAutoSave(
    { ...draft, _skip: true } as any,
    { ...task, description: task.description || '', _skip: true } as any,
    async (patch) => {
      await updateTask(task.id, patch as any);
      onRefresh();
    },
  );

  const handleSaveDescription = async () => {
    const newDesc = descMode === 'richtext'
      ? (descEditorRef.current?.innerHTML || '')
      : descDraft;
    if (newDesc !== (task.description || '')) {
      await updateTask(task.id, { description: newDesc });
      setDraft((d) => ({ ...d, description: newDesc }));
      await onRefresh();
      toast.success(t('board.save'));
    }
    setIsEditingDesc(false);
  };

  const startEditingDesc = () => {
    const desc = task.description || '';
    setDescDraft(desc);
    setIsEditingDesc(true);
  };

  useEffect(() => {
    if (!isEditingDesc) return;
    requestAnimationFrame(() => {
      if (descMode === 'markdown') {
        const ta = mdTextareaRef.current;
        ta?.focus();
        const pos = ta?.value.length ?? 0;
        ta?.setSelectionRange(pos, pos);
        ta?.scrollTo({ top: ta.scrollHeight });
      } else if (descEditorRef.current) {
        descEditorRef.current.innerHTML = descDraft;
        descEditorRef.current.focus();
      }
    });
  }, [isEditingDesc, descMode]);

  // ============ Rich Text commands ============
  const execCmd = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    descEditorRef.current?.focus();
    updateRtStates();
  };

  const updateRtStates = () => {
    setRtActiveStates({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
    });
  };

  const handleRtKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '   ');
    }
  };

  // ============ Markdown helpers ============
  const replaceMdRange = (
    ta: HTMLTextAreaElement,
    start: number,
    end: number,
    text: string,
    cursorOffset = text.length,
  ) => {
    const scrollTop = ta.scrollTop;
    const newText = descDraft.substring(0, start) + text + descDraft.substring(end);
    setDescDraft(newText);
    requestAnimationFrame(() => {
      ta.focus();
      ta.scrollTop = scrollTop;
      const next = start + cursorOffset;
      ta.setSelectionRange(next, next);
    });
  };

  const insertMd = (before: string, after = '') => {
    const ta = mdTextareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = descDraft.substring(start, end);
    const inserted = before + selected + after;
    const cursorOffset = before === '```\n' ? before.length : before.length + selected.length;
    replaceMdRange(ta, start, end, inserted, cursorOffset);
  };

  const handleMdKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      replaceMdRange(ta, start, end, '  ');
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const lineStart = descDraft.lastIndexOf('\n', start - 1) + 1;
      const currentLine = descDraft.substring(lineStart, start);

      const olMatch = currentLine.match(/^(\s*)(\d+)\.\s(.*)$/);
      const ulMatch = currentLine.match(/^(\s*)([-*+])\s(.*)$/);
      const quoteMatch = currentLine.match(/^(\s*)>\s?(.*)$/);
      const headingMatch = currentLine.match(/^(#{1,6})\s*$/);

      let insert = '\n';
      if (olMatch) {
        const [, indent, number, rest] = olMatch;
        if (rest.trim() === '') {
          replaceMdRange(ta, lineStart, start, '');
          return;
        }
        insert = `\n${indent}${parseInt(number, 10) + 1}. `;
      } else if (ulMatch) {
        const [, indent, marker, rest] = ulMatch;
        if (rest.trim() === '') {
          replaceMdRange(ta, lineStart, start, '');
          return;
        }
        insert = `\n${indent}${marker} `;
      } else if (quoteMatch) {
        const [, indent, rest] = quoteMatch;
        insert = rest.trim() ? `\n${indent}> ` : '\n';
      } else if (headingMatch) {
        insert = '\n\n';
      }

      replaceMdRange(ta, start, end, insert);
    }
  };

  const setEditorMode = (mode: 'richtext' | 'markdown') => {
    if (mode === descMode) return;
    if (descMode === 'richtext' && descEditorRef.current) {
      setDescDraft(descEditorRef.current.innerHTML);
    }
    setDescMode(mode);
  };

  const descHtml = task.description || '';
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(descHtml);

  return (
    <Modal open={true} onClose={onClose} title={t('board.taskDetail')} size="xl">
      <div className="space-y-3">
        {/* Parent task path breadcrumb */}
        {parentPath.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-text-muted flex-wrap bg-surface-2/30 rounded-lg px-3 py-2">
            <span className="font-medium">{t('board.parentTaskLabel')}:</span>
            {parentPath.map((p, i) => (
              <span key={p.id} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={10} className="text-text-muted/50" />}
                <button className="text-primary hover:underline truncate max-w-[120px]"
                  onClick={() => onNavigateToDepth(i)}>{p.title}</button>
              </span>
            ))}
            <ChevronRight size={10} className="text-text-muted/50" />
            <span className="text-text font-medium truncate max-w-[120px]">{task.title}</span>
          </div>
        )}

        {/* Title */}
        <Input label={t('board.taskTitle')} value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus />

        {/* Status / Priority / Start / Due */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="label">{t('board.currentStatus')}</label>
            <select className="input w-full" value={draft.status || 'not_started'}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as TaskStatus })}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{statusLabel(s, t)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('board.currentPriority')}</label>
            <select className="input w-full" value={draft.priority || 'none'}
              onChange={(e) => { const v = e.target.value; setDraft({ ...draft, priority: v === 'none' ? null : v as TaskPriority }); }}>
              {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p === 'none' ? t('board.priorityNone') : priorityLabel(p, t)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('board.startAt')}</label>
            <DateTimePicker value={draft.startAt} onChange={(v) => setDraft({ ...draft, startAt: v })} placeholder={t('board.startAt')} pickerId={`start-${task.id}-${depth}`} />
          </div>
          <div>
            <label className="label">{t('board.dueDate')}</label>
            <DateTimePicker value={draft.dueAt} onChange={(v) => setDraft({ ...draft, dueAt: v })} placeholder={t('board.dueDate')} pickerId={`due-${task.id}-${depth}`} />
          </div>
        </div>

        {/* Label Color & Reminder */}
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="label">{t('board.labelColor')}</label>
            <ColorPicker value={draft.color} onChange={(v) => setDraft({ ...draft, color: v })} />
          </div>
          <div>
            <label className="label">{t('board.taskReminder')}</label>
            <TimePicker value={draft.reminderTime} onChange={(v) => setDraft({ ...draft, reminderTime: v })} />
          </div>
          {draft.reminderTime && (
            <span className="flex items-center gap-1 text-xs text-text-muted pb-0.5">
              <Bell size={12} />{draft.reminderTime}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border pb-1">
          <button className={`px-3 py-1.5 text-sm font-medium rounded-t transition-colors ${detailTab === 'info' ? 'bg-primary/10 text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'}`}
            onClick={() => setDetailTab('info')}>{t('board.taskInfo')}</button>
          {canHaveSubtasks && (
            <button className={`px-3 py-1.5 text-sm font-medium rounded-t transition-colors ${detailTab === 'subtask' ? 'bg-primary/10 text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'}`}
              onClick={() => setDetailTab('subtask')}>{t('board.subtask')} {task.subtasks.length > 0 && `(${task.subtasks.length})`}</button>
          )}
        </div>

        {/* Tab content */}
        {detailTab === 'info' ? (
          <div className="space-y-3">
            <div>
              <label className="label">{t('board.taskDescription')}</label>
              {isEditingDesc ? (
                <div className="space-y-2">
                  {/* Mode toggle */}
                  <div className="flex items-center gap-1">
                    <button className={`text-xs px-2 py-1 rounded-l-md border ${descMode === 'richtext' ? 'bg-primary text-white border-primary shadow-sm' : 'border-border bg-surface-2/30 text-text-muted hover:text-text'}`}
                      onClick={() => setEditorMode('richtext')}><Type size={12} className="inline mr-1" />{t('board.richTextMode')}</button>
                    <button className={`text-xs px-2 py-1 rounded-r-md border border-l-0 ${descMode === 'markdown' ? 'bg-primary text-white border-primary shadow-sm' : 'border-border bg-surface-2/30 text-text-muted hover:text-text'}`}
                      onClick={() => setEditorMode('markdown')}><FileText size={12} className="inline mr-1" />{t('board.markdownMode')}</button>
                  </div>

                  {/* Editor container — toolbar + content as one visual unit */}
                  <div className="rounded-lg border border-border overflow-hidden">
                    {/* Toolbar */}
                    <div className="flex items-center gap-0.5 flex-wrap px-2 py-1 border-b border-border bg-surface-2/40">
                      {descMode === 'richtext' ? (
                        <>
                          <ToolbarBtn active={rtActiveStates.bold} onClick={() => execCmd('bold')} title="Bold"><Bold size={14} /></ToolbarBtn>
                          <ToolbarBtn active={rtActiveStates.italic} onClick={() => execCmd('italic')} title="Italic"><Italic size={14} /></ToolbarBtn>
                          <ToolbarBtn active={rtActiveStates.underline} onClick={() => execCmd('underline')} title="Underline"><Underline size={14} /></ToolbarBtn>
                          <div className="w-px h-4 bg-border mx-0.5" />
                          <ToolbarBtn onClick={() => execCmd('formatBlock', 'h1')} title="H1"><Heading1 size={14} /></ToolbarBtn>
                          <ToolbarBtn onClick={() => execCmd('formatBlock', 'h2')} title="H2"><Heading2 size={14} /></ToolbarBtn>
                          <div className="w-px h-4 bg-border mx-0.5" />
                          <ToolbarBtn active={rtActiveStates.insertUnorderedList} onClick={() => execCmd('insertUnorderedList')} title="Bullet List"><ListIcon size={14} /></ToolbarBtn>
                          <ToolbarBtn active={rtActiveStates.insertOrderedList} onClick={() => execCmd('insertOrderedList')} title="Numbered List"><ListOrdered size={14} /></ToolbarBtn>
                          <div className="w-px h-4 bg-border mx-0.5" />
                          <ToolbarBtn onClick={() => { const url = prompt('URL:'); if (url) execCmd('createLink', url); }} title="Link"><LinkIcon size={14} /></ToolbarBtn>
                          <ToolbarBtn onClick={() => execCmd('formatBlock', 'blockquote')} title="Quote"><Quote size={14} /></ToolbarBtn>
                          <ToolbarBtn onClick={() => execCmd('formatBlock', 'pre')} title="Code"><Code size={14} /></ToolbarBtn>
                        </>
                      ) : (
                        <>
                          <ToolbarBtn onClick={() => insertMd('**', '**')} title="Bold"><Bold size={14} /></ToolbarBtn>
                          <ToolbarBtn onClick={() => insertMd('*', '*')} title="Italic"><Italic size={14} /></ToolbarBtn>
                          <ToolbarBtn onClick={() => insertMd('~~', '~~')} title="Strikethrough"><Minus size={14} /></ToolbarBtn>
                          <div className="w-px h-4 bg-border mx-0.5" />
                          <ToolbarBtn onClick={() => insertMd('# ')} title="H1"><span className="text-xs font-bold">H1</span></ToolbarBtn>
                          <ToolbarBtn onClick={() => insertMd('## ')} title="H2"><span className="text-xs font-bold">H2</span></ToolbarBtn>
                          <ToolbarBtn onClick={() => insertMd('### ')} title="H3"><span className="text-xs font-bold">H3</span></ToolbarBtn>
                          <div className="w-px h-4 bg-border mx-0.5" />
                          <ToolbarBtn onClick={() => insertMd('- ')} title="Bullet List"><ListIcon size={14} /></ToolbarBtn>
                          <ToolbarBtn onClick={() => insertMd('1. ')} title="Ordered List"><ListOrdered size={14} /></ToolbarBtn>
                          <div className="w-px h-4 bg-border mx-0.5" />
                          <ToolbarBtn onClick={() => insertMd('[', '](url)')} title="Link"><LinkIcon size={14} /></ToolbarBtn>
                          <ToolbarBtn onClick={() => insertMd('> ')} title="Quote"><Quote size={14} /></ToolbarBtn>
                          <ToolbarBtn onClick={() => insertMd('`', '`')} title="Inline Code"><Code size={14} /></ToolbarBtn>
                          <ToolbarBtn onClick={() => insertMd('```\n', '\n```')} title="Code Block"><span className="text-[10px] font-mono">```</span></ToolbarBtn>
                        </>
                      )}
                    </div>
                    {/* Editor area */}
                    {descMode === 'richtext' ? (
                      <div ref={descEditorRef} contentEditable suppressContentEditableWarning
                        className="p-4 min-h-[250px] max-h-[50vh] overflow-y-auto text-sm outline-none prose prose-sm max-w-none"
                        style={{ background: 'var(--surface-2)' }}
                        onInput={(e) => setDescDraft((e.target as HTMLDivElement).innerHTML)}
                        onKeyDown={handleRtKeyDown}
                        onSelect={updateRtStates}
                        onClick={updateRtStates} />
                    ) : (
                      <textarea ref={mdTextareaRef}
                        className="w-full min-h-[250px] max-h-[50vh] overflow-y-auto p-4 text-sm font-mono outline-none resize-none"
                        style={{ background: 'var(--surface-2)', fontFamily: 'ui-monospace, monospace' }}
                        value={descDraft}
                        onChange={(e) => setDescDraft(e.target.value)}
                        onKeyDown={handleMdKeyDown}
                        placeholder="## Markdown supported..."
                      />
                    )}
                  </div>

                  <div className="flex items-center gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setIsEditingDesc(false)}>{t('common.cancel')}</Button>
                    <Button variant="primary" size="sm" onClick={handleSaveDescription}>{t('board.save')}</Button>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg border border-border bg-surface-2/50 min-h-[120px] max-h-[50vh] overflow-y-auto text-sm cursor-pointer hover:border-primary/50 transition-colors prose prose-sm max-w-none"
                  onDoubleClick={startEditingDesc}>
                  {hasHtmlTags
                    ? <div dangerouslySetInnerHTML={{ __html: descHtml }} />
                    : descHtml
                      ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(descHtml) }} />
                      : <span className="text-text-muted italic">{t('board.descPlaceholder')}</span>
                  }
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {task.subtasks.length === 0 && (
              <div className="text-sm text-text-muted text-center py-4">{t('board.noSubtasks')}</div>
            )}
            {task.subtasks.map((s) => (
              <SubtaskCard key={s.id} subtask={s}
                onToggle={async () => { await toggleTask(s.id); onRefresh(); }}
                onDelete={() => onDelete(s.id)}
                onClick={() => onOpenChild(s, depth + 1)} />
            ))}
            <div className="flex items-center gap-2 mt-2">
              <Input value={newSubtask} onChange={(e) => setNewSubtask(e.target.value)}
                placeholder={t('board.addSubtask').replace('+ ', '')}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && newSubtask.trim()) {
                    await createTask(task.listId, newSubtask.trim(), task.id);
                    setNewSubtask('');
                    onRefresh();
                  }
                }}
                className="flex-1" />
              <Button size="sm" onClick={async () => {
                if (newSubtask.trim()) {
                  await createTask(task.listId, newSubtask.trim(), task.id);
                  setNewSubtask('');
                  onRefresh();
                }
              }}><Plus size={14} /></Button>
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div className="flex items-center gap-4 text-xs text-text-muted pt-2 border-t border-border">
          <span>{t('board.createdAt')} {fmtDateTime(task.createdAt, lang)}</span>
          <span>|</span>
          <span>{t('board.updatedAt')} {fmtDateTime(task.updatedAt, lang)}</span>
          {task.completedAt && <><span>|</span><span>{t('board.completed')} {fmtDateTime(task.completedAt, lang)}</span></>}
        </div>
      </div>
    </Modal>
  );
}

// ============ Task Card Content ============

function TaskCardContent({ task }: { task: TaskWithSubtasks }) {
  const { t } = useTranslation();
  const status = (task.status || 'not_started') as TaskStatus;
  return (
    <div className="flex items-start gap-2">
      <div className="w-1 h-10 rounded-full shrink-0 mt-0.5" style={{ background: task.color || 'var(--border)' }} />
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${task.isCompleted ? 'line-through text-text-muted' : ''}`}>{task.title}</div>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full font-medium text-white"
            style={{ background: STATUS_COLORS[status] || 'var(--text-muted)' }}>{statusLabel(status, t)}</span>
          {task.priority && <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            style={{ background: PRIORITY_COLORS[task.priority] ? `${PRIORITY_COLORS[task.priority]}20` : 'var(--surface-2)', color: PRIORITY_COLORS[task.priority] || 'var(--text-muted)' }}>
            {priorityLabel(task.priority, t)}</span>}
          {task.dueAt && <span className="flex items-center gap-0.5 text-[10px] text-text-muted"><CalIcon size={9} />{fmtTaskDueDate(task.dueAt)}</span>}
        </div>
      </div>
    </div>
  );
}

// ============ Sortable List Column ============

function SortableListColumn({ list, index, editingListId, editListName, setEditListName,
  onStartRenameList, onConfirmRenameList, onCancelRenameList,
  onAddTask, onToggleTask, onDeleteTask, selectedTaskId, onViewTask, onEditTask, onDeleteList }: {
  list: ListWithTasks; index: number; editingListId: string | null; editListName: string;
  setEditListName: (v: string) => void; onStartRenameList: (id: string, name: string) => void;
  onConfirmRenameList: () => void; onCancelRenameList: () => void;
  onAddTask: (title: string) => Promise<void>; onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void; selectedTaskId: string | null; onViewTask: (id: string) => void;
  onEditTask: (t: TaskWithSubtasks) => void; onDeleteList: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.list.id, data: { type: 'list', index },
  });
  const [newTask, setNewTask] = useState('');
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1), opacity 200ms ease',
    opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 50 : 'auto' as const,
  };

  return (
    <div ref={setNodeRef} style={style} className="w-72 shrink-0">
      <div className="card p-3 flex flex-col gap-2 max-h-[calc(100vh-180px)]">
        <div className="flex items-center gap-2" {...attributes} {...listeners}>
          {editingListId === list.list.id ? (
            <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
              <input className="input py-0.5 px-1 text-sm flex-1" value={editListName}
                onChange={(e) => setEditListName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onConfirmRenameList(); if (e.key === 'Escape') onCancelRenameList(); }}
                autoFocus />
              <button className="btn-ghost p-0.5" onClick={onConfirmRenameList}><Check size={14} className="text-green-500" /></button>
              <button className="btn-ghost p-0.5" onClick={onCancelRenameList}><X size={14} className="text-text-muted" /></button>
            </div>
          ) : (
            <>
              <h3 className="font-semibold text-sm flex-1 truncate cursor-grab"
                onDoubleClick={(e) => { e.stopPropagation(); onStartRenameList(list.list.id, list.list.name); }}
                title={t('board.renameList')}>{list.list.name}</h3>
              <span className="text-xs text-text-muted">{list.tasks.length}</span>
              <button onClick={(e) => { e.stopPropagation(); onDeleteList(); }} className="btn-ghost p-0.5"><Trash2 size={12} /></button>
            </>
          )}
        </div>
        <SortableContext items={list.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1.5 overflow-y-auto pr-1" data-list-id={list.list.id}>
            {list.tasks.map((task, idx) => (
              <SortableTaskCard key={task.id} task={task} index={idx}
                onToggle={() => onToggleTask(task.id)} onDelete={() => onDeleteTask(task.id)}
                isSelected={selectedTaskId === task.id}
                onView={() => onViewTask(task.id)}
                onEdit={() => onEditTask(task)} />
            ))}
          </div>
        </SortableContext>
        <div className="flex items-center gap-1.5 pt-1 border-t border-border">
          <input className="bg-transparent flex-1 text-sm outline-none px-1 py-1" value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder={t('board.addTask').replace('+ ', '')}
            onKeyDown={async (e) => { if (e.key === 'Enter' && newTask.trim()) { await onAddTask(newTask.trim()); setNewTask(''); } }} />
          <button onClick={async () => { if (newTask.trim()) { await onAddTask(newTask.trim()); setNewTask(''); } }} className="btn-ghost p-1"><Plus size={14} /></button>
        </div>
      </div>
    </div>
  );
}

// ============ Sortable Task Card ============

function SortableTaskCard({ task, index, isSelected, onToggle, onDelete, onView, onEdit }: {
  task: TaskWithSubtasks; index: number; isSelected: boolean; onToggle: () => void; onDelete: () => void;
  onView: () => void; onEdit: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id, data: { type: 'task', listId: task.listId, index },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1), opacity 200ms ease',
    opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 50 : 'auto' as const,
  };

  return (
    <div ref={setNodeRef} style={style}
      className={`rounded-lg p-2.5 border group cursor-pointer transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}
      {...attributes} {...listeners} onClick={() => { onView(); onEdit(); }}>
      <div className="flex items-start gap-2">
        <button onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="w-4 h-4 mt-0.5 rounded border-2 flex items-center justify-center shrink-0"
          style={{ borderColor: task.isCompleted ? 'var(--primary)' : 'var(--border)', background: task.isCompleted ? 'var(--primary)' : 'transparent' }}>
          {task.isCompleted && <span className="text-white text-[10px]">✓</span>}
        </button>
        <div className="flex-1 min-w-0"><TaskCardContent task={task} /></div>
        <button onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity btn-ghost p-0.5"><Trash2 size={12} /></button>
      </div>
    </div>
  );
}

// ============ Subtask Card ============

function SubtaskCard({ subtask, onToggle, onDelete, onClick }: {
  subtask: TaskWithSubtasks; onToggle: () => void; onDelete: () => void; onClick: () => void;
}) {
  const { t } = useTranslation();
  const status = (subtask.status || 'not_started') as TaskStatus;

  return (
    <div className="flex items-center gap-2 text-sm p-2 rounded-lg border border-border hover:border-primary/30 cursor-pointer transition-colors group"
      onClick={onClick}>
      <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0"
        style={{ borderColor: subtask.isCompleted ? 'var(--primary)' : 'var(--border)', background: subtask.isCompleted ? 'var(--primary)' : 'transparent' }}>
        {subtask.isCompleted && <span className="text-white text-[10px]">✓</span>}
      </button>
      <span className={`flex-1 min-w-0 truncate ${subtask.isCompleted ? 'line-through text-text-muted' : ''}`}>{subtask.title}</span>
      {subtask.priority && <span className="text-[9px] px-1 py-0.5 rounded-full font-medium shrink-0"
        style={{ background: PRIORITY_COLORS[subtask.priority] ? `${PRIORITY_COLORS[subtask.priority]}15` : 'var(--surface-2)', color: PRIORITY_COLORS[subtask.priority] || 'var(--text-muted)' }}>
        {priorityLabel(subtask.priority, t)}</span>}
      <span className="text-[9px] px-1 py-0.5 rounded-full font-medium text-white shrink-0"
        style={{ background: STATUS_COLORS[status] || 'var(--text-muted)' }}>{statusLabel(status, t)}</span>
      {subtask.dueAt && <span className="flex items-center gap-0.5 text-[10px] text-text-muted shrink-0"><CalIcon size={8} />{fmtTaskDueDate(subtask.dueAt)}</span>}
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="opacity-0 group-hover:opacity-100 transition-opacity btn-ghost p-0.5 shrink-0"><Trash2 size={10} /></button>
    </div>
  );
}
