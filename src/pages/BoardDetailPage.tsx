import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Plus, Pin, PinOff, Trash2, Calendar as CalIcon, Bell, Check, X,
  ChevronRight, Bold, Italic, Edit3, Eye, EyeOff, ListTree, ArrowDownAZ, GripVertical,
  List as ListIcon, ListOrdered, Link as LinkIcon, Code, Quote, Minus,
} from 'lucide-react';
import { marked, type Tokens } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-dark.css';
import {
  DndContext, closestCorners, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
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
const TOOL_ICON_SIZE = 15;

type TaskStackEntry = { task: TaskWithSubtasks; depth: number; hideSubtaskTab?: boolean };
type SubtaskSort = 'custom' | 'title' | 'status' | 'priority' | 'createdAt' | 'startAt' | 'dueAt' | 'updatedAt';

function scrollMarkdownCaretIntoView(textarea: HTMLTextAreaElement, position: number) {
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const marker = document.createElement('span');
  const properties = [
    'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
    'textTransform', 'textIndent', 'wordSpacing', 'tabSize',
  ] as const;

  mirror.style.position = 'fixed';
  mirror.style.left = '-10000px';
  mirror.style.top = '0';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  properties.forEach((property) => {
    mirror.style[property] = style[property];
  });
  mirror.textContent = textarea.value.slice(0, position);
  marker.textContent = textarea.value.slice(position, position + 1) || '\u200b';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const caretTop = marker.offsetTop;
  const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.5;
  const visibleTop = textarea.scrollTop;
  const visibleBottom = visibleTop + textarea.clientHeight;
  if (caretTop < visibleTop + lineHeight) {
    textarea.scrollTop = Math.max(0, caretTop - lineHeight);
  } else if (caretTop + lineHeight > visibleBottom) {
    textarea.scrollTop = caretTop + lineHeight - textarea.clientHeight;
  }
  mirror.remove();
}

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

// Keep Markdown blank-line tokens visible instead of letting the default
// renderer discard them.
try {
  marked.use({
    breaks: true,
    gfm: true,
    renderer: {
      space(token: Tokens.Space) {
        const blankLineCount = Math.max(1, (token.raw.match(/\n/g) || []).length - 1);
        return `<div class="md-blank-lines" style="--md-blank-lines:${blankLineCount}" aria-hidden="true"></div>`;
      },
    },
  });
} catch { /* fallback */ }

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function highlightCode(code: string, lang: string): string {
  const raw = decodeHtmlEntities(code);
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(raw, { language: lang, ignoreIllegals: true }).value;
    }
    return hljs.highlightAuto(raw).value;
  } catch {
    return code;
  }
}

