// Events: manual entry + ICS import, Badminton Québec registration-window
// computation, and reminder synchronization.
//
// BQ 2026 rules (badmintonquebec.com), anchored to the competition start date
// (Saturday for real tournaments, so these land on the documented weekdays):
//   registration opens  : start − 18 days at 12:30
//   registration closes : start − 11 days at 11:30
//   draws posted        : start −  8 days at 16:30 (informational)
// Reminders created per event: one per entry in reminderOffsets (minutes
// before the start, defaulting to a day), plus "registration opens" (at the
// exact minute) and "registration closes tomorrow" (suppressed once the user
// marks themselves registered).
//
// Repeating events live in eventSeries.ts, which stamps occurrences into this
// table as ordinary rows. Everything below treats them as ordinary rows too —
// the only places that know better are the ones that have to: the writes that
// can reach a whole series, and the delete that leaves a tombstone.

import { dialog } from 'electron'
import fs from 'node:fs'
import type {
  EventInput,
  EventKind,
  EventPatch,
  EventScope,
  FeedEvent,
  IcsImportResult,
  PlannerEvent,
  RecurrenceRule
} from '../shared/types'
import { getDb } from './db'
import {
  createEventSeries,
  deleteEventSeries,
  detachOccurrence,
  getEventSeries,
  updateEventSeries
} from './eventSeries'
import { parseIcs } from './ics'

interface EventRow {
  id: string
  title: string
  kind: string
  start_at: string
  end_at: string | null
  location: string | null
  url: string | null
  notes: string | null
  source: string
  course_id: string | null
  external_uid: string | null
  reg_opens_at: string | null
  reg_closes_at: string | null
  registered: number
  series_id: string | null
  occurrence_date: string | null
  skipped: number
  reminder_offsets: string
  /** Joined from event_series so an occurrence can describe its own repeat
   *  without the renderer making a second call for the template. */
  series_rule: string | null
  series_end_date: string | null
  created_at: string
  updated_at: string
}

