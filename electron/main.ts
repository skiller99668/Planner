// Electron main process: window + tray lifecycle, single-instance lock,
// autostart, DB bootstrap, reminder scheduler, IPC registration.
//
// The app is tray-resident: closing the window hides it (configurable via
// settings.closeToTray); "Quit" lives in the tray menu.

import { app, BrowserWindow, globalShortcut, Menu, nativeImage, screen, Tray } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { CAPTURE_RESET_EVENT, TASKS_CHANGED_EVENT } from '../shared/ipc'
import { closeDb, getDbPath, getSchemaVersion, openDb } from './db'
import { registerIpcHandlers } from './ipcHandlers'
import { materializeAllEventSeries } from './eventSeries'
import { materializeAllSeries } from './recurrence'
import { startScheduler, stopScheduler } from './scheduler'
import { getSettings } from './settings'
import { TRAY_ICON_BASE64 } from './trayIconData'

const APP_ID = 'com.skyler.planner'
const isSmokeTest = process.env.PLANNER_SMOKE === '1'
const startHidden = process.argv.includes('--hidden')

let win: BrowserWindow | null = null
let captureWin: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
/** The accelerator currently held, so a settings change can release the old one. */
let captureAccelerator: string | null = null

// Windows toast notifications need a stable AppUserModelID.
app.setAppUserModelId(APP_ID)

