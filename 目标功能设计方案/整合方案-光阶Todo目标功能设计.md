# 光阶Todo — 目标功能设计方案（整合版）

> 综合 6 套方案的优秀设计，面向桌面 Todo 应用的产品定位，追求**实用、简洁、可落地**。

---

## 1. 产品定位

将 OKR 方法论降维应用于个人成长，帮助用户**设定目标 → 量化关键结果 → 日常执行 → 进度追踪 → 周期复盘**，打通"想做什么"到"做到没有"的完整链路。

### 核心用户场景
- 设定一个目标（如"三个月减重 5 公斤"）
- 拆解为可量化的关键结果（如"每周跑步 3 次"）
- 日常更新进度（如"本周跑了 2 次"）
- 查看整体完成度，获得成就感
- 周期结束后复盘归档，沉淀经验

---

## 2. 核心概念

| 概念 | 定义 | 示例 |
|------|------|------|
| **目标 (Goal)** | 定性、鼓舞人心的方向 | 提升英语商务沟通能力 |
| **关键结果 (KR)** | 定量、衡量目标是否达成的指标 | 背诵 2000 个商务词汇 |
| **里程碑 (Milestone)** | KR 下的非量化检查点 | 完成第一阶段课程 |
| **子目标 (Sub-goal)** | 目标下的子目标，最多 5 层 | Q2 子目标：听力突破 |

### 状态机

```
目标状态：
  进行中 ──(所有 KR 完成)──> 已达成
  进行中 ──(手动)──> 已放弃
  已达成/已放弃 ──(手动)──> 已归档（只读）

KR 状态：
  进行中 ──(current ≥ target)──> 已完成
  进行中 ──(手动)──> 已放弃
```

---

## 3. 数据模型

### 3.1 目标表 (goals) — 扩展现有表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | UUID |
| `title` | TEXT | 目标名称（必填，≤50 字） |
| `description` | TEXT | 愿景描述（选填） |
| `color` | TEXT | 主题色 |
| `icon` | TEXT | 图标标识 |
| `category` | TEXT | 分类：work / study / life / health / finance（可自定义） |
| `start_date` | TEXT | 开始日期 |
| `due_at` | TEXT | 截止日期 |
| `parent_goal_id` | TEXT FK | 父目标 ID（支持 4 层嵌套） |
| `weight` | INTEGER | 权重 1-10，默认 5（用于加权进度） |
| `status` | TEXT | active / completed / abandoned / archived |
| `progress_mode` | TEXT | percentage / numeric（复用现有字段） |
| `progress_value` | REAL | 当前进度值 |
| `progress_total` | REAL | 进度总量 |
| `position` | INTEGER | 排序位置 |
| `created_at` | TEXT | 创建时间 |
| `updated_at` | TEXT | 更新时间 |

### 3.2 关键结果表 (key_results) — 新建

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | UUID |
| `goal_id` | TEXT FK | 所属目标 ID |
| `title` | TEXT | KR 名称（必填） |
| `type` | TEXT | metric / boolean / milestone |
| `start_value` | REAL | 起始值（metric 类型，默认 0） |
| `target_value` | REAL | 目标值（metric 类型必填） |
| `current_value` | REAL | 当前值（默认 0） |
| `unit` | TEXT | 单位：次/kg/km/本/% |
| `weight` | INTEGER | 权重 1-100，同目标下总和 = 100 |
| `is_completed` | INTEGER | 是否完成（boolean 类型用） |
| `position` | INTEGER | 排序位置 |
| `created_at` | TEXT | 创建时间 |

### 3.3 进度日志表 (progress_logs) — 新建

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PK | UUID |
| `kr_id` | TEXT FK | 关联 KR ID |
| `old_value` | REAL | 更新前数值 |
| `new_value` | REAL | 更新后数值 |
| `comment` | TEXT | 更新备注（≤140 字） |
| `created_at` | TEXT | 记录时间 |

### 3.4 子目标表 — 复用现有 goals 表的 parent_goal_id

支持 4 层嵌套，通过 `parent_goal_id` 实现递归。

### 3.5 里程碑表 — 复用现有 milestones 表

每个 KR 下可挂载多个里程碑（非量化检查点）。

---

## 4. 进度计算引擎

### 4.1 KR 进度

