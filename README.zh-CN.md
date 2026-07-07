# 光阶Todo

[English](./README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md)

光阶Todo 是一款跨平台桌面效率应用，用于任务规划、目标管理、日历安排和专注统计。项目包含本地优先的 Tauri 桌面端、Rust 云同步后端，以及 React 管理后台。

## 功能特性

- 任务看板：列表、卡片、子任务、优先级、截止时间、提醒和拖拽流转。
- 目标管理：里程碑、关键结果、权重进度、复盘记录和关联任务。
- 日历：日、周、月视图，支持时间段日程、全天日程、节假日和未安排任务。
- 番茄钟：倒计时/正计时、关联任务、统计和通知。
- 本地 SQLite 存储，可选账号云端同步。
- 邮箱+密码账号、邮箱验证、设备管理和后台运营面板。
- 英语、简体中文、繁体中文界面。

## 当前开发环境

当前项目开发和验证环境如下：

- Windows 11 / PowerShell
- Node.js 25.x
- npm 11.x
- Rust stable，edition 2021
- Tauri 2.x
- Vite 6.4.x
- React 18.3.x
- TypeScript 5.6.x
- MySQL 8.x，用于云同步后端
- 后端端口：`11911`
- 管理后台端口：`11912`

## 目录结构

```text
.
├── .github/workflows/      # CI 和发布自动化
├── admin-web/              # React 管理后台
├── deploy/                 # 部署示例
├── docs/                   # 产品、API、同步、安全和运维文档
├── public/                 # 桌面端 Web 资源
├── server/                 # Rust 云同步后端
├── src/                    # 桌面端 React 前端
├── src-tauri/              # Tauri/Rust 桌面运行层
├── LICENSE
├── README.md
├── README.zh-CN.md
└── README.zh-TW.md
```

## 开发

安装桌面端依赖：

```bash
npm install
```

运行桌面端：

```bash
npm run tauri:dev
```

运行后端：

```bash
cd server
cargo run --bin ascend-todo-server
```

运行管理后台：

```bash
cd admin-web
npm install
npm run dev -- --host 127.0.0.1 --port 11912
```

## 打包

先安装依赖：

```bash
npm install
```

仅构建前端：

```bash
npm run build
```

按当前系统使用 Tauri 默认配置打包：

```bash
npm run tauri:build
```

构建 Windows x86_64 MSI：

```bash
npm run package:windows
```

在 Intel macOS 环境构建 macOS x86_64 DMG：

```bash
npm run tauri -- build --target x86_64-apple-darwin --bundles dmg
```

构建 macOS Apple Silicon DMG：

```bash
npm run tauri -- build --target aarch64-apple-darwin --bundles dmg
```

构建 Linux x86_64 AppImage：

```bash
npm run tauri -- build --target x86_64-unknown-linux-gnu --bundles appimage
```

构建 Linux aarch64 AppImage：

```bash
npm run tauri -- build --target aarch64-unknown-linux-gnu --bundles appimage
```

GitHub Actions 发布的安装包命名格式：

```text
Ascend-Todo-v<version>-windows-x86_64.msi
Ascend-Todo-v<version>-macos-x86_64.dmg
Ascend-Todo-v<version>-macos-aarch64.dmg
Ascend-Todo-v<version>-linux-x86_64.AppImage
Ascend-Todo-v<version>-linux-aarch64.AppImage
```

## 文档

- [客户端使用指南](./docs/client-user-guide.md)
- [API 文档](./docs/api.md)
- [客户端接入](./docs/client-integration.md)
- [运维说明](./docs/operations.md)
- [安全说明](./docs/security.md)
- [同步设计](./docs/sync.md)
- [开发指南](./DEVELOPING.md)

## 开源协议

本项目使用 [Apache License 2.0](./LICENSE)。