function rowToEvent(r: EventRow): PlannerEvent {
  return {
    id: r.id,
    title: r.title,
    kind: r.kind as EventKind,
    startAt: r.start_at,
    endAt: r.end_at,
    location: r.location,
    url: r.url,
    notes: r.notes,
    source: r.source as PlannerEvent['source'],
    courseId: r.course_id,
    externalUid: r.external_uid,
    regOpensAt: r.reg_opens_at,
    regClosesAt: r.reg_closes_at,
    registered: r.registered === 1,
    seriesId: r.series_id,
    occurrenceDate: r.occurrence_date,
    repeat: r.series_rule ? (JSON.parse(r.series_rule) as RecurrenceRule) : null,
    repeatUntil: r.series_end_date,
    reminderOffsets: normalizeOffsets(r.reminder_offsets),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

// ---------- queries ----------

/** Every read goes through the same join, so an occurrence always arrives
 *  carrying its series' rule and end date. */
const SELECT_EVENT = `
  SELECT e.*, s.rule AS series_rule, s.end_date AS series_end_date
  FROM events e LEFT JOIN event_series s ON s.id = e.series_id`

export function listEvents(): PlannerEvent[] {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 120)
  const rows = getDb()
    .prepare(`${SELECT_EVENT} WHERE e.start_at >= ? AND e.skipped = 0 ORDER BY e.start_at ASC`)
    .all(cutoff.toISOString()) as unknown as EventRow[]
  return rows.map(rowToEvent)
}

export function getEvent(id: string): PlannerEvent {
  const row = getDb().prepare(`${SELECT_EVENT} WHERE e.id = ?`).get(id) as EventRow | undefined
  if (!row) throw new Error(`Event not found: ${id}`)
  return rowToEvent(row)
}

/** The occurrence a series write should hand back: the one on the date the
 *  user was looking at, since rewriting a template replaces that row with a
 *  fresh one and the caller still needs an event to show. */
function occurrenceOn(seriesId: string, onOrAfter: string): PlannerEvent {
  const db = getDb()
  const pick = (sql: string, ...args: unknown[]) =>
    db.prepare(sql).get(...(args as never[])) as EventRow | undefined
  const row =
    pick(
      `${SELECT_EVENT} WHERE e.series_id = ? AND e.skipped = 0 AND e.occurrence_date >= ?
       ORDER BY e.occurrence_date ASC LIMIT 1`,
      seriesId,
      onOrAfter
    ) ??
    pick(
      `${SELECT_EVENT} WHERE e.series_id = ? AND e.skipped = 0
       ORDER BY e.occurrence_date DESC LIMIT 1`,
      seriesId
    )
  if (!row) throw new Error('That repeat never comes around — check its dates.')
  return rowToEvent(row)
}

// ---------- writes ----------

export function createEvent(input: EventInput): PlannerEvent {
  // A rule makes this a series, and the row the caller gets back is its first
  // occurrence — so from the outside, creating a repeat looks like creating an
  // event, which is the only thing the calendar knows how to show.
  if (input.repeat) {
    const seriesId = createEventSeries(input, input.repeat)
    return occurrenceOn(seriesId, input.date)
  }

  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const courseId = input.courseId ?? null
  // Filing an event under a course *is* calling it academic. Deriving the kind
  // here rather than trusting the caller keeps the two from drifting apart,
  // which would leave the calendar colouring one thing and filtering another.
  const kind = courseId ? 'academic' : input.kind
  const startAt = composeStart(input.date, input.time ?? null)
  const endAt = composeEnd(input.date, input.time ?? null, input.endDate ?? null, input.endTime ?? null)
  const reg =
    kind === 'badminton' && (input.autoRegWindow ?? true)
      ? computeRegWindow(input.date)
      : { opens: null, closes: null }

  getDb()
    .prepare(
      `INSERT INTO events (id, title, kind, start_at, end_at, location, url, notes, source,
                           course_id, external_uid, reg_opens_at, reg_closes_at, registered,
                           reminder_offsets, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, NULL, ?, ?, 0, ?, ?, ?)`
    )
    .run(
      id,
      input.title.trim(),
      kind,
      startAt,
      endAt,
      input.location?.trim() || null,
      input.url?.trim() || null,
      input.notes ?? null,
      courseId,
      reg.opens,
      reg.closes,
      JSON.stringify(normalizeOffsets(input.reminderOffsets)),
      now,
      now
    )
  const event = getEvent(id)
  syncEventReminders(event)
  return event
}

/** Edits one event. When it is an occurrence of a repeat, `scope` decides
 *  how far the edit reaches: 'one' touches only this row (a cancelled class
 *  moved to Friday stays moved), 'series' rewrites the template and re-stamps
 *  every future occurrence from it. Changing the repeat rule itself is always
 *  a series edit — there is nothing else it could mean. */
export function updateEvent(
  id: string,
  patch: EventPatch,
  scope: EventScope = 'one'
): PlannerEvent {
  const current = getEvent(id)
  if (patch.repeat !== undefined || (scope === 'series' && current.seriesId)) {
    return writeThroughSeries(current, patch)
  }

  const now = new Date().toISOString()

  // courseId undefined leaves the filing alone; null deliberately unfiles it.
  const courseId = patch.courseId !== undefined ? patch.courseId : current.courseId
  const kind = (courseId ? 'academic' : (patch.kind ?? current.kind)) as EventKind
  const touchesStart = patch.date !== undefined || patch.time !== undefined
  const touchesEnd = patch.endDate !== undefined || patch.endTime !== undefined

  const date = patch.date ?? localYMD(new Date(current.startAt))
  const time =
    patch.time !== undefined ? patch.time : isAllDay(current.startAt) ? null : localHM(current.startAt)
  let startAt = current.startAt
  if (touchesStart) startAt = composeStart(date, time)

  // The end follows the start unless the patch speaks for it: moving an event
  // keeps its length, which is what dragging a block on the week grid means.
  let endAt = current.endAt
  if (touchesEnd) {
    const endDate =
      patch.endDate !== undefined
        ? patch.endDate
        : current.endAt
          ? localYMD(new Date(current.endAt))
          : null
    const endTime =
      patch.endTime !== undefined
        ? patch.endTime
        : current.endAt && !isAllDay(current.endAt)
          ? localHM(current.endAt)
          : null
    endAt = composeEnd(date, time, endDate, endTime)
  } else if (touchesStart && current.endAt) {
    const shift = new Date(startAt).getTime() - new Date(current.startAt).getTime()
    endAt = new Date(new Date(current.endAt).getTime() + shift).toISOString()
  }

  // Recompute the registration window when kind/date changed on a badminton
  // event that had (or now gains) an auto window; explicit autoRegWindow=false clears it.
  let regOpens = current.regOpensAt
  let regCloses = current.regClosesAt
  const wantsAuto = patch.autoRegWindow ?? (current.regOpensAt !== null || kind === 'badminton')
  if (kind !== 'badminton' || patch.autoRegWindow === false) {
    regOpens = null
    regCloses = null
  } else if (wantsAuto && (patch.date !== undefined || patch.kind !== undefined || patch.autoRegWindow === true)) {
    const win = computeRegWindow(patch.date ?? localYMD(new Date(startAt)))
    regOpens = win.opens
    regCloses = win.closes
  }

  getDb()
    .prepare(
      `UPDATE events SET title = ?, kind = ?, start_at = ?, end_at = ?, location = ?, url = ?, notes = ?,
                         course_id = ?, reg_opens_at = ?, reg_closes_at = ?, registered = ?,
                         reminder_offsets = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      (patch.title ?? current.title).trim(),
      kind,
      startAt,
      endAt,
      patch.location !== undefined ? patch.location : current.location,
      patch.url !== undefined ? patch.url : current.url,
      patch.notes !== undefined ? patch.notes : current.notes,
      courseId,
      regOpens,
      regCloses,
      (patch.registered !== undefined ? patch.registered : current.registered) ? 1 : 0,
      JSON.stringify(
        patch.reminderOffsets !== undefined
          ? normalizeOffsets(patch.reminderOffsets)
          : current.reminderOffsets
      ),
      now,
      id
    )
  const event = getEvent(id)
  syncEventReminders(event)
  return event
}

/** Every write that reaches the whole repeat lands here, because occurrences
 *  are only ever stamps of the template — the way to change all of them is to
 *  change the thing they are stamped from and re-stamp. */
function writeThroughSeries(current: PlannerEvent, patch: EventPatch): PlannerEvent {
  const series = current.seriesId ? getEventSeries(current.seriesId) : null
  const rule = patch.repeat !== undefined ? patch.repeat : current.repeat
  const input = mergeInput(current, patch, series?.startDate ?? null)

  // "Stop repeating." The occurrence in hand becomes a plain event and the
  // rest of the series goes; detaching first is what saves it from the cascade.
  if (!rule) {
    if (current.seriesId) {
      detachOccurrence(current.id)
      deleteEventSeries(current.seriesId)
    }
    return updateEvent(current.id, { ...patch, repeat: undefined }, 'one')
  }

  if (current.seriesId) {
    updateEventSeries(current.seriesId, input, rule)
    return occurrenceOn(current.seriesId, current.occurrenceDate ?? input.date)
  }

  // A one-off becoming a repeat: its generated occurrences replace it, exactly
  // as a task giving way to its series does.
  const seriesId = createEventSeries(input, rule)
  clearEventReminders(current.id)
  getDb().prepare('DELETE FROM events WHERE id = ?').run(current.id)
  return occurrenceOn(seriesId, input.date)
}

/** The event as an input again, with the patch merged over it — what the
 *  series layer wants, since it speaks templates rather than rows.
 *
 *  `anchor` is the series' own start date, and when there is one it wins over
 *  any date in the patch. A series is edited through whichever occurrence you
 *  had open, so honouring that occurrence's date would drag the anchor forward
 *  every time you fixed a typo in November — quietly dropping every occurrence
 *  between here and there. When the repeat should start elsewhere, that is
 *  what the rule and the until-date are for. */
function mergeInput(
  current: PlannerEvent,
  patch: EventPatch,
  anchor: string | null
): EventInput {
  const allDay = isAllDay(current.startAt)
  const day = patch.date ?? localYMD(new Date(current.startAt))
  const endDay =
    patch.endDate !== undefined
      ? patch.endDate
      : current.endAt
        ? localYMD(new Date(current.endAt))
        : null

  // The length in whole days travels with the event while its start date is
  // re-based onto the anchor, so a two-day tournament stays two days long.
  const span = endDay && endDay > day ? daysApart(day, endDay) : 0
  const date = anchor ?? day

  return {
    title: patch.title ?? current.title,
    kind: patch.kind ?? current.kind,
    courseId: patch.courseId !== undefined ? patch.courseId : current.courseId,
    date,
    time: patch.time !== undefined ? patch.time : allDay ? null : localHM(current.startAt),
    endDate: span > 0 ? shiftYMD(date, span) : null,
    endTime:
      patch.endTime !== undefined
        ? patch.endTime
        : current.endAt && !allDay
          ? localHM(current.endAt)
          : null,
    location: patch.location !== undefined ? patch.location : current.location,
    url: patch.url !== undefined ? patch.url : current.url,
    notes: patch.notes !== undefined ? patch.notes : current.notes,
    autoRegWindow:
      patch.autoRegWindow !== undefined ? patch.autoRegWindow : current.regOpensAt !== null,
    repeatUntil: patch.repeatUntil !== undefined ? patch.repeatUntil : current.repeatUntil,
    reminderOffsets:
      patch.reminderOffsets !== undefined ? patch.reminderOffsets : current.reminderOffsets
  }
}

/** Removes one event, or the whole repeat it belongs to.
 *
 *  A single occurrence is not deleted so much as struck out: the row stays as
 *  a tombstone, which is the only thing stopping tomorrow's materialization
 *  from cheerfully putting it back. */
export function deleteEvent(id: string, scope: EventScope = 'one'): void {
  const event = getEvent(id)
  if (scope === 'series' && event.seriesId) {
    deleteEventSeries(event.seriesId)
    return
  }
  clearEventReminders(id)
  if (event.seriesId) {
    getDb()
      .prepare('UPDATE events SET skipped = 1, updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id)
    return
  }
  getDb().prepare('DELETE FROM events WHERE id = ?').run(id)
}

// ---------- ICS import ----------

export async function importIcs(
  kind: EventKind,
  courseId: string | null = null
): Promise<IcsImportResult> {
  const pick = await dialog.showOpenDialog({
    title: 'Import calendar file',
    filters: [{ name: 'iCalendar', extensions: ['ics'] }],
    properties: ['openFile']
  })
  if (pick.canceled || pick.filePaths.length === 0) {
    return { imported: 0, skipped: 0, canceled: true }
  }

  const text = fs.readFileSync(pick.filePaths[0], 'utf8')
  const parsed = parseIcs(text)
  const now = new Date().toISOString()
  const insert = getDb().prepare(
    `INSERT INTO events (id, title, kind, start_at, end_at, location, url, notes, source,
                         course_id, external_uid, reg_opens_at, reg_closes_at, registered,
                         created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ics', ?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT (external_uid) DO NOTHING`
  )
  // Same rule as createEvent: a course-filed import is an academic one.
  const filedKind = courseId ? 'academic' : kind

  let imported = 0
  let skipped = 0
  for (const ev of parsed) {
    const reg = filedKind === 'badminton' ? computeRegWindow(localYMD(new Date(ev.startAt))) : { opens: null, closes: null }
    const id = crypto.randomUUID()
    const res = insert.run(
      id,
      ev.summary,
      filedKind,
      ev.startAt,
      ev.endAt,
      ev.location,
      ev.url,
      ev.description,
      courseId,
      ev.uid,
      reg.opens,
      reg.closes,
      now,
      now
    )
    if (res.changes > 0) {
      imported++
      syncEventReminders(getEvent(id))
    } else {
      skipped++
    }
  }
  return { imported, skipped, canceled: false }
}

/** Import events picked from a federation calendar. Dedupes on external_uid,
 *  so re-importing the same tournament is a no-op. */
export function importFeedEvents(events: FeedEvent[]): IcsImportResult {
  const now = new Date().toISOString()
  const insert = getDb().prepare(
    `INSERT INTO events (id, title, kind, start_at, end_at, location, url, notes, source,
                         course_id, external_uid, reg_opens_at, reg_closes_at, registered,
                         created_at, updated_at)
     VALUES (?, ?, 'badminton', ?, ?, ?, ?, NULL, 'web', NULL, ?, ?, ?, 0, ?, ?)
     ON CONFLICT (external_uid) DO NOTHING`
  )

  let imported = 0
  let skipped = 0
  for (const ev of events) {
    const { dueAt: startAt } = { dueAt: composeStart(ev.startDate, null) }
    const reg = computeRegWindow(ev.startDate)
    const id = crypto.randomUUID()
    const res = insert.run(
      id,
      ev.title,
      startAt,
      ev.endDate ? composeStart(ev.endDate, null) : null,
      ev.location,
      ev.url,
      ev.uid,
      reg.opens,
      reg.closes,
      now,
      now
    )
    if (res.changes > 0) {
      imported++
      syncEventReminders(getEvent(id))
    } else {
      skipped++
    }
  }
  return { imported, skipped, canceled: false }
}

// ---------- registration window + reminders ----------

/** BQ window from the competition's local start date. */
export function computeRegWindow(startDate: string): { opens: string; closes: string } {
  const [y, m, d] = startDate.split('-').map(Number)
  const opens = new Date(y, m - 1, d - 18, 12, 30)
  const closes = new Date(y, m - 1, d - 11, 11, 30)
  return { opens: opens.toISOString(), closes: closes.toISOString() }
}

/** All-day events carry no time of day, so their reminders count back from
 *  9am on the day — the convention every calendar app settled on, and the
 *  reason "1 day before" arrives while you can still act on it. */
const ALL_DAY_ANCHOR_HOUR = 9

/** What a brand-new event is reminded at when nobody says otherwise: the same
 *  day-before nudge every event used to get, unchanged. */
export const DEFAULT_REMINDER_OFFSETS = [1440]

/** Two months. Past that an "advance warning" is really just a note. */
const MAX_OFFSET_MIN = 60 * 24 * 60

/** Offsets as whole minutes before the start: cleaned, deduped, and ordered
 *  furthest-out first so a run of them reads as a countdown. Takes either the
 *  stored JSON or a value straight off IPC, since both arrive here. Absent
 *  means "the default"; an empty array means the user turned them all off. */
export function normalizeOffsets(value: unknown): number[] {
  let raw = value
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return [...DEFAULT_REMINDER_OFFSETS] // tolerate corrupt JSON
    }
  }
  if (raw === undefined || raw === null) return [...DEFAULT_REMINDER_OFFSETS]
  if (!Array.isArray(raw)) return []
  const mins = raw
    .map((n) => Math.round(Number(n)))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= MAX_OFFSET_MIN)
  return [...new Set(mins)].sort((a, b) => b - a)
}

