# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Planner is a personal, offline-first **Windows desktop app** (Electron): tasks with recurrence + reminders, academics with Groq lecture chat, PPL gym tracking, badminton/McGill event alarms, and a Summer 2027 internship pipeline. `README.md` is thorough and current on the domain rules and build phases — read it for depth. Its **"Design" section is the one stale part** (see [Design system](#design-system)).

## Commands

- `npm run dev` — Vite dev server + Electron with hot reload (main/preload rebuild via `vite-plugin-electron`).
- `npm run typecheck` — `tsc` over both projects (`tsconfig.json` = renderer, `tsconfig.node.json` = `electron/` + `shared/`). **This is the main correctness gate — there is no ESLint and no unit-test runner.**
- `npm run build` — typecheck, then `vite build` (renderer → `dist/`, main + preload → `dist-electron/`).
- `npm run dist` — build + electron-builder NSIS installer → `release/`.
- `npm run gen:icons` — regenerate `build/` icons and `electron/trayIconData.ts`.

**Gotcha:** if the shell has `ELECTRON_RUN_AS_NODE=1` set (some IDE terminals do), Electron runs as plain Node and the app won't start — unset it first.

**Keep the app running — relaunch it after every change.** The user wants a live window open so each edit is visible. `npm run dev` hot-reloads the renderer, but **main/preload and `shared/` changes need the Electron process restarted** to take effect. A `PostToolUse` hook in `.claude/settings.local.json` keeps a single `npm run dev` alive across edits (PID-guarded at `.claude/.devserver.pid`, unsets `ELECTRON_RUN_AS_NODE`). If it isn't running — or after a main/`shared/` edit — relaunch: `unset ELECTRON_RUN_AS_NODE; npm run dev`. Never spawn a second instance while one is up (single-instance lock just refocuses the first).

### "Tests" are headless smoke flags, not a test framework

Verification runs the built app headlessly with env flags; each skips the single-instance lock and exits with a status code. Build first (`npm run build`), then run against the built `dist-electron/main.js`:

- `PLANNER_SMOKE=1 npx electron .` — DB opens + migrates, prints schema version, exit 0.
- `PLANNER_SMOKE=1 PLANNER_JOBS_TEST=1 npx electron .` — fetch + parse all six job feeds; per-source counts (verifies parsers against the live repos).
- `PLANNER_SMOKE=1 PLANNER_BQ_TEST=1 npx electron .` — fetch/parse the Badminton Québec calendar.
- `PLANNER_SMOKE=1 PLANNER_EVENT_TEST=YYYY-MM-DD npx electron .` — create a badminton event through the real path, print the computed registration window + queued reminders, then clean up.
- `PLANNER_SMOKE=1 PLANNER_ASSIST_TEST="add a task…" npx electron .` — one headless assistant round (needs a stored Groq key); prints reply + tool receipts.
- `PLANNER_SHOT=out.png [PLANNER_SHOT_JS="…"] npx electron .` — self-capture the rendered window to PNG then exit (ground-truth screenshots that bypass DWM quirks).
- `PLANNER_OPEN=<view>` deep-links the initial page; `--hidden` boots minimized to tray.

## Architecture

Three layers joined by one typed contract:

- `electron/` — main process: window/tray lifecycle, DB, reminder scheduler, IPC handlers, preload bridge, external feeds, Groq.
- `shared/` — domain types (`types.ts`) + the IPC contract (`ipc.ts`). **Single source of truth.**
- `src/` — React 19 renderer: `pages/`, `components/`, `lib/` hooks, `index.css`.

### The IPC spine (the part that spans several files)

The renderer never touches Node/Electron. It calls `window.planner`, a typed `PlannerApi` defined in `shared/ipc.ts`, exposed by the preload over `ipcRenderer.invoke`. Every layer is typed against that one file, so **adding a method there forces all layers to implement it.** A new capability end-to-end touches, in order:

1. `shared/types.ts` — data shapes.
2. `shared/ipc.ts` — add a channel to the `IPC` map and a method to `PlannerApi`.
3. `electron/<x>Repo.ts` — the implementation as plain functions over `getDb()`.
4. `electron/ipcHandlers.ts` — one `ipcMain.handle` wiring the channel to the repo.
5. `electron/preload.ts` — map the method to `ipcRenderer.invoke(channel, …)`.
6. `src/` — call `window.planner.<method>()`, often wrapped in a `lib/use*.ts` hook (tasks, gym, chat); other pages call `window.planner` directly.

