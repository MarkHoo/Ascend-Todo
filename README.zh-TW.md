# 光階Todo

[English](./README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md)

光階Todo 是一款跨平台桌面效率應用，用於任務規劃、目標管理、日曆安排和專注統計。專案包含本機優先的 Tauri 桌面端、Rust 雲端同步後端，以及 React 管理後台。

## 功能特色

- 任務看板：列表、卡片、子任務、優先級、截止時間、提醒和拖曳流程。
- 目標管理：里程碑、關鍵結果、權重進度、復盤記錄和關聯任務。
- 日曆：日、週、月視圖，支援時間段日程、全天日程、節假日和未安排任務。
- 番茄鐘：倒數/正計時、關聯任務、統計和通知。
- 本機 SQLite 儲存，可選帳號雲端同步。
- 信箱+密碼帳號、信箱驗證、裝置管理和後台營運面板。
- 英文、簡體中文、繁體中文介面。

## 目前開發環境

目前專案開發和驗證環境如下：

- Windows 11 / PowerShell
- Node.js 25.x
- npm 11.x
- Rust stable，edition 2021
- Tauri 2.x
- Vite 6.4.x
- React 18.3.x
- TypeScript 5.6.x
- MySQL 8.x，用於雲端同步後端
- 後端連接埠：`11911`
- 管理後台連接埠：`11912`

## 目錄結構

```text
.
├── .github/workflows/      # CI 和發布自動化
├── admin-web/              # React 管理後台
├── deploy/                 # 部署範例
├── docs/                   # 產品、API、同步、安全和維運文件
├── public/                 # 桌面端 Web 資源
├── server/                 # Rust 雲端同步後端
├── src/                    # 桌面端 React 前端
├── src-tauri/              # Tauri/Rust 桌面執行層
├── LICENSE
├── README.md
├── README.zh-CN.md
└── README.zh-TW.md
```

## 開發

安裝桌面端依賴：

```bash
npm install
```

執行桌面端：

```bash
npm run tauri:dev
```

執行後端：

```bash
cd server
cargo run --bin ascend-todo-server
```

執行管理後台：

```bash
cd admin-web
npm install
npm run dev -- --host 127.0.0.1 --port 11912
```

## 打包

先安裝依賴：

```bash
npm install
```

僅建置前端：

```bash
npm run build
```

按目前系統使用 Tauri 預設設定打包：

```bash
npm run tauri:build
```

建置 Windows x86_64 MSI：

```bash
npm run package:windows
```

在 Intel macOS 環境建置 macOS x86_64 DMG：

```bash
npm run tauri -- build --target x86_64-apple-darwin --bundles dmg
```

建置 macOS Apple Silicon DMG：

```bash
npm run tauri -- build --target aarch64-apple-darwin --bundles dmg
```

建置 Linux x86_64 AppImage：

```bash
npm run tauri -- build --target x86_64-unknown-linux-gnu --bundles appimage
```

建置 Linux aarch64 AppImage：

```bash
npm run tauri -- build --target aarch64-unknown-linux-gnu --bundles appimage
```

GitHub Actions 發布的安裝包命名格式：

```text
Ascend-Todo-v<version>-windows-x86_64.msi
Ascend-Todo-v<version>-macos-x86_64.dmg
Ascend-Todo-v<version>-macos-aarch64.dmg
Ascend-Todo-v<version>-linux-x86_64.AppImage
Ascend-Todo-v<version>-linux-aarch64.AppImage
```

## 文件

- [客戶端使用指南](./docs/client-user-guide.md)
- [API 文件](./docs/api.md)
- [客戶端接入](./docs/client-integration.md)
- [維運說明](./docs/operations.md)
- [安全說明](./docs/security.md)
- [同步設計](./docs/sync.md)
- [開發指南](./DEVELOPING.md)

## 開源協議

本專案使用 [Apache License 2.0](./LICENSE)。
