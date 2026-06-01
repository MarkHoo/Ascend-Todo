import { invoke } from '@tauri-apps/api/core';
import type { AuthSession } from '@/types';

export const authApi = {
  register: (params: { nickname: string; password: string; serverUrl?: string }) =>
    invoke<AuthSession>('register', params),
  login: (params: { nickname: string; password: string; serverUrl?: string }) =>
    invoke<AuthSession>('login', params),
  logout: () => invoke<void>('logout'),
  current: () => invoke<AuthSession | null>('current_session'),
};
