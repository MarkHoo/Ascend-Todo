# 新增后项目目录树

当前桌面端结构保持不变，不移动、不改名、不拆分。账号、同步、后台和部署能力只新增目录。

```text
D:\cc-code\111
├─ src\                         # 现有桌面端前端，保持原结构
├─ src-tauri\                   # 现有 Tauri/Rust 桌面端，保持原结构
├─ public\                      # 现有静态资源
├─ server\                      # 新增：Rust 后端服务
│  ├─ Cargo.toml
│  ├─ Dockerfile
│  ├─ .env.example
│  ├─ migrations\
│  │  └─ 0001_init.sql
│  └─ src\
│     ├─ main.rs
│     ├─ config.rs
│     ├─ error.rs
│     ├─ state.rs
│     ├─ middleware\
│     ├─ models\
│     ├─ repositories\
│     ├─ routes\
│     ├─ services\
│     └─ utils\
├─ admin-web\                   # 新增：React 管理员后台
│  ├─ package.json
│  ├─ package-lock.json
│  ├─ index.html
│  ├─ vite.config.ts
│  ├─ tsconfig.json
│  └─ src\
│     ├─ App.tsx
│     ├─ main.tsx
│     ├─ api\
│     ├─ layouts\
│     ├─ pages\
│     ├─ store\
│     └─ types\
├─ deploy\                      # 新增：部署编排
│  ├─ docker-compose.yml
│  ├─ mysql\
│  └─ nginx\
├─ docs\                        # 新增：接口、同步、安全、运维和客户端接入文档
│  ├─ api.md
│  ├─ client-integration.md
│  ├─ operations.md
│  ├─ project-tree-with-cloud.md
│  ├─ security.md
│  └─ sync.md
└─ 账号登录云同步与管理后台设计方案.md
```

后续桌面端接入云同步时，也继续沿用现有 `src` 和 `src-tauri`，只在里面按需新增云账号相关文件，不新建 `apps/desktop`。
