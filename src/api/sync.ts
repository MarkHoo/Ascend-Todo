import { invoke } from '@tauri-apps/api/core';
import type { SyncStatus } from '@/types';

export const syncApi = {
  status: () => invoke<SyncStatus>('sync_status'),
  push: () => invoke<SyncStatus>('sync_push'),
  pull: () => invoke<SyncStatus>('sync_pull'),
  merge: () => invoke<SyncStatus>('sync_merge'),
  exportBackup: () => invoke<string>('export_data_backup'),
  importBackup: (content: string) => invoke<SyncStatus>('import_data_backup', { content }),
};
