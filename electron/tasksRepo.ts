// Task persistence + reminder synchronization.
// Every write that changes a task's due/reminder/status also reconciles the
// reminders table, so the scheduler never needs task-specific logic.

import type { Priority, Task, TaskInput, TaskPatch, TaskStatus } from '../shared/types'
import { getDb } from './db'

interface TaskRow {
  id: string
  title: string
  notes: string | null
  tags: string
  due_at: string | null
  all_day: number
  priority: number
  status: string
  done_at: string | null
  series_id: string | null
  occurrence_date: string | null
  reminder_at: string | null
  created_at: string
  updated_at: string
}

function rowToTask(r: TaskRow): Task {
  let tags: string[] = []
  try {
    const parsed = JSON.parse(r.tags)
    if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === 'string')
  } catch {
    // tolerate corrupt JSON; treat as untagged
  }
  return {
    id: r.id,
    title: r.title,
    notes: r.notes,
    tags,
    dueAt: r.due_at,
    allDay: r.all_day === 1,
    priority: (r.priority as Priority) ?? 0,
    status: r.status as TaskStatus,
    doneAt: r.done_at,
    seriesId: r.series_id,
    occurrenceDate: r.occurrence_date,
    reminderAt: r.reminder_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

/** Compose UTC ISO dueAt from local date + optional time. All-day → 23:59:59 local. */
export function composeDueAt(
  dueDate: string,
  dueTime: string | null | undefined
): { dueAt: string; allDay: boolean } {
  const [y, m, d] = dueDate.split('-').map(Number)
  if (dueTime) {
    const [hh, mm] = dueTime.split(':').map(Number)
    return { dueAt: new Date(y, m - 1, d, hh, mm).toISOString(), allDay: false }
  }
  return { dueAt: new Date(y, m - 1, d, 23, 59, 59).toISOString(), allDay: true }
}

export function computeReminderAt(
  dueAt: string | null,
  allDay: boolean,
  offsetMin: number | null | undefined
): string | null {
  if (!dueAt || allDay || offsetMin == null || offsetMin < 0) return null
  return new Date(new Date(dueAt).getTime() - offsetMin * 60_000).toISOString()
}

// ---------- queries ----------

export function listTasks(): Task[] {
  const rows = getDb()
    .prepare(`SELECT * FROM tasks WHERE status != 'skipped' ORDER BY created_at`)
    .all() as unknown as TaskRow[]
  return rows.map(rowToTask)
}

export function getTask(id: string): Task {
  const row = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as
    | TaskRow
    | undefined
  if (!row) throw new Error(`Task not found: ${id}`)
  return rowToTask(row)
}

// ---------- writes ----------

export function createTask(input: TaskInput): Task {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const due = input.dueDate ? composeDueAt(input.dueDate, input.dueTime) : null
  const reminderAt = due
    ? computeReminderAt(due.dueAt, due.allDay, input.reminderOffsetMin)
    : null

  getDb()
    .prepare(
      `INSERT INTO tasks (id, title, notes, tags, due_at, all_day, priority, status,
                          series_id, occurrence_date, reminder_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', NULL, NULL, ?, ?, ?)`
    )
    .run(
      id,
      input.title.trim(),
      input.notes ?? null,
      JSON.stringify(input.tags ?? []),
      due?.dueAt ?? null,
      due ? (due.allDay ? 1 : 0) : 1,
      input.priority ?? 0,
      reminderAt,
      now,
      now
    )

  const task = getTask(id)
  syncReminder(task)
  return task
}

/** Insert a generated series occurrence; silently no-ops if it already exists
 *  (including as done/skipped) thanks to UNIQUE(series_id, occurrence_date). */
export function insertOccurrence(task: {
  title: string
  notes: string | null
  tags: string[]
  priority: Priority
  seriesId: string
  occurrenceDate: string
  dueAt: string
  allDay: boolean
  reminderAt: string | null
}): void {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const res = getDb()
    .prepare(
      `INSERT INTO tasks (id, title, notes, tags, due_at, all_day, priority, status,
                          series_id, occurrence_date, reminder_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)
       ON CONFLICT (series_id, occurrence_date) DO NOTHING`
    )
    .run(
      id,
      task.title,
      task.notes,
      JSON.stringify(task.tags),
      task.dueAt,
      task.allDay ? 1 : 0,
      task.priority,
      task.seriesId,
      task.occurrenceDate,
      task.reminderAt,
      now,
      now
    )
  if (res.changes > 0) syncReminder(getTask(id))
}

export function updateTask(id: string, patch: TaskPatch): Task {
  const current = getTask(id)
  const now = new Date().toISOString()

  const title = patch.title !== undefined ? patch.title.trim() : current.title
  const notes = patch.notes !== undefined ? patch.notes : current.notes
  const tags = patch.tags !== undefined ? patch.tags : current.tags
  const priority = patch.priority !== undefined ? patch.priority : current.priority
  const status = patch.status !== undefined ? patch.status : current.status

  // Due date/time: recompose when either field is present in the patch.
  let dueAt = current.dueAt
  let allDay = current.allDay
  if (patch.dueDate !== undefined || patch.dueTime !== undefined) {
    const date =
      patch.dueDate !== undefined
        ? patch.dueDate
        : current.dueAt
          ? localYMDFromIso(current.dueAt)
          : null
    if (!date) {
      dueAt = null
      allDay = true
    } else {
      const time =
        patch.dueTime !== undefined
          ? patch.dueTime
          : current.allDay || !current.dueAt
            ? null
            : localHMFromIso(current.dueAt)
      const composed = composeDueAt(date, time)
      dueAt = composed.dueAt
      allDay = composed.allDay
    }
  }

  // Reminder: recompute when offset given, or when due changed (preserve offset).
  let reminderAt = current.reminderAt
  if (patch.reminderOffsetMin !== undefined) {
    reminderAt = computeReminderAt(dueAt, allDay, patch.reminderOffsetMin)
  } else if (dueAt !== current.dueAt) {
    const prevOffset =
      current.reminderAt && current.dueAt
        ? Math.round(
            (new Date(current.dueAt).getTime() - new Date(current.reminderAt).getTime()) / 60_000
          )
        : null
    reminderAt = computeReminderAt(dueAt, allDay, prevOffset)
  }

  const doneAt =
    status === 'done' ? (current.status === 'done' ? current.doneAt : now) : null

  getDb()
    .prepare(
      `UPDATE tasks SET title = ?, notes = ?, tags = ?, due_at = ?, all_day = ?,
                        priority = ?, status = ?, done_at = ?, reminder_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      title,
      notes,
      JSON.stringify(tags),
      dueAt,
      allDay ? 1 : 0,
      priority,
      status,
      doneAt,
      reminderAt,
      now,
      id
    )

  const task = getTask(id)
  syncReminder(task)
  return task
}

export function deleteTask(id: string): void {
  const task = getTask(id)
  if (task.seriesId) {
    // Occurrence of a series: keep the row as 'skipped' so regeneration
    // can't bring it back.
    getDb()
      .prepare(`UPDATE tasks SET status = 'skipped', updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), id)
    clearPendingReminder(id)
  } else {
    clearPendingReminder(id)
    getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id)
  }
}

