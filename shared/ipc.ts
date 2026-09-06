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
  CoursePatch,
  EventInput,
  EventPatch,
  EventScope,
  GymLogInput,
  GymPatch,
  GymSession,
  Goal,
  GoalEntry,
  GoalEntryInput,
  GoalInput,
  GoalPatch,
  GoalStep,
  GoalStepPatch,
  FeedEvent,
  IcsImportResult,
  JobPosting,
  Lecture,
  LectureInput,
  LecturePatch,
  LeetcodeLogInput,
  LeetcodePatch,
  LeetcodeProblem,
  LeetcodeSyncResult,
  PlannerEvent,
  SearchHit,
  SeriesInput,
  SeriesPatch,
  Settings,
  Subtask,
  SubtaskPatch,
  Tag,
  Task,
  TaskInput,
  TaskPatch,
  TaskSeries,
  Term,
  TermInput,
  TermPatch
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
  tasksReorder: 'tasks:reorder',
  tasksSetRecurrence: 'tasks:setRecurrence',
  subtasksList: 'subtasks:list',
  subtasksCreate: 'subtasks:create',
  subtasksUpdate: 'subtasks:update',
  subtasksDelete: 'subtasks:delete',
  subtasksReorder: 'subtasks:reorder',
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
  leetcodeList: 'leetcode:list',
  leetcodeLog: 'leetcode:log',
  leetcodeUpdate: 'leetcode:update',
  leetcodeDelete: 'leetcode:delete',
  leetcodeSync: 'leetcode:sync',
  goalsList: 'goals:list',
  goalsCreate: 'goals:create',
  goalsUpdate: 'goals:update',
  goalsDelete: 'goals:delete',
  goalsReorder: 'goals:reorder',
  goalsCarry: 'goals:carry',
  goalStepsList: 'goalSteps:list',
  goalStepsCreate: 'goalSteps:create',
  goalStepsUpdate: 'goalSteps:update',
  goalStepsDelete: 'goalSteps:delete',
  goalStepsReorder: 'goalSteps:reorder',
  goalEntriesList: 'goalEntries:list',
  goalEntryAdd: 'goalEntries:add',
  goalEntryDelete: 'goalEntries:delete',
  termsList: 'terms:list',
  termsCreate: 'terms:create',
  termsUpdate: 'terms:update',
  termsDelete: 'terms:delete',
  termsReorder: 'terms:reorder',
  coursesList: 'courses:list',
  coursesCreate: 'courses:create',
  coursesUpdate: 'courses:update',
  coursesDelete: 'courses:delete',
  coursesReorder: 'courses:reorder',
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
  eventsFetchBadminton: 'events:fetchBadminton',
  eventsImportFeed: 'events:importFeed',
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
  jobsFetch: 'jobs:fetch',
  searchAll: 'search:all',
  captureDismiss: 'capture:dismiss'
} as const

export type BadmintonFeedResult =
  | { ok: true; events: FeedEvent[]; fetchedAt: string }
  | { ok: false; error: string }

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

