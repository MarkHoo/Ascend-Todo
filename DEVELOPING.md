# 光阶Todo开发文档

本文面向希望二次开发、贡献代码、排查问题或理解架构的开发者。文档以当前代码结构为准，重点说明桌面客户端、Tauri/Rust 本地层、云同步后端和管理后台之间的边界。

## 1. 技术栈

- 桌面前端：React 18、TypeScript、Vite 6、Tailwind CSS、Zustand、ECharts、i18next。
- 桌面运行层：Tauri 2、Rust、SQLite、rusqlite。
- 云同步后端：Rust、Axum、MySQL、JWT、SMTP 邮箱验证码。
- 管理后台：React、TypeScript、Ant Design、TanStack Query、ECharts。
- 自动发布：GitHub Actions 构建 Windows MSI、macOS DMG、Linux AppImage。

## 2. 本地开发环境

当前项目主要在以下环境开发和验证：

- Windows 11 / PowerShell
- Node.js 25.x
- npm 11.x
- Rust stable，edition 2021
- MySQL 8.x
- 后端端口：`11911`
- 管理后台端口：`11912`

推荐先安装：

```powershell
npm install
cd admin-web
npm install
```

## 3. 目录结构

```text
.
├── .github/workflows/      # CI 与发布工作流
├── admin-web/              # 管理后台
├── deploy/                 # Docker Compose、Nginx、MySQL 初始化示例
├── docs/                   # 产品、接入、同步、安全、运维文档
├── public/                 # 前端静态资源和提示音
├── server/                 # Rust 云同步后端
├── src/                    # 桌面端 React 前端
├── src-tauri/              # Tauri/Rust 桌面运行层
└── README*.md              # 多语言项目入口
```

## 4. 桌面客户端架构

桌面端采用本地优先架构。

```text
React 页面
  -> Zustand store
  -> src/api/*.ts
  -> Tauri invoke
  -> Rust command
  -> SQLite / HTTP / 系统能力
```

关键目录：

- `src/pages/`：主页面，如总览、任务看板、目标、日历、番茄钟、个人资料、设置。
- `src/components/`：通用组件和布局组件。
- `src/store/`：页面状态和业务操作封装。
- `src/api/`：Tauri command 的前端封装。
- `src/i18n/`：桌面端多语言资源。
- `src-tauri/src/commands/`：Rust command，按业务域拆分。
- `src-tauri/src/db.rs`：SQLite schema 与迁移。
- `src-tauri/src/models.rs`：Rust DTO，与 TypeScript 类型保持 camelCase 对齐。
- `src-tauri/src/sync_engine.rs`：本地快照导入导出、云同步合并基础能力。
- `src-tauri/src/example_seed.rs`：首次安装示例数据生成。

## 5. 运行项目

### 桌面端

```powershell
npm run tauri:dev
```

### 后端

```powershell
cd server
copy .env.example .env
cargo run --bin ascend-todo-server
```

### 管理后台

```powershell
cd admin-web
npm run dev -- --host 127.0.0.1 --port 11912
```

## 6. 数据库与本地数据

桌面端本地数据默认存放在：

```text
%APPDATA%\com.ascend.todo\
```

核心数据库：

```text
%APPDATA%\com.ascend.todo\ascend.db
```

迁移策略：

- SQLite 使用 `PRAGMA user_version` 记录迁移版本。
- 所有 schema 变更都写入 `src-tauri/src/db.rs` 的 `migrate()`。
- 新增表时必须考虑旧用户升级路径。
- 本地数据清理逻辑由卸载器和退出登录流程共同处理。

## 7. Tauri Command 开发规范

新增一个业务 command 的标准步骤：

1. 在 `src-tauri/src/models.rs` 增加 DTO。
2. 在 `src-tauri/src/commands/<domain>.rs` 增加 `#[tauri::command]` 函数。
3. 在 `src-tauri/src/commands/mod.rs` 导出模块。
4. 在 `src-tauri/src/lib.rs` 的 `generate_handler!` 注册命令。
5. 在 `src/api/<domain>.ts` 增加前端封装。
6. 在 `src/types/index.ts` 同步 TypeScript 类型。
7. 在 store 或页面中调用 API。

命名建议：

- 查询列表：`list_<entity>`
- 查询详情：`get_<entity>`
- 创建：`create_<entity>`
- 更新：`update_<entity>`
- 删除：`delete_<entity>`
- 排序：`reorder_<entity>`
- 状态切换：`toggle_<entity>`

错误统一返回 `AppResult<T>`，前端必须转换为用户能理解的提示，不直接展示 Rust 或 HTTP 原始错误。

## 8. 前端开发规范

