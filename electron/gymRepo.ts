// Gym session persistence. Sessions are independent rows (a date can hold
// more than one — rare two-a-days are fine); "trained that day" is derived
// as ≥1 session. Cycle/streak math lives in the renderer.

import type { GymLogInput, GymPatch, GymSession, GymType } from '../shared/types'
import { getDb } from './db'

interface GymRow {
  id: string
  date: string
  type: string
  notes: string | null
  details: string | null
  created_at: string
}

function rowToSession(r: GymRow): GymSession {
  let details: unknown | null = null
  if (r.details) {
    try {
      details = JSON.parse(r.details)
    } catch {
      details = null
    }
  }
  return {
    id: r.id,
    date: r.date,
    type: r.type as GymType,
    notes: r.notes,
    details,
    createdAt: r.created_at
  }
}

const HISTORY_DAYS = 26 * 7

export function listGymSessions(): GymSession[] {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - HISTORY_DAYS)
  const cutoffYmd = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`
  const rows = getDb()
    .prepare('SELECT * FROM gym_sessions WHERE date >= ? ORDER BY date DESC, created_at DESC')
    .all(cutoffYmd) as unknown as GymRow[]
  return rows.map(rowToSession)
}

export function logGymSession(input: GymLogInput): GymSession {
  // Idempotent per (date, type): tapping "Pull" twice on the same day is a
  // no-op, while a genuine two-a-day of different types still records.
  const existing = getDb()
    .prepare('SELECT * FROM gym_sessions WHERE date = ? AND type = ? LIMIT 1')
    .get(input.date, input.type) as GymRow | undefined
  if (existing) return rowToSession(existing)

  const id = crypto.randomUUID()
  getDb()
    .prepare(
      `INSERT INTO gym_sessions (id, date, type, notes, details, created_at)
       VALUES (?, ?, ?, ?, NULL, ?)`
    )
    .run(id, input.date, input.type, input.notes ?? null, new Date().toISOString())
  return getGymSession(id)
}

export function updateGymSession(id: string, patch: GymPatch): GymSession {
  const current = getGymSession(id)
  getDb()
    .prepare('UPDATE gym_sessions SET type = ?, notes = ? WHERE id = ?')
    .run(patch.type ?? current.type, patch.notes !== undefined ? patch.notes : current.notes, id)
  return getGymSession(id)
}

export function deleteGymSession(id: string): void {
  getDb().prepare('DELETE FROM gym_sessions WHERE id = ?').run(id)
}

/** Compact training status for the assistant (weeks run Sun–Sat). */
export function gymStatusSummary(target: number): {
  today: string[]
  nextType: GymType
  weekCount: number
  target: number
  weekMet: boolean
  weekStreak: number
} {
  const sessions = listGymSessions()
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const today = new Date()
  const todayStr = ymd(today)
  const dates = new Set(sessions.map((s) => s.date))

  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay()) // Sunday
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return ymd(d)
  })
  const weekCount = weekDates.filter((d) => dates.has(d)).length

  const order: GymType[] = ['push', 'pull', 'legs']
  const lastPpl = sessions.find((s) => order.includes(s.type))
  const nextType = lastPpl ? order[(order.indexOf(lastPpl.type) + 1) % 3] : 'push'

  let weekStreak = 0
  for (let back = 1; back <= 52; back++) {
    const ws = new Date(weekStart)
    ws.setDate(weekStart.getDate() - back * 7)
    const count = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ws)
      d.setDate(ws.getDate() + i)
      return ymd(d)
    }).filter((d) => dates.has(d)).length
    if (count >= target) weekStreak++
    else break
  }

  return {
    today: sessions.filter((s) => s.date === todayStr).map((s) => s.type),
    nextType,
    weekCount,
    target,
    weekMet: weekCount >= target,
    weekStreak
  }
}

function getGymSession(id: string): GymSession {
  const row = getDb().prepare('SELECT * FROM gym_sessions WHERE id = ?').get(id) as
    | GymRow
    | undefined
  if (!row) throw new Error(`Gym session not found: ${id}`)
  return rowToSession(row)
}