### Data & persistence

- SQLite through Electron's built-in **`node:sqlite`** (`DatabaseSync`) — deliberately **zero native deps** (no VS Build Tools, no ABI rebuilds). One handle owned by main (`electron/db.ts`); the renderer only reaches data through IPC.
- DB lives at `%APPDATA%/planner/planner.db` (WAL). Schema is migrated on launch by `PRAGMA user_version` against the `MIGRATIONS` array (`electron/migrations.ts`). **Every table for every phase ships in v1** — add a new `{ version, sql }` entry only for later schema changes.

### Main-process background work

- **Reminders** fire from `electron/scheduler.ts` (tray-resident, polls the `reminders` table ~30s). Feature code just inserts reminder rows; it works with the window closed and catches up missed reminders at launch.
- A **daily rollover** job materializes upcoming recurring-task occurrences (`recurrence.ts` → `materializeAllSeries`).
- When main mutates task/series data outside a renderer call (auto-tagging, materialization, assistant tools) it pushes `TASKS_CHANGED_EVENT`; the renderer subscribes via `window.planner.onTasksChanged(cb)` and refetches.
- **Single-instance**: a second launch focuses the running window. `--hidden` (autostart) boots to tray.

### Build wiring

`vite.config.mts`: renderer → `dist/`, main + preload → `dist-electron/` (`package.json` `"main"` points there). `node:*` builtins stay **external** in the main bundle — Electron provides them, including `node:sqlite`.

### AI (Groq)

The assistant agent loop runs in main (`electron/assistant.ts`): Groq tool-calling with **additive-only** tools (create/list/complete tasks, create recurring tasks, log gym, gym status) — **no delete tools by design**, max 5 tool rounds/message. The API key is stored encrypted via Electron `safeStorage` and **never crosses IPC**; the renderer only learns `configured: boolean`.

## Domain invariants that break silently

Full rules are in `README.md`; these are the ones easy to violate:

- **Recurring tasks:** the rule lives on a *series*; occurrences are real task rows keyed `UNIQUE(series_id, occurrence_date)`. Deleting an occurrence marks it `skipped` (hidden forever, never regenerated); editing a series rewrites only *future open* occurrences; deleting a series keeps past/done history. `tasksDelete` hard-deletes standalone tasks but only skips series occurrences.
- **Event periods:** `events.start_at`/`end_at` are ISO instants; **local midnight means all-day**. An all-day event's `end_at` is midnight of the last day it *covers* (inclusive), so `spanOf()` in `EventsPage.tsx` reads it directly — but a timed event's `end_at` is the real end instant, so one ending at midnight belongs to the day *before*. `end_at` NULL = a single point. Patching only `date`/`time` shifts `end_at` by the same delta (moving an event keeps its length); patching `endDate`/`endTime` recomputes it outright.
- **Reminders** require a due *time* (all-day tasks don't toast) and are re-synced to the `reminders` table on every task write.
- **Tags** normalize to lowercase-kebab (`ECSE 200` → `ecse-200`) so a tag can't exist twice; the picker offers every tag in use across tasks *and* series.
- **External feeds** (`jobsFeed.ts`, `badmintonFeed.ts`) are fetched on demand with a ~10-min cache, **never background-polled**. A dead source degrades to a warning line, never an empty page. Don't add scrape-hostile sources (LinkedIn/Indeed/Handshake) — use structured lists/boards.

## Design system

The live visual world is **"Nocturne"** — a dark theme (midnight blue with violet chroma: `azure`=action/focus, `coral`=urgent/destructive, `mint`=done, `gold`=streaks, `violet`=secondary) defined as Tailwind v4 `@theme` tokens in `src/index.css`. **`README.md`'s "Design" section still describes an earlier light "Soft Tactile" palette and is out of date — trust `src/index.css`.**

Two motion invariants (both in the Tasks list) that are easy to break:

- A completed task **lingers in place ~1s** before re-bucketing to Completed — without it the row unmounts before its animation plays.
- Replay the completion swell by **toggling a class, never by changing `key`** — remounting the row destroys the checkbox's particle burst, which lives in child state.

All motion shares one `--ease-spring` curve and collapses under `prefers-reduced-motion`. (The design detector may flag `--ease-spring` as "bounce-easing" — it's a deliberate ~8% overshoot, a known false positive.)
