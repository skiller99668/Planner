// Electron main process: window + tray lifecycle, single-instance lock,
// autostart, DB bootstrap, reminder scheduler, IPC registration.
//
// The app is tray-resident: closing the window hides it (configurable via
// settings.closeToTray); "Quit" lives in the tray menu.

import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { TASKS_CHANGED_EVENT } from '../shared/ipc'
import { closeDb, getDbPath, getSchemaVersion, openDb } from './db'
import { registerIpcHandlers } from './ipcHandlers'
import { materializeAllSeries } from './recurrence'
import { startScheduler, stopScheduler } from './scheduler'
import { getSettings } from './settings'
import { TRAY_ICON_BASE64 } from './trayIconData'

const APP_ID = 'com.skyler.planner'
const isSmokeTest = process.env.PLANNER_SMOKE === '1'
const startHidden = process.argv.includes('--hidden')

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

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
      notifyDataChanged: () => win?.webContents.send(TASKS_CHANGED_EVENT)
    })
    createWindow()
    createTray()
    applyAutostart(getSettings().autostart)
    // Daily job generates upcoming occurrences of recurring series (runs on
    // first tick, then at each local-date rollover).
    startScheduler(
      () => showWindow(),
      () => materializeAllSeries()
    )
  })
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
          if (process.env.PLANNER_SHOT_JS) {
            await win!.webContents.executeJavaScript(process.env.PLANNER_SHOT_JS)
            await new Promise((r) => setTimeout(r, 600))
          }
          const img = await win!.webContents.capturePage()
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
