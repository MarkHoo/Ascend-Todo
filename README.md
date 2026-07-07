# Ascend Todo

[English](./README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md)

Ascend Todo is a cross-platform desktop productivity app for planning tasks, managing goals, scheduling calendar events, and tracking focus sessions. It includes a local-first Tauri desktop app, a Rust cloud-sync backend, and a React admin dashboard.

## Features

- Task boards with lists, cards, subtasks, priorities, due dates, reminders, and drag-and-drop workflows.
- Goals with milestones, key results, weighted progress, review notes, and linked tasks.
- Calendar day, week, and month views with timed events, all-day events, holidays, and unscheduled tasks.
- Pomodoro focus timer with countdown/count-up modes, task linking, statistics, and notifications.
- Local SQLite storage with optional account cloud sync.
- Email/password accounts, email verification, device management, and admin operations dashboard.
- English, Simplified Chinese, and Traditional Chinese UI.

## Current Development Environment

This repository is currently developed and verified with:

- Windows 11 / PowerShell
- Node.js 25.x
- npm 11.x
- Rust stable, edition 2021
- Tauri 2.x
- Vite 6.4.x
- React 18.3.x
- TypeScript 5.6.x
- MySQL 8.x for the cloud-sync backend
- Backend port: `11911`
- Admin web port: `11912`

## Repository Layout

```text
.
├── .github/workflows/      # CI and release automation
├── admin-web/              # React admin dashboard
├── deploy/                 # Deployment examples
├── docs/                   # API, sync, security, and operations docs
├── public/                 # Desktop web assets
├── server/                 # Rust cloud-sync backend
├── src/                    # Desktop React frontend
├── src-tauri/              # Tauri/Rust desktop runtime
├── LICENSE
├── README.md
├── README.zh-CN.md
└── README.zh-TW.md
```

## Development

Install desktop dependencies:

```bash
npm install
```

Run the desktop app:

```bash
npm run tauri:dev
```

Run the backend:

```bash
cd server
cargo run --bin ascend-todo-server
```

Run the admin dashboard:

```bash
cd admin-web
npm install
npm run dev -- --host 127.0.0.1 --port 11912
```

## Packaging

Install dependencies first:

```bash
npm install
```

Build the frontend only:

```bash
npm run build
```

Build the current platform with Tauri defaults:

```bash
npm run tauri:build
```

Build Windows x86_64 MSI:

```bash
npm run package:windows
```

Build macOS x86_64 DMG on an Intel macOS runner or machine:

```bash
npm run tauri -- build --target x86_64-apple-darwin --bundles dmg
```

Build macOS Apple Silicon DMG:

```bash
npm run tauri -- build --target aarch64-apple-darwin --bundles dmg
```

Build Linux x86_64 AppImage:

```bash
npm run tauri -- build --target x86_64-unknown-linux-gnu --bundles appimage
```

Build Linux aarch64 AppImage:

```bash
npm run tauri -- build --target aarch64-unknown-linux-gnu --bundles appimage
```

GitHub Actions publishes packages with this naming pattern:

```text
Ascend-Todo-v<version>-windows-x86_64.msi
Ascend-Todo-v<version>-macos-x86_64.dmg
Ascend-Todo-v<version>-macos-aarch64.dmg
Ascend-Todo-v<version>-linux-x86_64.AppImage
Ascend-Todo-v<version>-linux-aarch64.AppImage
```

## Documentation

- [Client user guide](./docs/client-user-guide.md)
- [API documentation](./docs/api.md)
- [Client integration](./docs/client-integration.md)
- [Operations guide](./docs/operations.md)
- [Security notes](./docs/security.md)
- [Sync design](./docs/sync.md)
- [Development guide](./DEVELOPING.md)

## License

Licensed under the [Apache License 2.0](./LICENSE).
