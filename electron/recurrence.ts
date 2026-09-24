// Recurring task series: CRUD + occurrence materialization.
//
// Occurrences are real task rows generated lazily up to HORIZON_DAYS ahead,
// keyed by UNIQUE(series_id, occurrence_date). Completed/skipped/edited
// occurrences are never touched by regeneration; a skipped weekly lab stays
// skipped, and next week's still appears.

import { addDays, addMonths, lastDayOfMonth, startOfWeek } from 'date-fns'
import type {
  Priority,
  RecurrenceRule,
  SeriesInput,
  SeriesPatch,
  TaskSeries
} from '../shared/types'
import { getDb } from './db'
import {
  clearPendingReminder,
  composeDueAt,
  computeReminderAt,
  deleteTask,
  detachFromSeries,
  getTask,
  insertOccurrence
} from './tasksRepo'
import {
  captureSeriesTicks,
  restoreSeriesTicks,
  seedSeriesChecklist,
  stampSeriesChecklist
} from './subtasksRepo'

const HORIZON_DAYS = 60

interface SeriesRow {
  id: string
  title: string
  notes: string | null
  tags: string
  priority: number
  rule: string
  start_date: string
  end_date: string | null
  due_time: string | null
  reminder_offset_min: number | null
  active: number
  created_at: string
  updated_at: string
}

