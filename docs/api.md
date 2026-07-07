# API 文档

后端提供账号、邮箱验证、设备管理、云同步和管理后台接口。本文是静态说明，最新可交互接口请以运行中的 OpenAPI 为准。

本地接口入口：

```text
Swagger UI:     http://127.0.0.1:11911/docs
Scalar:         http://127.0.0.1:11911/scalar
OpenAPI JSON:   http://127.0.0.1:11911/api/openapi.json
Health:         http://127.0.0.1:11911/api/health
```

## 1. 认证方式

除注册、登录、健康检查、文档和验证码发送外，业务接口使用 Bearer Token。

```http
Authorization: Bearer <access_token>
```

access token 过期后，客户端使用 refresh token 调用刷新接口。刷新失败时，引导用户重新登录。

## 2. Auth

### 注册

```http
POST /api/auth/register
```

用途：使用邮箱、密码创建账号。

结果：返回用户资料。注册后邮箱尚未验证，不能同步。

### 登录

```http
POST /api/auth/login
```

用途：登录账号并登记当前设备。

返回：

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "deviceId": "...",
  "user": {}
}
```

客户端需要随请求提交设备名称、设备指纹、平台和客户端版本，方便设备管理和后台统计。

### 当前用户

```http
GET /api/auth/me
```

用途：获取当前登录用户资料、邮箱验证状态、昵称和个性签名等。

### 刷新 token

```http
POST /api/auth/refresh
```

请求：

```json
{
  "refreshToken": "...",
  "deviceId": "..."
}
```

设备被移除或 refresh token 失效时，返回未授权。

### 退出登录

```http
POST /api/auth/logout
```

用途：撤销当前设备的 refresh token。是否清理本地数据由客户端退出弹窗选项决定。

## 3. Email

### 发送验证码

```http
POST /api/email/send-verification-code
```

请求：

```json
{
  "purpose": "verify_email"
}
```

可用用途：

- `verify_email`
- `reset_password`
- `change_email`

当前客户端主要使用 `verify_email`。发送成功后，客户端按钮进入倒计时。

### 验证邮箱

```http
POST /api/email/verify
```

请求：

```json
{
  "code": "123456"
}
```

验证成功后，账号可以启用云端同步。

### 手机验证码预留

```http
POST /api/phone/send-verification-code
```

当前只是能力预留，产品上优先使用邮箱 + 密码注册登录和邮箱验证码绑定。

## 4. Devices

设备接口均需要登录。

### 登录设备列表

```http
GET /api/devices
```

用途：展示当前账号下所有登录设备。

### 重命名设备

```http
PATCH /api/devices/{id}
```

请求：

```json
{
  "deviceName": "Windows 工作电脑"
}
```

### 移除设备

```http
DELETE /api/devices/{id}
```

用途：撤销指定设备的云端访问能力。

注意：当前设备不应显示移除按钮。

### 移除其他设备

```http
POST /api/devices/revoke-others
```

用途：撤销除当前设备以外的其他设备。

### 请求下次联网清理

```http
POST /api/devices/{id}/request-wipe
```

用途：标记某个旧设备下次联网后清理本地数据。

### 标记已清理

```http
POST /api/devices/{id}/mark-wiped
```

用途：旧设备完成本地清理后回写状态。

## 5. Sync

同步接口均需要登录、邮箱已验证、设备未撤销。

### 同步状态

```http
GET /api/sync/status
```

用途：获取当前用户云端快照版本、同步可用状态和必要提示。

### 上传快照

```http
POST /api/sync/push-snapshot
```

请求：

```json
{
  "snapshot": {},
  "localVersion": 12,
  "baseRemoteVersion": 5,
  "clientVersion": "1.0.0"
}
```

如果云端版本与 `baseRemoteVersion` 不一致，服务端返回冲突，客户端需要先拉取并合并。

### 拉取快照

```http
GET /api/sync/pull-snapshot
```

返回：

```json
{
  "snapshot": {},
  "version": 6,
  "updatedAt": "2026-07-07T10:30:00"
}
```

### 同步日志

```http
GET /api/sync/logs
```

用途：客户端或后台查看当前账号同步记录。

## 6. Admin

后台接口需要管理员登录态。

```http
POST /api/admin/login
GET  /api/admin/overview
GET  /api/admin/users
GET  /api/admin/users/{id}
GET  /api/admin/devices
GET  /api/admin/sync-logs
GET  /api/admin/system-health
```

主要用途：

- 运营概览：用户数、设备数、同步情况、客户端版本分布。
- 用户管理：查看用户邮箱、昵称、签名、邮箱验证状态、客户端版本。
- 用户详情：查看用户设备和同步记录。
- 设备管理：查看设备状态、设备版本、最近登录和同步时间。
- 同步日志：排查同步失败原因。
- 系统健康：查看后端、数据库和关键配置状态。

## 7. 错误处理约定

后端错误返回给客户端后，客户端需要转换为用户语言下的友好提示。

推荐映射：

| 后端语义 | 用户提示 |
| --- | --- |
| `UNAUTHORIZED` | 登录已过期，请重新登录 |
| `BAD_REQUEST` | 输入内容有误，请检查后重试 |
| 验证码发送过于频繁 | 发送太频繁，请稍后再试 |
| 邮箱未验证 | 邮箱验证后才能同步 |
| 设备已撤销 | 当前设备已被移除，无法继续同步 |
| 同步冲突 | 云端数据已更新，正在合并后重试 |
| 网络失败 | 网络连接失败，请稍后重试 |

普通用户界面不得直接显示 JSON 错误、HTTP 状态码或英文内部错误。
