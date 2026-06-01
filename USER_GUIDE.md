# Ascend Todo — User Guide

> **Master your time, elevate your life.**
>
> A cross-platform desktop task manager that helps you build an orderly, purposeful life.

[中文版说明](./USER_GUIDE_ZH.md)

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Interface Overview](#2-interface-overview)
3. [Overview](#3-overview)
4. [Task Boards](#4-task-boards)
5. [Goals](#5-goals)
6. [Calendar](#6-calendar)
7. [Pomodoro](#7-pomodoro)
8. [Profile](#8-profile)
9. [Settings](#9-settings)
10. [FAQ](#10-faq)

---

## 1. Getting Started

### Installation

- **Windows**: Double-click the `.msi` or `-setup.exe` installer and follow the prompts
- **macOS**: Drag the `.app` to your Applications folder
- **Linux**: Run the `.deb` package (`sudo dpkg -i file.deb`) or make the `.AppImage` executable and double-click it

### First Launch

The app opens on the **Overview** page. Recommended first steps:

1. Click the avatar at the bottom-left → **Profile**, and set your nickname and signature
2. Click **Settings** at the bottom-left to choose your preferred theme and language
3. Go to **Task Boards** to create your first board

All data is stored locally in SQLite by default. **No internet connection is required.** Enable cloud sync after logging in (see [§9.5](#95-sync)).

---

## 2. Interface Overview

The app uses a classic **sidebar + main area** layout.

```
┌──────────┬──────────────────────────────────────────┐
│          │ Top bar: sync status, quick actions       │
│  Ascend  ├──────────────────────────────────────────┤
│   Todo   │                                          │
│          │              Main content                 │
│ Overview │        (changes based on sidebar          │
│  Boards  │           selection below)                │
│  Goals   │                                          │
│ Calendar │                                          │
│ Pomodoro │                                          │
│          │                                          │
│  ─────── │                                          │
│ Pinned   │                                          │
│  boards  │                                          │
│  ─────── │                                          │
│ Settings │                                          │
│  Avatar  │                                          │
└──────────┴──────────────────────────────────────────┘
```

**Sidebar** (top to bottom):
- Overview · Boards · Goals · Calendar · Pomodoro
- (Pinned boards)
- Settings · Avatar

**Top bar**: Shows cloud sync status, last sync time, and a quick sync button.

---

## 3. Overview

> Get a quick snapshot of today's progress and long-term trends

The first thing you see is the **Quote of the Day** (motivational quote), followed by four stat cards:

| Card | Meaning |
| --- | --- |
| Day Streak | Consecutive days with check-ins |
| Tasks Completed | Tasks marked done this week |
| Active Goals | Goals not yet 100% complete |
| Pomodoros | Total pomodoro sessions ever |

### Activity Heatmap

A **53-week × 7-day** GitHub-style heatmap. Each square's shade represents that day's activity level (based on check-ins + completed tasks). Hover to see the date and count.

Click **+ Check in** at the top-right to record today's check-in.

### Trend & Summary

- **14-day Pomodoro Trend**: Bar chart of daily pomodoro count over the last two weeks
- **Goal Progress**: Donut chart showing each goal's completion percentage
- **Goal List**: Progress bars with percentages

---

## 4. Task Boards

> Trello-style boards with drag-and-drop and subtasks

### 4.1 Creating a Board

1. On the **Task Boards** page, click **+ New board** at the top-right
2. Enter a name (required), description, and choose a color
3. Click **Create** — you'll be taken to the board detail view

### 4.2 Board Operations

- **Add a list**: Enter the list name in the input at the far right of the board, press Enter or click +
- **Add a task**: Enter the task title at the bottom of any list, press Enter
- **Drag tasks**: Hold a task card and drag within the same list to reorder
- **Cross-list drag**: Hold a task card and drag it to another list at any position
- **Complete / undo**: Click the circular checkbox to the left of the task
- **Edit a task**: Click the task body to open the detail modal
- **Delete a task**: Hover over the task card and click the × icon at the top-right
- **Pin to sidebar**: Return to the boards list, click the pin icon on any board card

### 4.3 Task Details

The modal that opens when you click a task body lets you set:

- **Title**, **Description**
- **Due date**: Supports cross-day, cross-month, and cross-year tasks
- **Daily reminder time** (HH:MM): Triggers a desktop notification + sound at the specified time each day
- **Task color**: Highlights the task in the calendar and heatmap views
- **Subtasks**: Checking a subtask automatically reflects in the parent task's progress

### 4.4 Task Badges

Task cards display:
- 📅 Due date
- 🔔 Daily reminder time
- ✓ Subtask progress (e.g. `2/5`)

---

## 5. Goals

> Long-term goals with milestones and sub-goals, progress auto-calculated

### 5.1 Creating a Goal

1. On the **Goals** page, click **+ New goal**
2. Enter a title, description, target date (optional), and color
3. Click **Create**

### 5.2 Adding Milestones

In the expanded goal card:
- Enter the milestone title at the bottom of the list → press Enter or click +
- Click the circle to the left of a milestone to mark it complete
- Click × to delete a milestone

### 5.3 Adding Sub-goals

Click the **+** icon at the top-right of the goal card. The "New goal" dialog opens with the parent goal pre-selected.

### 5.4 Progress Calculation

Progress is calculated as `completed items / total items`:
- First-level milestones + sub-goals = total items
- Checked milestones + 100%-complete sub-goals = completed items

The progress bar at the top updates in real time.

---

## 6. Calendar

> View and create tasks across days, weeks, and months

### 6.1 View Modes

- **Day**: 24-hour timeline for a single day
- **Week**: 7-day × 24-hour grid
- **Month**: Classic month calendar

Switch using the buttons at the top. The ‹ › buttons navigate forward/back, and the **Today** button returns to the current date.

### 6.2 Week Start Day

In **Settings**, choose whether the week starts on **Monday** or **Sunday**. This affects:
- The column order in week view
- The first/last row display in month view

### 6.3 Creating a Task

Click any empty cell in the calendar (a date in month view, an hour cell in week/day view) → a new task dialog appears:
- Select the board / list
- The task is pre-filled with the selected date/time, which you can modify
- Click **Create** to save

### 6.4 Display Rules

- Tasks whose **due date** falls on a given day appear as colored blocks on that day's cell
- Completed tasks are shown with strikethrough
- Tasks with a color set use that color as a tinted background

---

## 7. Pomodoro

> Focus timer with automatic logging and statistics

### 7.1 Modes

- **Countdown**: Counts down from the set duration to 0, then alerts
- **Countup**: Counts up from 0; press "Stop" to end

Switch between modes using the toggle above the timer.

### 7.2 Usage Steps

1. Choose the **duration** (minutes) — the default is set in **Settings**
2. (Optional) Select a **linked task** — so you can see "how many pomodoros this task took" in history
3. Click **Start**
4. You can **Pause** / **Resume** / **Stop** at any time
5. When the countdown reaches zero, a sound plays and a desktop notification appears

### 7.3 Statistics

- **Total sessions**, **Completed sessions**, **Total time**
- **14-day trend** line chart
- **History** list (each entry shows: start time, mode, duration, linked task)

---

## 8. Profile

> Click the avatar at the bottom-left of the sidebar

You can set:
- **Nickname** (displayed in the sidebar and top bar)
- **Avatar** (click "Upload" to select a local image; click × to clear)
- **Phone**, **Email**, **Signature**

Click **Save** to apply all changes (persisted locally + synced to cloud if logged in).

---

## 9. Settings

> Click "Settings" at the bottom-left of the sidebar

### 9.1 Appearance

- **Theme**: Choose from 4 options (Aurora Day · Mint Garden · Midnight · Forest)
- **Language**: English (default) · Simplified Chinese · Traditional Chinese
- **Week starts on**: Monday · Sunday

### 9.2 Pomodoro

- **Default duration** (minutes): Used as the starting value for new sessions
- **Long break** (minutes): Reserved for future use

### 9.3 Reminder

- **Enable notifications**: Daily reminders trigger system notifications at the specified time
- **Show motivational quotes**: The overview page shows a quote of the day
- **Reminder sound**: Bell · Chime · Digital · None (played when a timer ends or a reminder fires)

### 9.4 Account

- When not logged in: **Sign up** or **Sign in** forms
- When logged in: Shows current nickname, with a **Sign out** button

⚠️ Currently a **mock implementation**: passwords are stored locally as SHA-256 hashes and never uploaded to any server. Production deployment requires replacing `src-tauri/src/sync_engine.rs` with a real backend.

### 9.5 Sync

- **Enable cloud sync**: Only when enabled will the sync status appear in the top bar
- **Server URL**: Leave blank for local mock; fill in a real URL to connect to a backend
- **Sync now**: ↑ push (upload local to server) / ↓ pull (download from server, overwriting local)

⚠️ In mock mode, push/pull simulates within the process. Restarting the app resets the state.

### 9.6 About

- Current **version number**
- **Check for updates on startup**: When enabled, a check runs at each launch
- **Check for updates**: Manually trigger a check

---

## 10. FAQ

### Q1: Where is my data stored? Is it safe?
All data is stored in a local SQLite database:
- **Windows**: `%APPDATA%\com.ascend.todo\ascend.db`
- **macOS**: `~/Library/Application Support/com.ascend.todo/ascend.db`
- **Linux**: `~/.local/share/com.ascend.todo/ascend.db`

When not logged in, data is **entirely local**. After enabling cloud sync and logging in, data is exchanged with the server (currently mock).

### Q2: How do I back up?
Simply copy the `ascend.db` file listed above. Regular backups are recommended.

### Q3: I forgot my password. What do I do?
There is no password recovery (mock implementation). You can delete the `auth_pw_hash` and `auth_nickname` rows from the `settings` table, or delete the entire `ascend.db` to reset the app.

### Q4: Reminders aren't showing. What should I check?
1. Is **Enable notifications** turned on in **Settings**?
2. Has the OS granted notification permissions? (Windows: Settings → System → Notifications)
3. Is the **Reminder sound** set to "None"? — If both sound and notifications are off, nothing happens
4. Is the task already completed? — Completed tasks are no longer reminded

### Q5: Can multiple people collaborate?
Not in this version. Boards and goals are single-user local data.

### Q6: Can I import/export data?
No UI for this yet. You can manually copy `ascend.db` for backup/migration, or write a small tool that calls the `sync_snapshot` command to export full JSON.

### Q7: Which fires first — the pomodoro or the task reminder?
They are independent and may trigger simultaneously.

### Q8: Can I open multiple windows?
Currently a single-window design. Tauri 2 technically supports multi-window, but no UI entry is exposed.

### Q9: How do I change the theme colors?
Go to **Settings** → **Appearance** → click one of the 4 themes. To customize colors, edit `src/styles/themes.css` and rebuild.

### Q10: How do I switch languages?
**Settings** → **Appearance** → Language, 3 choices. Takes effect immediately — no restart required.

---

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `Esc` | Close modal / dialog |
| `Enter` | Confirm input (new task, list, goal, milestone, etc.) |
| `Ctrl+Shift+I` | Toggle developer tools (dev mode on by default) |
| `F11` | Toggle fullscreen |

---

## Getting Help

- Project README: [README.md](./README.md)
- Developer docs: [DEVELOPING.md](./DEVELOPING.md)
- 中文版: [USER_GUIDE_ZH.md](./USER_GUIDE_ZH.md)
- Bug reports: Include OS version, app version (**Settings → About**), and reproduction steps