/** How far off the event is, said the way a person would. */
function leadLabel(mins: number, allDay: boolean): string {
  if (mins <= 0) return allDay ? 'Today' : 'Starting now'
  if (mins < 60) return `In ${mins} min`
  if (mins < 1440) {
    const hours = round1(mins / 60)
    return `In ${hours} hour${hours === 1 ? '' : 's'}`
  }
  const days = round1(mins / 1440)
  if (days === 1) return 'Tomorrow'
  if (days === 7) return 'In a week'
  if (days % 7 === 0) return `In ${days / 7} weeks`
  return `In ${days} days`
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function clearEventReminders(eventId: string): void {
  getDb()
    .prepare(`DELETE FROM reminders WHERE kind = 'event' AND ref_id = ? AND fired_at IS NULL`)
    .run(eventId)
}

export function syncEventReminders(event: PlannerEvent): void {
  clearEventReminders(event.id)
  const nowMs = Date.now()
  const add = getDb().prepare(
    `INSERT INTO reminders (id, kind, ref_id, title, body, fire_at, created_at)
     VALUES (?, 'event', ?, ?, ?, ?, ?)`
  )
  const nowIso = new Date().toISOString()
  const push = (title: string, body: string, fireAt: string) => {
    if (new Date(fireAt).getTime() > nowMs) {
      add.run(crypto.randomUUID(), event.id, title, body, fireAt, nowIso)
    }
  }

  // One alarm per offset, counted back from the start. An all-day event has no
  // start time to count back from, so its offsets run from ALL_DAY_ANCHOR_HOUR
  // instead: "a day before" on an all-day event means the morning before, not
  // midnight, when nobody is looking at anything.
  const start = new Date(event.startAt)
  const allDay = isAllDay(event.startAt)
  const anchor = allDay
    ? new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate(),
        ALL_DAY_ANCHOR_HOUR
      ).getTime()
    : start.getTime()
  const where = event.location ? ` · ${event.location}` : ''
  for (const mins of event.reminderOffsets) {
    push(event.title, `${leadLabel(mins, allDay)}${where}`, new Date(anchor - mins * 60_000).toISOString())
  }

  // Badminton registration alarms.
  if (event.regOpensAt) {
    push(`Registration opens — ${event.title}`, 'Badminton Québec window is open now. Go register.', event.regOpensAt)
  }
  if (event.regClosesAt && !event.registered) {
    const closeWarn = new Date(new Date(event.regClosesAt).getTime() - 24 * 3600_000).toISOString()
    push(`Registration closes tomorrow — ${event.title}`, 'Last chance to register (closes 11:30).', closeWarn)
  }
}

