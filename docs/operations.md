# 本地开发与运维文档

本文面向需要在本机启动、联调、排查和发布光阶Todo服务的开发者。客户端可以离线使用；只有账号、邮箱验证、云同步和后台系统需要后端服务。

## 1. 服务组成

- 桌面客户端：React + TypeScript + Vite + Tauri。
- 本地层：Tauri Rust 命令，负责 SQLite、本机能力、通知、窗口、更新等。
- 后端服务：Rust + Axum，提供账号、邮箱验证、设备管理、云同步和后台 API。
- 管理后台：React，端口 `11912`。
- 数据库：MySQL 8.x。
- Redis：预留给频率限制、缓存和后续异步任务。

## 2. 端口

| 服务 | 默认地址 |
| --- | --- |
| 后端 API | `http://127.0.0.1:11911` |
| Swagger UI | `http://127.0.0.1:11911/docs` |
| Scalar API | `http://127.0.0.1:11911/scalar` |
| OpenAPI JSON | `http://127.0.0.1:11911/api/openapi.json` |
| 管理后台 | `http://127.0.0.1:11912` |
| 桌面前端开发服务 | `http://127.0.0.1:5173` |

## 3. 环境变量

后端配置文件参考 [server/.env.example](../server/.env.example)。

关键变量：

```text
SERVER_HOST=0.0.0.0
SERVER_PORT=11911
DATABASE_URL=mysql://root:123456@127.0.0.1:3306/ascend_todo
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=replace-with-a-long-random-secret
ACCESS_TOKEN_MINUTES=15
REFRESH_TOKEN_DAYS=30
EMAIL_CODE_MINUTES=10
SMTP_HOST=smtp.qq.com
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM=iex365@foxmail.com
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-this-password
ADMIN_NICKNAME=Admin
```

生产环境必须替换 `JWT_SECRET`、数据库密码、SMTP 密码和管理员密码。

## 4. 本地启动顺序

### 4.1 启动 MySQL 和 Redis

如果使用 Docker：

```powershell
cd deploy
docker compose up -d mysql redis
```

如果使用本机 MySQL，确保数据库存在：

```sql
CREATE DATABASE IF NOT EXISTS ascend_todo
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

### 4.2 启动后端

```powershell
cd server
copy .env.example .env
cargo run
```

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:11911/api/health
```

### 4.3 创建或更新管理员

```powershell
cd server
cargo run --bin bootstrap_admin
```

该命令读取 `.env` 中的管理员邮箱、密码和昵称。

### 4.4 启动管理后台

```powershell
cd admin-web
npm install
npm run dev
```

访问：

```text
http://127.0.0.1:11912
```

### 4.5 启动桌面客户端

```powershell
npm install
npm run tauri:dev
```

## 5. 数据库迁移

初始迁移文件：

```text
server/migrations/0001_init.sql
```

当前可使用 MySQL 客户端或 `sqlx-cli` 执行迁移。新增迁移时要求：

- 文件名递增，包含清晰语义。
- 兼容已有用户数据，不随意删除字段。
- 重要索引、唯一约束和外键要写清楚原因。
- 后端结构体、SQL 查询、OpenAPI 文档同步更新。

## 6. 日志和排查

常见排查顺序：

1. 检查后端健康接口。
2. 检查 `.env` 中 `DATABASE_URL`、`JWT_SECRET`、SMTP 配置是否正确。
3. 检查 MySQL 是否可连接。
4. 检查邮箱验证码是否受频率限制。
5. 检查客户端是否拿到新的 access token。
6. 检查设备是否被远程移除或请求清理。

客户端常见本地路径：

```text
%APPDATA%\com.ascend.todo
%APPDATA%\com.ascend.todo\ascend.db
```

卸载清理逻辑应清理应用数据目录，避免重装后仍保持旧登录状态或旧示例数据。

## 7. 邮箱验证码

邮箱验证码发送依赖 SMTP 配置。开发时建议：

- 使用专门的测试邮箱。
- 使用授权码，不使用邮箱登录密码。
- 避免把真实密码提交到仓库。
- 保持邮箱发送按钮倒计时和频率限制一致。
- 前端不要显示后端原始错误。

验证码规则：

- 输入框限制 6 位。
- 未满 6 位禁止提交。
- 成功发送后按钮进入倒计时。
- 验证成功后立即刷新账号状态并允许同步。

## 8. 发布与构建

桌面客户端构建：

```powershell
npm run build
npm run tauri:build
```

Windows 安装包：

```powershell
npm run package:windows
```

跨平台命令示例：

```powershell
npm run tauri -- build --target x86_64-apple-darwin --bundles dmg
npm run tauri -- build --target aarch64-apple-darwin --bundles dmg
npm run tauri -- build --target x86_64-unknown-linux-gnu --bundles appimage
npm run tauri -- build --target aarch64-unknown-linux-gnu --bundles appimage
```

发布产物命名规范：

```text
Ascend-Todo-v<version>-windows-x86_64.msi
Ascend-Todo-v<version>-macos-x86_64.dmg
Ascend-Todo-v<version>-macos-aarch64.dmg
Ascend-Todo-v<version>-linux-x86_64.AppImage
Ascend-Todo-v<version>-linux-aarch64.AppImage
```

## 9. 生产建议

- 后端必须部署在 HTTPS 后面。
- 管理后台接口必须校验管理员角色。
- `JWT_SECRET` 使用高强度随机值。
- 数据库账号使用最小权限。
- MySQL 开启自动备份并定期恢复演练。
- SMTP 凭据使用环境变量或密钥管理，不进入代码仓库。
- 管理后台建议增加访问限制、审计日志和二次验证。
- OpenAPI 文档生产环境可保留，但应通过网关或权限策略限制访问。

## 10. 变更验证清单

- 后端 `cargo check` 通过。
- 管理后台 `npm run build` 通过。
- 客户端 `npm run build` 通过。
- 邮箱注册、登录、验证、同步、退出流程可用。
- 首次安装示例数据按当前语言生成。
- 退出并清理这台电脑后，重装不保留旧登录态。
- 管理后台时间显示为用户所在地可理解的时间。
