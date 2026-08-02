// Domain types shared between the Electron main process and the renderer.
// All timestamps are ISO 8601 strings; all dates are YYYY-MM-DD strings.

// ---------- Tasks ----------

/** 'skipped' marks a deleted occurrence of a recurring series: the row stays
 *  so regeneration can't resurrect it, but the UI never shows it. */
export type TaskStatus = 'open' | 'done' | 'skipped'
export type Priority = 0 | 1 | 2 | 3 // none | low | medium | high

export interface Task {
  id: string
  title: string
  notes: string | null
  tags: string[]
  dueAt: string | null // ISO datetime; date-only tasks use T23:59:59 local
  allDay: boolean
  priority: Priority
  status: TaskStatus
  doneAt: string | null
  /** Set when this task is a generated occurrence of a recurring series. */
  seriesId: string | null
  /** YYYY-MM-DD identity of the occurrence within its series. */
  occurrenceDate: string | null
  reminderAt: string | null
  createdAt: string
  updatedAt: string
}

/** Recurrence rule subset: FREQ + INTERVAL + BYDAY, mirroring RFC 5545 semantics. */
export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly'
  interval: number // every N days/weeks/months
  /** For weekly: 0=Mon .. 6=Sun. Ignored otherwise. */
  byWeekdays: number[]
  /** For monthly: day of month 1..31 (clamped to month length). */
  byMonthDay: number | null
}

export interface TaskSeries {
  id: string
  title: string
  notes: string | null
  tags: string[]
  priority: Priority
  rule: RecurrenceRule
  /** First date an occurrence may exist on. */
  startDate: string
  /** Inclusive end date, or null for open-ended. */
  endDate: string | null
  /** HH:mm local time applied to each occurrence's dueAt, or null for all-day. */
  dueTime: string | null
  /** Minutes before dueAt to fire a reminder, or null for none. */
  reminderOffsetMin: number | null
  active: boolean
  createdAt: string
  updatedAt: string
}

// ---------- Task inputs (renderer → main) ----------
// The renderer speaks local date (YYYY-MM-DD) + time (HH:mm); the main process
// composes UTC ISO dueAt/reminderAt from them. Reminders require a due time.

export interface TaskInput {
  title: string
  notes?: string | null
  tags?: string[]
  dueDate?: string | null // YYYY-MM-DD
  dueTime?: string | null // HH:mm — null means all-day
  priority?: Priority
  /** Minutes before dueAt to remind (0 = at due time). Ignored without dueTime. */
  reminderOffsetMin?: number | null
}

export type TaskPatch = Partial<TaskInput> & { status?: TaskStatus }

export interface SeriesInput {
  title: string
  notes?: string | null
  tags?: string[]
  priority?: Priority
  rule: RecurrenceRule
  startDate: string // YYYY-MM-DD
  endDate?: string | null
  dueTime?: string | null
  reminderOffsetMin?: number | null
}

export type SeriesPatch = Partial<SeriesInput> & { active?: boolean }

// ---------- Gym ----------

export type GymType = 'push' | 'pull' | 'legs' | 'other'

export interface GymSession {
  id: string
  date: string // YYYY-MM-DD
  type: GymType
  notes: string | null
  /** Optional structured logging, e.g. [{ exercise, sets: [{ reps, weight }] }] */
  details: unknown | null
  createdAt: string
}

export interface GymLogInput {
  date: string // YYYY-MM-DD
  type: GymType
  notes?: string | null
}

export interface GymPatch {
  type?: GymType
  notes?: string | null
}

// ---------- Academics ----------

export interface Course {
  id: string
  code: string // e.g. ECSE 200
  name: string
  term: string // e.g. Fall 2026
  color: string // hex accent used in UI
  archived: boolean
  createdAt: string
}

export interface Lecture {
  id: string
  courseId: string
  title: string
  lectureDate: string // YYYY-MM-DD
  summary: string // the user's few-sentence post-lecture summary
  createdAt: string
  updatedAt: string
}

export interface CourseInput {
  code: string
  name: string
  term: string
}

export interface LectureInput {
  courseId: string
  title: string
  lectureDate: string // YYYY-MM-DD
  summary?: string
}

export interface LecturePatch {
  title?: string
  lectureDate?: string
  summary?: string
}

export type ChatScope = 'lecture' | 'course' | 'general'
export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatThread {
  id: string
  scope: ChatScope
  refId: string | null // lectureId or courseId depending on scope
  title: string
  createdAt: string
  updatedAt: string
}

export interface ChatMessage {
  id: string
  threadId: string
  role: ChatRole
  content: string
  /** Provider metadata: model id, token counts, etc. */
  meta: Record<string, unknown> | null
  createdAt: string
}

// ---------- Events (badminton tournaments, McGill career fairs, deadlines) ----------

export type EventKind = 'badminton' | 'career' | 'academic' | 'other'
export type EventSource = 'manual' | 'ics'

export interface PlannerEvent {
  id: string
  title: string
  kind: EventKind
  startAt: string // ISO datetime
  endAt: string | null
  location: string | null
  url: string | null
  notes: string | null
  source: EventSource
  /** UID from an imported ICS VEVENT, used to dedupe reimports. */
  externalUid: string | null
  /** Badminton Québec registration window, computed or manual. */
  regOpensAt: string | null
  regClosesAt: string | null
  createdAt: string
  updatedAt: string
}

// ---------- Career / internship pipeline ----------

export type ApplicationTrack = 'swe' | 'hardware' | 'research'
export type ApplicationStatus =
  | 'wishlist'
  | 'applied'
  | 'oa' // online assessment
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'ghosted'

export interface Application {
  id: string
  company: string
  role: string
  track: ApplicationTrack
  status: ApplicationStatus
  url: string | null
  deadline: string | null // YYYY-MM-DD
  appliedAt: string | null // YYYY-MM-DD
  nextAction: string | null
  nextActionDate: string | null // YYYY-MM-DD
  notes: string | null
  createdAt: string
  updatedAt: string
}

/** Countable career-prep actions logged against weekly targets. */
export type CareerLogKind = 'dsa' | 'networking' | 'project' | 'resume'

export interface CareerLog {
  id: string
  kind: CareerLogKind
  date: string // YYYY-MM-DD
  notes: string | null
  createdAt: string
}

// ---------- Reminders / notifications ----------

export type ReminderKind = 'task' | 'event' | 'custom'

export interface Reminder {
  id: string
  kind: ReminderKind
  refId: string | null
  title: string
  body: string | null
  fireAt: string // ISO datetime
  firedAt: string | null
  createdAt: string
}

// ---------- Settings ----------

/** Well-known settings keys. Values are JSON-serialized in the settings table. */
export interface Settings {
  autostart: boolean
  closeToTray: boolean
  groqModel: string | null
  /** Let AI suggest tags for new tasks (never overrides user tags). */
  aiAutoTag: boolean
  targets: {
    gymPerWeek: number
    applicationsPerWeek: number
    dsaPerWeek: number
    networkingPerWeek: number
  }
  internshipTrackFocus: 'swe' | 'hardware'
}

export const DEFAULT_SETTINGS: Settings = {
  autostart: true,
  closeToTray: true,
  groqModel: null,
  aiAutoTag: true,
  targets: {
    gymPerWeek: 5,
    applicationsPerWeek: 5,
    dsaPerWeek: 5,
    networkingPerWeek: 1
  },
  internshipTrackFocus: 'swe'
}