// ---------- local helpers ----------

export function composeStart(date: string, time: string | null): string {
  const [y, m, d] = date.split('-').map(Number)
  if (time) {
    const [hh, mm] = time.split(':').map(Number)
    return new Date(y, m - 1, d, hh, mm).toISOString()
  }
  return new Date(y, m - 1, d).toISOString() // local midnight = all-day
}

/** The end of a period, or null when the event is a single point.
 *
 *  All-day events end at local midnight of their last day, so the stored date
 *  is the day the event still covers — that's what the calendar grids read.
 *  A timed event given only an end *time* ends the same day, or the next one
 *  when that time has already passed (22:00 → 01:00 is one night, not −21h).
 *  Anything that still lands at or before the start is not a period, so it
 *  collapses back to null rather than being stored backwards. */
export function composeEnd(
  date: string,
  time: string | null,
  endDate: string | null,
  endTime: string | null
): string | null {
  if (!endDate && !endTime) return null

  const startMs = new Date(composeStart(date, time)).getTime()
  let end: string
  if (!time) {
    // All-day: only whole days can extend it.
    end = composeStart(endDate ?? date, null)
  } else if (endDate) {
    end = composeStart(endDate, endTime ?? time)
  } else {
    end = composeStart(date, endTime)
    if (new Date(end).getTime() <= startMs) end = composeStart(shiftYMD(date, 1), endTime)
  }
  return new Date(end).getTime() > startMs ? end : null
}

export function shiftYMD(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return localYMD(new Date(y, m - 1, d + days))
}

/** Whole days from one local date to another, both YYYY-MM-DD. */
function daysApart(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round(
    (new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86_400_000
  )
}

export function isAllDay(iso: string): boolean {
  const d = new Date(iso)
  return d.getHours() === 0 && d.getMinutes() === 0
}

function localYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function localHM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
