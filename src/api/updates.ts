import { invoke } from '@tauri-apps/api/core';

export interface UpdateAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

export interface GitHubRelease {
  tag_name: string;
  name?: string | null;
  html_url?: string | null;
  draft: boolean;
  prerelease: boolean;
  assets: UpdateAsset[];
}

export const updatesApi = {
  fetchLatestRelease: () =>
    invoke<GitHubRelease>('fetch_latest_release'),
  downloadPackage: (assetUrl: string, packagePath: string) =>
    invoke<void>('download_update_package', { assetUrl, packagePath }),
  installPackage: (packagePath: string) =>
    invoke<void>('install_update_package', { packagePath }),
};
