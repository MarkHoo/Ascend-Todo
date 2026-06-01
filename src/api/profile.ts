import { invoke } from '@tauri-apps/api/core';
import type { UserProfile } from '@/types';

export const profileApi = {
  get: () => invoke<UserProfile>('get_profile'),
  save: (params: {
    nickname?: string;
    avatar?: string | null;
    phone?: string | null;
    email?: string | null;
    signature?: string | null;
  }) => invoke<void>('save_profile', params),
};
