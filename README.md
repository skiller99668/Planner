# Planner

An offline-first personal planner for Windows — one desktop app for tasks,
coursework, training, tournaments, and internship prep, with an optional AI
assistant. Built with Electron and React; all of your data stays on your machine.

## Overview

Planner is a tray-resident Windows desktop application that brings a student's
whole routine into one place: recurring tasks with reminders, course notes with
an AI study chat, Push/Pull/Legs gym tracking, a calendar of tournaments and
campus events with registration alarms, a Summer 2027 internship pipeline, and a
LeetCode practice tracker.

It runs entirely offline. Everything is stored in a local SQLite database, and
the only network calls are ones you trigger yourself — fetching internship
boards, the Badminton Québec calendar, or a LeetCode sync — plus the Groq AI API
if you choose to add a key. Reminders fire from the background even when the
window is closed, so nothing slips.

## Features

### Tasks & reminders
- Quick capture with due dates and times, priorities, and lowercase-kebab tags
  with a colour picker.
- **Recurring tasks** — daily, weekly, or monthly with weekday selection. A
  repeating task shows only its **next occurrence**; the following one appears
  once you complete the current.
- **Reminders** run in the background from the system tray and toast even with
  the window closed. Missed reminders catch up on launch.
- **Drag to reorder** by the grip on the left of a row (or `Alt+↑/↓` from the
  keyboard). Order is kept *within* a section — Today, Tomorrow, No date — since
  which section a task is in is a fact about its due date. Rows you've never
  placed by hand keep sorting themselves by due date and priority, below the
  ones you have; rescheduling a task drops it back into that natural order.

### Assistant (optional AI)
- A slide-in assistant available on **every** page, plus an always-on box on the
  dashboard — one shared conversation, opened with a click or `Ctrl+A`.
- Powered by Groq with tool use: it can create tasks, break a project into
  steps, set up recurring tasks, log a workout, and mark tasks done — additive
  actions only, each shown as a receipt.
- Your API key is stored encrypted with Windows credentials and never leaves the
  machine except in calls to Groq.

### Academics
- **Terms are folders you make** — Fall 2026, Winter 2027 — and courses live in
  one. Rename, recolour, roll up, drag into order, and **archive** a term when
  the semester ends: archived things keep their lectures and chats, and sit on
  their own shelf. Deleting a term drops only the folder; its courses fall back
  to *No term* with everything intact.
- Courses → lectures → your written summaries. Codes, names, term and colour are
  all editable in place; drag to reorder courses within a term.
- A per-lecture AI chat that knows the course, your summary, and recent lectures
  — quiz yourself, go deeper, or generate study tasks.
- A course doubles as an **event category**: file a midterm under ECSE 200 and it
  shows up on the calendar in that course's colour, labelled with its code.

### Gym (Push / Pull / Legs)
- One-tap logging that suggests the next workout in the PPL cycle.
- A Sunday–Saturday week grid; click **any past day** to log it retroactively,
  with a weekly target and a streak.

### Events & registration alarms
- **Month, week, day and list views**, manual entry, and `.ics` import. Week and
  day are hour grids: **drag across the hours to block out a period**, and it
  arrives in the create bubble already filled in.
- Events are **periods, not points** — a start and an end, each with its own
  date and time. That covers a 90-minute lecture, an overnight sprint, and a
  four-day tournament. Whole-day and multi-day entries ride in the band above
  the hours; overlapping blocks split their column instead of hiding each other.
- **Events repeat** daily, weekly (on chosen weekdays) or monthly, with an
  optional end date. The rule lives on a series and each occurrence is a real
  event, so a repeat can be edited or deleted one occurrence at a time —
  "this event" or "all events", asked at the moment it matters.
- **Reminders you choose**: any combination of a week, two days, a day, two
  hours, an hour, 30 or 10 minutes before, or at the start. All-day events count
  back from 9am on the day, so "1 day before" arrives while you can still act on
  it. New events keep the day-before nudge unless you say otherwise.
- Fetches the **Badminton Québec** tournament calendar and computes each event's
  registration window, with "opens" and "closes-soon" alarms and a "registered"
  toggle.
- Click any event to **edit it inline** — type, period, repeat, reminders,
  location, URL, notes.

### Career — Summer 2027 internships
- An application pipeline (Wishlist → Applied → OA → Interview → Offer) and a
  weekly scoreboard (applications / DSA / networking vs. targets).
- **Live internship postings** aggregated on demand from community-maintained
  boards, with one-click add to your pipeline, plus a research-program watchlist
  and a resource shelf.

### LeetCode tracker
- Log solved problems with difficulty, topic, URL and notes; see weekly progress
  against your goal, a streak, and an all-time difficulty breakdown.
- **Best-effort sync** of your recent accepted solves from a LeetCode username,
  and one-click launch links to LeetCode and NeetCode.
- Drives the Career page's weekly DSA count, so there's a single source of truth.

### Goals for the month
- **Type the goal in plain English** and it works out what kind it is:
  `bench 190 lbs` is a measurement, `apply to 20 jobs` is a tally, `grab rim` is
  a checklist. It shows what it understood, and the kind is one click to change.
  It never eats a word it wasn't sure about — `finish 2026 taxes` and `run 5k`
  keep their numbers.
