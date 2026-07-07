# 光階Todo

[English](./README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md)

光階Todo 是一款跨平台桌面計劃工具，用於管理任務、目標、日曆、專注、複盤和可選的雲端同步。本倉庫包含 Tauri 桌面客戶端、Rust 同步 API 後端、React 管理後台，以及用於 Netlify 託管的產品官網。

## 功能特色

- 任務看板：列表、富文本卡片、子任務、優先級、提醒、截止時間、Markdown 說明和拖拽流轉。
- 目標管理：關鍵結果、權重進度、檢查日期、進度歷史、複盤記錄和關聯任務。
- 日曆：日、週、月、日程檢視，支援時間段日程、全天日程、節假日、未安排任務和拖拽排期。
- 番茄鐘：倒數/正計時、關聯任務、提醒、統計和通知。
- 本機優先 SQLite 儲存，雲端同步為可選功能，需要登入帳號並完成信箱驗證。
- 信箱+密碼帳號、信箱驗證碼、裝置管理、同步日誌和管理員營運後台。
- 產品官網支援語言識別、淺色/深色主題、GitHub 最新 Release 下載識別和 Netlify 部署。
- 支援英文、簡體中文和繁體中文介面。

## 已核實的本機開發環境

目前本機工作區已實際核實為：

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
- 後端 API 連接埠：`11911`
- 管理後台連接埠：`11912`
- 官網本機預覽連接埠：`11913`

## 目錄結構

```text
.
├── .github/workflows/      # GitHub Actions 發布自動化
├── admin-web/              # React 管理後台
├── deploy/                 # Docker 與部署示例
├── docs/                   # API、同步、安全、客戶端和維運文件
├── public/                 # 桌面端 Web 資源
├── server/                 # Rust 雲端同步 API 後端
├── src/                    # 桌面端 React 前端
├── src-tauri/              # Tauri/Rust 桌面執行層
├── website/                # Netlify 靜態產品官網
├── netlify.toml            # Netlify 設定
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

執行桌面客戶端：

```bash
npm run tauri:dev
```

執行後端 API：

```bash
cd server
cargo run --bin ascend-todo-server
```

執行管理後台：

```bash
cd admin-web
npm install
npm run dev
```

管理後台預設訪問地址：

```text
http://localhost:11912
```

本機預覽產品官網：

```bash
python -m http.server 11913 --directory website
```

然後打開：

```text
http://127.0.0.1:11913
```

## 後端設定

同步 API 後端使用 `server/.env` 中的環境變數。

本機常用設定示例：

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

建立或更新管理員帳號：

```bash
cd server
cargo run --bin bootstrap_admin
```

## 建置與打包

先安裝依賴：

```bash
npm install
```

僅建置桌面端前端：

```bash
npm run build
```

按目前平台使用 Tauri 預設設定打包：

```bash
npm run tauri:build
```

建置 Windows x86_64 MSI，並重新命名為發布檔案格式：

```bash
npm run package:windows
```

建置 Windows x86_64 EXE 安裝包：

```bash
npm run tauri -- build --bundles nsis
```

直接建置 Windows x86_64 MSI：

```bash
npm run tauri -- build --bundles msi
```

在 Intel macOS 機器或 Runner 上建置 macOS x86_64 DMG：

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

GitHub Actions 發布安裝包命名格式：

```text
Ascend-Todo-v<version>-windows-x86_64.msi
Ascend-Todo-v<version>-windows-x86_64.exe
Ascend-Todo-v<version>-macos-x86_64.dmg
Ascend-Todo-v<version>-macos-aarch64.dmg
Ascend-Todo-v<version>-linux-x86_64.AppImage
Ascend-Todo-v<version>-linux-aarch64.AppImage
```

## 官網部署

產品官網位於 `website/`。

Netlify 設定：

- Build command：留空
- Publish directory：`website`
- 自訂網域示例：`todo.foresai.com`

官網會在瀏覽器中讀取 GitHub 最新 Release，並根據使用者系統自動匹配推薦安裝包。

## 文件

- [客戶端使用文件](./docs/client-user-guide.md)
- [API 文件](./docs/api.md)
- [客戶端接入文件](./docs/client-integration.md)
- [維運說明](./docs/operations.md)
- [安全說明](./docs/security.md)
- [同步設計](./docs/sync.md)
- [開發指南](./DEVELOPING.md)

## 開源協議

本專案使用 [Apache License 2.0](./LICENSE)。
