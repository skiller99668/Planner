# Planner

Personal desktop planner (Windows, Electron): tasks with recurrence + reminders,
academics with Groq-powered lecture chat, PPL gym tracking, badminton tournament +
McGill event alarms, and the Summer 2027 internship pipeline.

## Run it

```bash
npm install
npm run dev        # dev server + Electron with hot reload
```

Build the installable app:

```bash
npm run dist       # → release/Planner-Setup-<version>.exe
```

The installer is unsigned, so SmartScreen will warn once — "More info → Run anyway".

> Running Electron from a terminal that has `ELECTRON_RUN_AS_NODE=1` set (e.g. some
> IDE-embedded shells) makes it behave like plain Node and the app won't start —
> unset it first. Normal terminals are unaffected.

## Architecture

| Layer | Choice | Why |
|---|---|---|
| Shell | Electron 43 + electron-builder (NSIS) | Tray residency, toast notifications, autostart |
| UI | React 19 + TypeScript + Vite + Tailwind 4 | |
| Storage | SQLite via Electron's built-in `node:sqlite` | Zero native deps — no VS Build Tools, no ABI rebuilds |
| AI | Groq (Phase 4) | Key encrypted via `safeStorage`, calls proxied through main |

```
electron/   main process: window/tray lifecycle, db + migrations, reminder
            scheduler, IPC handlers, preload bridge
shared/     domain types + the typed IPC contract (single source of truth)
src/        renderer (React) — pages, components, styles
scripts/    gen-icons.mjs — regenerates build/ icons + tray icon module
```

- **Data** lives in `%APPDATA%/planner/planner.db` (WAL). Schema is migrated on
  launch via `PRAGMA user_version`; all tables for every planned phase ship in v1
  ([electron/migrations.ts](electron/migrations.ts)).
- **The renderer never touches Node/Electron APIs.** It calls `window.planner`
  (typed `PlannerApi`, [shared/ipc.ts](shared/ipc.ts)), exposed by the preload over
  `ipcRenderer.invoke`. Adding a method to `PlannerApi` forces main + preload to
  implement it.
- **Reminders** fire from the main process ([electron/scheduler.ts](electron/scheduler.ts)),
  polling the `reminders` table every 30s — feature code just inserts rows.
  Works with the window closed (tray) and catches up on missed reminders at launch.
- The app is **single-instance**; launching again focuses the running window.
  `--hidden` starts minimized to tray (used by autostart).

## Build phases

1. ✅ **Foundation** — shell, SQLite, IPC, tray, autostart, notifications, UI skeleton
2. **Tasks** — capture, tags, due dates, reminders, recurring series (weekly labs)
3. **Gym** — PPL next-in-cycle, one-tap logging, weekly grid vs 5–6 target, streaks
4. **Academics** — courses → lectures → summaries, Groq chat with lecture context,
   AI-suggested tasks
5. **Events + Career** — ICS import, Badminton Québec registration-window alarms,
   McGill career fairs, application kanban, weekly prep targets, SURE/USRA deadlines
