import { invoke } from '@tauri-apps/api/core';
import type { Goal, GoalPeriod, GoalWithDetails, KeyResult, KeyResultWithLogs, Milestone, ProgressLog } from '@/types';

export const goalsApi = {
  list: () => invoke<GoalWithDetails[]>('list_goals'),
  get: (id: string) => invoke<GoalWithDetails>('get_goal', { id }),
  create: (params: {
    title: string;
    description?: string | null;
    color?: string | null;
    icon?: string | null;
    dueAt?: string | null;
    parentGoalId?: string | null;
    period?: GoalPeriod;
    startDate?: string | null;
    status?: 'draft' | 'active';
  }) => invoke<Goal>('create_goal', params),
  update: (params: {
    id: string;
    title?: string;
    description?: string | null;
    color?: string | null;
    icon?: string | null;
    dueAt?: string | null;
    parentGoalId?: string | null;
    clearParentGoal?: boolean;
    progressMode?: string;
    progressValue?: number;
    progressTotal?: number;
    period?: GoalPeriod;
    startDate?: string | null;
    status?: 'draft' | 'active' | 'completed' | 'abandoned' | 'archived';
  }) => invoke<void>('update_goal', params),
  delete: (id: string) => invoke<void>('delete_goal', { id }),
  listDeleted: () => invoke<GoalWithDetails[]>('list_deleted_goals'),
  permanentlyDelete: (ids: string[]) => invoke<void>('permanently_delete_goals', { ids }),
  emptyTrash: () => invoke<void>('empty_goal_trash'),
  restoreDeleted: (ids: string[]) => invoke<void>('restore_deleted_goals', { ids }),
  archive: (id: string) => invoke<void>('archive_goal', { id }),
  saveReview: (params: { id: string; score?: number | null; note?: string | null }) =>
    invoke<void>('save_review', params),
  progress: (goalId: string) => invoke<number>('goal_progress', { goalId }),
  linkTaskToKR: (krId: string, taskId: string) => invoke<void>('link_task_to_kr', { krId, taskId }),
  unlinkTaskFromKR: (krId: string, taskId: string) => invoke<void>('unlink_task_from_kr', { krId, taskId }),
};

export const milestonesApi = {
  list: (goalId: string) => invoke<Milestone[]>('list_milestones', { goalId }),
  create: (params: { goalId: string; title: string }) => invoke<Milestone>('create_milestone', params),
  toggle: (id: string) => invoke<boolean>('toggle_milestone', { id }),
  delete: (id: string) => invoke<void>('delete_milestone', { id }),
  reorder: (ids: string[]) => invoke<void>('reorder_milestones', { ids }),
};

export const keyResultsApi = {
  list: (goalId: string) => invoke<KeyResultWithLogs[]>('list_key_results', { goalId }),
  create: (params: {
    goalId: string;
    title: string;
    krType: string;
    startValue?: number;
    targetValue?: number;
    unit?: string;
    weight?: number;
    healthStatus?: string;
  }) => invoke<KeyResult>('create_key_result', params),
  update: (params: {
    id: string;
    title?: string;
    krType?: string;
    startValue?: number;
    targetValue?: number;
    unit?: string;
    weight?: number;
    healthStatus?: string;
  }) => invoke<void>('update_key_result', params),
  checkIn: (params: { krId: string; newValue: number; comment?: string }) =>
    invoke<KeyResultWithLogs>('check_in_kr', params),
  toggleCompleted: (id: string) => invoke<boolean>('toggle_kr_completed', { id }),
  delete: (id: string) => invoke<void>('delete_key_result', { id }),
  reorder: (ids: string[]) => invoke<void>('reorder_key_results', { ids }),
  history: (krId: string, limit?: number) =>
    invoke<ProgressLog[]>('kr_progress_history', { krId, limit: limit ?? null }),
};
