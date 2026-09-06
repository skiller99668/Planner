// Repeating events: series CRUD + occurrence materialization.
//
// Deliberately the same shape as recurring tasks (electron/recurrence.ts) —
// the rule lives on the series, occurrences are real rows keyed
// UNIQUE(series_id, occurrence_date) — and it reuses that module's
// occurrenceDates() so the two can never drift on what "every 2nd Tuesday"
// means. What differs is what an occurrence *is*: an ordinary events row. That
// is the whole point. The month and week grids, the dashboard, search and the
// reminder scheduler go on reading plain events and never learn that
// recurrence exists.

import type { EventInput, EventKind, RecurrenceRule } from '../shared/types'
import { getDb } from './db'
import {
  clearEventReminders,
  composeEnd,
  composeStart,
  computeRegWindow,
  getEvent,
  normalizeOffsets,
  shiftYMD,
  syncEventReminders
} from './eventsRepo'
import { occurrenceDates } from './recurrence'

/** A year out. Occurrences are cheap rows and the calendar can be paged
 *  arbitrarily far ahead, so this reaches much further than the 60 days tasks
 *  use — a weekly class that stopped appearing in March would read as a bug,
 *  where an un-generated task simply isn't due yet. */
const HORIZON_DAYS = 365

/** The template every occurrence of a repeating event is stamped from. Times
 *  are local wall clock and the span is in whole days, so a series keeps
 *  meaning the same thing on both sides of a daylight-saving boundary. */
export interface EventSeries {
  id: string
  title: string
  kind: EventKind
  courseId: string | null
  rule: RecurrenceRule
  startDate: string
  endDate: string | null
  time: string | null
  endTime: string | null
  /** Extra days each occurrence covers beyond its start day; 0 = one day. */
  spanDays: number
  location: string | null
  url: string | null
  notes: string | null
  autoRegWindow: boolean
  reminderOffsets: number[]
  active: boolean
}

interface SeriesRow {
  id: string
  title: string
  kind: string
  course_id: string | null
  rule: string
  start_date: string
  end_date: string | null
  time: string | null
  end_time: string | null
  span_days: number
  location: string | null
  url: string | null
  notes: string | null
  auto_reg_window: number
  reminder_offsets: string
  active: number
}

function rowToSeries(r: SeriesRow): EventSeries {
  return {
    id: r.id,
    title: r.title,
    kind: r.kind as EventKind,
    courseId: r.course_id,
    rule: JSON.parse(r.rule) as RecurrenceRule,
    startDate: r.start_date,
    endDate: r.end_date,
    time: r.time,
    endTime: r.end_time,
    spanDays: r.span_days,
    location: r.location,
    url: r.url,
    notes: r.notes,
    autoRegWindow: r.auto_reg_window === 1,
    reminderOffsets: normalizeOffsets(r.reminder_offsets),
    active: r.active === 1
  }
}

export function getEventSeries(id: string): EventSeries {
  const row = getDb().prepare('SELECT * FROM event_series WHERE id = ?').get(id) as
    | SeriesRow
    | undefined
  if (!row) throw new Error(`Event series not found: ${id}`)
  return rowToSeries(row)
}

function listEventSeries(): EventSeries[] {
  const rows = getDb()
    .prepare('SELECT * FROM event_series WHERE active = 1 ORDER BY created_at')
    .all() as unknown as SeriesRow[]
  return rows.map(rowToSeries)
}

// ---------- CRUD ----------

/** Build a series from the same input a one-off event is created from. The
 *  caller reads the first occurrence back out of the events table, so it gets
 *  an event either way and never has to care which branch it took. */