- **Number goals track a personal best, not the last reading.** Log a lift
  whenever you hit one; a worse day logged afterwards can't erase the PR, and
  the entry marked ★ best is usually not the newest. Goals that count *down*
  (losing weight, cutting a mile time) work the same way in reverse.
- **Checklist goals** are the deliverables you set yourself, and **any** goal
  can carry steps — a tally toward 20 applications can hold "upgrade resume"
  and "build a project" underneath it.
- **Counters can track themselves.** Point one at Applications, Gym, LeetCode,
  or tasks carrying a tag, and it counts that month's rows for you instead of
  asking you to log the same thing twice.
- Goals live in a month, with ‹ › to move between them. Anything unfinished
  turns up at the top of the next month under **Carried over** — Keep brings it
  forward with its history intact, Drop archives it. Nothing moves on its own.
- Progress shows on **Today** under the weekly trackers, in the same bar
  language: today → this week → this month.

### Throughout
- **Keyboard shortcuts** for everything — new task (`Ctrl+T`), assistant
  (`Ctrl+A`), jump to any page (`Ctrl+1`–`8`), filter by tag (`/`), and a
  shortcut cheat sheet (`?`). All rebindable in Settings.
- A cohesive dark "Nocturne" theme, purposeful motion that respects
  `prefers-reduced-motion`, and a confirmation step on every destructive action.
- **Offline-first**: local SQLite storage, launches on startup hidden in the
  tray, and single-instance (relaunching focuses the running window).

## Installation

Planner is a Windows desktop app. You can run a prebuilt installer if you have
one, or build it from source.

### If you have the installer
Double-click `Planner-Setup-<version>.exe`. Because it isn't code-signed (it's a
personal build), Windows SmartScreen will warn once — choose **More info → Run
anyway**. Planner installs like any app, adds a Start-menu entry, and is set to
launch on startup hidden in the tray so reminders keep firing.

### Build it from source

**Requirements:** Windows 10 or 11, [Node.js](https://nodejs.org) 20 or newer,
and Git.

```bash
git clone <your-repo-url> Planner
cd Planner
npm install
npm run dist
```

This produces the installer at:

```
release\Planner-Setup-<version>.exe
```

Run it as described above.

Your data lives in `%APPDATA%\planner\planner.db` and persists across reinstalls
and upgrades.

### Enabling the AI features (optional)
Open **Settings → Groq API key** and paste a key from
[console.groq.com](https://console.groq.com); it's stored encrypted on your
machine. Without a key, the Assistant and lecture chats are simply disabled and
everything else works normally.

## Development

```bash
npm install
npm run dev          # Vite dev server + Electron, with hot reload
npm run typecheck    # the correctness gate (there is no ESLint or test runner)
npm run build        # typecheck + production build
npm run dist         # build + electron-builder installer → release/
npm run gen:icons    # regenerate the app and tray icons
```

> If your shell has `ELECTRON_RUN_AS_NODE=1` set (some IDE-embedded terminals
> do), Electron runs as plain Node and the app won't start — unset it first.

There is no unit-test runner; verification runs the built app headlessly behind
environment flags — for example `PLANNER_SMOKE=1 npx electron .` opens and
migrates the database, then exits. The full set is documented in `CLAUDE.md`.

## Architecture

| Layer | Choice | Why |
|---|---|---|
| Shell | Electron + electron-builder (NSIS) | Tray residency, toast notifications, autostart |
| UI | React 19 + TypeScript + Vite + Tailwind CSS 4 | |
| Storage | SQLite via Electron's built-in `node:sqlite` | Zero native dependencies — no build tools, no ABI rebuilds |
| AI | Groq (optional) | Key encrypted via `safeStorage`; all calls proxied through the main process |

```
electron/   main process — window/tray lifecycle, DB + migrations, reminder
            scheduler, IPC handlers, preload bridge, external feeds, Groq
shared/     domain types + the typed IPC contract (single source of truth)
src/        renderer (React) — pages, components, hooks, styles
scripts/    icon generation
```

- **The renderer never touches Node or Electron APIs.** It calls `window.planner`,
  a typed `PlannerApi` ([shared/ipc.ts](shared/ipc.ts)) exposed by the preload
  over `ipcRenderer.invoke`; adding a method there forces both main and preload
  to implement it.
- **Data** is stored in `%APPDATA%\planner\planner.db` (WAL) and migrated on
  launch via `PRAGMA user_version` ([electron/migrations.ts](electron/migrations.ts)).
- **Reminders** fire from the main process ([electron/scheduler.ts](electron/scheduler.ts)),
  which polls the `reminders` table every ~30s; feature code just inserts rows.
  It works with the window closed and catches up on missed reminders at launch.
- **External feeds** (internship boards, Badminton Québec, LeetCode) are fetched
  only on demand with a short cache and degrade to a warning line, never an empty
  page.

For deeper implementation notes — the recurring-task model, the job-feed parsers,
the Badminton Québec window math, and the assistant tool loop — see `CLAUDE.md`.

## Privacy

Planner is offline-first. All of your data stays in a local SQLite database on
your machine: no telemetry, no accounts. Network access happens only when you
explicitly trigger it (fetching internship postings, the Badminton Québec
calendar, or a LeetCode sync), or when the assistant calls Groq with a key you
supply.

---

*A personal project, built around one student's actual routine.*
