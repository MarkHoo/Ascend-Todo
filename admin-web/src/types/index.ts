export type User = {
  id: string;
  email: string;
  emailVerifiedAt?: string | null;
  nickname?: string | null;
  status: string;
  role: string;
  currentClientVersion?: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
};

export type Device = {
  id: string;
  userId: string;
  userNickname?: string | null;
  deviceName: string;
  deviceFingerprint: string;
  platform?: string | null;
  appVersion?: string | null;
  lastLoginAt?: string | null;
  lastSyncAt?: string | null;
  revokedAt?: string | null;
  wipeRequestedAt?: string | null;
  wipedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SyncLog = {
  id: string;
  userId: string;
  userNickname?: string | null;
  deviceId?: string | null;
  action: string;
  status: string;
  localVersion?: number | null;
  remoteVersion?: number | null;
  errorMessage?: string | null;
  payloadSize?: number | null;
  createdAt: string;
};

export type ClientVersionStat = {
  version: string;
  users: number;
  devices: number;
};

export type Overview = {
  totalUsers: number;
  verifiedUsers: number;
  totalDevices: number;
  syncSuccessToday: number;
  syncFailedToday: number;
  clientVersions: ClientVersionStat[];
};
