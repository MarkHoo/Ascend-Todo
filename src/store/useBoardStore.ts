import { create } from 'zustand';
import { boardsApi, listsApi, tasksApi } from '@/api';
import type { Board, BoardWithLists, Task, TaskWithSubtasks } from '@/types';

const REMINDERS_CHANGED_EVENT = 'ascend:reminders-changed';

interface State {
  boards: Board[];
  currentBoard: BoardWithLists | null;
  loading: boolean;
  fetchBoards: () => Promise<void>;
  fetchBoard: (id: string) => Promise<void>;
  createBoard: (params: { name: string; description?: string | null; color?: string | null; icon?: string | null }) => Promise<Board>;
  updateBoard: (id: string, patch: { name?: string; description?: string | null; color?: string | null }) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  deleteBoard: (id: string) => Promise<void>;
  createList: (boardId: string, name: string) => Promise<void>;
  renameList: (id: string, name: string) => Promise<void>;
  deleteList: (id: string) => Promise<void>;
  createTask: (listId: string, title: string, parentId?: string | null) => Promise<Task>;
  getTask: (taskId: string) => Promise<TaskWithSubtasks>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  updateTask: (id: string, patch: { title?: string; description?: string; dueAt?: string | null; reminderAt?: string | null; reminderTime?: string | null; color?: string | null; status?: string | null; priority?: string | null; startAt?: string | null }) => Promise<void>;
  moveTask: (id: string, targetListId: string, targetPosition: number) => Promise<void>;
  reorderTasks: (listId: string, ids: string[]) => Promise<void>;
  reorderLists: (boardId: string, ids: string[]) => Promise<void>;
}

function patchTaskTree(
  tasks: TaskWithSubtasks[],
  id: string,
  patch: Partial<TaskWithSubtasks>,
): TaskWithSubtasks[] {
  return tasks.map((task) => {
    if (task.id === id) {
      return { ...task, ...patch, updatedAt: new Date().toISOString() };
    }
    if (task.subtasks.length > 0) {
      return { ...task, subtasks: patchTaskTree(task.subtasks, id, patch) };
    }
    return task;
  });
}

export const useBoardStore = create<State>((set, get) => ({
  boards: [],
  currentBoard: null,
  loading: false,

  fetchBoards: async () => {
    set({ loading: true });
    const boards = await boardsApi.list();
    set({ boards, loading: false });
  },
  fetchBoard: async (id: string) => {
    set({ loading: true });
    const data = await boardsApi.getStructure(id);
    set({ currentBoard: data, loading: false });
  },
  createBoard: async (params) => {
    const b = await boardsApi.create(params);
    await get().fetchBoards();
    return b;
  },
  updateBoard: async (id, patch) => {
    await boardsApi.update({ id, ...patch });
    await get().fetchBoards();
  },
  togglePin: async (id) => {
    await boardsApi.togglePin(id);
    await get().fetchBoards();
  },
  deleteBoard: async (id) => {
    await boardsApi.delete(id);
    if (get().currentBoard?.board.id === id) {
      set({ currentBoard: null });
    }
    await get().fetchBoards();
  },
  createList: async (boardId, name) => {
    await listsApi.create({ boardId, name });
    await get().fetchBoard(boardId);
  },
  renameList: async (id, name) => {
    await listsApi.rename({ id, name });
    const cur = get().currentBoard;
    if (cur) await get().fetchBoard(cur.board.id);
  },
  deleteList: async (id) => {
    await listsApi.delete(id);
    const cur = get().currentBoard;
    if (cur) await get().fetchBoard(cur.board.id);
  },
  createTask: async (listId, title, parentId) => {
    const task = await tasksApi.create({ listId, title, parentId: parentId || undefined });
    const cur = get().currentBoard;
    if (cur) await get().fetchBoard(cur.board.id);
    return task;
  },
  getTask: async (taskId) => {
    return await tasksApi.get(taskId);
  },
  toggleTask: async (id) => {
    await tasksApi.toggle(id);
    const cur = get().currentBoard;
    if (cur) await get().fetchBoard(cur.board.id);
  },
  deleteTask: async (id) => {
    await tasksApi.delete(id);
    const cur = get().currentBoard;
    if (cur) await get().fetchBoard(cur.board.id);
  },
  updateTask: async (id, patch) => {
    const before = get().currentBoard;
    if (before) {
      set({
        currentBoard: {
          ...before,
          lists: before.lists.map((list) => ({
            ...list,
            tasks: patchTaskTree(list.tasks, id, patch as Partial<TaskWithSubtasks>),
          })),
        },
      });
    }
    try {
      await tasksApi.update({
        id,
        title: patch.title,
        description: patch.description !== undefined ? patch.description : undefined,
        dueAt: patch.dueAt,
        reminderAt: patch.reminderAt,
        reminderTime: patch.reminderTime,
        color: patch.color,
        status: patch.status,
        priority: patch.priority,
        startAt: patch.startAt,
      });
      const cur = get().currentBoard;
      if (cur) {
        get().fetchBoard(cur.board.id).catch(() => {});
      }
      if ('reminderAt' in patch || 'reminderTime' in patch || 'dueAt' in patch) {
        window.dispatchEvent(new Event(REMINDERS_CHANGED_EVENT));
      }
    } catch (error) {
      if (before) set({ currentBoard: before });
      throw error;
    }
  },
  moveTask: async (id, targetListId, targetPosition) => {
    await tasksApi.move({ id, targetListId, targetPosition });
    const cur = get().currentBoard;
    if (cur) await get().fetchBoard(cur.board.id);
  },
  reorderTasks: async (listId, ids) => {
    await tasksApi.reorder({ listId, ids });
    const cur = get().currentBoard;
    if (cur) await get().fetchBoard(cur.board.id);
  },
  reorderLists: async (boardId, ids) => {
    await listsApi.reorder(ids);
    await get().fetchBoard(boardId);
  },
}));
