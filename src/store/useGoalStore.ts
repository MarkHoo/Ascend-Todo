import { create } from 'zustand';
import { goalsApi, milestonesApi } from '@/api';
import type { GoalWithMilestones } from '@/types';

interface State {
  goals: GoalWithMilestones[];
  loading: boolean;
  fetchGoals: () => Promise<void>;
  createGoal: (params: { title: string; description?: string | null; color?: string | null; icon?: string | null; dueAt?: string | null; parentGoalId?: string | null }) => Promise<void>;
  updateGoal: (id: string, patch: { title?: string; description?: string | null; color?: string | null; icon?: string | null; dueAt?: string | null }) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  createMilestone: (goalId: string, title: string) => Promise<void>;
  toggleMilestone: (id: string) => Promise<void>;
  deleteMilestone: (id: string) => Promise<void>;
}

export const useGoalStore = create<State>((set, get) => ({
  goals: [],
  loading: false,
  fetchGoals: async () => {
    set({ loading: true });
    const goals = await goalsApi.list();
    set({ goals, loading: false });
  },
  createGoal: async (params) => {
    await goalsApi.create(params);
    await get().fetchGoals();
  },
  updateGoal: async (id, patch) => {
    await goalsApi.update({ id, ...patch });
    await get().fetchGoals();
  },
  deleteGoal: async (id) => {
    await goalsApi.delete(id);
    await get().fetchGoals();
  },
  createMilestone: async (goalId, title) => {
    await milestonesApi.create({ goalId, title });
    await get().fetchGoals();
  },
  toggleMilestone: async (id) => {
    await milestonesApi.toggle(id);
    await get().fetchGoals();
  },
  deleteMilestone: async (id) => {
    await milestonesApi.delete(id);
    await get().fetchGoals();
  },
}));