/** Main → capture window: cleared and re-shown, so empty the field. */
export const CAPTURE_RESET_EVENT = 'event:captureReset'

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
  /** Hand-placed order for one section of the list: the ids take positions
   *  1..n. A series occurrence shares its position with its open siblings. */
  tasksReorder(ids: string[]): Promise<void>
  /** Change how one task repeats, from the task's own editor:
   *  - occurrence of a series → the series template/rule is rewritten;
   *  - standalone task → it becomes a series, replaced by its occurrences;
   *  - `null` → the series stops, but this task survives as a one-off. */
  tasksSetRecurrence(id: string, input: SeriesInput | null): Promise<void>

  /** Every checklist item in the DB, grouped by task in the renderer — the
   *  same fetch-it-all shape as tasksList. */
  subtasksList(): Promise<Subtask[]>
  /** Appends to the end of the task's checklist. Rejects an empty title. */
  subtasksCreate(taskId: string, title: string): Promise<Subtask>
  /** An empty title is ignored rather than stored, so a blurred editor can't
   *  blank a row. */
  subtasksUpdate(id: string, patch: SubtaskPatch): Promise<Subtask>
  subtasksDelete(id: string): Promise<void>
  /** Order within one task's checklist: the ids take positions 1..n. */
  subtasksReorder(taskId: string, ids: string[]): Promise<void>

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

  /** All logged LeetCode problems, newest first. Drives the Career "dsa" count. */
  leetcodeList(): Promise<LeetcodeProblem[]>
  leetcodeLog(input: LeetcodeLogInput): Promise<LeetcodeProblem>
  leetcodeUpdate(id: string, patch: LeetcodePatch): Promise<LeetcodeProblem>
  leetcodeDelete(id: string): Promise<void>
  /** Best-effort import of recent accepted solves for a LeetCode username. */
  leetcodeSync(username: string): Promise<LeetcodeSyncResult>

  /** Whether a Groq API key is stored (the key itself never crosses IPC). */
  groqStatus(): Promise<{ configured: boolean }>
  /** Store a Groq API key encrypted with Windows credentials; '' clears it. */
  groqSetKey(key: string): Promise<{ configured: boolean }>
  /** Model ids available to the stored key (empty when unconfigured). */
  groqListModels(): Promise<string[]>
  /** Subscribe to data-changed pushes; returns an unsubscribe function. */
  onTasksChanged(cb: () => void): () => void

  /** One month's live goals (YYYY-MM), in hand-placed order. Archived ones
   *  are left out — a dropped goal is gone from the page, not shelved. */
  goalsList(month: string): Promise<Goal[]>
  goalsCreate(input: GoalInput): Promise<Goal>
  /** Rename, retarget, recolour, relink, or archive. `kind` is ignored once
   *  the goal has entries — a bench log can't be reread as a tally. */
  goalsUpdate(id: string, patch: GoalPatch): Promise<Goal>
  /** Hard delete, taking the goal's steps and measurements with it. */
  goalsDelete(id: string): Promise<void>
  /** Order within one month: the ids take positions 1..n. */
  goalsReorder(month: string, ids: string[]): Promise<void>
  /** Move a goal into another month, keeping its steps and measurements. The
   *  row moves rather than being copied, so its history stays in one place. */
  goalsCarry(id: string, month: string): Promise<Goal>

  /** Every goal's steps, grouped by goal in the renderer — the same
   *  fetch-it-all shape as subtasksList. */
  goalStepsList(): Promise<GoalStep[]>
  goalStepsCreate(goalId: string, title: string): Promise<GoalStep>
  /** An empty title is ignored rather than stored, so a blurred editor can't
   *  blank a row. */
  goalStepsUpdate(id: string, patch: GoalStepPatch): Promise<GoalStep>
  goalStepsDelete(id: string): Promise<void>
  goalStepsReorder(goalId: string, ids: string[]): Promise<void>

  /** Every goal's dated entries, newest first within each goal. */
  goalEntriesList(): Promise<GoalEntry[]>
  /** Log a measurement, or one step of a manual tally. The first measurement
   *  on a number goal stamps its start value. */
  goalEntryAdd(input: GoalEntryInput): Promise<GoalEntry>
  goalEntryDelete(id: string): Promise<void>

  /** Every term, archived included, in hand-placed order. */
  termsList(): Promise<Term[]>
  termsCreate(input: TermInput): Promise<Term>
  /** An empty name is ignored rather than stored, so a blurred inline editor
   *  can't blank a folder. */
  termsUpdate(id: string, patch: TermPatch): Promise<Term>
  /** Drops the folder only: its courses fall back to unfiled and keep their
   *  lectures and chats. Archive instead when the semester is just over. */
  termsDelete(id: string): Promise<void>
  /** Order of the shelves: the ids take positions 1..n. */
  termsReorder(ids: string[]): Promise<void>

  /** Every course, archived included — callers filter for what they show. */
  coursesList(): Promise<Course[]>
  coursesCreate(input: CourseInput): Promise<Course>
  /** Rename, recolour, re-file into another term, or archive. */
  coursesUpdate(id: string, patch: CoursePatch): Promise<Course>
  /** Hard delete, taking the course's lectures and chats with it. */
  coursesDelete(id: string): Promise<void>
  /** Order within one term's shelf: the ids take positions 1..n. */
  coursesReorder(termId: string | null, ids: string[]): Promise<void>
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
  /** A `repeat` rule on the input builds a series; the first occurrence of it
   *  comes back, so the caller gets an event either way. */
  eventsCreate(input: EventInput): Promise<PlannerEvent>
  /** `scope` decides how far an edit to an occurrence reaches: 'one' (the
   *  default) touches only that row, 'series' re-stamps every future one.
   *  Patching `repeat` is always a series edit; patching it to null stops the
   *  repeat while keeping this occurrence as a plain event. */
  eventsUpdate(id: string, patch: EventPatch, scope?: EventScope): Promise<PlannerEvent>
  /** 'one' strikes out a single occurrence for good (it never comes back);
   *  'series' ends the repeat, keeping the occurrences already past. */
  eventsDelete(id: string, scope?: EventScope): Promise<void>
  /** Opens a file dialog in main, imports VEVENTs under the given kind — or
   *  filed under a course, which implies the 'academic' kind. */
  eventsImportIcs(kind: PlannerEvent['kind'], courseId?: string | null): Promise<IcsImportResult>
  /** Reads the Badminton Québec calendar (10-min cache). */
  eventsFetchBadminton(force?: boolean): Promise<BadmintonFeedResult>
  /** Imports the chosen feed events, computing BQ registration windows. */
  eventsImportFeed(events: FeedEvent[]): Promise<IcsImportResult>

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
  tagsCreate(name: string, color?: string): Promise<Tag[]>
  /** Deletes the tag and strips it from every task and series. */
  tagsDelete(name: string): Promise<Tag[]>
  tagsSetColor(name: string, color: string): Promise<Tag[]>

  /** One query across tasks, events, applications, lectures and LeetCode.
   *  Returns [] for queries shorter than two characters. */
  searchAll(query: string): Promise<SearchHit[]>

  /** Hide the global capture bar. No-op anywhere else. */
  captureDismiss(): Promise<void>
  /** Main tells the capture bar it was re-summoned; clear the field. */
  onCaptureReset(cb: () => void): () => void
}
