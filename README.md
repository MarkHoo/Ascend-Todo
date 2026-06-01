# Ascend Todo / 光阶Todo

> **Master your time, elevate your life.** / **拾光而上，有序人生。**

A cross-platform desktop task manager built with **React 18 + TypeScript + Tauri 2 + Rust + SQLite**.

## ✨ Features

- **Sidebar navigation**: Overview · Boards · Goals · Calendar · Pomodoro · Profile
- **Trello-style Boards** with drag-and-drop, subtasks, due dates, daily reminders, pin to sidebar
- **Goals** with milestones and sub-goals, automatic progress calculation
- **Calendar**: day / week / month views, 24-hour weekly grid, cross-day/cross-month tasks
- **Pomodoro** with countdown or count-up modes, custom duration, task linking, sound + desktop notification
- **Overview**: GitHub-style heatmap (53×7), summary charts, daily motivational quote
- **Profile**: nickname / avatar / phone / email / signature
- **4 themes**: Aurora Day · Mint Garden · Midnight · Forest
- **3 languages**: English (default) · 简体中文 · 繁體中文
- **Week start**: Monday or Sunday
- **Cloud sync (Mock)**: local-account login + push/pull snapshot, toggle on/off
- **Auto-update check** (default on, can disable)
- **Cross-day/month/year** tasks with reminders
- All data persisted in local SQLite (`%AppData%/com.ascend.todo/ascend.db`)

## 🛠️ Tech Stack

- Frontend: Vite 5 · React 18 · TypeScript · Tailwind CSS · Zustand
- Routing: react-router-dom (HashRouter for Tauri)
- i18n: i18next + react-i18next
- Drag & drop: @dnd-kit
- Charts: ECharts
- Date utilities: dayjs
- Backend: Rust · Tauri 2 · rusqlite (bundled)
- Plugins: notification, store, fs, dialog, os, process, updater

## 📁 Structure

```
├── src/                  # React frontend
│   ├── api/              # Tauri command wrappers
│   ├── components/       # UI components
│   ├── i18n/             # Translations (en, zh-CN, zh-TW)
│   ├── pages/            # 7 page components
│   ├── store/            # Zustand stores
│   ├── styles/           # Theme CSS variables
│   ├── types/            # TypeScript types
│   └── utils/            # Helpers (date, format, quotes, sound)
└── src-tauri/            # Rust backend
    └── src/
        ├── commands/     # Tauri commands (one file per domain)
        ├── db.rs         # SQLite connection + migrations
        ├── models.rs     # Serde DTOs
        ├── sync_engine.rs# Mock sync engine
        └── ...
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Rust 1.77+ (`rustup install stable`)
- Tauri CLI: installed via dev dependency
- Platform deps:
  - **Windows**: WebView2 (Win11 has it; Win10 install [Evergreen Runtime](https://developer.microsoft.com/microsoft-edge/webview2/))
  - **macOS**: Xcode Command Line Tools
  - **Linux**: see [Tauri prerequisites](https://tauri.app/start/prerequisites/)

### Install

```bash
cd D:/cc-code/111
npm install
```

### Run (development)

```bash
npm run tauri:dev
```

The first run will compile the Rust backend (a few minutes). Subsequent runs are fast.

### Build (release)

```bash
npm run tauri:build
```

This produces native installers for your platform (`.msi` / `.exe` on Windows, `.dmg` / `.app` on macOS, `.deb` / `.AppImage` on Linux) under `src-tauri/target/release/bundle/`.

## 🧩 Development Scripts

- `npm run dev` — Vite dev server only (no Tauri)
- `npm run build` — frontend type-check + Vite build
- `npm run typecheck` — TypeScript only
- `npm run tauri:dev` — full Tauri dev mode
- `npm run tauri:build` — production bundle

## 🎨 Themes

Edit `src/styles/themes.css` to tweak colors. Themes are switched at runtime via `data-theme` on `<html>`. The 4 themes are:

| Key           | Name          | Type  |
| ------------- | ------------- | ----- |
| `aurora-day`  | Aurora Day    | light |
| `mint-garden` | Mint Garden   | light |
| `midnight`    | Midnight      | dark  |
| `forest`      | Forest        | dark  |

## 🌐 Adding a Language

1. Copy `src/i18n/en.json` to `src/i18n/<code>.json` and translate.
2. Add an entry to `LANGUAGES` in `src/utils/constants.ts`.
3. Add the code to `supportedLngs` in `src/i18n/index.ts`.

## 🗄️ Database Schema

See `src-tauri/src/db.rs` `migrate()` for the full schema. Tables: `boards`, `lists`, `tasks`, `subtasks`, `goals`, `milestones`, `pomodoro_sessions`, `check_ins`, `user_profile`, `settings`, `sync_meta`.

Migrations are versioned via `PRAGMA user_version`. Add new migrations by checking the current version and applying incremental changes.

## 🔄 Sync (Mock)

The sync engine currently stores a single in-process snapshot. Replace `src-tauri/src/sync_engine.rs::mock_push` and `mock_pull` with real HTTP calls (e.g. `reqwest`) to wire up a real server.

UI: Settings → Account → Login/Register → enable Sync → Push/Pull.

## 📜 License

MIT

## 📚 Documentation

- [USER_GUIDE.md](./USER_GUIDE.md) — English user guide (detailed instructions, FAQ)
- [USER_GUIDE_ZH.md](./USER_GUIDE_ZH.md) — 中文用户使用说明（各模块详细操作、常见问题）
- [DEVELOPING.md](./DEVELOPING.md) — Developer docs (architecture, adding features, debugging)
