import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthSession } from '@/types';

interface State {
  session: AuthSession | null;
  setSession: (s: AuthSession | null) => void;
}

export const useAuthStore = create<State>()(
  persist(
    (set) => ({
      session: null,
      setSession: (s) => set({ session: s }),
    }),
    {
      name: 'ascend:auth',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
