# 运维说明

## 本地启动依赖

```powershell
cd deploy
docker compose up -d mysql redis
```

## 运行迁移

第一版 migration 位于：

```text
server/migrations/0001_init.sql
```

可以使用 sqlx-cli 或 MySQL 客户端执行。

## 启动后端

```powershell
cd server
copy .env.example .env
cargo run
```

后端默认监听：

```text
http://127.0.0.1:11911
```

## 启动管理后台

```powershell
cd admin-web
npm install
npm run dev
```

管理后台默认监听：

```text
http://127.0.0.1:11912
```

## 生产建议

- 使用 HTTPS。
- 修改默认 MySQL 密码。
- 修改 JWT_SECRET。
- 配置 SMTP。
- 配置数据库定时备份。
- 增加 Sentry 或 Prometheus/Grafana。
