#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const bundleDir = path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'msi');
const version = packageJson.version;
const targetName = `Ascend-Todo-v${version}-windows-x86_64.msi`;
const targetPath = path.join(bundleDir, targetName);

if (!fs.existsSync(bundleDir)) {
  throw new Error(`MSI bundle directory not found: ${bundleDir}`);
}

const candidates = fs.readdirSync(bundleDir)
  .filter((name) => name.toLowerCase().endsWith('.msi') && name !== targetName)
  .map((name) => {
    const fullPath = path.join(bundleDir, name);
    return { name, fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
  })
  .sort((a, b) => b.mtimeMs - a.mtimeMs);

if (candidates.length === 0 && !fs.existsSync(targetPath)) {
  throw new Error(`No MSI bundle found in ${bundleDir}`);
}

if (candidates.length > 0) {
  fs.copyFileSync(candidates[0].fullPath, targetPath);
  fs.unlinkSync(candidates[0].fullPath);
}

for (const candidate of candidates.slice(1)) {
  if (candidate.name.includes(version)) {
    fs.unlinkSync(candidate.fullPath);
  }
}

console.log(`[rename-windows-msi] ${targetPath}`);