export function createEventSeries(input: EventInput, rule: RecurrenceRule): string {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const courseId = input.courseId ?? null
  const kind = courseId ? 'academic' : input.kind

  getDb()
    .prepare(
      `INSERT INTO event_series (id, title, kind, course_id, rule, start_date, end_date,
                                 time, end_time, span_days, location, url, notes,
                                 auto_reg_window, reminder_offsets, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .run(
      id,
      input.title.trim(),
      kind,
      courseId,
      JSON.stringify(normalizeRule(rule, input.date)),
      input.date,
      input.repeatUntil ?? null,
      input.time ?? null,
      input.time ? (input.endTime ?? null) : null,
      spanDaysOf(input),
      input.location?.trim() || null,
      input.url?.trim() || null,
      input.notes ?? null,
      kind === 'badminton' && (input.autoRegWindow ?? true) ? 1 : 0,
      JSON.stringify(normalizeOffsets(input.reminderOffsets)),
      now,
      now
    )

  // Backfill as far as the calendar will ever show, so "my lab has met every
  // Tuesday since September" puts September on the calendar rather than
  // starting from today and leaving a hole where the term was.
  materializeEventSeries(getEventSeries(id), shiftYMD(localToday(), -120))
  return id
}

/** Rewrite the template, then re-stamp every future occurrence from it. Past
 *  ones are left exactly as they were: they already happened, and rewriting
 *  history to match a rule changed today would be a lie. */
export function updateEventSeries(id: string, input: EventInput, rule: RecurrenceRule): void {
  const now = new Date().toISOString()
  const courseId = input.courseId ?? null
  const kind = courseId ? 'academic' : input.kind

  getDb()
    .prepare(
      `UPDATE event_series SET title = ?, kind = ?, course_id = ?, rule = ?, start_date = ?,
                               end_date = ?, time = ?, end_time = ?, span_days = ?,
                               location = ?, url = ?, notes = ?, auto_reg_window = ?,
                               reminder_offsets = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      input.title.trim(),
      kind,
      courseId,
      JSON.stringify(normalizeRule(rule, input.date)),
      input.date,
      input.repeatUntil ?? null,
      input.time ?? null,
      input.time ? (input.endTime ?? null) : null,
      spanDaysOf(input),
      input.location?.trim() || null,
      input.url?.trim() || null,
      input.notes ?? null,
      kind === 'badminton' && (input.autoRegWindow ?? true) ? 1 : 0,
      JSON.stringify(normalizeOffsets(input.reminderOffsets)),
      now,
      id
    )

  dropFutureOccurrences(id)
  materializeEventSeries(getEventSeries(id))
}

/** Stop repeating. Occurrences that already happened stay on the calendar as
 *  plain one-off events — that history is real — while future ones and the
 *  tombstones of deleted ones go with the series. */
export function deleteEventSeries(id: string): void {
  const db = getDb()
  const today = localToday()
  const doomed = db
    .prepare(
      `SELECT id FROM events WHERE series_id = ? AND NOT (occurrence_date < ? AND skipped = 0)`
    )
    .all(id, today) as unknown as { id: string }[]
  for (const r of doomed) clearEventReminders(r.id)
  db.prepare(
    `UPDATE events SET series_id = NULL, occurrence_date = NULL, updated_at = ?
     WHERE series_id = ? AND occurrence_date < ? AND skipped = 0`
  ).run(new Date().toISOString(), id, today)
  db.prepare('DELETE FROM event_series WHERE id = ?').run(id) // cascades the rest
}

/** Detach one occurrence so it survives its series being deleted, which is
 *  what "stop repeating, but keep this one" means. */
export function detachOccurrence(eventId: string): void {
  getDb()
    .prepare(
      'UPDATE events SET series_id = NULL, occurrence_date = NULL, updated_at = ? WHERE id = ?'
    )
    .run(new Date().toISOString(), eventId)
}

// ---------- materialization ----------

/** Generate occurrences for every active series. Idempotent — the unique key
 *  means a re-run inserts only what is genuinely missing — so it is safe to
 *  call on every launch and every date rollover. */
export function materializeAllEventSeries(): void {
  for (const s of listEventSeries()) {
    try {
      materializeEventSeries(s)
    } catch (err) {
      console.error(`[event-series] failed for ${s.id} (${s.title}):`, err)
    }
  }
}

