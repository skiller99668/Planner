# EE Planner — Dashboard Skeleton

Personal planner PWA for tracking academics, fitness (PPL), badminton, and career goals.

## Run it locally

```bash
npm install
npm run dev
```

Open the printed localhost URL. This is the dev server — use it while you keep building features.

## Install it as an app on your phone/laptop

1. Deploy it somewhere free and public, e.g. [Vercel](https://vercel.com):
   - Push this folder to a GitHub repo
   - Import the repo on vercel.com → it auto-detects Vite → Deploy
   - You'll get a URL like `ee-planner.vercel.app`
2. On your **phone** (Chrome/Safari): open that URL → "Add to Home Screen". It now behaves like a native app icon, opens full-screen, works offline.
3. On your **laptop** (Chrome/Edge): open the URL → click the install icon in the address bar (or menu → "Install EE Planner").

No backend, no signup needed for this — data is stored locally in the browser via `localStorage`.

## Where your data lives right now

Everything is saved to `localStorage` under the key `ee-planner-data-v1`, defined in `src/lib/store.js`.
This means:
- It persists across restarts on the *same device/browser*.
- It does **not** sync between your phone and laptop yet.
- Clearing browser data/cache will wipe it — worth exporting/backing up once you have real data in it.

## Adding cross-device sync later (when you want it)

The data layer in `src/lib/store.js` is intentionally shaped like database tables
(`tasks`, `gymSessions`, `badmintonSessions`, `applications`, `courses`, `projects`).
When you're ready:
1. Create a free [Supabase](https://supabase.com) project.
2. Create matching Postgres tables.
3. Swap the `localStorage` read/writes in `usePlannerData()` for Supabase client calls (or add a sync-on-write layer that pushes to Supabase in addition to localStorage, so it still works offline).

This is a contained, one-file change — nothing in the components needs to know where the data comes from.

## What's built vs. what's next

**Built (functional):**
- Dashboard with goal gauges (GPA floor, lifts/week, badminton/week, applications sent)
- Quick-log buttons for gym (push/pull/legs) and badminton sessions
- Cross-module task list (add, complete, delete, tag by category, due dates)
- Responsive nav (sidebar on desktop, bottom tabs on mobile)
- Installable as a PWA

**Stubbed, ready to fill in next:**
- Academics: course list, assignment tracker, GPA calculator
- Fitness: full session history, streaks, set/rep logging
- Badminton: session history, tournament tracker with results
- Career: application pipeline (kanban), project portfolio, networking log

Each stub page (`src/components/ModuleStub.jsx` usages in `App.jsx`) is a clear slot — tell me which one to build out first and we'll go module by module.
