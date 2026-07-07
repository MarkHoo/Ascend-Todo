# Ascend Todo

[English](./README.md) | [Simplified Chinese](./README.zh-CN.md) | [Traditional Chinese](./README.zh-TW.md)

Ascend Todo is a cross-platform desktop planner for tasks, goals, calendars, focus sessions, reviews, and optional cloud sync. The repository contains the Tauri desktop app, the Rust sync API server, the React admin dashboard, and the static product website for Netlify.

## Features

- Task boards with lists, rich cards, subtasks, priorities, reminders, due dates, Markdown notes, and drag-and-drop workflows.
- Goal management with key results, weighted progress, check dates, progress history, reviews, and linked tasks.
- Calendar day, week, month, and agenda views with timed events, all-day events, holidays, unscheduled tasks, and drag scheduling.
- Pomodoro focus with countdown/count-up modes, task linking, reminders, statistics, and notifications.
- Local-first SQLite storage. Cloud sync is optional and uses account sign-in plus verified email.
- Email/password accounts, email verification, device management, sync logs, and an admin operations dashboard.
- Product website with language detection, light/dark themes, GitHub latest-release download detection, and Netlify deployment support.
- English, Simplified Chinese, and Traditional Chinese UI.

## Verified Local Development Environment

The current local workspace has been verified with:

- Windows 11 / PowerShell
- Node.js `v22.9.0`
- npm `11.5.2`
- npx `11.5.2`
- Rust `rustc 1.95.0`
- Cargo `cargo 1.95.0`
- Tauri CLI `tauri-cli 2.11.2`
- MySQL Community Server `8.0.32`
- Tauri `2.x`
- Vite `6.4.x`
- React `18.3.x`
- TypeScript `5.6.x`
- Backend API port: `11911`
- Admin web port: `11912`
- Website local preview port used in development: `11913`

## Repository Layout

```text
.
├── .github/workflows/      # GitHub Actions release automation
├── admin-web/              # React admin dashboard
├── deploy/                 # Docker and deployment examples
├── docs/                   # API, sync, security, client, and operations docs
├── public/                 # Desktop web assets
├── server/                 # Rust cloud-sync API backend
├── src/                    # Desktop React frontend
├── src-tauri/              # Tauri/Rust desktop runtime
├── website/                # Static product website for Netlify
├── netlify.toml            # Netlify configuration
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

Run the backend API:

```bash
cd server
cargo run --bin ascend-todo-server
```

Run the admin dashboard:

```bash
cd admin-web
npm install
npm run dev
```

The admin dashboard defaults to:

```text
http://localhost:11912
```

Preview the product website locally:

```bash
python -m http.server 11913 --directory website
```

Then open:

```text
http://127.0.0.1:11913
```

## Backend Configuration

The sync API server uses environment variables from `server/.env`.

Typical local values:

```text
SERVER_HOST=0.0.0.0
SERVER_PORT=11911
DATABASE_URL=mysql://root:123456@127.0.0.1:3306/ascend_todo
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=replace-with-a-long-random-secret
SMTP_HOST=smtp.qq.com
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM=
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-this-password
ADMIN_NICKNAME=Admin
```

Create or update the admin account:

```bash
cd server
cargo run --bin bootstrap_admin
```

## Build And Packaging

Install dependencies first:

```bash
npm install
```

Build the desktop frontend only:

```bash
npm run build
```

Build the current platform with Tauri defaults:

```bash
npm run tauri:build
```

Build Windows x86_64 MSI and rename it to the release naming format:

```bash
npm run package:windows
```

Build Windows x86_64 EXE installer:

```bash
npm run tauri -- build --bundles nsis
```

Build Windows x86_64 MSI directly:

```bash
npm run tauri -- build --bundles msi
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

GitHub Actions publishes release assets with this naming pattern:

```text
Ascend-Todo-v<version>-windows-x86_64.msi
Ascend-Todo-v<version>-windows-x86_64.exe
Ascend-Todo-v<version>-macos-x86_64.dmg
Ascend-Todo-v<version>-macos-aarch64.dmg
Ascend-Todo-v<version>-linux-x86_64.AppImage
Ascend-Todo-v<version>-linux-aarch64.AppImage
```

## Website Deployment

The product website is in `website/`.

Netlify configuration:

- Build command: leave empty
- Publish directory: `website`
- Custom domain example: `todo.foresai.com`

The website reads the latest GitHub Release in the browser and automatically selects the best installer for the user's operating system.

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