if (isSmokeTest) {
  // Smoke mode opens no window and must work alongside a running instance,
  // so it skips the single-instance lock.
  app.whenReady().then(async () => {
    openDb(app.getPath('userData'))
    // PLANNER_ASSIST_TEST="..." runs one headless assistant round (needs a
    // stored Groq key) and prints the reply + tool receipts.
    // PLANNER_JOBS_TEST=1 fetches every job source and prints per-source
    // counts plus a Canada sample — verifies parsers against the live repos.
    if (process.env.PLANNER_JOBS_TEST) {
      try {
        const { fetchJobs } = await import('./jobsFeed')
        const res = await fetchJobs(true)
        if (!res.ok) {
          console.log('JOBS FAIL', res.error)
          app.exit(1)
          return
        }
        // Mirror the renderer's filters so the counts here match the UI chips.
        const canadaRe = /canada|montr[eé]al|toronto|vancouver|ottawa|waterloo|qu[eé]bec|calgary|edmonton|halifax|mississauga|burnaby|kitchener|winnipeg|,\s*(on|qc|bc|ab|ns|mb|sk)\b/i
        const hwRe = /hardware|embedded|firmware|fpga|asic|vlsi|silicon|semiconductor|chip design|electrical|electronic|analog|mixed.signal|\brf\b|pcb|circuit|robotic|mechatronic|signal processing|verification engineer|physical design|power system/i
        const isCad = (p: (typeof res.postings)[number]) =>
          p.locations.some((l) => canadaRe.test(l))
        const swe = res.postings.filter((p) => p.category !== 'Hardware')
        const hw = res.postings.filter((p) => p.category === 'Hardware' || hwRe.test(p.title))
        console.log(
          'JOBS OK',
          JSON.stringify({
            total: res.postings.length,
            sources: res.sources,
            swe: { all: swe.length, canada: swe.filter(isCad).length },
            hardware: { all: hw.length, canada: hw.filter(isCad).length },
            canadaSample: res.postings
              .filter(isCad)
              .slice(0, 3)
              .map((p) => `${p.company} — ${p.title} [${p.locations.join('/')}]`),
            withSalary: res.postings.filter((p) => p.salary).length
          })
        )
        app.exit(0)
      } catch (err) {
        console.error('JOBS FAIL', err)
        app.exit(1)
      }
      return
    }

    // PLANNER_BQ_TEST=1 fetches the Badminton Québec calendar and prints what
    // the parser found — verifies the feed against the live site.
    if (process.env.PLANNER_BQ_TEST) {
      try {
        const { fetchBadmintonQuebec } = await import('./badmintonFeed')
        const res = await fetchBadmintonQuebec(true)
        console.log('BQ ' + JSON.stringify(res).slice(0, 1500))
        app.exit(res.ok ? 0 : 1)
      } catch (err) {
        console.error('BQ FAIL', err)
        app.exit(1)
      }
      return
    }

    // PLANNER_LEETCODE_TEST=<username> hits the LeetCode GraphQL for recent
    // solves + per-problem difficulty and prints counts — verifies the parser
    // against the live (unofficial) API without touching the DB.
    const lcUser = process.env.PLANNER_LEETCODE_TEST
    if (lcUser) {
      try {
        const { fetchRecentSolves, fetchProblemMeta } = await import('./leetcodeFeed')
        const res = await fetchRecentSolves(lcUser, true)
        if (!res.ok) {
          console.log('LEETCODE FAIL', res.error)
          app.exit(1)
          return
        }
        const counts = { easy: 0, medium: 0, hard: 0 }
        for (const s of res.solves.slice(0, 8)) counts[(await fetchProblemMeta(s.slug)).difficulty]++
        console.log(
          'LEETCODE OK',
          JSON.stringify({
            solves: res.solves.length,
            sample: res.solves.slice(0, 5).map((s) => `${s.title} [${s.date}]`),
            difficultySampled: counts
          })
        )
        app.exit(0)
      } catch (err) {
        console.error('LEETCODE FAIL', err)
        app.exit(1)
      }
      return
    }

    // PLANNER_EVENT_TEST=YYYY-MM-DD creates a badminton event through the real
    // path, prints the computed BQ window + queued reminders, cleans up, exits.
    const eventTestDate = process.env.PLANNER_EVENT_TEST
    if (eventTestDate) {
      try {
        const { createEvent, deleteEvent } = await import('./eventsRepo')
        const { getDb } = await import('./db')
        const ev = createEvent({
          title: 'BQ window self-test',
          kind: 'badminton',
          date: eventTestDate,
          time: null
        })
        const reminders = getDb()
          .prepare(`SELECT title, fire_at FROM reminders WHERE ref_id = ? ORDER BY fire_at`)
          .all(ev.id)
        console.log(
          'EVENT OK',
          JSON.stringify({ opens: ev.regOpensAt, closes: ev.regClosesAt, reminders })
        )
        deleteEvent(ev.id)
        app.exit(0)
      } catch (err) {
        console.error('EVENT FAIL', err)
        app.exit(1)
      }
      return
    }

    // PLANNER_REPEAT_TEST=YYYY-MM-DD walks a repeating event through its whole
    // life on the real path — materialize, strike one out, edit the series,
    // stop repeating — printing what happened at each step, then cleans up.
    const repeatTestDate = process.env.PLANNER_REPEAT_TEST
    if (repeatTestDate) {
      try {
        const { createEvent, deleteEvent, listEvents, updateEvent } = await import('./eventsRepo')
        const { materializeAllEventSeries } = await import('./eventSeries')
        const { getDb } = await import('./db')
        const db = getDb()
        const count = (sql: string, ...args: unknown[]) =>
          (db.prepare(sql).get(...(args as never[])) as { n: number }).n
        const steps: Record<string, unknown> = {}

        const first = createEvent({
          title: 'Repeat self-test',
          kind: 'other',
          date: repeatTestDate,
          time: '18:30',
          endTime: '20:00',
          reminderOffsets: [10_080, 1440, 30],
          repeat: { freq: 'weekly', interval: 1, byWeekdays: [], byMonthDay: null },
          repeatUntil: null
        })
        const seriesId = first.seriesId
        if (!seriesId) throw new Error('a repeat rule did not produce a series')

        const dates = () =>
          (
            db
              .prepare(
                `SELECT occurrence_date AS d FROM events
                 WHERE series_id = ? AND skipped = 0 ORDER BY d`
              )
              .all(seriesId) as unknown as { d: string }[]
          ).map((r) => r.d)

        const all = dates()
        steps.generated = all.length
        steps.firstThree = all.slice(0, 3)
        steps.spacingDays = [
          ...new Set(
            all.slice(1).map((d, i) => Math.round((Date.parse(d) - Date.parse(all[i])) / 86_400_000))
          )
        ]
        steps.remindersOnFirst = count('SELECT COUNT(*) AS n FROM reminders WHERE ref_id = ?', first.id)

        // A struck-out occurrence must stay gone across a re-materialization —
        // the tombstone is the only thing standing between it and tomorrow.
        const victim = listEvents().find((e) => e.seriesId === seriesId && e.id !== first.id)
        if (!victim?.occurrenceDate) throw new Error('series produced only one occurrence')
        deleteEvent(victim.id)
        materializeAllEventSeries()
        steps.skippedStaysGone = !dates().includes(victim.occurrenceDate)
        steps.remindersOnSkipped = count(
          'SELECT COUNT(*) AS n FROM reminders WHERE ref_id = ?',
          victim.id
        )

        // A series edit rewrites the future and leaves the tombstone alone.
        updateEvent(first.id, { title: 'Repeat self-test renamed' }, 'series')
        steps.renamedOccurrences = count(
          'SELECT COUNT(*) AS n FROM events WHERE series_id = ? AND skipped = 0 AND title = ?',
          seriesId,
          'Repeat self-test renamed'
        )
        steps.stillMissingSkipped = !dates().includes(victim.occurrenceDate)

        // Stopping the repeat keeps the occurrence it was asked from.
        const survivor = listEvents().find((e) => e.seriesId === seriesId)
        if (!survivor) throw new Error('nothing left to stop repeating')
        const kept = updateEvent(survivor.id, { repeat: null })
        steps.keptStandalone = kept.seriesId === null && kept.repeat === null
        steps.seriesRowsLeft = count('SELECT COUNT(*) AS n FROM event_series WHERE id = ?', seriesId)
        steps.occurrencesLeft = count('SELECT COUNT(*) AS n FROM events WHERE series_id = ?', seriesId)

        console.log('REPEAT OK', JSON.stringify(steps))

        deleteEvent(kept.id)
        db.prepare("DELETE FROM events WHERE title LIKE 'Repeat self-test%'").run()
        db.prepare("DELETE FROM event_series WHERE title LIKE 'Repeat self-test%'").run()
        db.prepare("DELETE FROM reminders WHERE title LIKE 'Repeat self-test%'").run()
        app.exit(0)
      } catch (err) {
        console.error('REPEAT FAIL', err)
        app.exit(1)
      }
      return
    }

    // PLANNER_SEARCH_TEST="query" runs one cross-module search against the real
    // DB and prints per-module hit counts plus a sample.
    const searchQuery = process.env.PLANNER_SEARCH_TEST
    if (searchQuery) {
      try {
        const { searchAll } = await import('./searchRepo')
        const hits = searchAll(searchQuery)
        const byModule: Record<string, number> = {}
        for (const h of hits) byModule[h.module] = (byModule[h.module] ?? 0) + 1
        console.log(
          'SEARCH OK',
          JSON.stringify({
            query: searchQuery,
            total: hits.length,
            byModule,
            top: hits.slice(0, 5).map((h) => `[${h.module}] ${h.title}`)
          })
        )
        app.exit(0)
      } catch (err) {
        console.error('SEARCH FAIL', err)
        app.exit(1)
      }
      return
    }

    // PLANNER_PARSE_TEST=1 runs the quick-add parser over a table of inputs.
    // Pure and offline — no DB, no network — so it's the one check here that
    // is a real unit test.
    if (process.env.PLANNER_PARSE_TEST) {
      try {
        const { parseTask, reconcileTags } = await import('../shared/parseTask')
        // A fixed "today" (a Monday) keeps weekday math deterministic.
        const T = '2026-08-10'
        const cases: [string, Partial<ReturnType<typeof parseTask>>][] = [
          ['buy milk', { title: 'buy milk', dueDate: null, dueTime: null, priority: 0, tags: [] }],
          ['lab report fri 5pm !high #ecse200', {
            title: 'lab report', dueDate: '2026-08-14', dueTime: '17:00', priority: 3, tags: ['ecse200']
          }],
          ['standup 9:30', { title: 'standup', dueDate: T, dueTime: '09:30' }],
          ['call mom tomorrow', { title: 'call mom', dueDate: '2026-08-11', dueTime: null }],
          ['gym tonight 6pm', { title: 'gym', dueDate: T, dueTime: '18:00' }],
          // Today IS a Monday: a bare weekday means the next one, not today.
          ['review mon', { title: 'review', dueDate: '2026-08-17' }],
          ['ship next fri', { title: 'ship', dueDate: '2026-08-21' }],
          ['dentist aug 14', { title: 'dentist', dueDate: '2026-08-14' }],
          ['dentist 14 aug', { title: 'dentist', dueDate: '2026-08-14' }],
          // A month/day already past rolls to next year.
          ['taxes apr 30', { title: 'taxes', dueDate: '2027-04-30' }],
          ['reading !2 #ecse 200', { title: 'reading 200', priority: 2, tags: ['ecse'] }],
          // Words that only look like modifiers must survive into the title.
          ['saturate the buffer', { title: 'saturate the buffer', dueDate: null }],
          ['read chapter 17', { title: 'read chapter 17', dueTime: null }],
          ['pay $5 fee', { title: 'pay $5 fee', dueTime: null }],
          ['midnight run 12am', { title: 'midnight run', dueTime: '00:00' }],
          ['lunch 12pm', { title: 'lunch', dueTime: '12:00' }]
        ]
        const failures: string[] = []
        for (const [input, want] of cases) {
          const got = parseTask(input, T)
          for (const [k, v] of Object.entries(want)) {
            const actual = (got as unknown as Record<string, unknown>)[k]
            const ok = Array.isArray(v)
              ? JSON.stringify(actual) === JSON.stringify(v)
              : actual === v
            if (!ok) {
              failures.push(`"${input}" → ${k}: want ${JSON.stringify(v)}, got ${JSON.stringify(actual)}`)
            }
          }
        }
        // Typing #ecse200 must land on an existing ecse-200 rather than fork it.
        const snapped = reconcileTags(['ecse200', 'newone'], ['ecse-200', 'gym'])
        if (JSON.stringify(snapped) !== JSON.stringify(['ecse-200', 'newone'])) {
          failures.push(`reconcileTags → got ${JSON.stringify(snapped)}`)
        }

        if (failures.length) {
          console.error(`PARSE FAIL (${failures.length})\n  ${failures.join('\n  ')}`)
          app.exit(1)
          return
        }
        console.log(`PARSE OK ${cases.length} cases + tag reconciliation`)
        app.exit(0)
      } catch (err) {
        console.error('PARSE FAIL', err)
        app.exit(1)
      }
      return
    }

    // PLANNER_GOAL_PARSE_TEST=1 does the same for the goal composer's parser.
    // Half these cases exist to prove what it does NOT eat — the failure that
    // matters here is a goal whose title lost a word.
    if (process.env.PLANNER_GOAL_PARSE_TEST) {
      try {
        const { parseGoal } = await import('../shared/parseGoal')
        const cases: [string, Partial<ReturnType<typeof parseGoal>>][] = [
          // The three the feature was asked for.
          ['bench 190 lbs', { title: 'bench', kind: 'number', targetValue: 190, unit: 'lbs', startValue: null }],
          ['apply to 20 jobs', { title: 'apply to jobs', kind: 'counter', targetValue: 20 }],
          ['grab rim', { title: 'grab rim', kind: 'checklist', targetValue: 0 }],
          // Ranges, in every spelling.
          ['bench 175 -> 190', { title: 'bench', kind: 'number', startValue: 175, targetValue: 190 }],
          ['bench 175 to 190 lbs', { title: 'bench', kind: 'number', startValue: 175, targetValue: 190, unit: 'lbs' }],
          ['weight from 185 to 170', { title: 'weight', kind: 'number', startValue: 185, targetValue: 170 }],
          // A descending range is a real goal, not a mistake.
          ['weight 185 -> 170 lbs', { title: 'weight', startValue: 185, targetValue: 170, unit: 'lbs' }],
          ['save $5000', { title: 'save', kind: 'number', targetValue: 5000, unit: '$' }],
          ['hit 90%', { title: 'hit', kind: 'number', targetValue: 90, unit: '%' }],
          ['pushups x20', { title: 'pushups', kind: 'counter', targetValue: 20 }],
          ['read 12 books', { title: 'read books', kind: 'counter', targetValue: 12 }],
          ['gpa 3.9', { title: 'gpa', kind: 'number', targetValue: 3.9, unit: null }],
          // --- everything below must come back untouched ---
          // A year is a word.
          ['finish 2026 taxes', { title: 'finish 2026 taxes', kind: 'checklist', targetValue: 0 }],
          // An unknown suffix rejects the whole token rather than dropping it.
          ['run 5k', { title: 'run 5k', kind: 'checklist' }],
          // A number inside a larger token is part of that token.
          ['pass ECSE200', { title: 'pass ECSE200', kind: 'checklist' }],
          ['ship v2.1', { title: 'ship v2.1', kind: 'checklist' }],
          // Tags and dates belong to the goal's own words.
          ['ship #v2 by aug 30', { title: 'ship #v2 by aug 30', kind: 'checklist' }],
          // Only the first numeric construct is ever consumed — the 190 stays
          // in the title. "3 sets" is a count of things, so this is a counter.
          ['bench 3 sets of 190', { title: 'bench sets of 190', kind: 'counter', targetValue: 3 }]
        ]
        const failures: string[] = []
        for (const [input, want] of cases) {
          const got = parseGoal(input)
          for (const [k, v] of Object.entries(want)) {
            const actual = (got as unknown as Record<string, unknown>)[k]
            if (actual !== v) {
              failures.push(`"${input}" → ${k}: want ${JSON.stringify(v)}, got ${JSON.stringify(actual)}`)
            }
          }
        }
        if (failures.length) {
          console.error(`GOAL PARSE FAIL (${failures.length})\n  ${failures.join('\n  ')}`)
          app.exit(1)
          return
        }
        console.log(`GOAL PARSE OK ${cases.length} cases`)
        app.exit(0)
      } catch (err) {
        console.error('GOAL PARSE FAIL', err)
        app.exit(1)
      }
      return
    }

    // PLANNER_GOAL_TEST=1 drives the goals repo end to end, asserting the two
    // rules that are easy to break by accident: a personal best survives a
    // worse reading logged after it, and a carry keeps the history. Creates and
    // removes its own rows.
    if (process.env.PLANNER_GOAL_TEST) {
      const MARK = 'GOAL self-test'
      const { getDb } = await import('./db')
      const wipe = (): void => {
        // Steps and entries cascade off the goal row.
        getDb().prepare('DELETE FROM goals WHERE title LIKE ?').run(`${MARK}%`)
      }
      try {
        const repo = await import('./goalsRepo')
        const check = (label: string, ok: boolean): void => {
          if (!ok) throw new Error(label)
        }
        const now = new Date()
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        const next = `${now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()}-${String(
          now.getMonth() === 11 ? 1 : now.getMonth() + 2
        ).padStart(2, '0')}`
        const day = `${month}-05`
        wipe()

        // A number goal handed a source must come back without one: the source
        // only means anything on a counter, and the repo derives that.
        const bench = repo.createGoal({
          month,
          title: `${MARK} bench`,
          kind: 'number',
          targetValue: 190,
          unit: 'lbs',
          source: 'gym'
        })
        check('number goal must not keep a source', bench.source === null)

        repo.addGoalEntry({ goalId: bench.id, date: day, value: 175 })
        check('first entry stamps the start value', repo.getGoal(bench.id).startValue === 175)
        repo.addGoalEntry({ goalId: bench.id, date: day, value: 190 })
        repo.addGoalEntry({ goalId: bench.id, date: day, value: 178 })
        const benchEntries = repo.listGoalEntries().filter((e) => e.goalId === bench.id)
        check('every reading is kept', benchEntries.length === 3)
        check(
          'a worse reading after a PR does not erase it',
          Math.max(...benchEntries.map((e) => e.value)) === 190
        )

        // Descending: losing weight, where the best reading is the lowest.
        const weight = repo.createGoal({
          month,
          title: `${MARK} weight`,
          kind: 'number',
          startValue: 185,
          targetValue: 170
        })
        repo.addGoalEntry({ goalId: weight.id, date: day, value: 180 })
        repo.addGoalEntry({ goalId: weight.id, date: day, value: 174 })
        const wEntries = repo.listGoalEntries().filter((e) => e.goalId === weight.id)
        check('descending best is the minimum', Math.min(...wEntries.map((e) => e.value)) === 174)
        check('an explicit start is not overwritten', repo.getGoal(weight.id).startValue === 185)

        // Checklist + steps.
        const rim = repo.createGoal({ month, title: `${MARK} rim`, kind: 'checklist' })
        const s1 = repo.createGoalStep(rim.id, 'Touch backboard')
        const s2 = repo.createGoalStep(rim.id, 'Depth jumps')
        repo.updateGoalStep(s1.id, { done: true })
        repo.reorderGoalSteps(rim.id, [s2.id, s1.id])
        const steps = repo.listGoalSteps().filter((s) => s.goalId === rim.id)
        check('steps reorder 1..n', steps[0].id === s2.id && steps[0].sortOrder === 1)
        check('an empty retitle is ignored', repo.updateGoalStep(s1.id, { title: '  ' }).title === 'Touch backboard')

        // A linked counter reads another table rather than its own rows.
        const linked = repo.createGoal({
          month,
          title: `${MARK} gym`,
          kind: 'counter',
          targetValue: 20,
          source: 'gym'
        })
        check('a counter keeps its source', repo.getGoal(linked.id).source === 'gym')
        check('autoCount is carried on the row', typeof repo.getGoal(linked.id).autoCount === 'number')

        // The trap: tasks.done_at is a UTC instant while every other source is
        // a local YYYY-MM-DD. A task finished late on the last evening of the
        // month is already "next month" in UTC, and a prefix match would file
        // it there. Both goals below read the same task and must disagree.
        {
          const db = getDb()
          const [gy, gm] = month.split('-').map(Number)
          const lastDay = new Date(gy, gm, 0).getDate()
          const lateLocal = new Date(gy, gm - 1, lastDay, 21, 0).toISOString()
          const taskId = `goal-test-${Date.now()}`
          db.prepare(
            `INSERT INTO tasks (id, title, tags, all_day, priority, status, done_at, created_at, updated_at)
             VALUES (?, ?, ?, 1, 0, 'done', ?, ?, ?)`
          ).run(taskId, MARK, '["goaltest"]', lateLocal, lateLocal, lateLocal)

          const thisMonth = repo.createGoal({
            month,
            title: `${MARK} tagged`,
            kind: 'counter',
            targetValue: 5,
            source: 'tasks',
            sourceTag: 'goaltest'
          })
          const nextMonth = repo.createGoal({
            month: next,
            title: `${MARK} tagged next`,
            kind: 'counter',
            targetValue: 5,
            source: 'tasks',
            sourceTag: 'goaltest'
          })
          check('a late-evening completion counts in its own month', thisMonth.autoCount === 1)
          check('and not in the next one', nextMonth.autoCount === 0)
          db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId)
        }

        // Carry moves the row and keeps everything hanging off it.
        repo.carryGoal(bench.id, next)
        const moved = repo.getGoal(bench.id)
        check('carry rewrites the month', moved.month === next)
        check('carry keeps the start value', moved.startValue === 175)
        check(
          'carry keeps every entry',
          repo.listGoalEntries().filter((e) => e.goalId === bench.id).length === 3
        )
        check('the old month no longer lists it', !repo.listGoals(month).some((g) => g.id === bench.id))
        check('the new month does', repo.listGoals(next).some((g) => g.id === bench.id))

        // Kind is frozen once there is history to reinterpret.
        check(
          'kind is refused once entries exist',
          repo.updateGoal(bench.id, { kind: 'counter' }).kind === 'number'
        )

        // Delete cascades both child tables.
        repo.deleteGoal(rim.id)
        check(
          'steps go with the goal',
          repo.listGoalSteps().filter((s) => s.goalId === rim.id).length === 0
        )
        repo.deleteGoal(bench.id)
        check(
          'entries go with the goal',
          repo.listGoalEntries().filter((e) => e.goalId === bench.id).length === 0
        )

        wipe()
        console.log('GOAL OK 20 assertions')
        app.exit(0)
      } catch (err) {
        wipe()
        console.error('GOAL FAIL', err)
        app.exit(1)
      }
      return
    }

    // PLANNER_RECUR_TEST=1 drives the task-level repeat editor end to end —
    // standalone → repeating → a different rule → stopped — asserting what each
    // step keeps. Creates and removes its own rows in the real DB.
    if (process.env.PLANNER_RECUR_TEST) {
      const MARK = 'RECUR self-test'
      const { getDb } = await import('./db')
      const wipe = (): void => {
        const db = getDb()
        // Dropping the series cascades its occurrences; the rest go by title.
        db.prepare('DELETE FROM task_series WHERE title = ?').run(MARK)
        db.prepare('DELETE FROM tasks WHERE title = ?').run(MARK)
      }
      try {
        const { createTask, listTasks } = await import('./tasksRepo')
        const { listSeries, setTaskRecurrence } = await import('./recurrence')
        const check = (label: string, ok: boolean): void => {
          if (!ok) throw new Error(label)
        }
        const ymd = (d: Date): string =>
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const parse = (s: string): number => {
          const [y, m, d] = s.split('-').map(Number)
          return new Date(y, m - 1, d).getTime()
        }
        const dayGap = (a: string, b: string): number =>
          Math.round((parse(b) - parse(a)) / 86_400_000)
        const start = ymd(new Date())
        const mine = (): ReturnType<typeof listTasks> =>
          listTasks().filter((t) => t.title === MARK)

        wipe()
        const one = createTask({ title: MARK, dueDate: start, dueTime: '09:00' })

        // 1. Standalone task → repeating: the one-off gives way to occurrences.
        setTaskRecurrence(one.id, {
          title: MARK,
          rule: { freq: 'weekly', interval: 1, byWeekdays: [(new Date().getDay() + 6) % 7], byMonthDay: null },
          startDate: start,
          dueTime: '09:00'
        })
        const series = listSeries().filter((s) => s.title === MARK)
        check('series not created', series.length === 1)
        check('one-off survived the conversion', !mine().some((t) => t.id === one.id))
        const weekly = mine()
        check('weekly occurrences missing', weekly.length >= 8)
        check('occurrences not 7 days apart', weekly.every((t, i) =>
          i === 0 || dayGap(weekly[i - 1].occurrenceDate!, t.occurrenceDate!) === 7))

        // 2. Rule changed from an occurrence: the series template is rewritten.
        setTaskRecurrence(weekly[0].id, {
          title: MARK,
          rule: { freq: 'daily', interval: 3, byWeekdays: [], byMonthDay: null },
          startDate: series[0].startDate,
          dueTime: '09:00'
        })
        const daily = mine()
        check('daily occurrences missing', daily.length >= 15)
        check('occurrences not 3 days apart', daily.every((t, i) =>
          i === 0 || dayGap(daily[i - 1].occurrenceDate!, t.occurrenceDate!) === 3))
        check('anchor drifted off the series start', daily[0].occurrenceDate === start)

        // 3. Repeat switched off: this row survives, history is kept, rest go.
        const keep = daily[1]
        setTaskRecurrence(keep.id, null)
        check('series still active', !listSeries().some((s) => s.title === MARK))
        const left = mine()
        const kept = left.find((t) => t.id === keep.id)
        check('the edited task was destroyed', kept !== undefined)
        check('kept task still bound to a series', kept!.seriesId === null)
        check('future occurrences survived', left.length === 1)

        console.log('RECUR OK', JSON.stringify({ weekly: weekly.length, daily: daily.length, kept: kept!.occurrenceDate }))
        wipe()
        app.exit(0)
      } catch (err) {
        console.error('RECUR FAIL', err)
        wipe()
        app.exit(1)
      }
      return
    }

    const assistPrompt = process.env.PLANNER_ASSIST_TEST
    if (assistPrompt) {
      try {
        const { assistantSend } = await import('./assistant')
        const res = await assistantSend(
          { scope: 'general', refId: null, threadId: null, text: assistPrompt },
          () => {}
        )
        console.log(
          'ASSIST OK',
          JSON.stringify({
            reply: res.assistantMessage.content,
            receipts: res.assistantMessage.meta?.receipts ?? []
          })
        )
        app.exit(0)
      } catch (err) {
        console.error('ASSIST FAIL', err)
        app.exit(1)
      }
      return
    }
    runSmokeTest()
  })
} else if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())

  app.whenReady().then(() => {
    openDb(app.getPath('userData'))

    registerIpcHandlers({
      applyAutostart,
      notifyDataChanged: () => {
        win?.webContents.send(TASKS_CHANGED_EVENT)
        captureWin?.webContents.send(TASKS_CHANGED_EVENT)
      },
      dismissCapture: () => hideCapture(),
      applyCaptureShortcut: (accel) => registerCaptureShortcut(accel)
    })
    createWindow()
    createTray()
    applyAutostart(getSettings().autostart)
    registerCaptureShortcut(getSettings().captureShortcut)
    // Daily job generates upcoming occurrences of recurring tasks and events
    // (runs on first tick, then at each local-date rollover).
    startScheduler(
      () => showWindow(),
      () => {
        materializeAllSeries()
        materializeAllEventSeries()
      }
    )
  })
}

