import { invoke } from '@tauri-apps/api/core';

export const updatesApi = {
  installPackage: (packagePath: string) =>
    invoke<void>('install_update_package', { packagePath }),
};
