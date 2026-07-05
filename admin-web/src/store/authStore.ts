import { create } from 'zustand';

type AuthState = {
  token: string;
  setToken: (token: string) => void;
  logout: () => void;
};

const TOKEN_KEY = 'ascend.admin.token';

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem(TOKEN_KEY) || '',
  setToken: (token) => {
    localStorage.setItem(TOKEN_KEY, token);
    set({ token });
  },
  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ token: '' });
  },
}));

