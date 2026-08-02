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
  app.whenReady().then(() => {
    openDb(app.getPath('userData'))
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
