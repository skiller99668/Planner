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
  // Packaged builds embed the icon via electron-builder; in dev, load it from
  // the repo so the taskbar doesn't show the stock Electron logo.
  const devIcon = path.join(__dirname, '..', 'build', 'icon-256.png')
  win = new BrowserWindow({
    ...(!app.isPackaged && fs.existsSync(devIcon)
      ? { icon: nativeImage.createFromPath(devIcon) }
      : {}),
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
