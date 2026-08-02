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

function getGymSession(id: string): GymSession {
  const row = getDb().prepare('SELECT * FROM gym_sessions WHERE id = ?').get(id) as
    | GymRow
    | undefined
  if (!row) throw new Error(`Gym session not found: ${id}`)
  return rowToSession(row)
}