function rowToSeries(r: SeriesRow): TaskSeries {
  let tags: string[] = []
  try {
    const parsed = JSON.parse(r.tags)
    if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === 'string')
  } catch {
    // tolerate corrupt JSON
  }
  return {
    id: r.id,
    title: r.title,
    notes: r.notes,
    tags,
    priority: (r.priority as Priority) ?? 0,
    rule: normalizeRule(JSON.parse(r.rule) as RecurrenceRule, r.start_date),
    startDate: r.start_date,
    endDate: r.end_date,
    dueTime: r.due_time,
    reminderOffsetMin: r.reminder_offset_min,
    active: r.active === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

// ---------- CRUD ----------

export function listSeries(): TaskSeries[] {
  const rows = getDb()
    .prepare('SELECT * FROM task_series WHERE active = 1 ORDER BY created_at')
    .all() as unknown as SeriesRow[]
  return rows.map(rowToSeries)
}

export function getSeries(id: string): TaskSeries {
  const row = getDb().prepare('SELECT * FROM task_series WHERE id = ?').get(id) as
    | SeriesRow
    | undefined
  if (!row) throw new Error(`Series not found: ${id}`)
  return rowToSeries(row)
}

/** `checklistFrom` seeds the series' checklist template from an existing
 *  task's subtasks, before the first occurrences are generated. */
export function createSeries(input: SeriesInput, checklistFrom?: string): TaskSeries {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const rule = normalizeRule(input.rule, input.startDate)
  getDb()
    .prepare(
      `INSERT INTO task_series (id, title, notes, tags, priority, rule, start_date,
                                end_date, due_time, reminder_offset_min, active,
                                created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .run(
      id,
      input.title.trim(),
      input.notes ?? null,
      JSON.stringify(input.tags ?? []),
      input.priority ?? 0,
      JSON.stringify(rule),
      input.startDate,
      input.endDate ?? null,
      input.dueTime ?? null,
      input.reminderOffsetMin ?? null,
      now,
      now
    )
  if (checklistFrom) seedSeriesChecklist(id, checklistFrom)
  const series = getSeries(id)
  materializeSeries(series)
  return series
}

export function updateSeries(id: string, patch: SeriesPatch): TaskSeries {
  const current = getSeries(id)
  const now = new Date().toISOString()
  const startDate = patch.startDate ?? current.startDate
  const rule = normalizeRule(patch.rule ?? current.rule, startDate)

  getDb()
    .prepare(
      `UPDATE task_series SET title = ?, notes = ?, tags = ?, priority = ?, rule = ?,
                              start_date = ?, end_date = ?, due_time = ?,
                              reminder_offset_min = ?, active = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      (patch.title ?? current.title).trim(),
      patch.notes !== undefined ? patch.notes : current.notes,
      JSON.stringify(patch.tags ?? current.tags),
      patch.priority ?? current.priority,
      JSON.stringify(rule),
      startDate,
      patch.endDate !== undefined ? patch.endDate : current.endDate,
      patch.dueTime !== undefined ? patch.dueTime : current.dueTime,
      patch.reminderOffsetMin !== undefined
        ? patch.reminderOffsetMin
        : current.reminderOffsetMin,
      (patch.active !== undefined ? patch.active : current.active) ? 1 : 0,
      now,
      id
    )

  // Future open occurrences are stamped from the old template — rewrite them,
  // keeping any checklist steps already ticked on them (today's, usually).
  const ticks = captureSeriesTicks(id, localToday())
  dropFutureOpenOccurrences(id)
  const series = getSeries(id)
  if (series.active) {
    materializeSeries(series)
    restoreSeriesTicks(id, ticks)
  }
  return series
}

export function deleteSeries(id: string): void {
  const db = getDb()
  const today = localToday()
  // Keep history: done/past occurrences are detached from the series before
  // the cascade delete removes the rest (future open + skipped).
  const dropIds = db
    .prepare(
      `SELECT id FROM tasks WHERE series_id = ?
       AND NOT (status = 'done' OR occurrence_date < ?)`
    )
    .all(id, today) as unknown as { id: string }[]
  for (const r of dropIds) clearPendingReminder(r.id)
  db.prepare(
    `UPDATE tasks SET series_id = NULL, updated_at = ?
     WHERE series_id = ? AND (status = 'done' OR occurrence_date < ?)`
  ).run(new Date().toISOString(), id, today)
  db.prepare('DELETE FROM task_series WHERE id = ?').run(id) // cascades the rest
}

/** Change how a single task repeats, driven from the task's own editor rather
 *  than the series manager. Three shapes, all keeping the usual history rules:
 *  - occurrence + a rule → rewrite the series template (future occurrences follow);
 *  - standalone task + a rule → it becomes a series, and the one-off row gives
 *    way to the generated occurrences;
 *  - null → the series stops, but this task is kept as a standalone one-off. */
export function setTaskRecurrence(taskId: string, input: SeriesInput | null): void {
  const task = getTask(taskId)
  if (input) {
    if (task.seriesId) {
      updateSeries(task.seriesId, input)
    } else {
      createSeries(input, taskId)
      deleteTask(taskId)
    }
  } else if (task.seriesId) {
    // Detach first: deleteSeries cascades away future open occurrences, and
    // this row is the one the user is keeping.
    detachFromSeries(taskId)
    deleteSeries(task.seriesId)
  }
}

// ---------- materialization ----------

/** Generate occurrences for all active series. Idempotent; safe to run often. */
export function materializeAllSeries(): void {
  for (const s of listSeries()) {
    try {
      materializeSeries(s)
    } catch (err) {
      console.error(`[recurrence] failed for series ${s.id} (${s.title}):`, err)
    }
  }
}

export function materializeSeries(series: TaskSeries): void {
  if (!series.active) return
  const today = localToday()
  const from = series.startDate > today ? series.startDate : today
  const to = ymd(addDays(parseYMD(today), HORIZON_DAYS))
  const until = series.endDate && series.endDate < to ? series.endDate : to

  for (const date of occurrenceDates(series.rule, series.startDate, from, until)) {
    const { dueAt, allDay } = composeDueAt(date, series.dueTime)
    const taskId = insertOccurrence({
      title: series.title,
      notes: series.notes,
      tags: series.tags,
      priority: series.priority,
      seriesId: series.id,
      occurrenceDate: date,
      dueAt,
      allDay,
      reminderAt: computeReminderAt(dueAt, allDay, series.reminderOffsetMin)
    })
    if (taskId) stampSeriesChecklist(taskId, series.id)
  }
}

function dropFutureOpenOccurrences(seriesId: string): void {
  const db = getDb()
  const today = localToday()
  const rows = db
    .prepare(
      `SELECT id FROM tasks WHERE series_id = ? AND status = 'open' AND occurrence_date >= ?`
    )
    .all(seriesId, today) as unknown as { id: string }[]
  for (const r of rows) clearPendingReminder(r.id)
  db.prepare(
    `DELETE FROM tasks WHERE series_id = ? AND status = 'open' AND occurrence_date >= ?`
  ).run(seriesId, today)
}

/** All dates the rule produces in [from, to], both inclusive, anchored at startDate. */
export function occurrenceDates(
  rule: RecurrenceRule,
  startDate: string,
  from: string,
  to: string
): string[] {
  if (from > to) return []
  const out: string[] = []
  const start = parseYMD(startDate)
  const interval = Math.max(1, rule.interval)

  if (rule.freq === 'daily') {
    // First multiple of `interval` days on/after `from`.
    const fromD = parseYMD(from < startDate ? startDate : from)
    const diff = Math.round((fromD.getTime() - start.getTime()) / 86_400_000)
    const offset = ((interval - (diff % interval)) % interval + interval) % interval
    for (let d = addDays(fromD, offset); ymd(d) <= to; d = addDays(d, interval)) {
      out.push(ymd(d))
    }
  } else if (rule.freq === 'weekly') {
    const weekdays = rule.byWeekdays.length
      ? [...rule.byWeekdays].sort()
      : [mondayIndex(start)]
    const anchorMonday = startOfWeek(start, { weekStartsOn: 1 })
    for (let k = 0; ; k++) {
      const monday = addDays(anchorMonday, k * interval * 7)
      if (ymd(monday) > to) break
      for (const wd of weekdays) {
        const date = ymd(addDays(monday, wd))
        if (date >= startDate && date >= from && date <= to) out.push(date)
      }
    }
  } else {
    // monthly
    const day = rule.byMonthDay ?? start.getDate()
    for (let k = 0; ; k++) {
      const monthStart = addMonths(new Date(start.getFullYear(), start.getMonth(), 1), k * interval)
      const clamped = Math.min(day, lastDayOfMonth(monthStart).getDate())
      const date = ymd(new Date(monthStart.getFullYear(), monthStart.getMonth(), clamped))
      if (date > to) break
      if (date >= startDate && date >= from) out.push(date)
    }
  }
  return out
}

/** Fill rule defaults so stored rules are always complete. */
function normalizeRule(rule: RecurrenceRule, startDate: string): RecurrenceRule {
  const start = parseYMD(startDate)
  return {
    freq: rule.freq,
    interval: Math.max(1, Math.round(rule.interval || 1)),
    byWeekdays:
      rule.freq === 'weekly'
        ? rule.byWeekdays.length
          ? [...new Set(rule.byWeekdays)].filter((d) => d >= 0 && d <= 6).sort()
          : [mondayIndex(start)]
        : [],
    byMonthDay: rule.freq === 'monthly' ? (rule.byMonthDay ?? start.getDate()) : null
  }
}

// ---------- date helpers (local wall time) ----------

function parseYMD(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function localToday(): string {
  return ymd(new Date())
}

/** 0 = Monday … 6 = Sunday */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7
}
