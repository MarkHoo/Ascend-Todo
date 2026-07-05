export type User = {
  id: string;
  email: string;
  email_verified_at?: string | null;
  nickname?: string | null;
  status: string;
  role: string;
  created_at: string;
  updated_at: string;
  last_login_at?: string | null;
};

export type Device = {
  id: string;
  user_id: string;
  device_name: string;
  device_fingerprint: string;
  platform?: string | null;
  app_version?: string | null;
  last_login_at?: string | null;
  last_sync_at?: string | null;
  revoked_at?: string | null;
  wipe_requested_at?: string | null;
  wiped_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type SyncLog = {
  id: string;
  user_id: string;
  device_id?: string | null;
  action: string;
  status: string;
  local_version?: number | null;
  remote_version?: number | null;
  error_message?: string | null;
  payload_size?: number | null;
  created_at: string;
};

export type Overview = {
  total_users: number;
  verified_users: number;
  total_devices: number;
  sync_success_today: number;
  sync_failed_today: number;
};

