import { invoke } from '@tauri-apps/api/core';
import type { Goal, GoalWithMilestones, Milestone } from '@/types';

export const goalsApi = {
  list: () => invoke<GoalWithMilestones[]>('list_goals'),
  get: (id: string) => invoke<GoalWithMilestones>('get_goal', { id }),
  create: (params: {
    title: string;
    description?: string | null;
    color?: string | null;
    icon?: string | null;
    dueAt?: string | null;
    parentGoalId?: string | null;
  }) => invoke<Goal>('create_goal', params),
  update: (params: {
    id: string;
    title?: string;
    description?: string | null;
    color?: string | null;
    icon?: string | null;
    dueAt?: string | null;
    progressMode?: string;
    progressValue?: number;
    progressTotal?: number;
  }) => invoke<void>('update_goal', params),
  delete: (id: string) => invoke<void>('delete_goal', { id }),
  progress: (goalId: string) => invoke<number>('goal_progress', { goalId }),
};

export const milestonesApi = {
  list: (goalId: string) => invoke<Milestone[]>('list_milestones', { goalId }),
  create: (params: { goalId: string; title: string }) => invoke<Milestone>('create_milestone', params),
  toggle: (id: string) => invoke<boolean>('toggle_milestone', { id }),
  delete: (id: string) => invoke<void>('delete_milestone', { id }),
  reorder: (ids: string[]) => invoke<void>('reorder_milestones', { ids }),
};
