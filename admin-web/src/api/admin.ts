import { api } from './client';
import type { Device, Overview, SyncLog, User } from '@/types';

export const adminApi = {
  login: (input: {
    email: string;
    password: string;
    deviceName: string;
    deviceFingerprint: string;
    platform?: string;
    appVersion?: string;
  }) => api<{ accessToken: string }>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify(input),
  }),
  overview: () => api<Overview>('/api/admin/overview'),
  users: () => api<User[]>('/api/admin/users'),
  user: (id: string) => api<User>(`/api/admin/users/${id}`),
  devices: () => api<Device[]>('/api/admin/devices'),
  syncLogs: () => api<SyncLog[]>('/api/admin/sync-logs'),
  systemHealth: () => api<{ ok: boolean; database: boolean; version: string }>('/api/admin/system-health'),
};