function decorateCodeBlocks(html: string): string {
  return html.replace(
    /<pre><code( class="language-([^"]+)")?>([\s\S]*?)<\/code><\/pre>/g,
    (_match, classAttr = '', lang = '', code = '') => {
      const normalized = code.endsWith('\n') ? code.slice(0, -1) : code;
      const highlighted = highlightCode(normalized, lang);
      const lines: string[] = highlighted.split('\n');
      const numbered = lines.map((line: string, index: number) => (
        `<span class="md-code-line"><span class="md-code-number">${index + 1}</span><span class="md-code-text">${line || ' '}</span></span>`
      )).join('');
      const language = lang ? `<div class="md-code-lang">${lang}</div>` : '';
      const codeClass = `hljs${lang ? ` language-${lang}` : ''}`;
      return `<div class="md-codeblock">${language}<pre><code class="${codeClass}">${numbered}</code></pre></div>`;
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
      className={`w-7 h-7 inline-flex items-center justify-center rounded border text-[11px] font-semibold transition-colors ${active ? 'bg-primary text-white border-primary shadow-sm' : 'border-transparent text-text-muted hover:bg-surface-2 hover:text-text'}`}
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
    reorderLists, moveTask, createTask, getTask, updateTask, updateBoard } = useBoardStore();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'list' | 'task' | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editListName, setEditListName] = useState('');
  const [boardEditOpen, setBoardEditOpen] = useState(false);
  const [boardEditName, setBoardEditName] = useState('');
  const [boardEditDesc, setBoardEditDesc] = useState('');
  const [boardEditColor, setBoardEditColor] = useState<string | null>('#6366f1');
  const [taskStack, setTaskStack] = useState<TaskStackEntry[]>([]);
  const taskStackRef = useRef(taskStack);
  taskStackRef.current = taskStack;
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; onConfirm: () => void; message?: string }>({
    open: false, onConfirm: () => {},
  });
  const lang = i18n.language;

  useEffect(() => { if (id) fetchBoard(id); }, [id, fetchBoard]);
  useEffect(() => {
    if (!currentBoard?.board || boardEditOpen) return;
    setBoardEditName(currentBoard.board.name);
    setBoardEditDesc(currentBoard.board.description || '');
    setBoardEditColor(currentBoard.board.color || '#6366f1');
  }, [currentBoard?.board, boardEditOpen]);
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

  const openBoardEditor = () => {
    setBoardEditName(board.name);
    setBoardEditDesc(board.description || '');
    setBoardEditColor(board.color || '#6366f1');
    setBoardEditOpen(true);
  };

  const saveBoardEditor = async () => {
    if (!boardEditName.trim()) {
      toast.error(t('profile.nickname') + ' ?');
      return;
    }
    await updateBoard(board.id, {
      name: boardEditName.trim(),
      description: boardEditDesc || null,
      color: boardEditColor,
    });
    await fetchBoard(board.id);
    setBoardEditOpen(false);
  };

  const openTaskDetail = async (task: TaskWithSubtasks, depth = 0, hideSubtaskTab = false) => {
    if (depth >= MAX_NESTING) { toast.error(t('board.maxDepth') || 'Max nesting depth reached'); return; }
    try {
      const fresh = await getTask(task.id);
      setTaskStack((prev) => {
        const truncated = prev.filter((s) => s.depth < depth);
        return [...truncated, { task: fresh, depth, hideSubtaskTab }];
      });
    } catch {
      setTaskStack((prev) => {
        const truncated = prev.filter((s) => s.depth < depth);
        return [...truncated, { task, depth, hideSubtaskTab }];
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
        <div className="min-w-0">
          <h1 className="text-lg font-semibold cursor-pointer truncate" onDoubleClick={openBoardEditor}>{board.name}</h1>
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
          hideSubtaskTab={entry.hideSubtaskTab}
          parentPath={taskStack.slice(0, idx).map((s) => ({ id: s.task.id, title: s.task.title }))}
          onClose={() => setTaskStack((prev) => prev.filter((_, i) => i < idx))}
          onNavigateToDepth={(targetDepth) => setTaskStack((prev) => prev.filter((_, i) => i <= targetDepth))}
          onOpenChild={(child, d, hideSubtaskTab) => openTaskDetail(child, d, hideSubtaskTab)}
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
      <Modal
        open={boardEditOpen}
        onClose={() => setBoardEditOpen(false)}
        title={i18n.language.startsWith('zh') ? '看板' : 'Board'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBoardEditOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={saveBoardEditor}>{t('common.save')}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label={t('board.taskTitle')}
            value={boardEditName}
            onChange={(e) => setBoardEditName(e.target.value)}
            placeholder="My Tasks"
          />
          <div>
            <label className="label">{t('board.boardColor')}</label>
            <ColorPicker value={boardEditColor} onChange={setBoardEditColor} />
          </div>
          <Input
            label={t('board.taskDescription')}
            value={boardEditDesc}
            onChange={(e) => setBoardEditDesc(e.target.value)}
            placeholder="..."
          />
        </div>
      </Modal>
    </div>
  );
}

// ============ Task Detail Modal ============

function TaskDetailModal({
  task, depth, hideSubtaskTab, parentPath, onClose, onNavigateToDepth, onOpenChild, onDelete, onRefresh,
}: {
  task: TaskWithSubtasks;
  depth: number;
  hideSubtaskTab?: boolean;
  parentPath: { id: string; title: string }[];
  onClose: () => void;
  onNavigateToDepth: (depth: number) => void;
  onOpenChild: (task: TaskWithSubtasks, depth: number, hideSubtaskTab?: boolean) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { updateTask, createTask, toggleTask, reorderTasks } = useBoardStore();
  const lang = i18n.language;

  const [draft, setDraft] = useState({
    title: task.title, description: task.description || '', dueAt: task.dueAt,
    reminderTime: task.reminderTime, color: task.color, status: task.status,
    priority: task.priority, startAt: task.startAt,
  });
  const [detailTab, setDetailTab] = useState<'info' | 'subtask'>('info');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(task.description || '');
  const mdTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [newSubtask, setNewSubtask] = useState('');
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [fullSubtaskOpen, setFullSubtaskOpen] = useState(false);
  const [hideCompletedSubtasks, setHideCompletedSubtasks] = useState(false);
  const [subtaskSort, setSubtaskSort] = useState<SubtaskSort>('custom');
  const [subtaskSortOpen, setSubtaskSortOpen] = useState(false);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('');
  const quickSubtaskRef = useRef<HTMLInputElement>(null);
  const canHaveSubtasks = depth < MAX_NESTING - 1 && !hideSubtaskTab;

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

  useEffect(() => {
    if (isAddingSubtask) {
      requestAnimationFrame(() => quickSubtaskRef.current?.focus());
    }
  }, [isAddingSubtask]);

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
    const newDesc = descDraft;
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
      const ta = mdTextareaRef.current;
      ta?.focus();
      const pos = ta?.value.length ?? 0;
      ta?.setSelectionRange(pos, pos);
      ta?.scrollTo({ top: ta.scrollHeight });
    });
  }, [isEditingDesc]);

  // ============ Markdown helpers ============
  const replaceMdRange = (
    ta: HTMLTextAreaElement,
    start: number,
    end: number,
    text: string,
    cursorOffset = text.length,
  ) => {
    const newText = descDraft.substring(0, start) + text + descDraft.substring(end);
    setDescDraft(newText);
    requestAnimationFrame(() => {
      ta.focus();
      const next = start + cursorOffset;
      ta.setSelectionRange(next, next);
      scrollMarkdownCaretIntoView(ta, next);
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

  const descHtml = task.description || '';
  const sortedSubtasks = useMemo(() => {
    const items = [...task.subtasks];
    if (subtaskSort === 'custom') return items;
    const statusRank: Record<TaskStatus, number> = { not_started: 0, in_progress: 1, long_term: 2, completed: 3, closed: 4 };
    const priorityRank: Record<string, number> = { highest: 5, higher: 4, normal: 3, lower: 2, lowest: 1 };
    const timestamp = (value?: string | null) => value ? dayjs(value).valueOf() : Number.MAX_SAFE_INTEGER;
    return items.sort((a, b) => {
      if (subtaskSort === 'title') return a.title.localeCompare(b.title, i18n.language);
      if (subtaskSort === 'status') return statusRank[a.status] - statusRank[b.status];
      if (subtaskSort === 'priority') return (priorityRank[b.priority || ''] || 0) - (priorityRank[a.priority || ''] || 0);
      if (subtaskSort === 'createdAt') return timestamp(a.createdAt) - timestamp(b.createdAt);
      if (subtaskSort === 'startAt') return timestamp(a.startAt) - timestamp(b.startAt);
      if (subtaskSort === 'dueAt') return timestamp(a.dueAt) - timestamp(b.dueAt);
      return timestamp(a.updatedAt) - timestamp(b.updatedAt);
    });
  }, [i18n.language, subtaskSort, task.subtasks]);
  const visibleSubtasks = hideCompletedSubtasks ? sortedSubtasks.filter((s) => !s.isCompleted) : sortedSubtasks;
  const completedSubtasks = task.subtasks.filter((s) => s.isCompleted).length;
  const subtaskProgress = task.subtasks.length > 0 ? completedSubtasks / task.subtasks.length : 0;
  const subtaskSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const subtaskSortOptions: { value: SubtaskSort; label: string }[] = [
    { value: 'custom', label: t('board.sortCustom') },
    { value: 'title', label: t('board.taskTitle') },
    { value: 'status', label: t('board.currentStatus') },
    { value: 'priority', label: t('board.currentPriority') },
    { value: 'createdAt', label: t('board.sortCreatedAt') },
    { value: 'startAt', label: t('board.startAt') },
    { value: 'dueAt', label: t('board.dueDate') },
    { value: 'updatedAt', label: t('board.sortUpdatedAt') },
  ];

  const handleSubtaskDragEnd = async (event: DragEndEvent) => {
    if (subtaskSort !== 'custom' || !event.over || event.active.id === event.over.id) return;
    const oldIndex = visibleSubtasks.findIndex((subtask) => subtask.id === event.active.id);
    const newIndex = visibleSubtasks.findIndex((subtask) => subtask.id === event.over?.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reorderedVisible = arrayMove(visibleSubtasks, oldIndex, newIndex);
    const visibleIds = new Set(reorderedVisible.map((subtask) => subtask.id));
    const reorderedIterator = reorderedVisible[Symbol.iterator]();
    const allIds = task.subtasks.map((subtask) => (
      visibleIds.has(subtask.id) ? reorderedIterator.next().value!.id : subtask.id
    ));
    await reorderTasks(task.listId, allIds);
    await onRefresh();
  };

  const createSubtask = async (openFull = false, keepAdding = false) => {
    const title = newSubtask.trim();
    if (openFull) {
      setIsAddingSubtask(false);
      setFullSubtaskOpen(true);
      return;
    }
    if (!title) return;
    await createTask(task.listId, title, task.id);
    setNewSubtask('');
    if (openFull || !keepAdding) {
      setIsAddingSubtask(false);
    } else {
      requestAnimationFrame(() => quickSubtaskRef.current?.focus());
    }
    await onRefresh();
  };

  const saveSubtaskTitle = async (subtask: TaskWithSubtasks) => {
    const title = editingSubtaskTitle.trim();
    if (title && title !== subtask.title) {
      await updateTask(subtask.id, { title });
      await onRefresh();
    }
    setEditingSubtaskId(null);
    setEditingSubtaskTitle('');
  };

  return (
    <>
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
            <DateTimePicker value={draft.startAt} onChange={(v) => setDraft({ ...draft, startAt: v })} withTime placeholder={t('board.startAt')} pickerId={`start-${task.id}-${depth}`} />
          </div>
          <div>
            <label className="label">{t('board.dueDate')}</label>
            <DateTimePicker value={draft.dueAt} onChange={(v) => setDraft({ ...draft, dueAt: v })} withTime placeholder={t('board.dueDate')} pickerId={`due-${task.id}-${depth}`} />
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
                  {/* Editor container — toolbar + content as one visual unit */}
                  <div className="rounded-lg border border-border overflow-hidden">
                    {/* Toolbar */}
                    <div className="min-h-10 flex items-center gap-0.5 flex-wrap px-2 py-1.5 border-b border-border bg-surface-2/40">
                      <ToolbarBtn onClick={() => insertMd('**', '**')} title="Bold"><Bold size={TOOL_ICON_SIZE} /></ToolbarBtn>
                      <ToolbarBtn onClick={() => insertMd('*', '*')} title="Italic"><Italic size={TOOL_ICON_SIZE} /></ToolbarBtn>
                      <ToolbarBtn onClick={() => insertMd('~~', '~~')} title="Strikethrough"><Minus size={TOOL_ICON_SIZE} /></ToolbarBtn>
                      <div className="w-px h-4 bg-border mx-0.5" />
                      <ToolbarBtn onClick={() => insertMd('# ')} title="H1"><span className="text-xs font-bold">H1</span></ToolbarBtn>
                      <ToolbarBtn onClick={() => insertMd('## ')} title="H2"><span className="text-xs font-bold">H2</span></ToolbarBtn>
                      <ToolbarBtn onClick={() => insertMd('### ')} title="H3"><span className="text-xs font-bold">H3</span></ToolbarBtn>
                      <div className="w-px h-4 bg-border mx-0.5" />
                      <ToolbarBtn onClick={() => insertMd('- ')} title="Bullet List"><ListIcon size={TOOL_ICON_SIZE} /></ToolbarBtn>
                      <ToolbarBtn onClick={() => insertMd('1. ')} title="Ordered List"><ListOrdered size={TOOL_ICON_SIZE} /></ToolbarBtn>
                      <div className="w-px h-4 bg-border mx-0.5" />
                      <ToolbarBtn onClick={() => insertMd('[', '](url)')} title="Link"><LinkIcon size={TOOL_ICON_SIZE} /></ToolbarBtn>
                      <ToolbarBtn onClick={() => insertMd('> ')} title="Quote"><Quote size={TOOL_ICON_SIZE} /></ToolbarBtn>
                      <ToolbarBtn onClick={() => insertMd('`', '`')} title="Inline Code"><Code size={TOOL_ICON_SIZE} /></ToolbarBtn>
                      <ToolbarBtn onClick={() => insertMd('```\n', '\n```')} title="Code Block"><span className="text-[10px] font-mono">```</span></ToolbarBtn>
                    </div>
                    {/* Editor area */}
                    <textarea ref={mdTextareaRef}
                      className="w-full min-h-[250px] max-h-[50vh] overflow-y-auto p-4 text-sm font-mono outline-none resize-none"
                      style={{ background: 'var(--surface-2)', fontFamily: 'ui-monospace, monospace' }}
                      value={descDraft}
                      onChange={(e) => setDescDraft(e.target.value)}
                      onKeyDown={handleMdKeyDown}
                      placeholder="## Markdown supported..."
                    />
                  </div>

                  <div className="flex items-center gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setIsEditingDesc(false)}>{t('common.cancel')}</Button>
                    <Button variant="primary" size="sm" onClick={handleSaveDescription}>{t('board.save')}</Button>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg border border-border bg-surface-2/50 min-h-[120px] max-h-[50vh] overflow-y-auto text-sm cursor-pointer hover:border-primary/50 transition-colors prose prose-sm max-w-none"
                  onDoubleClick={startEditingDesc}>
                  {descHtml
                    ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(descHtml) }} />
                    : <span className="text-text-muted italic">{t('board.descPlaceholder')}</span>}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="min-h-[360px]">
            <div className="flex items-center justify-between gap-4 py-3 border-b border-border">
              <div className="flex items-center gap-5 text-sm text-text-muted">
                <span>{t('board.totalSubtasks', { count: task.subtasks.length })}</span>
                <button className={`inline-flex items-center gap-1 hover:text-primary ${hideCompletedSubtasks ? 'text-primary' : ''}`}
                  onClick={() => setHideCompletedSubtasks((v) => !v)}>
                  {hideCompletedSubtasks ? <Eye size={15} /> : <EyeOff size={15} />}
                  {hideCompletedSubtasks ? t('board.showCompleted') : t('board.hideCompleted')}
                </button>
                <div className="relative">
                  <button
                    className={`inline-flex items-center gap-1 hover:text-primary ${subtaskSortOpen || subtaskSort !== 'custom' ? 'text-primary' : ''}`}
                    onClick={() => setSubtaskSortOpen((open) => !open)}
                    title={t('board.sortBy')}
                  >
                    <ArrowDownAZ size={15} />
                  </button>
                  {subtaskSortOpen && (
                    <div className="absolute left-0 top-7 z-40 w-40 border border-border bg-surface shadow-lg py-1">
                      {subtaskSortOptions.map((option) => (
                        <button
                          key={option.value}
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-surface-2 ${subtaskSort === option.value ? 'text-primary bg-primary/5' : 'text-text'}`}
                          onClick={() => {
                            setSubtaskSort(option.value);
                            setSubtaskSortOpen(false);
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                {task.subtasks.length > 0 && (
                  <div className="hidden sm:flex items-center gap-2">
                    <div className="w-48 h-2 rounded-full bg-surface-2 overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${subtaskProgress * 100}%` }} />
                    </div>
                    <span className="text-sm text-text-muted tabular-nums">{(subtaskProgress * 100).toFixed(2)}%</span>
                  </div>
                )}
                <button className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary"
                  onClick={() => setIsAddingSubtask(true)}>
                  <Plus size={16} /> {t('board.newSubtask')}
                </button>
              </div>
            </div>

            {visibleSubtasks.length === 0 && !isAddingSubtask ? (
              <div className="h-64 flex flex-col items-center justify-center text-text-muted">
                <div className="w-16 h-16 rounded-lg bg-surface-2/60 flex items-center justify-center mb-4">
                  <ListTree size={28} className="opacity-50" />
                </div>
                <div className="text-sm">{task.subtasks.length === 0 ? t('board.noLinkedSubtasks') : t('board.noVisibleSubtasks')}</div>
              </div>
            ) : (
              <DndContext sensors={subtaskSensors} collisionDetection={closestCorners} onDragEnd={handleSubtaskDragEnd}>
                <SortableContext items={visibleSubtasks.map((subtask) => subtask.id)} strategy={verticalListSortingStrategy}>
                  <div className="divide-y divide-border">
                    {visibleSubtasks.map((s) => (
                      <SortableSubtaskRow
                        key={s.id}
                        subtask={s}
                        draggable={subtaskSort === 'custom'}
                        isEditing={editingSubtaskId === s.id}
                        editingTitle={editingSubtaskTitle}
                        onEditingTitleChange={setEditingSubtaskTitle}
                        onStartEdit={() => { setEditingSubtaskId(s.id); setEditingSubtaskTitle(s.title); }}
                        onCancelEdit={() => { setEditingSubtaskId(null); setEditingSubtaskTitle(''); }}
                        onSaveEdit={() => saveSubtaskTitle(s)}
                        onToggle={async () => { await toggleTask(s.id); onRefresh(); }}
                        onDelete={() => onDelete(s.id)}
                        onClick={() => onOpenChild(s, depth + 1)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            {isAddingSubtask && (
              <div className="pt-4">
                <input ref={quickSubtaskRef}
                  className="input w-full h-12"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  placeholder={t('board.quickSubtaskPlaceholder')}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      await createSubtask(e.shiftKey, !e.shiftKey);
                    }
                    if (e.key === 'Escape') {
                      setIsAddingSubtask(false);
                      setNewSubtask('');
                    }
                  }}
                />
                <div className="flex items-center justify-end gap-3 mt-2">
                  <Button variant="ghost" size="sm" onClick={() => { setIsAddingSubtask(false); setNewSubtask(''); }}>
                    {t('common.cancel')}
                  </Button>
                  <Button size="sm" onClick={() => createSubtask(false)}>{t('common.confirm')}</Button>
                </div>
              </div>
            )}
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
    <NewSubtaskModal
      open={fullSubtaskOpen}
      initialTitle={newSubtask}
      parentTask={task}
      depth={depth + 1}
      onClose={() => {
        setFullSubtaskOpen(false);
        setNewSubtask('');
      }}
      onCreated={async () => {
        setFullSubtaskOpen(false);
        setNewSubtask('');
        await onRefresh();
      }}
    />
    </>
  );
}

function NewSubtaskModal({
  open, initialTitle, parentTask, depth, onClose, onCreated,
}: {
  open: boolean;
  initialTitle: string;
  parentTask: TaskWithSubtasks;
  depth: number;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { createTask, updateTask } = useBoardStore();
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    title: initialTitle,
    description: '',
    dueAt: null as string | null,
    reminderTime: null as string | null,
    color: null as string | null,
    status: 'not_started' as TaskStatus,
    priority: null as TaskPriority | null,
    startAt: null as string | null,
  });

  useEffect(() => {
    if (!open) return;
    setDraft({
      title: initialTitle,
      description: '',
      dueAt: null,
      reminderTime: null,
      color: null,
      status: 'not_started',
      priority: null,
      startAt: null,
    });
  }, [initialTitle, open]);

  const replaceDescriptionRange = (before: string, after = '') => {
    const textarea = descriptionRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = draft.description.slice(start, end);
    const inserted = `${before}${selected}${after}`;
    const nextPosition = start + (before === '```\n' ? before.length : before.length + selected.length);
    setDraft((state) => ({
      ...state,
      description: state.description.slice(0, start) + inserted + state.description.slice(end),
    }));
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextPosition, nextPosition);
      scrollMarkdownCaretIntoView(textarea, nextPosition);
    });
  };

  const handleDescriptionEnter = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const lineStart = draft.description.lastIndexOf('\n', start - 1) + 1;
    const currentLine = draft.description.slice(lineStart, start);
    const ordered = currentLine.match(/^(\s*)(\d+)\.\s(.*)$/);
    const unordered = currentLine.match(/^(\s*)([-*+])\s(.*)$/);
    const quote = currentLine.match(/^(\s*)>\s?(.*)$/);
    let text = '\n';
    if (ordered) text = ordered[3].trim() ? `\n${ordered[1]}${Number(ordered[2]) + 1}. ` : '';
    if (unordered) text = unordered[3].trim() ? `\n${unordered[1]}${unordered[2]} ` : '';
    if (quote) text = quote[2].trim() ? `\n${quote[1]}> ` : '\n';
    const replaceStart = text === '' ? lineStart : start;
    setDraft((state) => ({
      ...state,
      description: state.description.slice(0, replaceStart) + text + state.description.slice(textarea.selectionEnd),
    }));
    requestAnimationFrame(() => {
      const next = replaceStart + text.length;
      textarea.focus();
      textarea.setSelectionRange(next, next);
      scrollMarkdownCaretIntoView(textarea, next);
    });
  };

  const createFullSubtask = async () => {
    const title = draft.title.trim();
    if (!title || saving) return;
    setSaving(true);
    try {
      const created = await createTask(parentTask.listId, title, parentTask.id);
      await updateTask(created.id, {
        description: draft.description,
        dueAt: draft.dueAt,
        reminderTime: draft.reminderTime,
        color: draft.color,
        status: draft.status,
        priority: draft.priority,
        startAt: draft.startAt,
      });
      await onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('board.newSubtaskTitle')}
      size="xl"
      footer={(
        <div className="w-full flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={createFullSubtask} disabled={!draft.title.trim() || saving}>{t('common.create')}</Button>
        </div>
      )}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-1 text-xs text-text-muted flex-wrap bg-surface-2/30 rounded-lg px-3 py-2">
          <span className="font-medium">{t('board.parentTaskLabel')}:</span>
          <span className="text-primary font-medium truncate max-w-[360px]">{parentTask.title}</span>
        </div>

        <Input
          label={t('board.taskTitle')}
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          autoFocus
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="label">{t('board.currentStatus')}</label>
            <select className="input w-full" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TaskStatus })}>
              {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{statusLabel(status, t)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('board.currentPriority')}</label>
            <select
              className="input w-full"
              value={draft.priority || 'none'}
              onChange={(event) => setDraft({ ...draft, priority: event.target.value === 'none' ? null : event.target.value as TaskPriority })}
            >
              {PRIORITY_OPTIONS.map((priority) => <option key={priority} value={priority}>{priority === 'none' ? t('board.priorityNone') : priorityLabel(priority, t)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('board.startAt')}</label>
            <DateTimePicker value={draft.startAt} onChange={(value) => setDraft({ ...draft, startAt: value })} withTime placeholder={t('board.startAt')} pickerId={`new-subtask-start-${parentTask.id}-${depth}`} />
          </div>
          <div>
            <label className="label">{t('board.dueDate')}</label>
            <DateTimePicker value={draft.dueAt} onChange={(value) => setDraft({ ...draft, dueAt: value })} withTime placeholder={t('board.dueDate')} pickerId={`new-subtask-due-${parentTask.id}-${depth}`} />
          </div>
        </div>

        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="label">{t('board.labelColor')}</label>
            <ColorPicker value={draft.color} onChange={(value) => setDraft({ ...draft, color: value })} />
          </div>
          <div>
            <label className="label">{t('board.taskReminder')}</label>
            <TimePicker value={draft.reminderTime} onChange={(value) => setDraft({ ...draft, reminderTime: value })} />
          </div>
          {draft.reminderTime && <span className="flex items-center gap-1 text-xs text-text-muted pb-0.5"><Bell size={12} />{draft.reminderTime}</span>}
        </div>

        <div className="flex items-center gap-1 border-b border-border pb-1">
          <span className="px-3 py-1.5 text-sm font-medium rounded-t bg-primary/10 text-primary border-b-2 border-primary">{t('board.taskInfo')}</span>
        </div>

        <div>
          <label className="label">{t('board.taskDescription')}</label>
          <div className="border border-border rounded overflow-hidden">
            <div className="h-10 px-2 flex items-center gap-1 border-b border-border bg-surface-2/40">
              <ToolbarBtn onClick={() => replaceDescriptionRange('**', '**')} title="Bold"><Bold size={TOOL_ICON_SIZE} /></ToolbarBtn>
              <ToolbarBtn onClick={() => replaceDescriptionRange('*', '*')} title="Italic"><Italic size={TOOL_ICON_SIZE} /></ToolbarBtn>
              <ToolbarBtn onClick={() => replaceDescriptionRange('~~', '~~')} title="Strikethrough"><Minus size={TOOL_ICON_SIZE} /></ToolbarBtn>
              <span className="w-px h-5 bg-border mx-1" />
              <ToolbarBtn onClick={() => replaceDescriptionRange('# ')} title="H1"><span className="text-xs font-bold">H1</span></ToolbarBtn>
              <ToolbarBtn onClick={() => replaceDescriptionRange('- ')} title="Bullet List"><ListIcon size={TOOL_ICON_SIZE} /></ToolbarBtn>
              <ToolbarBtn onClick={() => replaceDescriptionRange('1. ')} title="Ordered List"><ListOrdered size={TOOL_ICON_SIZE} /></ToolbarBtn>
              <ToolbarBtn onClick={() => replaceDescriptionRange('[', '](url)')} title="Link"><LinkIcon size={TOOL_ICON_SIZE} /></ToolbarBtn>
              <ToolbarBtn onClick={() => replaceDescriptionRange('> ')} title="Quote"><Quote size={TOOL_ICON_SIZE} /></ToolbarBtn>
              <ToolbarBtn onClick={() => replaceDescriptionRange('`', '`')} title="Inline Code"><Code size={TOOL_ICON_SIZE} /></ToolbarBtn>
              <ToolbarBtn onClick={() => replaceDescriptionRange('```\n', '\n```')} title="Code Block"><span className="text-[10px] font-mono">```</span></ToolbarBtn>
            </div>
            <textarea
              ref={descriptionRef}
              className="w-full min-h-[220px] resize-y bg-surface p-4 font-mono text-sm leading-6 outline-none"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              onKeyDown={handleDescriptionEnter}
              placeholder="## Markdown supported..."
            />
          </div>
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

function SortableSubtaskRow({
  subtask, draggable, ...props
}: Omit<React.ComponentProps<typeof SubtaskRow>, 'dragHandle'> & { draggable: boolean }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: subtask.id,
    disabled: !draggable,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
        position: 'relative',
        zIndex: isDragging ? 20 : undefined,
      }}
    >
      <SubtaskRow
        subtask={subtask}
        {...props}
        dragHandle={draggable ? (
          <button
            className="cursor-grab active:cursor-grabbing p-1 text-text-muted hover:text-primary"
            onClick={(event) => event.stopPropagation()}
            title={t('board.dragToSort')}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={15} />
          </button>
        ) : undefined}
      />
    </div>
  );
}

function SubtaskRow({
  subtask, isEditing, editingTitle, onEditingTitleChange, onStartEdit, onCancelEdit, onSaveEdit,
  onToggle, onDelete, onClick, dragHandle,
}: {
  subtask: TaskWithSubtasks;
  isEditing: boolean;
  editingTitle: string;
  onEditingTitleChange: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onClick: () => void;
  dragHandle?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const status = (subtask.status || 'not_started') as TaskStatus;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_120px_120px_80px] items-center gap-3 min-h-14 text-sm group hover:bg-surface-2/30 cursor-pointer transition-colors"
      onClick={onClick}>
      <div className="flex items-center gap-3 min-w-0 px-2">
        <button onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0"
          style={{ borderColor: subtask.isCompleted ? 'var(--primary)' : 'var(--border)', background: subtask.isCompleted ? 'var(--primary)' : 'transparent' }}>
          {subtask.isCompleted && <span className="text-white text-[10px]">✓</span>}
        </button>
        {isEditing ? (
          <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
            <input className="input h-9 flex-1 min-w-0" value={editingTitle}
              onChange={(e) => onEditingTitleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveEdit();
                if (e.key === 'Escape') onCancelEdit();
              }}
              autoFocus />
            <button className="btn-ghost p-1" onClick={onSaveEdit}><Check size={14} className="text-green-500" /></button>
            <button className="btn-ghost p-1" onClick={onCancelEdit}><X size={14} /></button>
          </div>
        ) : (
          <span className={`truncate font-medium ${subtask.isCompleted ? 'line-through text-text-muted' : ''}`}>{subtask.title}</span>
        )}
      </div>
      <div className="text-sm text-text-muted">{subtask.dueAt ? fmtTaskDueDate(subtask.dueAt) : ''}</div>
      <div>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-white"
          style={{ background: STATUS_COLORS[status] || 'var(--text-muted)' }}>{statusLabel(status, t)}</span>
      </div>
      <div className="flex items-center justify-end gap-1 pr-2">
        {dragHandle}
        {!isEditing && (
          <>
            <button onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity btn-ghost p-1" title={t('common.edit')}>
              <Edit3 size={14} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity btn-ghost p-1" title={t('common.delete')}>
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

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