// ---------- global capture ----------
//
// The whole point is that it works when the app isn't focused, so this is a
// separate always-on-top window rather than the main one: summoning the full
// app to jot one line would disturb whatever you were actually doing.
//
// It's created once and hidden rather than destroyed, because the gap between
// pressing the key and being able to type is the entire feature.

/** Point the OS hotkey at the capture bar. null (or a rejected accelerator)
 *  simply leaves the feature off — never fatal. */
function registerCaptureShortcut(accelerator: string | null): boolean {
  if (captureAccelerator) {
    globalShortcut.unregister(captureAccelerator)
    captureAccelerator = null
  }
  if (!accelerator) return true
  try {
    // Another app may already own the combination; Electron reports that by
    // returning false rather than throwing.
    const ok = globalShortcut.register(accelerator, () => toggleCapture())
    if (ok) captureAccelerator = accelerator
    return ok
  } catch {
    return false // malformed accelerator from a hand-edited setting
  }
}

function ensureCaptureWindow(): BrowserWindow {
  if (captureWin && !captureWin.isDestroyed()) return captureWin

  captureWin = new BrowserWindow({
    width: 620,
    height: 200,
    show: false,
    frame: false,
    transparent: true, // the panel rounds itself; the rest of the frame is air
    resizable: false,
    movable: false,
    skipTaskbar: true, // it's a hotkey surface, not a window you alt-tab to
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    captureWin.loadURL(`${process.env.VITE_DEV_SERVER_URL}#capture`)
  } else {
    captureWin.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: 'capture' })
  }

  // Clicking away is a dismissal — the bar should never be something you have
  // to go back and close. (Suppressed under PLANNER_SHOT, where the main
  // window taking focus would hide the bar before it could be captured.)
  if (!process.env.PLANNER_SHOT) captureWin.on('blur', () => hideCapture())
  captureWin.on('closed', () => {
    captureWin = null
  })
  return captureWin
}

