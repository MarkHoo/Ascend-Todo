# 开发文档

本文档面向二次开发者：解释项目架构、模块边界、扩展点与调试技巧。

## 1. 架构概览

```
┌────────────────────────────────────────────────────────────┐
│                     React 18 + TS 前端                     │
│  Pages  →  Stores (Zustand)  →  api/*.ts (invoke 封装)     │
│           ↓                                                  │
│  Components / Hooks / Utils / i18n                          │
└──────────────────────────┬─────────────────────────────────┘
                           │  Tauri IPC (typed)
┌──────────────────────────┴─────────────────────────────────┐
│                       Tauri 2 + Rust                        │
│  commands/*.rs   →   db.rs (SQLite)   →   models.rs (DTO) │
│  sync_engine.rs (Mock 同步)   error.rs (统一错误)           │
└────────────────────────────────────────────────────────────┘
                           │
                       SQLite DB
```

数据流：**UI 组件 → Store 调 API 封装 → invoke('command', args) → Rust command → SQL → 回传 JSON**。所有跨边界都通过 Tauri 的 `#[tauri::command]` 与 `camelCase` 序列化。

## 2. 目录索引

| 路径 | 职责 |
| --- | --- |
| `src-tauri/src/db.rs` | SQLite 连接 (`PRAGMA journal_mode=WAL`, `foreign_keys=ON`)、迁移 (`PRAGMA user_version`)、公用 helpers (`new_id`, `now`, `today`) |
| `src-tauri/src/models.rs` | 所有 DTO，使用 `camel_struct!` 宏自动 `#[serde(rename_all = "camelCase")]` |
| `src-tauri/src/error.rs` | `AppError` 枚举，自动实现 `Serialize` 把错误转为 JSON 字符串 |
| `src-tauri/src/commands/boards.rs` | 看板 / 列表 / 任务 / 子任务 CRUD + 拖拽排序 + 跨列表移动 |
| `src-tauri/src/commands/goals.rs` | 目标 / 里程碑 / 子目标 + 进度计算（递归汇总） |
| `src-tauri/src/commands/calendar.rs` | 按日期范围聚合任务 |
| `src-tauri/src/commands/pomodoro.rs` | 番茄钟会话 CRUD + 统计 |
| `src-tauri/src/commands/checkins.rs` | 每日打卡（贡献图） |
| `src-tauri/src/commands/settings.rs` | KV 设置（`settings` 表） |
| `src-tauri/src/commands/profile.rs` | 用户资料 |
| `src-tauri/src/commands/auth.rs` | 本地账户（昵称 + SHA-256 密码），生成 UUID token |
| `src-tauri/src/commands/sync.rs` | Mock 同步状态、push / pull |
| `src-tauri/src/commands/reminders.rs` | 当前应提醒 / 即将到来的任务 |
| `src-tauri/src/sync_engine.rs` | 导出/导入全量 Snapshot（Mock 用 `once_cell::Mutex<Option<Snapshot>>`） |
| `src/api/*.ts` | 前端对 Rust 命令的薄封装 |
| `src/store/*.ts` | Zustand store，封装业务方法 |
| `src/pages/*.tsx` | 7 个主页面 |
| `src/components/common/*` | 通用 UI 组件 |
| `src/components/layout/*` | Sidebar、TopBar |
| `src/i18n/*.json` | 翻译资源 |
| `src/styles/themes.css` | 4 套主题的 CSS 变量 |
| `src/utils/*` | 日期、格式、励志语、声音（Web Audio） |

## 3. 添加新功能的标准流程

### 3.1 添加一张新表

1. 在 `src-tauri/src/db.rs` 的 `migrate()` 中追加 `user_version = 2` 的迁移分支（用 `if user_version < 2 { ... PRAGMA user_version = 2; }`），新表用 `CREATE TABLE IF NOT EXISTS`。
2. 在 `src-tauri/src/models.rs` 用 `camel_struct! { pub struct NewEntity { ... } }` 定义 DTO。
3. 在 `src-tauri/src/commands/` 下新建 `xxx.rs`，实现 `#[tauri::command] pub fn list_xxx(...) -> AppResult<Vec<X>>` 等。
4. 在 `commands/mod.rs` 加 `pub mod xxx;`。
5. 在 `lib.rs` 的 `tauri::generate_handler!` 宏里加 `commands::xxx::*`。
6. 前端：在 `src/types/index.ts` 加 TS 类型；在 `src/api/xxx.ts` 写 `invoke` 封装；在 `src/store/useXxxStore.ts` 写 Zustand store；在 `src/pages/XxxPage.tsx` 实现 UI；在 `router.tsx` 注册路由。

### 3.2 添加新主题

编辑 `src/styles/themes.css`：

```css
[data-theme='solar-flare'] {
  --bg: #fff7ed;
  --surface: #ffffff;
  --primary: #f97316;
  /* ... 全部 CSS 变量 */
}
```

再把 `'solar-flare'` 加到：
- `src/types/index.ts` 的 `AppSettings.theme` 联合类型
- `src/utils/constants.ts` 的 `THEMES` 数组
- `src/i18n/*.json` 的 `settings.theme_solar` 翻译

### 3.3 添加新语言

1. 复制 `src/i18n/en.json` 为 `src/i18n/<code>.json`，翻译所有键。
2. 在 `src/i18n/index.ts` 的 `resources` 与 `supportedLngs` 里加新条目。
3. 在 `src/utils/date.ts` 的 `setDayjsLocale` map 里加 dayjs locale 名（如果 dayjs 有对应 locale）。
4. 在 `src/utils/constants.ts` 的 `LANGUAGES` 数组里加展示名。
5. 在 `src/types/index.ts` 的 `AppSettings.language` 联合类型加新 code。

