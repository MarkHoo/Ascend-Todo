import { create } from 'zustand';
import { profileApi } from '@/api';
import type { UserProfile } from '@/types';

interface State {
  profile: UserProfile | null;
  fetchProfile: () => Promise<void>;
  saveProfile: (patch: {
    nickname?: string;
    avatar?: string | null;
    phone?: string | null;
    email?: string | null;
    signature?: string | null;
  }) => Promise<void>;
}

export const useProfileStore = create<State>((set, get) => ({
  profile: null,
  fetchProfile: async () => {
    try {
      const p = await profileApi.get();
      set({ profile: p });
    } catch {
      set({ profile: null });
    }
  },
  saveProfile: async (patch) => {
    await profileApi.save(patch);
    set((state) => ({
      profile: state.profile ? { ...state.profile, ...patch } : state.profile,
    }));
    await get().fetchProfile();
  },
}));
