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
  /** Hand-placed position within the list section it shows up in, set by
   *  dragging. null means "no opinion" — those sort by due date/priority and
   *  sit below the hand-placed ones. Cleared when a task's due date moves it
   *  to another section, where a position picked elsewhere means nothing. */
  sortOrder: number | null
  createdAt: string
  updatedAt: string
}

/** A checklist step under a task.
 *
 *  Deliberately not a Task of its own: a subtask has no due date, tags,
 *  priority, reminder or recurrence. Making them real tasks would mean every
 *  list query, the scheduler, drag-sort and search all had to learn to exclude
 *  children — a lot of new ways to break for something that is a checklist.
 *  Rows are deleted with their parent (FK ON DELETE CASCADE). */
export interface Subtask {
  id: string
  taskId: string
  title: string
  done: boolean
  /** Position within its own task's list. */
  sortOrder: number
  createdAt: string
}

export interface SubtaskPatch {
  title?: string
  done?: boolean
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

// ---------- Monthly goals ----------

/** What arithmetic a goal's bar runs on.
 *  - `number`    a measurement moving from a start value to a target, in some
 *                unit ("bench 175 → 190 lbs")
 *  - `checklist` steps done over steps total
 *  - `counter`   a tally toward N ("apply to 20 jobs")
 *
 *  Steps exist on all three. They only *drive* the bar on a checklist — on the
 *  other two they sit under it as deliverables. */
export type GoalKind = 'number' | 'checklist' | 'counter'

/** Where a counter goal borrows its count from, scoped to the goal's month.
 *  A goal with no source is manual: you tap +1. A linked goal has no +1
 *  button, because the number isn't yours to change — it's a reading of
 *  another page. */
export type GoalSource = 'applications' | 'gym' | 'leetcode' | 'tasks'

export interface Goal {
  id: string
  /** YYYY-MM. A goal lives in exactly one month; carrying it forward rewrites
   *  this rather than copying the row, so its measurements and steps come with
   *  it and its personal best stays in one place. */
  month: string
  title: string
  kind: GoalKind
  /** `number` only: the baseline the bar runs from. null until the first
   *  measurement, which the repo stamps in here — a bar with no start reads
   *  nearly full the moment you log a real lift. */
  startValue: number | null
  /** What the number is in — 'lbs', '$', '%'. null for a bare count. */
  unit: string | null
  /** `number`: what you're after. `counter`: how many. Unused by a checklist,
   *  whose steps are its target. */
  targetValue: number
  /** `counter` only: the table this goal's count is read from, or null for a
   *  hand-tapped tally. */
  source: GoalSource | null
  /** `source: 'tasks'` only: completed tasks carrying this tag are the count.
   *  Deliberately not a foreign key — the tag vocabulary is keyed by name and
   *  tags exist implicitly, so a deleted tag should make this read zero with
   *  the tag still visible rather than break the row. */
  sourceTag: string | null
  color: string // hex from TAG_COLORS
  /** Archived goals are kept but shown nowhere — what Drop does on the
   *  carried-over shelf. Delete, which takes the history with it, lives in the
   *  card's ··· menu. */
  archived: boolean
  /** Hand-placed position within its own month, set by dragging. */
  sortOrder: number
  /** For a linked counter: how many rows the source table holds for this
   *  goal's month. Derived, but carried on the row — computed in `rowToGoal`
   *  so every path that produces a Goal has it, since a value filled in only
   *  by the list query would leave every update returning a goal whose bar
   *  reads zero for one render. 0 for every other kind. */
  autoCount: number
  createdAt: string
  updatedAt: string
}

/** A deliverable under a goal. The same shape as a Subtask, and kept separate
 *  for the same reason that one is kept out of `tasks`. */
export interface GoalStep {
  id: string
  goalId: string
  title: string
  done: boolean
  /** Position within its own goal's list. */
  sortOrder: number
  createdAt: string
}

/** One dated data point: a measurement on a number goal, or one tally step on
 *  a manual counter. */
export interface GoalEntry {
  id: string
  goalId: string
  date: string // YYYY-MM-DD
  value: number
  note: string | null
  createdAt: string
}

export interface GoalInput {
  month: string // YYYY-MM
  title: string
  kind: GoalKind
  startValue?: number | null
  unit?: string | null
  targetValue?: number
  source?: GoalSource | null
  sourceTag?: string | null
  color?: string
}

export type GoalPatch = Partial<GoalInput> & { archived?: boolean }

export interface GoalStepPatch {
  title?: string
  done?: boolean
}

export interface GoalEntryInput {
  goalId: string
  date: string // YYYY-MM-DD
  value: number
  note?: string | null
}

// ---------- Journal ----------

/** How the day felt, on a five-point scale: 1 sad → 3 neutral → 5 happy. */
export type Mood = 1 | 2 | 3 | 4 | 5

/** A day's writing. `body` is plaintext here — this type only ever exists on
 *  the far side of an unlock, because the column it comes from is ciphertext
 *  and the key lives in the main process. */
export interface JournalEntry {
  id: string
  date: string // YYYY-MM-DD, local; one entry per day
  body: string
  mood: Mood | null
  createdAt: string
  updatedAt: string
}

/** A row for the date list: enough to render it without handing the whole
 *  journal to the renderer every time the page mounts. */
export interface JournalEntryMeta {
  id: string
  date: string
  mood: Mood | null
  /** First line or so of the body, for the list. Decrypted like everything
   *  else, so it is empty whenever the journal is locked. */
  excerpt: string
  /** Words in the entry. Counted in main, where the plaintext already is,
   *  so a lifetime total costs nothing to show. */
  words: number
  updatedAt: string
}

/** What the renderer is allowed to know without a passcode. Deliberately not
 *  the entry count — that is already one fact more than "is it set up". */
export interface JournalStatus {
  /** A passcode has been set. False means the journal has never been used. */
  configured: boolean
  /** The key is in memory for this run of the app. */
  unlocked: boolean
  /** A forgotten passcode can be replaced without losing the entries, because
   *  the OS holds a second wrapper for the data key. False on a journal that
   *  predates that, or one carried to another Windows account — there, the
   *  only way past a forgotten passcode is erasing it. */
  recoverable: boolean
}

// ---------- Academics ----------

/** A semester, as a place things go rather than a string repeated on every
 *  course. A term can be renamed, recoloured, collapsed, archived and
 *  reordered, and it exists before the first course goes into it — none of
 *  which the free-text `term` field it replaced could do. */
export interface Term {
  id: string
  name: string // e.g. Fall 2026
  color: string // hex from TAG_COLORS
  archived: boolean
  /** Hand-placed position among the terms, set by dragging. */
  sortOrder: number
  createdAt: string
}

export interface Course {
  id: string
  code: string // e.g. ECSE 200
  name: string
  /** The term folder this sits in. null when its term was deleted out from
   *  under it — the course survives, unfiled, rather than going with it. */
  termId: string | null
  color: string // hex from TAG_COLORS
  archived: boolean
  /** Hand-placed position within its own term. */
  sortOrder: number
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

export interface TermInput {
  name: string
  color?: string
}

export interface TermPatch {
  name?: string
  color?: string
  archived?: boolean
}

export interface CourseInput {
  code: string
  name: string
  termId: string | null
  color?: string
}

export interface CoursePatch {
  code?: string
  name?: string
  termId?: string | null
  color?: string
  archived?: boolean
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
  /** The course this belongs to, when it was filed under one instead of a
   *  plain kind. Set alongside kind 'academic'; goes null if the course is
   *  deleted, leaving the event on the calendar as a generic academic one. */
  courseId: string | null
  /** UID from an imported ICS VEVENT, used to dedupe reimports. */
  externalUid: string | null
  /** Badminton Québec registration window, computed or manual. */
  regOpensAt: string | null
  regClosesAt: string | null
  /** User marked themselves registered → close-soon reminder is dropped. */
  registered: boolean
  /** The repeating series this is an occurrence of, or null for a one-off. */
  seriesId: string | null
  /** Local date (YYYY-MM-DD) this occurrence was generated for. */
  occurrenceDate: string | null
  /** The series' rule, carried on every occurrence so the calendar can show
   *  and edit "repeats weekly" without a second round trip for the series. */
  repeat: RecurrenceRule | null
  /** Inclusive last date the series may produce, or null for open-ended. */
  repeatUntil: string | null
  /** Minutes before the start to be reminded — one reminder per entry, so
   *  [10080, 1440, 30] is a week, a day and half an hour ahead. */
  reminderOffsets: number[]
  createdAt: string
  updatedAt: string
}

export interface EventInput {
  title: string
  kind: EventKind
  /** Files the event under a course. Passing one implies kind 'academic'. */
  courseId?: string | null
  date: string // YYYY-MM-DD
  time?: string | null // HH:mm; null = all-day
  /** End of the period. `endDate` alone spans whole days; `endTime` alone ends
   *  the same day (or the next, when it lands before the start). Both null =
   *  a single point on the calendar. */
  endDate?: string | null
  endTime?: string | null
  location?: string | null
  url?: string | null
  notes?: string | null
  /** Badminton only: compute BQ registration window + alarms (default true). */
  autoRegWindow?: boolean
  /** Makes the event repeat. On create, a rule builds a series and the first
   *  occurrence comes back; patching one onto a standalone event converts it,
   *  and patching null stops the series while keeping this occurrence. */
  repeat?: RecurrenceRule | null
  /** Inclusive last date the repeat may produce; null is open-ended. */
  repeatUntil?: string | null
  /** Minutes before the start to be reminded, one reminder each. Defaults to
   *  a day before; an empty array means no reminders at all. */
  reminderOffsets?: number[]
}

/** Editing one occurrence of a repeating event, or the whole series. Every
 *  write defaults to 'one' — changing every future occurrence is the bigger
 *  action, so it is the one you have to ask for. */
export type EventScope = 'one' | 'series'

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
export type SearchModule = 'task' | 'event' | 'application' | 'lecture' | 'leetcode' | 'goal'

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
  /** Term folders the user has rolled up on the Academics page. Kept here
   *  rather than in component state because the page unmounts on every
   *  navigation, and a folder that springs back open is not a folder. */
  collapsedTerms: string[]
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
  collapsedTerms: [],
  keybinds: {},
  captureShortcut: 'Control+Alt+Space'
}