### 3.4 添加 Tauri 插件

1. 在 `src-tauri/Cargo.toml` 加 crate 依赖。
2. 在 `src-tauri/src/lib.rs` 的 builder 链上 `.plugin(your_plugin::init())`。
3. 在 `src-tauri/capabilities/default.json` 的 `permissions` 里加新插件需要的权限。
4. 前端装 `@tauri-apps/plugin-yourplugin`，从 `import { … } from '@tauri-apps/plugin-yourplugin'` 使用。

## 4. Tauri 命令命名约定

- 列表查询：`list_<entity>` → `Vec<T>`
- 单条查询：`get_<entity>` → `T` 或 `Option<T>`
- 创建：`create_<entity>` → `T`（返回新对象）
- 更新：`update_<entity>` → `()` 或 `bool`
- 删除：`delete_<entity>` → `()`
- 切换布尔状态：`toggle_<entity>` → `bool`（返回新值）
- 排序：`reorder_<entity>`（参数 `ids: Vec<String>`）→ `()`

参数一律用 `snake_case`，TS 端通过 `camelCase` 自动转换。例如 Rust 函数：

```rust
#[tauri::command]
pub fn create_task(state: State<DbState>, list_id: String, title: String, ...) -> AppResult<Task>
```

前端调用：

```ts
invoke<Task>('create_task', { listId, title, ... });
```

## 5. 调试技巧

### 5.1 前端
- DevTools 在 Tauri 窗口里 `Ctrl+Shift+I` 打开（开发模式默认开；生产模式可在菜单里打开）
- Zustand store 状态可在 React DevTools 里查看
- 日志：`console.log` 会出现在终端 stdout

### 5.2 Rust
- `RUST_LOG=debug npm run tauri:dev` 设置日志级别
- `log::info!` / `log::warn!` 配合 `env_logger`
- SQLite 调试：下载 DB 副本
  ```bash
  # Windows 默认位置
  %APPDATA%\com.guangjie.todo\guangjie.db
  ```
  用 [DB Browser for SQLite](https://sqlitebrowser.org/) 打开。

### 5.3 同步调试
Mock 同步存在 `sync_engine.rs` 的 `static REMOTE`。在 Rust 端打断点或加 `log::info!` 可以看到 push/pull 流程。日志会输出到 Tauri 终端。

## 6. 性能注意事项

- **拖拽性能**：`@dnd-kit` 已优化；任务数 > 200 时考虑关闭拖拽过渡动画（`<SortableContext strategy={verticalListSortingStrategy}>` 已默认优化）
- **ECharts 体积**：已按需引入。ECharts 包约 600KB gzip 后约 180KB，可接受
- **热力图**：53 周 × 7 天 = 371 格，CSS grid + bg color 足够流畅
- **SQLite WAL**：`PRAGMA journal_mode=WAL` 已开启，写入不阻塞读
- **Tauri IPC**：每个 invoke 是 JSON 序列化，1ms 量级

## 7. 发布前检查清单

- [ ] 更新 `package.json` 的 `version`
- [ ] 更新 `src-tauri/tauri.conf.json` 的 `version`
- [ ] 更新 `README.md` 的版本号引用
- [ ] 运行 `npm run tauri:build` 验证打包
- [ ] 替换 `src-tauri/icons/` 为正式图标（`npx @tauri-apps/cli icon path/to/icon.png`）
- [ ] 在 `tauri.conf.json` 的 `bundle.icon` 列表里确认平台对应图标
- [ ] 配置 updater：`plugins.updater.endpoints` 填入实际更新服务 URL
- [ ] 检查 capabilities 权限最小化（生产环境只保留必要权限）

## 8. 已知问题与改进点

- **图标**：当前是占位渐变；建议替换为正式品牌图标
- **真实同步**：`sync_engine.rs::mock_push/pull` 需替换为 `reqwest` HTTP 调用；接口契约待定
- **移动端**：Tauri 支持 iOS/Android 但当前仅验证桌面端
- **多窗口**：当前是单窗口；Tauri 2 支持多窗口可在 `lib.rs` builder 里加
- **测试**：当前无自动化测试。建议加 vitest（前端）+ cargo test（后端）覆盖核心逻辑
- **CI/CD**：可加 GitHub Actions 自动构建 + 发布

## 9. 命令速查

```bash
# 前端
npm run dev              # 仅 Vite 开发服务器（无 Tauri）
npm run typecheck        # tsc --noEmit
npm run build            # tsc + vite build

# Tauri
npm run tauri:dev        # 完整桌面开发（首次会编译 Rust 5-15 分钟）
npm run tauri:build      # 打包安装包（输出到 src-tauri/target/release/bundle/）

# 单独编译
cd src-tauri
cargo check              # 快速检查（只类型检查）
cargo build              # Debug 构建
cargo build --release    # Release 构建
```

## 10. 相关资源

- [Tauri 2 官方文档](https://tauri.app/start/)
- [Tauri 插件索引](https://tauri.app/plugin/)
- [React 18 文档](https://react.dev)
- [Zustand 文档](https://zustand.docs.pmnd.rs/)
- [@dnd-kit 文档](https://docs.dndkit.com/)
- [ECharts 文档](https://echarts.apache.org/)
- [dayjs 文档](https://day.js.org/)
