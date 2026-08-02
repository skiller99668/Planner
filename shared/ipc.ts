// The single source of truth for the IPC surface between renderer and main.
// - Channel names live in IPC.
// - PlannerApi is the promise-based API exposed on window.planner by the preload.
// Main-process handlers and the preload bridge are both typed against this file,
// so adding a method here forces both sides to implement it.

import type { Settings } from './types'

export const IPC = {
  appPing: 'app:ping',
  settingsGetAll: 'settings:getAll',
  settingsPatch: 'settings:patch',
  notifyTest: 'notify:test',
  openExternal: 'app:openExternal'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export interface AppInfo {
  version: string
  electron: string
  dbPath: string
  schemaVersion: number
  packaged: boolean
}

/** The API the renderer sees as `window.planner`. */
export interface PlannerApi {
  ping(): Promise<AppInfo>
  getSettings(): Promise<Settings>
  patchSettings(patch: Partial<Settings>): Promise<Settings>
  testNotification(): Promise<boolean>
  openExternal(url: string): Promise<void>
}
