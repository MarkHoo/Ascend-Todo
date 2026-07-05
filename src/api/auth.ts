import { invoke } from '@tauri-apps/api/core';
import type { AuthSession } from '@/types';

export interface CloudDevice {
  id: string;
  deviceName: string;
  platform?: string | null;
  appVersion?: string | null;
  lastLoginAt?: string | null;
  lastSyncAt?: string | null;
  revokedAt?: string | null;
}

export const authApi = {
  register: (params: { email: string; password: string; serverUrl?: string }) =>
    invoke<AuthSession>('register', params),
  login: (params: { email: string; password: string; serverUrl?: string }) =>
    invoke<AuthSession>('login', params),
  logout: () => invoke<void>('logout'),
  current: () => invoke<AuthSession | null>('current_session'),
  refresh: () => invoke<AuthSession | null>('refresh_cloud_session'),
  sendEmailVerificationCode: () => invoke<void>('send_email_verification_code'),
  verifyEmailCode: (code: string) => invoke<AuthSession>('verify_email_code', { code }),
  listDevices: () => invoke<CloudDevice[]>('list_cloud_devices'),
};
