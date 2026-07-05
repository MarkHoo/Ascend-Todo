import { invoke } from '@tauri-apps/api/core';
import type { Board, BoardWithLists, List, Task, TaskActivityLog, TaskWithSubtasks } from '@/types';

export const boardsApi = {
  list: () => invoke<Board[]>('list_boards'),
  create: (params: { name: string; description?: string | null; color?: string | null; icon?: string | null }) =>
    invoke<Board>('create_board', params),
  update: (params: { id: string; name?: string; description?: string | null; color?: string | null; icon?: string | null }) =>
    invoke<void>('update_board', params),
  togglePin: (id: string) => invoke<void>('toggle_pin_board', { id }),
  delete: (id: string) => invoke<void>('delete_board', { id }),
  getStructure: (boardId: string) =>
    invoke<BoardWithLists>('get_board_with_structure', { boardId }),
};

export const listsApi = {
  list: (boardId: string) => invoke<List[]>('list_lists', { boardId }),
  create: (params: { boardId: string; name: string }) => invoke<List>('create_list', params),
  rename: (params: { id: string; name: string }) => invoke<void>('rename_list', params),
  delete: (id: string) => invoke<void>('delete_list', { id }),
  reorder: (ids: string[]) => invoke<void>('reorder_lists', { ids }),
};

export const tasksApi = {
  list: (listId: string) => invoke<TaskWithSubtasks[]>('list_tasks', { listId }),
  listAll: () => invoke<Task[]>('list_all_tasks'),
  listActivityLogs: (taskId: string, limit?: number) =>
    invoke<TaskActivityLog[]>('list_task_activity_logs', { taskId, limit: limit ?? null }),
  get: (taskId: string) => invoke<TaskWithSubtasks>('get_task', { taskId }),
  create: (params: {
    listId: string;
    title: string;
    description?: string | null;
    dueAt?: string | null;
    reminderAt?: string | null;
    reminderTime?: string | null;
    color?: string | null;
    status?: string | null;
    priority?: string | null;
    startAt?: string | null;
    parentId?: string | null;
  }) => invoke<Task>('create_task', params),
  update: (params: {
    id: string;
    title?: string;
    description?: string | null;
    dueAt?: string | null;
    reminderAt?: string | null;
    reminderTime?: string | null;
    color?: string | null;
    status?: string | null;
    priority?: string | null;
    startAt?: string | null;
  }) => invoke<void>('update_task', params),
  toggle: (id: string) => invoke<boolean>('toggle_task', { id }),
  delete: (id: string) => invoke<void>('delete_task', { id }),
  move: (params: { id: string; targetListId: string; targetPosition: number }) =>
    invoke<void>('move_task', params),
  reorder: (params: { listId: string; ids: string[] }) =>
    invoke<void>('reorder_tasks', params),
};
