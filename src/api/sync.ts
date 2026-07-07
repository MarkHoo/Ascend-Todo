import { invoke } from '@tauri-apps/api/core';
import type { Snapshot, SyncStatus } from '@/types';

export const syncApi = {
  status: () => invoke<SyncStatus>('sync_status'),
  snapshot: () => invoke<Snapshot>('sync_snapshot'),
  push: () => invoke<SyncStatus>('sync_push'),
  pull: () => invoke<SyncStatus>('sync_pull'),
  merge: () => invoke<SyncStatus>('sync_merge'),
  clearLocalData: () => invoke<SyncStatus>('sync_clear_local_data'),
  exportBackup: () => invoke<string>('export_data_backup'),
  importBackup: (content: string) => invoke<SyncStatus>('import_data_backup', { content }),
};
