#!/usr/bin/env node
// Copy WebView2Loader.dll (and other Rust build outputs) to a location Tauri's
// resources config can find. The placeholder is created before Rust build
// because Tauri validates configured resources early; this script replaces it
// with the real DLL before bundling.
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const resourcesDir = path.join(projectRoot, 'resources');
const targetDir = path.join(projectRoot, 'target');

if (!fs.existsSync(resourcesDir)) {
  fs.mkdirSync(resourcesDir, { recursive: true });
}

function walkForFile(dir, fileName, depth = 0) {
  if (!fs.existsSync(dir) || depth > 6) return null;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === fileName && fs.statSync(fullPath).size > 0) {
      return fullPath;
    }
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = walkForFile(path.join(dir, entry.name), fileName, depth + 1);
    if (found) return found;
  }
  return null;
}

function candidatePaths(fileName) {
  const triples = [
    process.env.TAURI_ENV_TARGET_TRIPLE,
    process.env.CARGO_BUILD_TARGET,
    'x86_64-pc-windows-msvc',
    'aarch64-pc-windows-msvc',
    'i686-pc-windows-msvc',
  ].filter(Boolean);

  return [
    path.join(targetDir, 'release', fileName),
    ...triples.map((triple) => path.join(targetDir, triple, 'release', fileName)),
    walkForFile(targetDir, fileName),
  ].filter(Boolean);
}

for (const fileName of ['WebView2Loader.dll']) {
  const src = candidatePaths(fileName).find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).size > 0);
  const dst = path.join(resourcesDir, fileName);
  if (src) {
    fs.copyFileSync(src, dst);
    console.log(`[copy-resources] ${fileName} copied from ${src}`);
  } else {
    console.warn(`[copy-resources] WARN: ${fileName} not found; keeping existing placeholder`);
  }
}
