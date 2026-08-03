// The single source of truth for the IPC surface between renderer and main.
// - Channel names live in IPC.
// - PlannerApi is the promise-based API exposed on window.planner by the preload.
// Main-process handlers and the preload bridge are both typed against this file,
// so adding a method here forces both sides to implement it.

import type {
  Application,
  ApplicationInput,
  ApplicationPatch,
  CareerLogKind,
  CareerWeekStats,
  ChatMessage,
  ChatThread,
  Course,
  CourseInput,
  EventInput,
  EventPatch,
  GymLogInput,
  GymPatch,
  GymSession,
  IcsImportResult,
  JobPosting,
  Lecture,
  LectureInput,
  LecturePatch,
  PlannerEvent,
  SeriesInput,
  SeriesPatch,
  Settings,
  Tag,
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
  groqSetKey: 'groq:setKey',
  gymList: 'gym:list',
  gymLog: 'gym:log',
  gymUpdate: 'gym:update',
  gymDelete: 'gym:delete',
  coursesList: 'courses:list',
  coursesCreate: 'courses:create',
  coursesDelete: 'courses:delete',
  lecturesList: 'lectures:list',
  lecturesCreate: 'lectures:create',
  lecturesUpdate: 'lectures:update',
  lecturesDelete: 'lectures:delete',
  chatThreads: 'chat:threads',
  chatMessages: 'chat:messages',
  chatSend: 'chat:send',
  groqListModels: 'groq:listModels',
  eventsList: 'events:list',
  eventsCreate: 'events:create',
  eventsUpdate: 'events:update',
  eventsDelete: 'events:delete',
  eventsImportIcs: 'events:importIcs',
  appsList: 'apps:list',
  appsCreate: 'apps:create',
  appsUpdate: 'apps:update',
  appsDelete: 'apps:delete',
  careerLogAdd: 'career:logAdd',
  careerLogUndo: 'career:logUndo',
  careerWeekStats: 'career:weekStats',
  tagsList: 'tags:list',
  tagsCreate: 'tags:create',
  tagsDelete: 'tags:delete',
  tagsSetColor: 'tags:setColor',
  jobsFetch: 'jobs:fetch'
} as const

export interface JobSourceStatus {
  id: string
  label: string
  ok: boolean
  count: number
  error?: string
}

export type JobsFetchResult =
  | { ok: true; postings: JobPosting[]; fetchedAt: string; sources: JobSourceStatus[] }
  | { ok: false; error: string }

/** Main → renderer: task/series data changed outside a renderer call
 *  (auto-tagging, daily materialization, assistant tools). Refetch on it. */
export const TASKS_CHANGED_EVENT = 'event:tasksChanged'

export interface ChatSendInput {
  scope: 'general' | 'lecture'
  refId: string | null
  threadId: string | null // null starts a new thread
  text: string
}

export interface ChatSendResult {
  threadId: string
  userMessage: ChatMessage
  assistantMessage: ChatMessage
}

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

  /** Sessions from the last ~26 weeks, newest first. */
  gymList(): Promise<GymSession[]>
  gymLog(input: GymLogInput): Promise<GymSession>
  gymUpdate(id: string, patch: GymPatch): Promise<GymSession>
  gymDelete(id: string): Promise<void>

  /** Whether a Groq API key is stored (the key itself never crosses IPC). */
  groqStatus(): Promise<{ configured: boolean }>
  /** Store a Groq API key encrypted with Windows credentials; '' clears it. */
  groqSetKey(key: string): Promise<{ configured: boolean }>
  /** Model ids available to the stored key (empty when unconfigured). */
  groqListModels(): Promise<string[]>
  /** Subscribe to data-changed pushes; returns an unsubscribe function. */
  onTasksChanged(cb: () => void): () => void

  coursesList(): Promise<Course[]>
  coursesCreate(input: CourseInput): Promise<Course>
  coursesDelete(id: string): Promise<void>
  lecturesList(courseId: string): Promise<Lecture[]>
  lecturesCreate(input: LectureInput): Promise<Lecture>
  lecturesUpdate(id: string, patch: LecturePatch): Promise<Lecture>
  lecturesDelete(id: string): Promise<void>

  chatThreads(scope: 'general' | 'lecture', refId: string | null): Promise<ChatThread[]>
  chatMessages(threadId: string): Promise<ChatMessage[]>
  /** Runs the assistant loop (may execute tools) and returns both messages. */
  chatSend(input: ChatSendInput): Promise<ChatSendResult>

  /** Events from the last ~4 months onward, soonest first. */
  eventsList(): Promise<PlannerEvent[]>
  eventsCreate(input: EventInput): Promise<PlannerEvent>
  eventsUpdate(id: string, patch: EventPatch): Promise<PlannerEvent>
  eventsDelete(id: string): Promise<void>
  /** Opens a file dialog in main, imports VEVENTs under the given kind. */
  eventsImportIcs(kind: PlannerEvent['kind']): Promise<IcsImportResult>

  appsList(): Promise<Application[]>
  appsCreate(input: ApplicationInput): Promise<Application>
  appsUpdate(id: string, patch: ApplicationPatch): Promise<Application>
  appsDelete(id: string): Promise<void>
  careerLogAdd(kind: CareerLogKind): Promise<void>
  /** Removes today's most recent log of that kind (mis-click undo). */
  careerLogUndo(kind: CareerLogKind): Promise<void>
  careerWeekStats(): Promise<CareerWeekStats>
  /** On-demand fetch of the aggregated internship feeds (10-min cache).
   *  `force` bypasses the cache for an explicit refresh. */
  jobsFetch(force?: boolean): Promise<JobsFetchResult>

  /** Tag vocabulary: standalone tags plus every tag in use, with colours. */
  tagsList(): Promise<Tag[]>
  tagsCreate(name: string): Promise<Tag[]>
  /** Deletes the tag and strips it from every task and series. */
  tagsDelete(name: string): Promise<Tag[]>
  tagsSetColor(name: string, color: string): Promise<Tag[]>
}
