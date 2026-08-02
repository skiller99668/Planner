// Preload: the only bridge between renderer and main. Exposes the typed
// PlannerApi as window.planner via contextBridge; the renderer never sees
// Node or Electron APIs directly.

import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type PlannerApi } from '../shared/ipc'
import type { Settings } from '../shared/types'

const api: PlannerApi = {
  ping: () => ipcRenderer.invoke(IPC.appPing),
  getSettings: () => ipcRenderer.invoke(IPC.settingsGetAll),
  patchSettings: (patch: Partial<Settings>) => ipcRenderer.invoke(IPC.settingsPatch, patch),
  testNotification: () => ipcRenderer.invoke(IPC.notifyTest),
  openExternal: (url: string) => ipcRenderer.invoke(IPC.openExternal, url)
}

contextBridge.exposeInMainWorld('planner', api)
