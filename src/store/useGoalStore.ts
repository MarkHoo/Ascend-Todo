import { create } from 'zustand';
import { goalsApi, milestonesApi, keyResultsApi } from '@/api';
import type { Goal, GoalPeriod, GoalWithDetails } from '@/types';

interface State {
  goals: GoalWithDetails[];
  currentGoal: GoalWithDetails | null;
  loading: boolean;
  fetchGoals: () => Promise<void>;
  fetchGoal: (id: string) => Promise<void>;
  createGoal: (params: { title: string; description?: string | null; color?: string | null; icon?: string | null; dueAt?: string | null; parentGoalId?: string | null; period?: GoalPeriod; startDate?: string | null; status?: 'draft' | 'active' }) => Promise<Goal>;
  updateGoal: (id: string, patch: Record<string, unknown>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  archiveGoal: (id: string) => Promise<void>;
  saveReview: (id: string, score?: number | null, note?: string | null) => Promise<void>;
  createMilestone: (goalId: string, title: string) => Promise<void>;
  toggleMilestone: (id: string) => Promise<void>;
  deleteMilestone: (id: string) => Promise<void>;
  createKeyResult: (params: { goalId: string; title: string; krType: string; startValue?: number; targetValue?: number; unit?: string; weight?: number; healthStatus?: string; checkDate?: string | null }) => Promise<void>;
  updateKeyResult: (id: string, patch: Record<string, unknown>) => Promise<void>;
  checkInKeyResult: (krId: string, newValue: number, comment?: string) => Promise<void>;
  toggleKeyResult: (id: string) => Promise<void>;
  deleteKeyResult: (id: string) => Promise<void>;
  linkTaskToKR: (krId: string, taskId: string) => Promise<void>;
  unlinkTaskFromKR: (krId: string, taskId: string) => Promise<void>;
}

export const useGoalStore = create<State>((set, get) => ({
  goals: [],
  currentGoal: null,
  loading: false,

  fetchGoals: async () => {
    set({ loading: true });
    const goals = await goalsApi.list();
    set({ goals, loading: false });
  },

  fetchGoal: async (id: string) => {
    set({ loading: true });
    const goal = await goalsApi.get(id);
    set({ currentGoal: goal, loading: false });
  },

  createGoal: async (params) => {
    const goal = await goalsApi.create(params);
    await get().fetchGoals();
    return goal;
  },

  updateGoal: async (id, patch) => {
    await goalsApi.update({ id, ...patch });
    await get().fetchGoals();
    if (get().currentGoal?.id === id) {
      await get().fetchGoal(id);
    }
  },

  deleteGoal: async (id) => {
    await goalsApi.delete(id);
    if (get().currentGoal?.id === id) {
      set({ currentGoal: null });
    }
    await get().fetchGoals();
  },

  archiveGoal: async (id) => {
    await goalsApi.archive(id);
    await get().fetchGoals();
    if (get().currentGoal?.id === id) {
      await get().fetchGoal(id);
    }
  },

  saveReview: async (id, score, note) => {
    await goalsApi.saveReview({ id, score, note });
    await get().fetchGoals();
    if (get().currentGoal?.id === id) {
      await get().fetchGoal(id);
    }
  },

  createMilestone: async (goalId, title) => {
    await milestonesApi.create({ goalId, title });
    await get().fetchGoals();
    if (get().currentGoal?.id === goalId) {
      await get().fetchGoal(goalId);
    }
  },

  toggleMilestone: async (id) => {
    await milestonesApi.toggle(id);
    if (get().currentGoal) {
      await get().fetchGoal(get().currentGoal!.id);
    }
    await get().fetchGoals();
  },

  deleteMilestone: async (id) => {
    await milestonesApi.delete(id);
    if (get().currentGoal) {
      await get().fetchGoal(get().currentGoal!.id);
    }
    await get().fetchGoals();
  },

  createKeyResult: async (params) => {
    await keyResultsApi.create(params);
    if (get().currentGoal) {
      await get().fetchGoal(get().currentGoal!.id);
    }
    await get().fetchGoals();
  },

  updateKeyResult: async (id, patch) => {
    await keyResultsApi.update({ id, ...patch });
    if (get().currentGoal) {
      await get().fetchGoal(get().currentGoal!.id);
    }
    await get().fetchGoals();
  },

  checkInKeyResult: async (krId, newValue, comment) => {
    await keyResultsApi.checkIn({ krId, newValue, comment });
    if (get().currentGoal) {
      await get().fetchGoal(get().currentGoal!.id);
    }
    await get().fetchGoals();
  },

  toggleKeyResult: async (id) => {
    await keyResultsApi.toggleCompleted(id);
    if (get().currentGoal) {
      await get().fetchGoal(get().currentGoal!.id);
    }
    await get().fetchGoals();
  },

  deleteKeyResult: async (id) => {
    await keyResultsApi.delete(id);
    if (get().currentGoal) {
      await get().fetchGoal(get().currentGoal!.id);
    }
    await get().fetchGoals();
  },

  linkTaskToKR: async (krId, taskId) => {
    await goalsApi.linkTaskToKR(krId, taskId);
    if (get().currentGoal) {
      await get().fetchGoal(get().currentGoal!.id);
    }
    await get().fetchGoals();
  },

  unlinkTaskFromKR: async (krId, taskId) => {
    await goalsApi.unlinkTaskFromKR(krId, taskId);
    if (get().currentGoal) {
      await get().fetchGoal(get().currentGoal!.id);
    }
    await get().fetchGoals();
  },
}));