```javascript
// 数值型 (metric)
krProgress = (currentValue - startValue) / (targetValue - startValue) * 100
// 封顶：max(0, min(100, krProgress))

// 布尔型 (boolean)
krProgress = isCompleted ? 100 : 0

// 里程碑型 (milestone)
krProgress = (completedMilestones / totalMilestones) * 100
```

### 4.2 目标进度（加权平均）

采用方案 4 的加权设计：

```javascript
goalProgress = Σ(krProgress * krWeight) / Σ(krWeight)
// 保留 1 位小数
```

### 4.3 进度颜色状态机（采用方案 2）

根据进度与时间消耗的对比，动态显示颜色：

```
时间消耗率 = (今天 - startDate) / (endDate - startDate) * 100%

进度 ≥ 时间消耗率         → 绿色（领跑）
时间消耗率 - 进度 ≤ 20%   → 黄色（轻度滞后）
时间消耗率 - 进度 > 20%   → 红色（严重滞后）
```

### 4.4 任务驱动 KR 更新（采用方案 4）

当任务关联了 metric 类型 KR，且任务标记完成时：

```
kr.currentValue += task.contributionValue
→ 触发 KR 进度重算
→ 触发 Goal 进度重算
```

---

## 5. 功能模块

### 5.1 目标管理

**创建目标**：
- 必填：标题、截止日期
- 选填：描述、分类、颜色、权重（1-10）
- 创建后自动进入"进行中"状态

**目标列表**：
- 卡片展示：标题、进度环、剩余天数、分类色标
- 筛选：状态 / 分类 / 周期
- 排序：最近更新 / 到期时间 / 完成度
- 支持子目标 4 层嵌套

**目标详情**：
- 顶部：标题 + 进度环 + 剩余天数 + 状态标签
- 中部：KR 列表（每个含进度条、当前值/目标值、权重）
- 下部：里程碑清单 + 关联任务 + 更新日志

### 5.2 关键结果管理

**KR 类型**（采用方案 3 的三种类型）：

| 类型 | 字段 | 进度计算 | 示例 |
|------|------|----------|------|
| **数值型** | 起始值/目标值/单位 | (当前-起始)/(目标-起始)*100% | 存款 0→50000 元 |
| **布尔型** | 完成/未完成 | 0% 或 100% | 通过 PMP 考试 |
| **里程碑型** | 子检查点列表 | 已完成数/总数*100% | 考取驾照(报名/学科/路考) |

**KR 权重**：同目标下所有 KR 权重之和 = 100。新增 KR 时默认均分，用户可手动调整。

**进度更新方式**：
1. **精确输入**：输入具体数值
2. **百分比滑块**：0-100% 滑动
3. **快速 +1**：计数型 KR 点击递增
4. **任务驱动**：完成关联任务自动累加

**更新日志**：每次更新记录时间戳 + 旧值 + 新值 + 可选备注。

### 5.3 里程碑

- 每个 KR 下可添加多个里程碑（非量化检查点）
- 勾选即标记完成，参与里程碑型 KR 的进度计算
- 独立于 KR 的完成状态

### 5.4 任务联动（采用方案 5）

- 支持将看板中的任务关联到目标或 KR
- 任务完成时自动更新关联 KR 的进度（metric 类型）
- 目标详情页展示所有关联任务的状态
- 支持从目标详情页直接创建关联任务

### 5.5 归档与复盘（采用方案 5）

**自动归档**：目标完成或超出截止日期 7 天后，标记"待归档"。

**手动归档**：用户可随时归档任意状态的目标。

**复盘记录**：
- 完成总结（文本）
- 自评打分（1-5 星）
- 成功因素 / 失败原因
- 下次改进方向

**模板复用**：支持将已归档的目标（含 KR 配置）保存为模板，一键复用。

### 5.6 提醒与预警（采用方案 6）

| 触发条件 | 提醒方式 | 内容 |
|----------|----------|------|
| 每日固定时间 | 桌面通知 | "今日还有 N 个目标未更新进度" |
| 目标到期前 3 天 | 桌面通知 | "「目标名」即将到期，当前完成度 X%" |
| 连续 3 天未更新 | 桌面通知 | "已连续 3 天未更新，保持节奏！" |
| KR 进度滞后（颜色变红） | 应用内红点 | KR 卡片显示风险标识 |

---

## 6. 页面设计

### 6.1 目标列表页

