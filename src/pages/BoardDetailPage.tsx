import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus, MoreHorizontal, Pin, PinOff, Trash2, Calendar as CalIcon, Bell, Clock, Edit3 } from 'lucide-react';
import {
  DndContext,
  closestCorners,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useBoardStore } from '@/store/useBoardStore';
import { tasksApi } from '@/api';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { Input, Textarea } from '@/components/common/Input';
import { DateTimePicker } from '@/components/common/DateTimePicker';
import { TimePicker } from '@/components/common/DateTimePicker';
import { ColorPicker } from '@/components/common/ColorPicker';
import { ProgressBar } from '@/components/common/ProgressBar';
import { toast } from '@/components/common/Toast';
import { dayjs } from '@/utils/date';
import type { ListWithTasks, Subtask, TaskWithSubtasks } from '@/types';

export function BoardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentBoard, fetchBoard, createList, togglePin, deleteList, deleteTask, reorderLists, reorderTasks, moveTask, createSubtask, toggleSubtask, deleteSubtask, updateTask } = useBoardStore();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'list' | 'task' | null>(null);
  const [newListName, setNewListName] = useState('');
  const [editingTask, setEditingTask] = useState<TaskWithSubtasks | null>(null);
  const [newSubtask, setNewSubtask] = useState('');

  useEffect(() => {
    if (id) fetchBoard(id);
  }, [id, fetchBoard]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  if (!id) return null;
  if (!currentBoard || currentBoard.board.id !== id) {
    return <div className="p-6 text-text-muted">{t('common.loading')}</div>;
  }

  const { board, lists } = currentBoard;

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setActiveType((e.active.data.current?.type as 'list' | 'task') || 'task');
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    setActiveType(null);
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
      // task drag
      const aData = active.data.current as { listId: string; index: number };
      const oData = over.data.current as { listId: string; index: number } | undefined;
      // If over is a list container (droppable)
      let targetListId = oData?.listId;
      let targetIndex = oData?.index;
      if (!targetListId) {
        targetListId = String(over.id);
        // Drop into empty list
        const lst = lists.find((l) => l.list.id === targetListId);
        targetIndex = lst ? lst.tasks.length : 0;
      }
      await moveTask(String(active.id), targetListId, targetIndex ?? 0);
    }
  };

  const activeList = activeType === 'list' ? lists.find((l) => l.list.id === activeId) : null;
  const activeTask = activeType === 'task'
    ? lists.flatMap((l) => l.tasks).find((t) => t.id === activeId)
    : null;

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-3 border-b border-border flex items-center gap-3" style={{ background: 'var(--surface)' }}>
        <button className="btn-ghost p-1" onClick={() => navigate('/boards')}>
          <ArrowLeft size={18} />
        </button>
        <div
          className="w-3 h-6 rounded-full"
          style={{ background: board.color || 'var(--primary)' }}
        />
        <div>
          <h1 className="text-lg font-semibold">{board.name}</h1>
          {board.description && (
            <div className="text-xs text-text-muted">{board.description}</div>
          )}
        </div>
        <button
          onClick={() => togglePin(board.id)}
          className="btn-ghost ml-2"
          title={board.isPinned ? t('board.unpin') : t('board.pin')}
        >
          {board.isPinned ? <PinOff size={16} /> : <Pin size={16} />}
        </button>
      </div>

      <div className="flex-1 overflow-x-auto p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={lists.map((l) => l.list.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex gap-3 items-start">
              {lists.map((l, idx) => (
                <SortableListColumn
                  key={l.list.id}
                  list={l}
                  index={idx}
                  onAddTask={async (title) => {
                    await useBoardStore.getState().createTask(l.list.id, title);
                  }}
                  onToggleTask={(taskId) => useBoardStore.getState().toggleTask(taskId)}
                  onDeleteTask={deleteTask}
                  onEditTask={(task) => setEditingTask(task)}
                  onDeleteList={async () => {
                    if (confirm(t('goal.deleteConfirm'))) await deleteList(l.list.id);
                  }}
                />
              ))}
              <div className="w-72 shrink-0">
                <div className="card p-2 flex items-center gap-2">
                  <Input
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder={t('board.addList').replace('+ ', '')}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && newListName.trim()) {
                        await createList(board.id, newListName.trim());
                        setNewListName('');
                      }
                    }}
                    className="border-0 bg-transparent"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (newListName.trim()) {
                        await createList(board.id, newListName.trim());
                        setNewListName('');
                      }
                    }}
                  >
                    <Plus size={14} />
                  </Button>
                </div>
              </div>
            </div>
          </SortableContext>
          <DragOverlay>
            {activeList && (
              <div className="card p-3 w-72 opacity-80 rotate-2">
                <div className="font-semibold">{activeList.list.name}</div>
                <div className="text-xs text-text-muted">{activeList.tasks.length} tasks</div>
              </div>
            )}
            {activeTask && (
              <div className="card p-3 w-72 opacity-80 rotate-2">
                <div className="text-sm">{activeTask.title}</div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      <Modal
        open={!!editingTask}
        onClose={() => setEditingTask(null)}
        title={t('board.taskDetail')}
        size="lg"
        footer={
          <>
            <Button
              variant="danger"
              onClick={async () => {
                if (editingTask && confirm(t('board.deleteConfirm'))) {
                  await deleteTask(editingTask.id);
                  setEditingTask(null);
                }
              }}
            >
              <Trash2 size={14} />
              {t('common.delete')}
            </Button>
            <div className="flex-1" />
            <Button variant="ghost" onClick={() => setEditingTask(null)}>
              {t('common.close')}
            </Button>
          </>
        }
      >
        {editingTask && (
          <div className="space-y-3">
            <Input
              label={t('profile.nickname')}
              value={editingTask.title}
              onChange={async (e) => {
                const v = e.target.value;
                await updateTask(editingTask.id, { title: v });
                setEditingTask({ ...editingTask, title: v });
              }}
            />
            <Textarea
              label={t('profile.signature')}
              value={editingTask.description || ''}
              onChange={async (e) => {
                const v = e.target.value;
                await updateTask(editingTask.id, { description: v || undefined });
                setEditingTask({ ...editingTask, description: v || null });
              }}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">{t('board.due')}</label>
                <DateTimePicker
                  value={editingTask.dueAt}
                  onChange={async (v) => {
                    await updateTask(editingTask.id, { dueAt: v });
                    setEditingTask({ ...editingTask, dueAt: v });
                  }}
                  placeholder={t('board.due')}
                />
              </div>
              <div>
                <label className="label">{t('board.reminderTime')}</label>
                <TimePicker
                  value={editingTask.reminderTime}
                  onChange={async (v) => {
                    await updateTask(editingTask.id, { reminderTime: v });
                    setEditingTask({ ...editingTask, reminderTime: v });
                  }}
                />
              </div>
            </div>
            <div>
              <label className="label">{t('board.boardColor')}</label>
              <ColorPicker
                value={editingTask.color}
                onChange={async (v) => {
                  await updateTask(editingTask.id, { color: v });
                  setEditingTask({ ...editingTask, color: v });
                }}
              />
            </div>
            <div>
              <label className="label">{t('board.subtask')}</label>
              <div className="space-y-1.5">
                {editingTask.subtasks.map((s) => (
                  <SubtaskRow
                    key={s.id}
                    subtask={s}
                    onToggle={() => toggleSubtask(s.id)}
                    onDelete={() => deleteSubtask(s.id)}
                  />
                ))}
                <div className="flex items-center gap-2">
                  <Input
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                    placeholder={t('board.addSubtask').replace('+ ', '')}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && newSubtask.trim()) {
                        await createSubtask(editingTask.id, newSubtask.trim());
                        setNewSubtask('');
                      }
                    }}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>
                {editingTask.completedAt &&
                  `${t('board.completed')}: ${dayjs(editingTask.completedAt).format('YYYY-MM-DD HH:mm')}`}
              </span>
              {editingTask.reminderTime && (
                <span className="flex items-center gap-1">
                  <Bell size={12} />
                  {editingTask.reminderTime}
                </span>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function SortableListColumn({
  list,
  index,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onEditTask,
  onDeleteList,
}: {
  list: ListWithTasks;
  index: number;
  onAddTask: (title: string) => Promise<void>;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onEditTask: (t: TaskWithSubtasks) => void;
  onDeleteList: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.list.id,
    data: { type: 'list', index },
  });
  const [newTask, setNewTask] = useState('');
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="w-72 shrink-0">
      <div className="card p-3 flex flex-col gap-2 max-h-[calc(100vh-180px)]">
        <div className="flex items-center gap-2" {...attributes} {...listeners}>
          <h3 className="font-semibold text-sm flex-1 truncate cursor-grab">{list.list.name}</h3>
          <span className="text-xs text-text-muted">{list.tasks.length}</span>
          <button onClick={onDeleteList} className="btn-ghost p-0.5">
            <Trash2 size={12} />
          </button>
        </div>
        <SortableContext
          items={list.tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div
            className="flex flex-col gap-1.5 overflow-y-auto pr-1"
            data-list-id={list.list.id}
          >
            {list.tasks.map((task, idx) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                index={idx}
                onToggle={() => onToggleTask(task.id)}
                onDelete={() => onDeleteTask(task.id)}
                onEdit={() => onEditTask(task)}
              />
            ))}
          </div>
        </SortableContext>
        <div className="flex items-center gap-1.5 pt-1 border-t border-border">
          <input
            className="bg-transparent flex-1 text-sm outline-none px-1 py-1"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder={t('board.addTask').replace('+ ', '')}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && newTask.trim()) {
                await onAddTask(newTask.trim());
                setNewTask('');
              }
            }}
          />
          <button
            onClick={async () => {
              if (newTask.trim()) {
                await onAddTask(newTask.trim());
                setNewTask('');
              }
            }}
            className="btn-ghost p-1"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function SortableTaskCard({
  task,
  index,
  onToggle,
  onDelete,
  onEdit,
}: {
  task: TaskWithSubtasks;
  index: number;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', listId: task.listId, index },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const doneSubs = task.subtasks.filter((s) => s.isCompleted).length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg p-2.5 border border-border group"
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start gap-2">
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="w-4 h-4 mt-0.5 rounded border-2 flex items-center justify-center shrink-0"
          style={{
            borderColor: task.isCompleted ? 'var(--primary)' : 'var(--border)',
            background: task.isCompleted ? 'var(--primary)' : 'transparent',
          }}
        >
          {task.isCompleted && <span className="text-white text-[10px]">✓</span>}
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onEdit}>
          <div
            className={`text-sm ${task.isCompleted ? 'line-through text-text-muted' : ''}`}
            style={task.color ? { borderLeft: `3px solid ${task.color}`, paddingLeft: 6 } : undefined}
          >
            {task.title}
          </div>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-text-muted">
            {task.dueAt && (
              <span className="flex items-center gap-0.5">
                <CalIcon size={10} />
                {dayjs(task.dueAt).format('MM-DD')}
              </span>
            )}
            {task.reminderTime && (
              <span className="flex items-center gap-0.5">
                <Bell size={10} />
                {task.reminderTime}
              </span>
            )}
            {task.subtasks.length > 0 && (
              <span>
                {doneSubs}/{task.subtasks.length}
              </span>
            )}
          </div>
        </div>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity btn-ghost p-0.5"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function SubtaskRow({
  subtask,
  onToggle,
  onDelete,
}: {
  subtask: Subtask;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <button
        onClick={onToggle}
        className="w-4 h-4 rounded border-2 flex items-center justify-center"
        style={{
          borderColor: subtask.isCompleted ? 'var(--primary)' : 'var(--border)',
          background: subtask.isCompleted ? 'var(--primary)' : 'transparent',
        }}
      >
        {subtask.isCompleted && <span className="text-white text-[10px]">✓</span>}
      </button>
      <span className={`flex-1 ${subtask.isCompleted ? 'line-through text-text-muted' : ''}`}>
        {subtask.title}
      </span>
      <button onClick={onDelete} className="btn-ghost p-0.5">
        <Trash2 size={12} />
      </button>
    </div>
  );
}
