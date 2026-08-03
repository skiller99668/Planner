// Events: manual entry + ICS import, Badminton Québec registration-window
// computation, and reminder synchronization.
//
// BQ 2026 rules (badmintonquebec.com), anchored to the competition start date
// (Saturday for real tournaments, so these land on the documented weekdays):
//   registration opens  : start − 18 days at 12:30
//   registration closes : start − 11 days at 11:30
//   draws posted        : start −  8 days at 16:30 (informational)
// Reminders created per event: "starts tomorrow" for all kinds, plus
// "registration opens" (at the exact minute) and "registration closes
// tomorrow" (suppressed once the user marks themselves registered).

import { dialog } from 'electron'
import fs from 'node:fs'
import type {
  EventInput,
  EventKind,
  EventPatch,
  FeedEvent,
  IcsImportResult,
  PlannerEvent
} from '../shared/types'
import { getDb } from './db'
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
  external_uid: string | null
  reg_opens_at: string | null
  reg_closes_at: string | null
  registered: number
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
    externalUid: r.external_uid,
    regOpensAt: r.reg_opens_at,
    regClosesAt: r.reg_closes_at,
    registered: r.registered === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

// ---------- queries ----------

export function listEvents(): PlannerEvent[] {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 120)
  const rows = getDb()
    .prepare('SELECT * FROM events WHERE start_at >= ? ORDER BY start_at ASC')
    .all(cutoff.toISOString()) as unknown as EventRow[]
  return rows.map(rowToEvent)
}

export function getEvent(id: string): PlannerEvent {
  const row = getDb().prepare('SELECT * FROM events WHERE id = ?').get(id) as
    | EventRow
    | undefined
  if (!row) throw new Error(`Event not found: ${id}`)
  return rowToEvent(row)
}

// ---------- writes ----------

export function createEvent(input: EventInput): PlannerEvent {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const startAt = composeStart(input.date, input.time ?? null)
  const reg =
    input.kind === 'badminton' && (input.autoRegWindow ?? true)
      ? computeRegWindow(input.date)
      : { opens: null, closes: null }

  getDb()
    .prepare(
      `INSERT INTO events (id, title, kind, start_at, end_at, location, url, notes, source,
                           external_uid, reg_opens_at, reg_closes_at, registered,
                           created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 'manual', NULL, ?, ?, 0, ?, ?)`
    )
    .run(
      id,
      input.title.trim(),
      input.kind,
      startAt,
      input.location?.trim() || null,
      input.url?.trim() || null,
      input.notes ?? null,
      reg.opens,
      reg.closes,
      now,
      now
    )
  const event = getEvent(id)
  syncEventReminders(event)
  return event
}

export function updateEvent(id: string, patch: EventPatch): PlannerEvent {
  const current = getEvent(id)
  const now = new Date().toISOString()

  const kind = (patch.kind ?? current.kind) as EventKind
  let startAt = current.startAt
  if (patch.date !== undefined || patch.time !== undefined) {
    const date = patch.date ?? localYMD(new Date(current.startAt))
    const time =
      patch.time !== undefined ? patch.time : isAllDay(current.startAt) ? null : localHM(current.startAt)
    startAt = composeStart(date, time)
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
      `UPDATE events SET title = ?, kind = ?, start_at = ?, location = ?, url = ?, notes = ?,
                         reg_opens_at = ?, reg_closes_at = ?, registered = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      (patch.title ?? current.title).trim(),
      kind,
      startAt,
      patch.location !== undefined ? patch.location : current.location,
      patch.url !== undefined ? patch.url : current.url,
      patch.notes !== undefined ? patch.notes : current.notes,
      regOpens,
      regCloses,
      (patch.registered !== undefined ? patch.registered : current.registered) ? 1 : 0,
      now,
      id
    )
  const event = getEvent(id)
  syncEventReminders(event)
  return event
}

export function deleteEvent(id: string): void {
  clearEventReminders(id)
  getDb().prepare('DELETE FROM events WHERE id = ?').run(id)
}

// ---------- ICS import ----------

export async function importIcs(kind: EventKind): Promise<IcsImportResult> {
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
                         external_uid, reg_opens_at, reg_closes_at, registered,
                         created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ics', ?, ?, ?, 0, ?, ?)
     ON CONFLICT (external_uid) DO NOTHING`
  )

  let imported = 0
  let skipped = 0
  for (const ev of parsed) {
    const reg = kind === 'badminton' ? computeRegWindow(localYMD(new Date(ev.startAt))) : { opens: null, closes: null }
    const id = crypto.randomUUID()
    const res = insert.run(
      id,
      ev.summary,
      kind,
      ev.startAt,
      ev.endAt,
      ev.location,
      ev.url,
      ev.description,
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
                         external_uid, reg_opens_at, reg_closes_at, registered,
                         created_at, updated_at)
     VALUES (?, ?, 'badminton', ?, ?, ?, ?, NULL, 'web', ?, ?, ?, 0, ?, ?)
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

  // Everything gets a day-before nudge. All-day events (stored at local
  // midnight) would land the nudge at 00:00 — fire at 18:00 the evening
  // before instead; timed events use exactly start − 24h.
  const start = new Date(event.startAt)
  const dayBefore = isAllDay(event.startAt)
    ? new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1, 18, 0).toISOString()
    : new Date(start.getTime() - 24 * 3600_000).toISOString()
  push(event.title, `Tomorrow${event.location ? ` · ${event.location}` : ''}`, dayBefore)

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

function composeStart(date: string, time: string | null): string {
  const [y, m, d] = date.split('-').map(Number)
  if (time) {
    const [hh, mm] = time.split(':').map(Number)
    return new Date(y, m - 1, d, hh, mm).toISOString()
  }
  return new Date(y, m - 1, d).toISOString() // local midnight = all-day
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
