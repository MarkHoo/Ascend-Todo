# 光阶Todo

[English](./README.md) | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md)

光阶Todo 是一款跨平台桌面计划工具，用于管理任务、目标、日历、专注、复盘和可选的云端同步。本仓库包含 Tauri 桌面客户端、Rust 同步 API 后端、React 管理后台，以及用于 Netlify 托管的产品官网。

## 功能特色

- 任务看板：列表、富文本卡片、子任务、优先级、提醒、截止时间、Markdown 说明和拖拽流转。
- 目标管理：关键结果、权重进度、检查日期、进度历史、复盘记录和关联任务。
- 日历：日、周、月、日程视图，支持时间段日程、全天日程、节假日、未安排任务和拖拽排期。
- 番茄钟：倒计时/正计时、关联任务、提醒、统计和通知。
- 本地优先 SQLite 存储，云端同步为可选功能，需要登录账号并完成邮箱验证。
- 邮箱+密码账号、邮箱验证码、设备管理、同步日志和管理员运营后台。
- 产品官网支持语言识别、浅色/深色主题、GitHub 最新 Release 下载识别和 Netlify 部署。
- 支持英文、简体中文和繁体中文界面。

## 已核实的本地开发环境

当前本地工作区已实际核实为：

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
- 后端 API 端口：`11911`
- 管理后台端口：`11912`
- 官网本地预览端口：`11913`

## 目录结构

```text
.
├── .github/workflows/      # GitHub Actions 发布自动化
├── admin-web/              # React 管理后台
├── deploy/                 # Docker 与部署示例
├── docs/                   # API、同步、安全、客户端和运维文档
├── public/                 # 桌面端 Web 资源
├── server/                 # Rust 云同步 API 后端
├── src/                    # 桌面端 React 前端
├── src-tauri/              # Tauri/Rust 桌面运行层
├── website/                # Netlify 静态产品官网
├── netlify.toml            # Netlify 配置
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

运行桌面客户端：

```bash
npm run tauri:dev
```

运行后端 API：

```bash
cd server
cargo run --bin ascend-todo-server
```

运行管理后台：

```bash
cd admin-web
npm install
npm run dev
```

管理后台默认访问地址：

```text
http://localhost:11912
```

本地预览产品官网：

```bash
python -m http.server 11913 --directory website
```

然后打开：

```text
http://127.0.0.1:11913
```

## 后端配置

同步 API 后端使用 `server/.env` 中的环境变量。

本地常用配置示例：

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

创建或更新管理员账号：

```bash
cd server
cargo run --bin bootstrap_admin
```

## 构建与打包

先安装依赖：

```bash
npm install
```

仅构建桌面端前端：

```bash
npm run build
```

按当前平台使用 Tauri 默认配置打包：

```bash
npm run tauri:build
```

构建 Windows x86_64 MSI，并重命名为发布文件格式：

```bash
npm run package:windows
```

构建 Windows x86_64 EXE 安装包：

```bash
npm run tauri -- build --bundles nsis
```

直接构建 Windows x86_64 MSI：

```bash
npm run tauri -- build --bundles msi
```

在 Intel macOS 机器或 Runner 上构建 macOS x86_64 DMG：

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

GitHub Actions 发布安装包命名格式：

```text
Ascend-Todo-v<version>-windows-x86_64.msi
Ascend-Todo-v<version>-windows-x86_64.exe
Ascend-Todo-v<version>-macos-x86_64.dmg
Ascend-Todo-v<version>-macos-aarch64.dmg
Ascend-Todo-v<version>-linux-x86_64.AppImage
Ascend-Todo-v<version>-linux-aarch64.AppImage
```

## 官网部署

产品官网位于 `website/`。

Netlify 配置：

- Build command：留空
- Publish directory：`website`
- 自定义域名示例：`todo.foresai.com`

官网会在浏览器中读取 GitHub 最新 Release，并根据用户系统自动匹配推荐安装包。

## 文档

- [客户端使用文档](./docs/client-user-guide.md)
- [API 文档](./docs/api.md)
- [客户端接入文档](./docs/client-integration.md)
- [运维说明](./docs/operations.md)
- [安全说明](./docs/security.md)
- [同步设计](./docs/sync.md)
- [开发指南](./DEVELOPING.md)

## 开源协议

本项目使用 [Apache License 2.0](./LICENSE)。
