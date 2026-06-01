import { invoke } from '@tauri-apps/api/core';
import type { SyncStatus } from '@/types';

export const syncApi = {
  status: () => invoke<SyncStatus>('sync_status'),
  push: () => invoke<SyncStatus>('sync_push'),
  pull: () => invoke<SyncStatus>('sync_pull'),
};