- 优先使用现有组件和样式体系，不随意引入新 UI 库。
- 所有用户可见文本必须走 i18n，至少维护 `en`、`zh-CN`、`zh-TW`。
- 页面状态优先放入对应 Zustand store；短生命周期弹窗状态可放在页面组件内。
- 日期显示统一使用 `src/utils/date.ts` 和 `dayjs`。
- Markdown 展示统一使用 `src/utils/markdownRenderer.ts`。
- 新功能涉及设置项时，需要同步类型、默认值、本地持久化、设置页 UI 和云同步快照。

## 9. 云同步开发要点

同步范围：

- 任务看板、列表、任务、子任务。
- 目标、里程碑、关键结果、进度日志、目标关联任务。
- 番茄钟记录、复盘、日历事件、日历配置。
- 设置项和个人资料文字信息。

不同步：

- 头像图片。
- 邮箱/OAuth token。
- 本地缓存、安装包缓存、日志、本机路径。

同步前置条件：

- 用户已登录。
- 邮箱已验证。
- 当前设备未被撤销。
- 用户状态为 active。

多设备冲突通过云端 `remoteVersion` 保护。推送时携带本地已知版本，版本不一致时应先拉取并执行智能合并。

## 10. 管理后台开发规范

后台代码位于 `admin-web/`。

- API 封装：`admin-web/src/api/`
- 页面：`admin-web/src/pages/`
- 布局：`admin-web/src/layouts/AdminLayout.tsx`
- 多语言：`admin-web/src/i18n.tsx`
- 类型：`admin-web/src/types/`

新增后台页面时：

1. 在 `admin-web/src/pages/` 新增页面。
2. 在 `admin-web/src/App.tsx` 增加路由。
3. 在 `AdminLayout` 增加菜单。
4. 在 `i18n.tsx` 为三种语言补齐文案。
5. 在 `admin-web/src/api/admin.ts` 增加接口封装。

## 11. 后端开发规范

后端位于 `server/`。

- `server/src/routes/`：HTTP 路由。
- `server/src/services/`：业务服务。
- `server/src/models/`：请求与响应模型。
- `server/src/utils/`：JWT、加密、时间等工具。
- `server/migrations/`：MySQL 初始化 schema。

新增接口时：

1. 在对应 route 文件中定义请求/响应结构。
2. 使用统一 `AppResult<T>` 返回。
3. 需要鉴权的接口必须经过 auth middleware。
4. 涉及 OpenAPI 的接口同步补充 utoipa 注解。
5. 管理后台或桌面端调用前，先确认错误码和用户提示文案。

## 12. 打包命令

当前平台默认打包：

```powershell
npm run tauri:build
```

Windows MSI：

```powershell
npm run package:windows
```

macOS x86_64：

```bash
npm run tauri -- build --target x86_64-apple-darwin --bundles dmg
```

macOS aarch64：

```bash
npm run tauri -- build --target aarch64-apple-darwin --bundles dmg
```

Linux x86_64：

```bash
npm run tauri -- build --target x86_64-unknown-linux-gnu --bundles appimage
```

Linux aarch64：

```bash
npm run tauri -- build --target aarch64-unknown-linux-gnu --bundles appimage
```

## 13. 发布流程

GitHub Actions 触发方式：

- 推送 `main`。
- 推送 `v*` tag。
- 手动触发 workflow。

推送 `main` 时，workflow 会读取 `package.json` 的版本，生成 `v<version>` release。发布文件命名格式：

```text
Ascend-Todo-v<version>-windows-x86_64.msi
Ascend-Todo-v<version>-macos-x86_64.dmg
Ascend-Todo-v<version>-macos-aarch64.dmg
Ascend-Todo-v<version>-linux-x86_64.AppImage
Ascend-Todo-v<version>-linux-aarch64.AppImage
```

## 14. 验证清单

提交前至少检查：

```powershell
npm run build
cd admin-web
npx vite build
cd ../src-tauri
cargo check
cd ../server
cargo check --bin ascend-todo-server
```

涉及客户端关键代码时，需要重新打包客户端。仅文档变更不需要打包。

## 15. 常见问题

### Tauri `frontendDist` 不存在

先执行：

```powershell
npm run build
```

再执行 `cargo check` 或 Tauri 构建。

### 后台依赖无法删除

Windows 下可能是 `node`、`vite`、`esbuild` 或 `rollup` 进程占用。停止后台 dev server 后再执行 `npm ci`。

### 登录后仍然保留本地状态

本地状态存放在 `%APPDATA%\com.ascend.todo\`。卸载正式版本时会清理该目录；开发环境可手动删除。
