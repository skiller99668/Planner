// Career pipeline (applications) + weekly prep logs (dsa / networking).

import type {
  Application,
  ApplicationInput,
  ApplicationPatch,
  ApplicationStatus,
  ApplicationTrack,
  CareerLogKind,
  CareerWeekStats
} from '../shared/types'
import { getDb } from './db'

interface AppRow {
  id: string
  company: string
  role: string
  track: string
  status: string
  url: string | null
  deadline: string | null
  applied_at: string | null
  next_action: string | null
  next_action_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

function rowToApp(r: AppRow): Application {
  return {
    id: r.id,
    company: r.company,
    role: r.role,
    track: r.track as ApplicationTrack,
    status: r.status as ApplicationStatus,
    url: r.url,
    deadline: r.deadline,
    appliedAt: r.applied_at,
    nextAction: r.next_action,
    nextActionDate: r.next_action_date,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

// ---------- applications ----------

export function listApplications(): Application[] {
  const rows = getDb()
    .prepare('SELECT * FROM applications ORDER BY updated_at DESC')
    .all() as unknown as AppRow[]
  return rows.map(rowToApp)
}

export function getApplication(id: string): Application {
  const row = getDb().prepare('SELECT * FROM applications WHERE id = ?').get(id) as
    | AppRow
    | undefined
  if (!row) throw new Error(`Application not found: ${id}`)
  return rowToApp(row)
}

export function createApplication(input: ApplicationInput): Application {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  getDb()
    .prepare(
      `INSERT INTO applications (id, company, role, track, status, url, deadline,
                                 applied_at, next_action, next_action_date, notes,
                                 created_at, updated_at)
       VALUES (?, ?, ?, ?, 'wishlist', ?, ?, NULL, NULL, NULL, NULL, ?, ?)`
    )
    .run(
      id,
      input.company.trim(),
      input.role.trim(),
      input.track,
      input.url?.trim() || null,
      input.deadline ?? null,
      now,
      now
    )
  return getApplication(id)
}

export function updateApplication(id: string, patch: ApplicationPatch): Application {
  const current = getApplication(id)
  const status = patch.status ?? current.status
  // First transition into 'applied' (or beyond) stamps the applied date,
  // which is what the weekly scoreboard counts.
  const advanced = ['applied', 'oa', 'interview', 'offer'].includes(status)
  const appliedAt =
    current.appliedAt ?? (advanced ? new Date().toLocaleDateString('en-CA') : null)

  getDb()
    .prepare(
      `UPDATE applications SET company = ?, role = ?, track = ?, status = ?, url = ?,
                               deadline = ?, applied_at = ?, next_action = ?,
                               next_action_date = ?, notes = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      (patch.company ?? current.company).trim(),
      (patch.role ?? current.role).trim(),
      patch.track ?? current.track,
      status,
      patch.url !== undefined ? patch.url : current.url,
      patch.deadline !== undefined ? patch.deadline : current.deadline,
      appliedAt,
      patch.nextAction !== undefined ? patch.nextAction : current.nextAction,
      patch.nextActionDate !== undefined ? patch.nextActionDate : current.nextActionDate,
      patch.notes !== undefined ? patch.notes : current.notes,
      new Date().toISOString(),
      id
    )
  return getApplication(id)
}

export function deleteApplication(id: string): void {
  getDb().prepare('DELETE FROM applications WHERE id = ?').run(id)
}

// ---------- weekly logs ----------

export function addCareerLog(kind: CareerLogKind): void {
  getDb()
    .prepare('INSERT INTO career_logs (id, kind, date, notes, created_at) VALUES (?, ?, ?, NULL, ?)')
    .run(crypto.randomUUID(), kind, todayYMD(), new Date().toISOString())
}

export function undoCareerLog(kind: CareerLogKind): void {
  getDb()
    .prepare(
      `DELETE FROM career_logs WHERE id = (
         SELECT id FROM career_logs WHERE kind = ? AND date = ?
         ORDER BY created_at DESC LIMIT 1
       )`
    )
    .run(kind, todayYMD())
}

export function careerWeekStats(): CareerWeekStats {
  const now = new Date()
  const weekStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
  const weekStart = ymd(weekStartDate)
  const weekEnd = ymd(new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate() + 6))

  const apps = (
    getDb()
      .prepare('SELECT COUNT(*) AS n FROM applications WHERE applied_at BETWEEN ? AND ?')
      .get(weekStart, weekEnd) as { n: number }
  ).n
  const count = (kind: string) =>
    (
      getDb()
        .prepare('SELECT COUNT(*) AS n FROM career_logs WHERE kind = ? AND date BETWEEN ? AND ?')
        .get(kind, weekStart, weekEnd) as { n: number }
    ).n

  // DSA is driven by real logged LeetCode problems (see leetcodeRepo), not the
  // old dumb career_logs tally — so the scoreboard and the LeetCode page agree.
  const dsa = (
    getDb()
      .prepare('SELECT COUNT(*) AS n FROM leetcode_problems WHERE date BETWEEN ? AND ?')
      .get(weekStart, weekEnd) as { n: number }
  ).n

  return { weekStart, applications: apps, dsa, networking: count('networking') }
}

function todayYMD(): string {
  return ymd(new Date())
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
