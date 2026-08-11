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

/** A tag and the colour it renders in. */
export interface Tag {
  name: string
  color: string
}

/** Tag palette: one hue family per swatch, all tuned to the same rough
 *  luminance so no tag shouts louder than another on the midnight field. */
export const TAG_COLORS = [
  '#5B9CFF', // azure
  '#7B7BFA', // indigo
  '#A78BFA', // violet
  '#C88BF5', // orchid
  '#E86FD8', // magenta
  '#FF7BB0', // pink
  '#FF6B72', // coral
  '#FF8F5E', // ember
  '#F5C56B', // gold
  '#D7D06B', // citron
  '#8FD065', // leaf
  '#4FD6AC', // mint
  '#3FD0C9', // teal
  '#4FC3F7', // sky
  '#93A4C8' // slate
] as const

/** Stable colour for a tag that has never been assigned one, so the palette
 *  looks deliberate from the first tag without anyone picking. */
export function defaultTagColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return TAG_COLORS[h % TAG_COLORS.length]
}

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

// ---------- LeetCode ----------

export type LeetcodeDifficulty = 'easy' | 'medium' | 'hard'

export interface LeetcodeProblem {
  id: string
  date: string // YYYY-MM-DD (solve date)
  title: string
  slug: string | null // leetcode titleSlug — builds the URL + dedups sync
  difficulty: LeetcodeDifficulty
  topic: string | null // pattern/topic, e.g. "Dynamic Programming"
  url: string | null
  notes: string | null
  source: 'manual' | 'leetcode'
  createdAt: string
}

export interface LeetcodeLogInput {
  date: string // YYYY-MM-DD
  title: string
  difficulty: LeetcodeDifficulty
  topic?: string | null
  url?: string | null
  slug?: string | null
  notes?: string | null
}

export interface LeetcodePatch {
  date?: string
  title?: string
  difficulty?: LeetcodeDifficulty
  topic?: string | null
  url?: string | null
  notes?: string | null
}

/** Result of an on-demand sync from a LeetCode username (best-effort). */
export interface LeetcodeSyncResult {
  added: number
  warning?: string
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

export type EventKind = 'badminton' | 'hackathon' | 'career' | 'academic' | 'other'
export type EventSource = 'manual' | 'ics' | 'web'

export interface PlannerEvent {
  id: string
  title: string
  kind: EventKind
  startAt: string // ISO datetime; local midnight means "all-day"
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
  /** User marked themselves registered → close-soon reminder is dropped. */
  registered: boolean
  createdAt: string
  updatedAt: string
}

export interface EventInput {
  title: string
  kind: EventKind
  date: string // YYYY-MM-DD
  time?: string | null // HH:mm; null = all-day
  location?: string | null
  url?: string | null
  notes?: string | null
  /** Badminton only: compute BQ registration window + alarms (default true). */
  autoRegWindow?: boolean
}

export type EventPatch = Partial<EventInput> & { registered?: boolean }

/** A tournament found on a federation calendar, before it's imported. */
export interface FeedEvent {
  uid: string
  title: string
  startDate: string // YYYY-MM-DD
  endDate: string | null
  url: string | null
  location: string | null
}

export interface IcsImportResult {
  imported: number
  skipped: number
  canceled: boolean
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

export interface ApplicationInput {
  company: string
  role: string
  track: ApplicationTrack
  url?: string | null
  deadline?: string | null
}

export type ApplicationPatch = Partial<ApplicationInput> & {
  status?: ApplicationStatus
  nextAction?: string | null
  nextActionDate?: string | null
  notes?: string | null
}

/** Weekly career scoreboard (weeks run Sun–Sat). */
export interface CareerWeekStats {
  weekStart: string
  applications: number
  dsa: number
  networking: number
}

/** A live internship posting aggregated from the community job-list repos. */
export interface JobPosting {
  id: string
  company: string
  title: string
  category: string // Software | Software Engineering | AI/ML/Data | Quant | Hardware | Product
  locations: string[]
  url: string
  /** Listed pay when the source publishes it (e.g. "$60/hr"). */
  salary: string | null
  /** Human label of the list this came from. */
  source: string
  postedAt: string | null
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

// ---------- Search ----------

/** Which page a hit belongs to — the palette routes there when you pick it. */
export type SearchModule = 'task' | 'event' | 'application' | 'lecture' | 'leetcode'

export interface SearchHit {
  module: SearchModule
  id: string
  /** The matched thing's name. */
  title: string
  /** One line of context: due date, company, course code — never the whole row. */
  subtitle: string | null
  /** For ordering across modules: recency or due date as YYYY-MM-DD, if any. */
  date: string | null
  /** Set when the hit is finished/closed, so the UI can mute it. */
  done: boolean
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
  targets: {
    gymPerWeek: number
    applicationsPerWeek: number
    dsaPerWeek: number
    networkingPerWeek: number
  }
  internshipTrackFocus: 'swe' | 'hardware'
  /** LeetCode username for best-effort solve sync; null until set. */
  leetcodeUsername: string | null
  /** User overrides for keyboard shortcuts, keyed by action id. Defaults live in src/lib/keybinds.ts. */
  keybinds: Record<string, string>
  /** OS-wide capture hotkey (Electron accelerator). null disables it entirely. */
  captureShortcut: string | null
}

export const DEFAULT_SETTINGS: Settings = {
  autostart: true,
  closeToTray: true,
  groqModel: null,
  targets: {
    gymPerWeek: 5,
    applicationsPerWeek: 5,
    dsaPerWeek: 5,
    networkingPerWeek: 1
  },
  internshipTrackFocus: 'swe',
  leetcodeUsername: null,
  keybinds: {},
  captureShortcut: 'Control+Alt+Space'
}
