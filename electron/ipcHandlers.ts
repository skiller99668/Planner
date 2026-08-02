// IPC handler registration. Every channel in shared/ipc.ts is implemented here;
// the preload exposes the matching PlannerApi methods to the renderer.

import { app, ipcMain, Notification, shell } from 'electron'
import { IPC, type AppInfo } from '../shared/ipc'
import type { Settings } from '../shared/types'
import { getDbPath, getSchemaVersion } from './db'
import { getSettings, patchSettings } from './settings'

export interface IpcDeps {
  applyAutostart: (enabled: boolean) => void
}

export function registerIpcHandlers(deps: IpcDeps): void {
  ipcMain.handle(IPC.appPing, (): AppInfo => {
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      dbPath: getDbPath(),
      schemaVersion: getSchemaVersion(),
      packaged: app.isPackaged
    }
  })

  ipcMain.handle(IPC.settingsGetAll, (): Settings => getSettings())

  ipcMain.handle(IPC.settingsPatch, (_e, patch: Partial<Settings>): Settings => {
    const next = patchSettings(patch)
    if ('autostart' in patch) deps.applyAutostart(next.autostart)
    return next
  })

  ipcMain.handle(IPC.notifyTest, (): boolean => {
    if (!Notification.isSupported()) return false
    new Notification({
      title: 'Planner',
      body: 'Notifications are working. Reminders will look like this.'
    }).show()
    return true
  })

  ipcMain.handle(IPC.openExternal, async (_e, url: string): Promise<void> => {
    // Only allow http(s) links out of the app.
    if (/^https?:\/\//i.test(url)) await shell.openExternal(url)
  })
}