function showCapture(): void {
  const w = ensureCaptureWindow()
  // Re-centre on the display the mouse is on, not the primary one — on a
  // multi-monitor desk the bar has to appear where you're looking.
  const cursor = screen.getCursorScreenPoint()
  const area = screen.getDisplayNearestPoint(cursor).workArea
  const [width] = w.getSize()
  w.setPosition(
    Math.round(area.x + (area.width - width) / 2),
    Math.round(area.y + area.height * 0.22)
  )
  w.webContents.send(CAPTURE_RESET_EVENT)
  w.show()
  w.focus()
}

function hideCapture(): void {
  if (captureWin && !captureWin.isDestroyed() && captureWin.isVisible()) captureWin.hide()
}

function toggleCapture(): void {
  if (captureWin && !captureWin.isDestroyed() && captureWin.isVisible()) hideCapture()
  else showCapture()
}

function createWindow(): void {
  // The running window needs its icon set explicitly: on Windows the taskbar
  // button uses the window's icon, not the .exe's, so without this it shows the
  // stock Electron logo even though the exe icon is correct. Dev reads it from
  // the repo; packaged builds ship it via electron-builder `extraResources`.
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon-256.png')
    : path.join(__dirname, '..', 'build', 'icon-256.png')
  win = new BrowserWindow({
    ...(fs.existsSync(iconPath) ? { icon: nativeImage.createFromPath(iconPath) } : {}),
    width: 1200,
    height: 800,
    minWidth: 860,
    minHeight: 600,
    show: !startHidden,
    backgroundColor: '#0B1220',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // PLANNER_OPEN=<view> deep-links the initial page (also used by smoke checks).
  const hash = process.env.PLANNER_OPEN ? `#${process.env.PLANNER_OPEN}` : ''
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL + hash)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
      hash: process.env.PLANNER_OPEN ?? undefined
    })
  }

  // PLANNER_SHOT=<file.png>: self-capture the rendered page shortly after
  // load and exit — ground-truth debugging that bypasses DWM quirks.
  const shotPath = process.env.PLANNER_SHOT
  if (shotPath) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          // PLANNER_SHOT_JS runs in the page first, so screenshots can capture
          // states that need interaction (opening a form, expanding a row).
          // PLANNER_SHOT_TARGET=capture shoots the global capture bar instead
          // of the main window — it's a separate BrowserWindow, so it can't be
          // reached from the page the way every other surface can.
          const target =
            process.env.PLANNER_SHOT_TARGET === 'capture' ? (showCapture(), captureWin!) : win!
          if (target !== win) await new Promise((r) => setTimeout(r, 700))
          if (process.env.PLANNER_SHOT_JS) {
            // Log what the snippet returned: it's the only channel back out of
            // the page, and probing layout is half of what it gets used for.
            const result = await target.webContents.executeJavaScript(process.env.PLANNER_SHOT_JS)
            if (result !== undefined) console.log(`SHOT JS ${JSON.stringify(result)}`)
            await new Promise((r) => setTimeout(r, 600))
          }
          const img = await target.webContents.capturePage()
          fs.writeFileSync(shotPath, img.toPNG())
          console.log(`SHOT OK ${shotPath}`)
        } catch (err) {
          console.error('SHOT FAIL', err)
        }
        quitting = true
        app.quit()
      }, 3500)
    })
  }

  // Hide to tray instead of quitting, unless the user opted out or is quitting.
  win.on('close', (e) => {
    if (quitting) return
    if (getSettings().closeToTray) {
      e.preventDefault()
      win?.hide()
    }
  })

  win.on('closed', () => {
    win = null
  })
}

