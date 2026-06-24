import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { exit } from '@tauri-apps/plugin-process';
import { exists, mkdir, readDir, remove, writeFile } from '@tauri-apps/plugin-fs';
import { updatesApi } from '@/api';
import { APP_VERSION } from '@/utils/constants';

const GITHUB_RELEASE_API = 'https://api.github.com/repos/MarkHoo/Ascend-Todo/releases/latest';
const UPDATE_DIR = 'updates';
const CACHE_KEY = 'ascend:update-cache';

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error';

export interface CachedUpdate {
  version: string;
  tagName: string;
  assetName: string;
  assetUrl: string;
  packagePath: string;
  size: number;
  downloadedAt: string;
}

export interface UpdateStatus {
  state: UpdateState;
  currentVersion: string;
  latestVersion?: string;
  releaseName?: string;
  releaseUrl?: string;
  packagePath?: string;
  message?: string;
  error?: string;
}

interface GitHubRelease {
  tag_name: string;
  name?: string;
  html_url?: string;
  draft: boolean;
  prerelease: boolean;
  assets: Array<{
    name: string;
    size: number;
    browser_download_url: string;
  }>;
}

export function getCachedUpdate(): CachedUpdate | null {
  try {
    const value = localStorage.getItem(CACHE_KEY);
    return value ? JSON.parse(value) as CachedUpdate : null;
  } catch {
    return null;
  }
}

function setCachedUpdate(update: CachedUpdate) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(update));
}

function clearCachedUpdateMeta() {
  localStorage.removeItem(CACHE_KEY);
}

async function updateDir() {
  const base = await appLocalDataDir();
  return join(base, UPDATE_DIR);
}

async function ensureUpdateDir() {
  const dir = await updateDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

async function removeAllDownloadedPackages() {
  const dir = await updateDir();
  if (!(await exists(dir))) return;
  const entries = await readDir(dir);
  await Promise.all(entries.map((entry) => remove(joinPath(dir, entry.name), { recursive: true }).catch(() => {})));
  clearCachedUpdateMeta();
}

function joinPath(base: string, name: string) {
  return `${base.replace(/[\\/]+$/, '')}\\${name}`;
}

export async function cleanupInstalledUpdate() {
  const cached = getCachedUpdate();
  if (!cached) return;
  if (compareVersions(APP_VERSION, cached.version) >= 0) {
    await removeAllDownloadedPackages();
  }
}

export async function getDownloadedUpdateStatus(): Promise<UpdateStatus | null> {
  const cached = getCachedUpdate();
  if (!cached) return null;
  if (compareVersions(APP_VERSION, cached.version) >= 0) {
    await removeAllDownloadedPackages();
    return null;
  }
  if (!(await exists(cached.packagePath))) {
    clearCachedUpdateMeta();
    return null;
  }
  return {
    state: 'downloaded',
    currentVersion: APP_VERSION,
    latestVersion: cached.version,
    packagePath: cached.packagePath,
    message: `新版本 v${cached.version} 已下载`,
  };
}

export async function checkForAppUpdate(options: {
  silent?: boolean;
  onStatus?: (status: UpdateStatus) => void;
} = {}): Promise<UpdateStatus> {
  const emit = (status: UpdateStatus) => {
    options.onStatus?.(status);
    return status;
  };

  try {
    emit({ state: 'checking', currentVersion: APP_VERSION, message: '正在检查 GitHub Release' });
    await cleanupInstalledUpdate();

    const response = await fetch(GITHUB_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) {
      throw new Error(`GitHub Release 请求失败：${response.status}`);
    }

    const release = await response.json() as GitHubRelease;
    const latestVersion = normalizeVersion(release.tag_name);
    const baseStatus = {
      currentVersion: APP_VERSION,
      latestVersion,
      releaseName: release.name,
      releaseUrl: release.html_url,
    };

    if (release.draft || release.prerelease || compareVersions(latestVersion, APP_VERSION) <= 0) {
      return emit({ ...baseStatus, state: 'not-available', message: '当前已是最新版本' });
    }

    const asset = pickInstallerAsset(release);
    if (!asset) {
      throw new Error('GitHub Release 中未找到 Windows x64 安装包');
    }

    emit({ ...baseStatus, state: 'available', message: `发现新版本 v${latestVersion}` });

    const cached = getCachedUpdate();
    if (cached && cached.version === latestVersion && await exists(cached.packagePath)) {
      return emit({
        ...baseStatus,
        state: 'downloaded',
        packagePath: cached.packagePath,
        message: `新版本 v${latestVersion} 已下载`,
      });
    }

    if (cached && cached.version !== latestVersion) {
      await removeAllDownloadedPackages();
    }

    emit({ ...baseStatus, state: 'downloading', message: `正在静默下载 v${latestVersion}` });
    const dir = await ensureUpdateDir();
    const packagePath = await join(dir, safeAssetName(asset.name));
    const assetResponse = await fetch(asset.browser_download_url);
    if (!assetResponse.ok) {
      throw new Error(`安装包下载失败：${assetResponse.status}`);
    }
    const bytes = new Uint8Array(await assetResponse.arrayBuffer());
    await writeFile(packagePath, bytes);

    setCachedUpdate({
      version: latestVersion,
      tagName: release.tag_name,
      assetName: asset.name,
      assetUrl: asset.browser_download_url,
      packagePath,
      size: asset.size,
      downloadedAt: new Date().toISOString(),
    });

    return emit({
      ...baseStatus,
      state: 'downloaded',
      packagePath,
      message: `新版本 v${latestVersion} 已下载`,
    });
  } catch (error) {
    const status = {
      state: 'error' as const,
      currentVersion: APP_VERSION,
      error: String(error),
      message: options.silent ? undefined : '更新检查失败',
    };
    return emit(status);
  }
}

export async function installDownloadedUpdate() {
  const cached = getCachedUpdate();
  if (!cached) {
    throw new Error('没有已下载的更新安装包');
  }
  if (!(await exists(cached.packagePath))) {
    clearCachedUpdateMeta();
    throw new Error('更新安装包已不存在，请重新检查更新');
  }
  await updatesApi.installPackage(cached.packagePath);
  window.setTimeout(() => {
    exit(0).catch(() => {});
  }, 800);
}

function pickInstallerAsset(release: GitHubRelease) {
  const assets = release.assets.filter((asset) => /\.exe$/i.test(asset.name) || /\.msi$/i.test(asset.name));
  return assets.find((asset) => /x64.*setup\.exe$/i.test(asset.name))
    || assets.find((asset) => /setup\.exe$/i.test(asset.name))
    || assets.find((asset) => /x64.*\.msi$/i.test(asset.name))
    || assets[0];
}

function safeAssetName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

function normalizeVersion(version: string) {
  return version.trim().replace(/^v/i, '');
}

export function compareVersions(left: string, right: string) {
  const a = normalizeVersion(left).split(/[.-]/).map((part) => Number.parseInt(part, 10));
  const b = normalizeVersion(right).split(/[.-]/).map((part) => Number.parseInt(part, 10));
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const av = Number.isFinite(a[index]) ? a[index] : 0;
    const bv = Number.isFinite(b[index]) ? b[index] : 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}