export function materializeEventSeries(series: EventSeries, backfillFrom?: string): void {
  if (!series.active) return
  const today = localToday()
  const floor = backfillFrom && backfillFrom < today ? backfillFrom : today
  const from = series.startDate > floor ? series.startDate : floor
  const horizon = shiftYMD(today, HORIZON_DAYS)
  const until = series.endDate && series.endDate < horizon ? series.endDate : horizon

  const now = new Date().toISOString()
  const insert = getDb().prepare(
    `INSERT INTO events (id, title, kind, start_at, end_at, location, url, notes, source,
                         course_id, external_uid, reg_opens_at, reg_closes_at, registered,
                         series_id, occurrence_date, skipped, reminder_offsets,
                         created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, NULL, ?, ?, 0, ?, ?, 0, ?, ?, ?)
     ON CONFLICT (series_id, occurrence_date) DO NOTHING`
  )
  const offsets = JSON.stringify(series.reminderOffsets)

  for (const date of occurrenceDates(series.rule, series.startDate, from, until)) {
    const endDate = series.spanDays > 0 ? shiftYMD(date, series.spanDays) : null
    const reg =
      series.kind === 'badminton' && series.autoRegWindow
        ? computeRegWindow(date)
        : { opens: null, closes: null }
    const id = crypto.randomUUID()
    const res = insert.run(
      id,
      series.title,
      series.kind,
      composeStart(date, series.time),
      composeEnd(date, series.time, endDate, series.endTime),
      series.location,
      series.url,
      series.notes,
      series.courseId,
      reg.opens,
      reg.closes,
      series.id,
      date,
      offsets,
      now,
      now
    )
    // Only fresh rows need alarms. An occurrence that already exists has its
    // own, and re-syncing here would undo a reminder edited on just that one.
    if (res.changes > 0) syncEventReminders(getEvent(id))
  }
}

/** Future occurrences carry the old template, so a template change has to
 *  clear them out before the new one is stamped. Tombstones are left alone —
 *  a deleted occurrence stays deleted through an edit to the series. */
function dropFutureOccurrences(seriesId: string): void {
  const db = getDb()
  const today = localToday()
  const rows = db
    .prepare(`SELECT id FROM events WHERE series_id = ? AND skipped = 0 AND occurrence_date >= ?`)
    .all(seriesId, today) as unknown as { id: string }[]
  for (const r of rows) clearEventReminders(r.id)
  db.prepare(
    `DELETE FROM events WHERE series_id = ? AND skipped = 0 AND occurrence_date >= ?`
  ).run(seriesId, today)
}

// ---------- helpers ----------

/** How many whole days past its start day an occurrence runs. A timed event
 *  ending after midnight has already had its end date rolled forward by the
 *  caller, so this reads the same for both kinds. */
function spanDaysOf(input: EventInput): number {
  if (!input.endDate || input.endDate <= input.date) return 0
  return Math.max(0, daysBetween(input.date, input.endDate))
}

/** Fill rule defaults so a stored rule is always complete — the same contract
 *  as the task version, which is why occurrenceDates() can be shared. */
function normalizeRule(rule: RecurrenceRule, startDate: string): RecurrenceRule {
  const [y, m, d] = startDate.split('-').map(Number)
  const start = new Date(y, m - 1, d)
  return {
    freq: rule.freq,
    interval: Math.max(1, Math.round(rule.interval || 1)),
    byWeekdays:
      rule.freq === 'weekly'
        ? rule.byWeekdays.length
          ? [...new Set(rule.byWeekdays)].filter((n) => n >= 0 && n <= 6).sort((a, b) => a - b)
          : [(start.getDay() + 6) % 7]
        : [],
    byMonthDay: rule.freq === 'monthly' ? (rule.byMonthDay ?? start.getDate()) : null
  }
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round(
    (new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86_400_000
  )
}

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
