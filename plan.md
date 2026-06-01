# 任务看板功能重构方案

## 设计文档要求总结

### 1. 任务卡片显示
- 标签颜色 ✅ 已有(color字段)
- 任务标题 ✅ 已有
- 当前状态 ❌ **缺少** — 需新增 `status` 字段
- 优先级 ❌ **缺少** — 需新增 `priority` 字段（若无优先级则不显示）
- 截至时间 ✅ 已有(dueAt)

### 2. 任务详情页面
- 任务标题默认可编辑 ✅ 已有
- 当前状态下拉：未开始、进行中、长期任务、已完成、关闭 ❌ **缺少**
- 优先级下拉：普通、最低、较高、最高、较低。默认为【无】 ❌ **缺少**
- 开始时间 ❌ **缺少** — 需新增 `startAt` 字段
- 截至时间 ✅ 已有
- 任务描述和子任务并列切换显示 ❌ 当前是堆叠显示，需改为tab切换
- 描述支持编辑图标和全屏查看图标 ❌ **缺少**
- 子任务点击后显示子任务详情（带父任务链接） ❌ **缺少**

### 3. 日期选择器本地化
- 中文时星期显示为"一二三四五六日" ❌ 当前DateTimePicker未本地化
- 年月显示为"2026年6月" ❌ 当前未本地化

---

## 实施步骤

### Step 1: Rust 后端 — 新增字段 & DB迁移

**db.rs** — 新增 migration (user_version = 6):
```sql
ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT NULL;
ALTER TABLE tasks ADD COLUMN start_at TEXT DEFAULT NULL;
```

**models.rs** — Task struct 新增字段:
```rust
pub status: String,        // "not_started" | "in_progress" | "long_term" | "completed" | "closed"
pub priority: Option<String>, // "normal" | "lowest" | "higher" | "highest" | "lower"
pub start_at: Option<String>,
```

**commands/boards.rs** — 更新所有涉及Task的SQL查询和命令:
- `create_task`: 新增 `status`, `priority`, `start_at` 参数
- `update_task`: 新增 `status`, `priority`, `start_at` 参数
- `list_tasks`, `list_all_tasks`, `get_board_with_structure`: SELECT 新增3列
- `toggle_task`: 当完成时自动设置 status = "completed"

### Step 2: TypeScript 类型更新

**types/index.ts** — Task interface 新增:
```ts
status: 'not_started' | 'in_progress' | 'long_term' | 'completed' | 'closed';
priority?: 'normal' | 'lowest' | 'higher' | 'highest' | 'lower' | null;
startAt?: string | null;
```

### Step 3: API 层更新

**api/boards.ts** — tasksApi.create 和 tasksApi.update 新增参数:
- create: `status`, `priority`, `startAt`
- update: `status`, `priority`, `startAt`

### Step 4: Store 层更新

**store/useBoardStore.ts** — updateTask 新增 status/priority/startAt 支持

### Step 5: 任务卡片重构 (BoardDetailPage.tsx)

SortableTaskCard 组件重构:
- 移除完成复选框（状态由下拉控制）
- 显示: 标签颜色条 + 任务标题 + 状态标签 + 优先级标签(若有) + 截至时间
- 状态标签用不同颜色区分:
  - not_started: 灰色
  - in_progress: 蓝色
  - long_term: 橙色
  - completed: 绿色
  - closed: 红色
- 优先级标签:
  - highest: 红色
  - higher: 橙色
  - normal: 默认
  - lower: 蓝色
  - lowest: 灰色

### Step 6: 任务详情模态框重构 (BoardDetailPage.tsx)

重构 Modal 内容:
1. **标题行**: 可编辑文本输入框
2. **属性行**: 当前状态下拉 + 优先级下拉 + 开始时间 + 截至时间 (一行排列)
3. **内容区**: "任务信息" 和 "子任务" 两个tab按钮并列切换
4. **任务信息tab**: 描述内容 + 编辑图标 + 全屏查看图标
5. **子任务tab**: 子任务列表，点击子任务打开子任务详情（带父任务链接）

### Step 7: DateTimePicker 本地化

**components/common/DateTimePicker.tsx** — 使用 react-day-picker 的 i18n 配置:
- 传入 `locale` prop (从 i18next 获取当前语言)
- 中文时星期显示为"一二三四五六日"
- 年月标题显示为"2026年6月"格式

### Step 8: i18n 新增翻译

三个语言文件新增:
- `board.statusNotStarted`: 未开始 / Not Started / 未開始
- `board.statusInProgress`: 进行中 / In Progress / 進行中
- `board.statusLongTerm`: 长期任务 / Long Term / 長期任務
- `board.statusCompleted`: 已完成 / Completed / 已完成
- `board.statusClosed`: 关闭 / Closed / 關閉
- `board.priorityNormal`: 普通 / Normal / 普通
- `board.priorityLowest`: 最低 / Lowest / 最低
- `board.priorityLower`: 较低 / Lower / 較低
- `board.priorityHigher`: 较高 / Higher / 較高
- `board.priorityHighest`: 最高 / Highest / 最高
- `board.priorityNone`: 无 / None / 無
- `board.startAt`: 开始时间 / Start Date / 開始時間
- `board.taskInfo`: 任务信息 / Task Info / 任務資訊
- `board.parentTask`: 父任务 / Parent Task / 父任務
- `board.fullscreen`: 全屏查看 / Fullscreen / 全螢幕檢視

### Step 9: 编译打包

`npm run tauri:build`