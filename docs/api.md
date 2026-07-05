# API 草案

基础地址：

```text
https://api.example.com/api
```

## Auth

```text
POST /auth/register
POST /auth/login
POST /auth/refresh
GET  /auth/me
POST /auth/logout
```

登录成功返回 access token、refresh token、device id 和用户资料。

## Email

```text
POST /email/send-verification-code
POST /email/verify
POST /phone/send-verification-code
```

邮箱未验证时允许登录和本地使用，但禁止同步。

手机号验证码接口当前只做能力预留，第一版返回“手机验证码暂未开放”。

## Devices

```text
GET    /devices
PATCH  /devices/:id
DELETE /devices/:id
POST   /devices/revoke-others
POST   /devices/:id/request-wipe
```

远程移除设备只保证撤销云端访问能力；本地数据只有在旧设备重新联网并执行清理请求时才可能被删除。

## Sync

```text
GET  /sync/status
POST /sync/push-snapshot
GET  /sync/pull-snapshot
GET  /sync/logs
```

第一版使用全量快照同步。

## Admin

```text
POST /admin/login
GET  /admin/overview
GET  /admin/users
GET  /admin/users/:id
GET  /admin/devices
GET  /admin/sync-logs
GET  /admin/system-health
```
