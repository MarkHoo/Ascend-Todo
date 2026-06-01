#!/usr/bin/env node
// Copy WebView2Loader.dll (and other Rust build outputs) to a location Tauri's
// resources config can find. Runs after Rust build, before bundling.
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const releaseDir = path.join(projectRoot, 'target', 'release');
const resourcesDir = path.join(projectRoot, 'resources');

if (!fs.existsSync(resourcesDir)) {
  fs.mkdirSync(resourcesDir, { recursive: true });
}

const filesToCopy = ['WebView2Loader.dll'];

for (const f of filesToCopy) {
  const src = path.join(releaseDir, f);
  const dst = path.join(resourcesDir, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`[copy-resources] ${f} copied to resources/`);
  } else {
    console.error(`[copy-resources] WARN: ${src} not found`);
  }
}