```
┌─────────────────────────────────────────────────────┐
│  目标        [筛选: 全部 ▼]  [排序: 最近更新 ▼]  + │
├─────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────┐  │
│  │ 🏃 完成马拉松训练                  ● 健康     │  │
│  │ ████████████░░░░ 75%   剩余 18 天   ★★★★☆    │  │
│  │ KR: 月跑量 120/150km · LSD 2/3次             │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │ 📚 精通 React                      ● 学习     │  │
│  │ ████████░░░░░░░░ 50%   剩余 45 天   ★★★☆☆    │  │
│  │ KR: 完成项目 3/5 · 阅读源码 40%               │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │ 💰 存款 10 万                       ● 财务     │  │
│  │ ██████████████░░ 90%   剩余 5 天    ★★★★★    │  │
│  │ KR: 月存 8000/10000 · 副业收入 达标            │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 6.2 目标详情页

```
┌─────────────────────────────────────────────────────┐
│ ← 返回     完成马拉松训练          [编辑] [更多 ▼] │
├─────────────────────────────────────────────────────┤
│ 2026.07.01 – 2026.12.31  ● 健康  ★★★★☆           │
│ ████████████░░░░ 75%     剩余 18 天                │
├─────────────────────────────────────────────────────┤
│ 关键结果                              权重  进度    │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 月跑量达到 150km                   40%  ████░░  │ │
│ │ 当前: 120 / 150 km                             │ │
│ │ [更新进度]                      进度正常(绿色)  │ │
│ └─────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 完成 3 次 30km LSD                30%  █░░░░░  │ │
│ │ 当前: 1 / 3 次                                  │ │
│ │ [更新进度]                      进度滞后(黄色)  │ │
│ └─────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 完成全程马拉松                     30%  ░░░░░░  │ │
│ │ 状态: 未开始                                    │ │
│ │ [标记完成]                                      │ │
│ └─────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────┤
│ 里程碑                                            │ │
│ ☑ 报名马拉松           ☐ 完成半马测试              │
│ ☑ 购买专业跑鞋         ☐ 完成全程                  │
├─────────────────────────────────────────────────────┤
│ 关联任务                                          │
│ ☑ 购买跑鞋              ☐ 制定 16 周训练计划       │
│ ☑ 每周跑 3 次           ☐ 报名 12 月马拉松         │
├─────────────────────────────────────────────────────┤
│ 更新日志                                          │
│ 06-01  120/150 km (+10km)  "本周状态很好"          │
│ 05-25  110/150 km (+5km)   "下雨天室内跑"          │
└─────────────────────────────────────────────────────┘
```

### 6.3 创建目标弹窗

```
┌─────────────────────────────────────┐
│ 创建目标                    [✕]     │
├─────────────────────────────────────┤
│ 目标名称 *  [________________]      │
│ 描述        [________________]      │
│ 分类        [健康 ▼]               │
│ 截止日期 *  [2026-12-31]          │
│ 权重        ★★★★☆ (5/10)         │
│ 颜色        [●●●●●●]              │
├─────────────────────────────────────┤
│ 关键结果 (至少 1 个，最多 5 个)     │
│ ┌─────────────────────────────────┐ │
│ │ KR 1  [____________] [数值型 ▼] │ │
│ │ 目标值 [150] 单位 [km]         │ │
│ │ 权重 [40]%                     │ │
│ └─────────────────────────────────┘ │
│ [+ 添加关键结果]                    │
├─────────────────────────────────────┤
│         [取消]  [创建目标]          │
└─────────────────────────────────────┘
```

---

## 7. 技术实现要点

### 7.1 数据库迁移（迁移 v4）

```sql
-- 新建 KR 表
CREATE TABLE IF NOT EXISTS key_results (
    id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'metric',
    start_value REAL NOT NULL DEFAULT 0,
    target_value REAL NOT NULL DEFAULT 1,
    current_value REAL NOT NULL DEFAULT 0,
    unit TEXT,
    weight INTEGER NOT NULL DEFAULT 20,
    is_completed INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

-- 新建进度日志表
CREATE TABLE IF NOT EXISTS progress_logs (
    id TEXT PRIMARY KEY,
    kr_id TEXT NOT NULL REFERENCES key_results(id) ON DELETE CASCADE,
    old_value REAL NOT NULL,
    new_value REAL NOT NULL,
    comment TEXT,
    created_at TEXT NOT NULL
);

-- 扩展 goals 表
ALTER TABLE goals ADD COLUMN category TEXT;
ALTER TABLE goals ADD COLUMN start_date TEXT;
ALTER TABLE goals ADD COLUMN weight INTEGER NOT NULL DEFAULT 5;
ALTER TABLE goals ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE goals ADD COLUMN review_score INTEGER;
ALTER TABLE goals ADD COLUMN review_note TEXT;

PRAGMA user_version = 4;
```

### 7.2 新增 Rust 命令

| 命令 | 说明 |
|------|------|
| `list_key_results` | 获取目标下所有 KR |
| `create_key_result` | 创建 KR |
| `update_key_result` | 更新 KR（含进度值） |
| `toggle_kr_completed` | 切换 KR 完成状态 |
| `delete_key_result` | 删除 KR |
| `check_in_kr` | 更新 KR 进度 + 写入日志 |
| `kr_progress_history` | 获取 KR 进度日志 |
| `goal_progress_detail` | 获取目标完整进度详情 |
| `link_task_to_goal` | 关联任务到目标/KR |
| `unlink_task_from_goal` | 取消关联 |
| `archive_goal` | 归档目标 |
| `save_review` | 保存复盘记录 |
| `save_as_template` | 保存为模板 |
| `create_from_template` | 从模板创建目标 |

### 7.3 前端新增文件

```
src/pages/GoalDetailPage.tsx        -- 目标详情页
src/components/goal/KRCard.tsx      -- KR 卡片（含进度更新）
src/components/goal/MilestoneList.tsx -- 里程碑列表
src/components/goal/ProgressLog.tsx  -- 更新日志时间轴
src/components/goal/ReviewModal.tsx  -- 复盘弹窗
src/components/goal/CreateGoalModal.tsx -- 创建目标弹窗
src/api/goals.ts                    -- 扩展 API（新增 KR 相关）
src/store/useGoalStore.ts           -- 扩展 store
```

### 7.4 进度颜色实现

```tsx
function getProgressColor(progress: number, startDate: string, endDate: string): string {
  const now = dayjs();
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  const totalDays = end.diff(start, 'day');
  if (totalDays <= 0) return 'var(--success)';
  const elapsed = now.diff(start, 'day');
  const timeRate = Math.min(100, (elapsed / totalDays) * 100);
  const gap = timeRate - progress;
  if (gap <= 0) return 'var(--success)';    // 绿色：领跑
  if (gap <= 20) return 'var(--warning)';   // 黄色：轻度滞后
  return 'var(--danger)';                    // 红色：严重滞后
}
```

---

## 8. 与现有系统的集成

### 8.1 总览页
- 热力图：活动数据包含 KR 更新记录
- 统计卡片：新增"进行中目标数"
- 目标进度环形图：展示所有进行中目标的进度

### 8.2 番茄钟
- 番茄钟可关联到 KR，完成后自动更新 KR 进度（计数型）

### 8.3 任务看板
- 任务卡片显示关联的目标/KR 标签
- 从任务详情可跳转到关联的目标详情

### 8.4 日历
- 目标截止日期在日历中显示
- KR 截止日期可设置提醒

---

## 9. 边界与约束

| 约束 | 说明 |
|------|------|
| 每个目标最多 5 个 KR | 避免过度复杂 |
| 子目标最多 4 层 | 控制嵌套深度 |
| KR 权重总和 = 100 | 保证加权计算正确 |
| 目标值 ≠ 起始值 | 避免除零 |
| 起止日期跨度 ≤ 5 年 | 合理性校验 |
| 删除目标级联删除 KR + 里程碑 | 数据一致性 |
| 归档后只读 | 防止误修改 |

---

## 10. 实施计划

| 阶段 | 内容 | 预估工作量 |
|------|------|-----------|
| Phase 1 | 数据库迁移 + KR CRUD 命令 + 前端 KR 管理 | 2 天 |
| Phase 2 | 目标详情页 + 进度计算 + 进度颜色 | 2 天 |
| Phase 3 | 任务联动 + 更新日志 + 提醒 | 1 天 |
| Phase 4 | 归档复盘 + 模板复用 | 1 天 |
| Phase 5 | 总览集成 + 番茄钟关联 + 测试 | 1 天 |

总计约 **7 天**可完成全功能开发。
