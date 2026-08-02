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
2. ✅ **Tasks** — capture, tags, due dates, reminders, recurring series (weekly labs),
   AI tag suggestions (Groq; key in Settings, encrypted via `safeStorage`)
3. ✅ **Gym** — PPL next-in-cycle, one-tap logging (idempotent per day+type),
   Sun–Sat week grid with history arrows, week streak vs target, session notes
4. ✅ **Academics + Assistant** — courses → lectures → summaries, per-lecture Groq
   chat with course context; app-wide Assistant with tool use (creates tasks,
   plans projects into steps, sets up recurring tasks, logs workouts, completes
   tasks — additive tools only, every action shows a receipt chip)
5. **Events + Career** — ICS import, Badminton Québec registration-window alarms,
   McGill career fairs, application kanban, weekly prep targets, SURE/USRA deadlines

### Task model notes

- Recurring tasks: the rule lives on a **series**; occurrences are real task rows
  generated ~60 days ahead, keyed `UNIQUE(series_id, occurrence_date)`. Deleting an
  occurrence marks it `skipped` (hidden forever, never regenerated); editing a series
  rewrites only future open occurrences; deleting a series keeps past/done history.
- Reminders need a due **time** (all-day tasks don't fire toasts) and are synced to
  the `reminders` table on every task write; the tray-resident scheduler does the rest.
- AI tag suggestions merge into your tags, never replace them; at most one course-code
  tag per task is enforced in code, preferring yours ([electron/autoTag.ts](electron/autoTag.ts)).

### Assistant notes

- The agent loop runs in the main process ([electron/assistant.ts](electron/assistant.ts)):
  Groq tool-calling over `create_tasks`, `create_recurring_task`, `log_gym_session`,
  `list_tasks`, `complete_task`, `get_gym_status`. Max 5 tool rounds per message.
  No delete tools by design.
- Lecture chats inject the course, the lecture's summary, and recent lectures from
  the same course as system context at send time.
- Headless check once a key is stored:
  `PLANNER_SMOKE=1 PLANNER_ASSIST_TEST="add a task to test the assistant" npx electron .`
- Default models: `llama-3.3-70b-versatile` (assistant), `llama-3.1-8b-instant`
  (tagging); override the assistant model in Settings if Groq retires it.
