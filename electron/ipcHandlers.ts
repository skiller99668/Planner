// IPC handler registration. Every channel in shared/ipc.ts is implemented here;
// the preload exposes the matching PlannerApi methods to the renderer.

import { app, ipcMain, Notification, shell } from 'electron'
import { IPC, type AppInfo } from '../shared/ipc'
import type {
  SeriesInput,
  SeriesPatch,
  Settings,
  TaskInput,
  TaskPatch
} from '../shared/types'
import { autoTagSeries, autoTagTask } from './autoTag'
import { getDbPath, getSchemaVersion } from './db'
import { getGroqStatus, setGroqKey } from './groq'
import { createSeries, deleteSeries, listSeries, updateSeries } from './recurrence'
import { getSettings, patchSettings } from './settings'
import { createTask, deleteTask, listTasks, updateTask } from './tasksRepo'

export interface IpcDeps {
  applyAutostart: (enabled: boolean) => void
  /** Broadcast that task/series data changed outside a renderer request. */
  notifyDataChanged: () => void
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

  // ---------- tasks ----------
  ipcMain.handle(IPC.tasksList, () => listTasks())
  ipcMain.handle(IPC.tasksCreate, (_e, input: TaskInput) => {
    const task = createTask(input)
    // Fire-and-forget: tags merge in a moment later and push a refresh.
    void autoTagTask(task.id, deps.notifyDataChanged)
    return task
  })
  ipcMain.handle(IPC.tasksUpdate, (_e, id: string, patch: TaskPatch) => updateTask(id, patch))
  ipcMain.handle(IPC.tasksDelete, (_e, id: string) => deleteTask(id))

  // ---------- recurring series ----------
  ipcMain.handle(IPC.seriesList, () => listSeries())
  ipcMain.handle(IPC.seriesCreate, (_e, input: SeriesInput) => {
    const series = createSeries(input)
    void autoTagSeries(series.id, deps.notifyDataChanged)
    return series
  })
  ipcMain.handle(IPC.seriesUpdate, (_e, id: string, patch: SeriesPatch) =>
    updateSeries(id, patch)
  )
  ipcMain.handle(IPC.seriesDelete, (_e, id: string) => deleteSeries(id))

  // ---------- groq ----------
  ipcMain.handle(IPC.groqStatus, () => getGroqStatus())
  ipcMain.handle(IPC.groqSetKey, (_e, key: string) => setGroqKey(key))
}