function showWindow(): void {
  if (!win) {
    createWindow()
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createTray(): void {
  const icon = nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_BASE64, 'base64'))
  tray = new Tray(icon)
  tray.setToolTip('Planner')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Planner', click: () => showWindow() },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', () => showWindow())
}

function applyAutostart(enabled: boolean): void {
  // Registering the dev electron.exe as a login item would be wrong;
  // only touch login items for the packaged app.
  if (!app.isPackaged) return
  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: ['--hidden']
  })
}

app.on('window-all-closed', () => {
  // Tray app: stay alive with no windows. Quit only via tray menu.
  if (!getSettingsSafe()?.closeToTray) {
    quitting = true
    app.quit()
  }
})

app.on('before-quit', () => {
  quitting = true
  stopScheduler()
})

app.on('will-quit', () => {
  // An OS-wide hotkey outlives the window that registered it — release it or
  // the combination stays claimed until the process dies.
  globalShortcut.unregisterAll()
  captureAccelerator = null
  closeDb()
})

function getSettingsSafe() {
  try {
    return getSettings()
  } catch {
    return null
  }
}

/** PLANNER_SMOKE=1: verify DB opens + migrates, then exit 0. Used by CI/manual checks. */
function runSmokeTest(): void {
  try {
    console.log(`SMOKE OK schema=v${getSchemaVersion()} db=${getDbPath()}`)
    app.exit(0)
  } catch (err) {
    console.error('SMOKE FAIL', err)
    app.exit(1)
  }
}
