// The single source of truth for the IPC surface between renderer and main.
// - Channel names live in IPC.
// - PlannerApi is the promise-based API exposed on window.planner by the preload.
// Main-process handlers and the preload bridge are both typed against this file,
// so adding a method here forces both sides to implement it.

import type {
  SeriesInput,
  SeriesPatch,
  Settings,
  Task,
  TaskInput,
  TaskPatch,
  TaskSeries
} from './types'

export const IPC = {
  appPing: 'app:ping',
  settingsGetAll: 'settings:getAll',
  settingsPatch: 'settings:patch',
  notifyTest: 'notify:test',
  openExternal: 'app:openExternal',
  tasksList: 'tasks:list',
  tasksCreate: 'tasks:create',
  tasksUpdate: 'tasks:update',
  tasksDelete: 'tasks:delete',
  seriesList: 'series:list',
  seriesCreate: 'series:create',
  seriesUpdate: 'series:update',
  seriesDelete: 'series:delete',
  groqStatus: 'groq:status',
  groqSetKey: 'groq:setKey'
} as const

/** Main → renderer: task/series data changed outside a renderer call
 *  (auto-tagging, daily materialization). Renderer should refetch. */
export const TASKS_CHANGED_EVENT = 'event:tasksChanged'

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

  /** All tasks except skipped occurrences; includes done. */
  tasksList(): Promise<Task[]>
  tasksCreate(input: TaskInput): Promise<Task>
  tasksUpdate(id: string, patch: TaskPatch): Promise<Task>
  /** Standalone tasks are hard-deleted; series occurrences become 'skipped'. */
  tasksDelete(id: string): Promise<void>

  seriesList(): Promise<TaskSeries[]>
  seriesCreate(input: SeriesInput): Promise<TaskSeries>
  /** Rewrites future open occurrences from the updated template/rule. */
  seriesUpdate(id: string, patch: SeriesPatch): Promise<TaskSeries>
  /** Deletes the series + future open occurrences; past/done history is kept. */
  seriesDelete(id: string): Promise<void>

  /** Whether a Groq API key is stored (the key itself never crosses IPC). */
  groqStatus(): Promise<{ configured: boolean }>
  /** Store a Groq API key encrypted with Windows credentials; '' clears it. */
  groqSetKey(key: string): Promise<{ configured: boolean }>
  /** Subscribe to data-changed pushes; returns an unsubscribe function. */
  onTasksChanged(cb: () => void): () => void
}
