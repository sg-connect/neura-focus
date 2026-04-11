# NeuraFocus 🧠

**Your personal focus tracker that lives in the macOS menu bar.**

NeuraFocus silently monitors which apps you use throughout the day, categorizes your time into focus, distraction, communication, and idle buckets, and gives you a real-time focus score. When you drift off-task for too long, it nudges you back with smart native notifications.

![Dashboard Screenshot](assets/screenshot-placeholder.png)

## What it does

- **Tracks the active window** every 3 seconds using AppleScript, categorizing apps and browser tabs automatically
- **Computes a daily focus score** (0–100) based on the ratio of productive vs. distracted time
- **Sends smart notifications** — distraction warnings, break reminders after 90 min of deep work, context-switching alerts, and positive reinforcement for great streaks
- **Focus Mode** — one click to suppress all alerts and enter deep work; the app tracks your session length
- **Dashboard** — a full Electron window with an activity timeline, context-switch chart, top apps breakdown, daily insights, and a weekly trend view

## Features

| Feature | Description |
|---|---|
| Menu bar score | Live focus score displayed in the macOS tray |
| Activity timeline | Hour-by-hour color-coded view of your day |
| Context switch chart | Switches per hour — highlights overload periods |
| Smart rules engine | Configurable alerts with per-rule cooldowns to prevent spam |
| Browser awareness | Categorizes Chrome/Safari/Arc tabs by URL (GitHub = focus, YouTube = distraction) |
| Local-only storage | All data stays in a SQLite database at `~/.neura-focus.db` — nothing leaves your machine |
| Focus Mode | Suppresses alerts and tracks deep work sessions |
| Weekly trends | See your focus score over the past 7 days |

## Tech stack

- **Electron 31** — desktop shell, tray integration, native notifications
- **better-sqlite3** — fast local persistence with WAL mode
- **AppleScript** (via `osascript`) — active window detection
- **Vanilla JS + CSS** — zero-framework dashboard UI with a dark theme

## Getting started

### Prerequisites

- **macOS** (uses AppleScript for window tracking)
- **Node.js** >= 18
- **npm**

### Install and run

```bash
cd hacks/neura-focus
npm install
npx electron-rebuild   # rebuilds better-sqlite3 for Electron
npm start
```

On first launch, macOS will ask for **Accessibility** permission — the app needs it to read the active window title. Grant it in System Settings > Privacy & Security > Accessibility.

The app runs in the **menu bar only** (no Dock icon). Right-click the tray icon to open the dashboard, toggle pause, or start focus mode.

### Data location

All activity data is stored locally at:

```
~/.neura-focus.db
```

## Project structure

```
neura-focus/
├── main.js          # Electron main process — tray, window, IPC, lifecycle
├── tracker.js       # Polls active window, categorizes apps, manages sessions
├── rules.js         # Smart notification rules with cooldowns
├── db.js            # SQLite schema, reads, writes, daily summary rebuilds
├── preload.js       # Context bridge for secure renderer ↔ main IPC
├── public/
│   ├── index.html   # Dashboard layout and styles
│   └── app.js       # Dashboard rendering logic
└── assets/
    └── tray-icon.png
```

## App categories

Apps are automatically classified:

- **Focus** — VS Code, Xcode, iTerm, Cursor, WebStorm, IntelliJ, Figma, Sketch
- **Communication** — Slack, Teams, Mail, Zoom, Discord, Telegram, WhatsApp
- **Distraction** — YouTube, and browser tabs on twitter.com, reddit.com, instagram.com, tiktok.com, netflix.com, etc.
- **Idle** — Finder, login window, System Settings

Browser tabs are categorized by URL keywords in the window title. Unknown apps default to focus.

## License

Internal hackathon project — not licensed for external distribution.
