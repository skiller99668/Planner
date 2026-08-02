// Preload: the only bridge between renderer and main. Exposes the typed
// PlannerApi as window.planner via contextBridge; the renderer never sees
// Node or Electron APIs directly.

import { contextBridge, ipcRenderer } from 'electron'
import { IPC, TASKS_CHANGED_EVENT, type PlannerApi } from '../shared/ipc'
import type {
  SeriesInput,
  SeriesPatch,
  Settings,
  TaskInput,
  TaskPatch
} from '../shared/types'

const api: PlannerApi = {
  ping: () => ipcRenderer.invoke(IPC.appPing),
  getSettings: () => ipcRenderer.invoke(IPC.settingsGetAll),
  patchSettings: (patch: Partial<Settings>) => ipcRenderer.invoke(IPC.settingsPatch, patch),
  testNotification: () => ipcRenderer.invoke(IPC.notifyTest),
  openExternal: (url: string) => ipcRenderer.invoke(IPC.openExternal, url),

  tasksList: () => ipcRenderer.invoke(IPC.tasksList),
  tasksCreate: (input: TaskInput) => ipcRenderer.invoke(IPC.tasksCreate, input),
  tasksUpdate: (id: string, patch: TaskPatch) => ipcRenderer.invoke(IPC.tasksUpdate, id, patch),
  tasksDelete: (id: string) => ipcRenderer.invoke(IPC.tasksDelete, id),

  seriesList: () => ipcRenderer.invoke(IPC.seriesList),
  seriesCreate: (input: SeriesInput) => ipcRenderer.invoke(IPC.seriesCreate, input),
  seriesUpdate: (id: string, patch: SeriesPatch) =>
    ipcRenderer.invoke(IPC.seriesUpdate, id, patch),
  seriesDelete: (id: string) => ipcRenderer.invoke(IPC.seriesDelete, id),

  groqStatus: () => ipcRenderer.invoke(IPC.groqStatus),
  groqSetKey: (key: string) => ipcRenderer.invoke(IPC.groqSetKey, key),
  onTasksChanged: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on(TASKS_CHANGED_EVENT, listener)
    return () => ipcRenderer.removeListener(TASKS_CHANGED_EVENT, listener)
  }
}

contextBridge.exposeInMainWorld('planner', api)