/** Cut a generated occurrence loose from its series so the row survives on its
 *  own — used when a repeat is switched off from the task itself, where the
 *  series (and its future occurrences) go but this task should stay. */
export function detachFromSeries(id: string): void {
  getDb()
    .prepare(
      `UPDATE tasks SET series_id = NULL, occurrence_date = NULL, updated_at = ? WHERE id = ?`
    )
    .run(new Date().toISOString(), id)
}

// ---------- reminder sync ----------

/** One pending reminder row per task, mirroring reminder_at. */
export function syncReminder(task: Task): void {
  clearPendingReminder(task.id)
  if (task.status !== 'open' || !task.reminderAt || !task.dueAt) return
  if (new Date(task.reminderAt).getTime() <= Date.now()) return // never fire stale reminders on edit
  getDb()
    .prepare(
      `INSERT INTO reminders (id, kind, ref_id, title, body, fire_at, created_at)
       VALUES (?, 'task', ?, ?, ?, ?, ?)`
    )
    .run(
      crypto.randomUUID(),
      task.id,
      task.title,
      `Due ${formatDueForBody(task.dueAt)}`,
      task.reminderAt,
      new Date().toISOString()
    )
}

export function clearPendingReminder(taskId: string): void {
  getDb()
    .prepare(`DELETE FROM reminders WHERE kind = 'task' AND ref_id = ? AND fired_at IS NULL`)
    .run(taskId)
}

// ---------- local time helpers ----------

export function localYMDFromIso(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function localHMFromIso(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDueForBody(dueAt: string): string {
  const d = new Date(dueAt)
  const today = localYMDFromIso(new Date().toISOString())
  const dueDay = localYMDFromIso(dueAt)
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  if (dueDay === today) return `today at ${time}`
  return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at ${time}`
}
