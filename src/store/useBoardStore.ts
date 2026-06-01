import { create } from 'zustand';
import { boardsApi, listsApi, tasksApi, subtasksApi } from '@/api';
import type { Board, BoardWithLists } from '@/types';

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
  createTask: (listId: string, title: string) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  updateTask: (id: string, patch: { title?: string; description?: string; dueAt?: string | null; reminderAt?: string | null; reminderTime?: string | null; color?: string | null }) => Promise<void>;
  createSubtask: (taskId: string, title: string) => Promise<void>;
  toggleSubtask: (id: string) => Promise<void>;
  deleteSubtask: (id: string) => Promise<void>;
  moveTask: (id: string, targetListId: string, targetPosition: number) => Promise<void>;
  reorderTasks: (listId: string, ids: string[]) => Promise<void>;
  reorderLists: (boardId: string, ids: string[]) => Promise<void>;
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
  createTask: async (listId, title) => {
    await tasksApi.create({ listId, title });
    const cur = get().currentBoard;
    if (cur) await get().fetchBoard(cur.board.id);
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
    await tasksApi.update({
      id,
      title: patch.title,
      description: patch.description !== undefined ? patch.description : undefined,
      dueAt: patch.dueAt,
      reminderAt: patch.reminderAt,
      reminderTime: patch.reminderTime,
      color: patch.color,
    });
    const cur = get().currentBoard;
    if (cur) await get().fetchBoard(cur.board.id);
  },
  createSubtask: async (taskId, title) => {
    await subtasksApi.create({ taskId, title });
    const cur = get().currentBoard;
    if (cur) await get().fetchBoard(cur.board.id);
  },
  toggleSubtask: async (id) => {
    await subtasksApi.toggle(id);
    const cur = get().currentBoard;
    if (cur) await get().fetchBoard(cur.board.id);
  },
  deleteSubtask: async (id) => {
    await subtasksApi.delete(id);
    const cur = get().currentBoard;
    if (cur) await get().fetchBoard(cur.board.id);
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
