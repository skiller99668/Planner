// Monthly goals: the goal rows, their steps, and their dated entries.
//
// The one rule that shapes this whole file: progress is never stored. A goal's
// headline number is computed from its entries (or read out of another table)
// every time it is asked for, because a cached "best" goes stale the moment a
// measurement is corrected or a target is moved below its start — and an
// auto-linked goal has no local rows to cache onto at all.

import type {
  Goal,
  GoalEntry,
  GoalEntryInput,
  GoalInput,
  GoalKind,
  GoalPatch,
  GoalSource,
  GoalStep,
  GoalStepPatch
} from '../shared/types'
import { TAG_COLORS } from '../shared/types'
import { getDb } from './db'

const KINDS: readonly GoalKind[] = ['number', 'checklist', 'counter']
const SOURCES: readonly GoalSource[] = ['applications', 'gym', 'leetcode', 'tasks']

interface GoalRow {
  id: string
  month: string
  title: string
  kind: string
  start_value: number | null
  unit: string | null
  target_value: number
  source: string | null
  source_tag: string | null
  color: string
  archived: number
  sort_order: number
  created_at: string
  updated_at: string
}

interface GoalStepRow {
  id: string
  goal_id: string
  title: string
  done: number
  sort_order: number
  created_at: string
}

interface GoalEntryRow {
  id: string
  goal_id: string
  date: string
  value: number
  note: string | null
  created_at: string
}

/** The linked count is filled in here rather than only in listGoals: every
 *  path that produces a Goal has to carry it, or an update would hand the
 *  renderer a goal whose bar reads zero until the next full refetch. */
function rowToGoal(r: GoalRow): Goal {
  const source = (SOURCES as readonly string[]).includes(r.source ?? '')
    ? (r.source as GoalSource)
    : null
  return {
    id: r.id,
    month: r.month,
    title: r.title,
    kind: r.kind as GoalKind,
    startValue: r.start_value,
    unit: r.unit,
    targetValue: r.target_value,
    source,
    sourceTag: r.source_tag,
    color: r.color,
    archived: r.archived === 1,
    sortOrder: r.sort_order,
    autoCount: source ? countFromSource(source, r.source_tag, r.month) : 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

const rowToStep = (r: GoalStepRow): GoalStep => ({
  id: r.id,
  goalId: r.goal_id,
  title: r.title,
  done: r.done === 1,
  sortOrder: r.sort_order,
  createdAt: r.created_at
})

const rowToEntry = (r: GoalEntryRow): GoalEntry => ({
  id: r.id,
  goalId: r.goal_id,
  date: r.date,
  value: r.value,
  note: r.note,
  createdAt: r.created_at
})

// ---------- validation ----------

/** YYYY-MM, and a real month. A malformed one would be invisible forever — no
 *  ‹ › cursor could land on it and no query would return it — so it is refused
 *  at every write rather than left to a CHECK constraint this schema doesn't
 *  use and whose failure surfaces as an opaque insert error. */
function validMonth(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month.trim())
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) {
    throw new Error(`Bad goal month: ${month}`)
  }
  return `${m[1]}-${m[2]}`
}

/** Only a real palette swatch is stored — the picker can't show a selection it
 *  doesn't own. Same rule as terms and courses. */
function paletteColor(color: string | undefined, fallback: string): string {
  return color && (TAG_COLORS as readonly string[]).includes(color) ? color : fallback
}

/** The least-used swatch among this month's goals, so a new one arrives
 *  visually distinct without anyone picking. */
function leastUsedColor(month: string): string {
  const used = (
    getDb()
      .prepare('SELECT color FROM goals WHERE month = ? AND archived = 0')
      .all(month) as unknown as { color: string }[]
  ).map((r) => r.color)
  const counts = new Map<string, number>(TAG_COLORS.map((c) => [c, 0]))
  for (const c of used) if (counts.has(c)) counts.set(c, counts.get(c)! + 1)
  let best: string = TAG_COLORS[0]
  for (const c of TAG_COLORS) if (counts.get(c)! < counts.get(best)!) best = c
  return best
}

// ---------- the linked count ----------

/** A month as both forms the schema stores dates in.
 *
 *  Three of the four sources hold a local YYYY-MM-DD, which a plain string
 *  range covers. `tasks.done_at` is a UTC instant, which one does NOT: a
 *  prefix match on '2026-08%' misfiles every task finished after about 20:00
 *  local on the last day of the month. Hence both, and hence the half-open ISO
 *  range below — do not "simplify" that back into a LIKE. */
function monthBounds(month: string): {
  firstDay: string
  lastDay: string
  startIso: string
  endIso: string
} {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return {
    firstDay: `${month}-01`,
    lastDay: `${month}-${pad(last)}`,
    startIso: new Date(y, m - 1, 1).toISOString(),
    endIso: new Date(y, m, 1).toISOString()
  }
}

/** Escape the LIKE wildcards so a tag containing % or _ can't widen the match. */
function likeTerm(raw: string): string {
  return raw.replace(/[\\%_]/g, (c) => `\\${c}`)
}

function countFromSource(source: GoalSource, tag: string | null, month: string): number {
  const db = getDb()
  const { firstDay, lastDay, startIso, endIso } = monthBounds(month)
  const one = (sql: string, ...args: unknown[]): number =>
    (db.prepare(sql).get(...(args as never[])) as { n: number }).n

  switch (source) {
    case 'applications':
      return one(
        'SELECT COUNT(*) AS n FROM applications WHERE applied_at BETWEEN ? AND ?',
        firstDay,
        lastDay
      )
    // Distinct days, matching how the Gym page counts a week: two sessions in
    // one day is one day of training.
    case 'gym':
      return one(
        'SELECT COUNT(DISTINCT date) AS n FROM gym_sessions WHERE date BETWEEN ? AND ?',
        firstDay,
        lastDay
      )
    case 'leetcode':
      return one(
        'SELECT COUNT(*) AS n FROM leetcode_problems WHERE date BETWEEN ? AND ?',
        firstDay,
        lastDay
      )
    case 'tasks': {
      if (!tag) return 0
      // The tags column is a JSON array, and the quotes are part of the
      // pattern, so "resume" can't match a longer tag that merely starts with
      // it. That holds because tag names are normalized to [a-z0-9-+#.] and
      // can never contain a quote or a backslash.
      return one(
        `SELECT COUNT(*) AS n FROM tasks
         WHERE status = 'done' AND done_at >= ? AND done_at < ?
           AND tags LIKE ? ESCAPE '\\'`,
        startIso,
        endIso,
        `%"${likeTerm(tag)}"%`
      )
    }
  }
}

// ---------- goals ----------

/** One month's goals in hand-placed order, archived ones left out — those are
 *  gone from the page, not shelved like an archived course. */
export function listGoals(month: string): Goal[] {
  const rows = getDb()
    .prepare('SELECT * FROM goals WHERE month = ? AND archived = 0 ORDER BY sort_order, created_at')
    .all(validMonth(month)) as unknown as GoalRow[]
  return rows.map(rowToGoal)
}

export function getGoal(id: string): Goal {
  const row = getDb().prepare('SELECT * FROM goals WHERE id = ?').get(id) as GoalRow | undefined
  if (!row) throw new Error(`Goal not found: ${id}`)
  return rowToGoal(row)
}

export function createGoal(input: GoalInput): Goal {
  const db = getDb()
  const month = validMonth(input.month)
  const title = input.title.trim()
  if (!title) throw new Error('Goal title is empty')
  const kind: GoalKind = KINDS.includes(input.kind) ? input.kind : 'checklist'
  // A source only means something on a counter, so it is derived from the kind
  // rather than trusted — the same rule that keeps events.course_id and
  // events.kind from drifting apart.
  const source = kind === 'counter' && input.source && SOURCES.includes(input.source)
    ? input.source
    : null
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const { next } = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM goals WHERE month = ?')
    .get(month) as { next: number }

  db.prepare(
    `INSERT INTO goals (id, month, title, kind, start_value, unit, target_value,
                        source, source_tag, color, archived, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
  ).run(
    id,
    month,
    title,
    kind,
    kind === 'number' ? (input.startValue ?? null) : null,
    kind === 'checklist' ? null : (input.unit?.trim() || null),
    kind === 'checklist' ? 0 : (input.targetValue ?? 0),
    source,
    source === 'tasks' ? (input.sourceTag?.trim() || null) : null,
    paletteColor(input.color, leastUsedColor(month)),
    next,
    now,
    now
  )
  return getGoal(id)
}

export function updateGoal(id: string, patch: GoalPatch): Goal {
  const db = getDb()
  const current = getGoal(id)
  // An empty retitle is a no-op rather than a blanking: the title is an inline
  // editor that commits on blur, so a stray click would otherwise erase it.
  const title = patch.title !== undefined && patch.title.trim() ? patch.title.trim() : current.title

  // Changing kind once there is history would reinterpret every entry — a
  // bench log is not a tally. Silently kept rather than thrown, because the UI
  // disables the control and this is only the backstop.
  const hasEntries =
    (db.prepare('SELECT COUNT(*) AS n FROM goal_entries WHERE goal_id = ?').get(id) as { n: number })
      .n > 0
  const kind: GoalKind =
    patch.kind !== undefined && KINDS.includes(patch.kind) && !hasEntries ? patch.kind : current.kind

  const wantSource = patch.source !== undefined ? patch.source : current.source
  const source = kind === 'counter' && wantSource && SOURCES.includes(wantSource) ? wantSource : null
  const wantTag = patch.sourceTag !== undefined ? patch.sourceTag : current.sourceTag

  const month = patch.month !== undefined ? validMonth(patch.month) : current.month
  // Landing on another month means the position it was hand-placed at is
  // meaningless; put it at the end of the month it arrives in.
  let sortOrder = current.sortOrder
  if (month !== current.month) {
    const { next } = db
      .prepare(
        'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM goals WHERE month = ? AND id != ?'
      )
      .get(month, id) as { next: number }
    sortOrder = next
  }

  db.prepare(
    `UPDATE goals SET month = ?, title = ?, kind = ?, start_value = ?, unit = ?,
                      target_value = ?, source = ?, source_tag = ?, color = ?,
                      archived = ?, sort_order = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    month,
    title,
    kind,
    kind === 'number' ? (patch.startValue !== undefined ? patch.startValue : current.startValue) : null,
    kind === 'checklist'
      ? null
      : patch.unit !== undefined
        ? patch.unit?.trim() || null
        : current.unit,
    kind === 'checklist' ? 0 : (patch.targetValue ?? current.targetValue),
    source,
    source === 'tasks' ? (wantTag?.trim() || null) : null,
    paletteColor(patch.color, current.color),
    (patch.archived !== undefined ? patch.archived : current.archived) ? 1 : 0,
    sortOrder,
    new Date().toISOString(),
    id
  )
  return getGoal(id)
}

export function deleteGoal(id: string): void {
  getDb().prepare('DELETE FROM goals WHERE id = ?').run(id) // steps + entries cascade
}

/** Order within one month: the ids take positions 1..n. Scoped to the month so
 *  a drag can never reshuffle one it didn't touch. */
export function reorderGoals(month: string, ids: string[]): void {
  const db = getDb()
  const m = validMonth(month)
  const place = db.prepare('UPDATE goals SET sort_order = ? WHERE id = ? AND month = ?')
  db.exec('BEGIN')
  try {
    ids.forEach((id, i) => place.run(i + 1, id, m))
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

/** Move a goal into another month, keeping its steps and its measurements.
 *
 *  Moves the row rather than copying it, deliberately. A copy would fork the
 *  measurement log, and two rows each holding half a bench log cannot agree on
 *  a personal best — which is the one number this feature exists to get right.
 *  The cost is that the old month no longer lists the goal, so the card shows
 *  created_at ("since July") to say where it came from. */
export function carryGoal(id: string, month: string): Goal {
  return updateGoal(id, { month: validMonth(month) })
}

// ---------- steps ----------

/** Every step of every goal, ordered within each. One query for the lot, the
 *  same bargain listSubtasks makes: the renderer refetches after each mutation
 *  anyway, and grouping by goalId there beats a round trip per open card. */
export function listGoalSteps(): GoalStep[] {
  const rows = getDb()
    .prepare('SELECT * FROM goal_steps ORDER BY goal_id, sort_order, created_at')
    .all() as unknown as GoalStepRow[]
  return rows.map(rowToStep)
}

function getStep(id: string): GoalStep {
  const row = getDb().prepare('SELECT * FROM goal_steps WHERE id = ?').get(id) as
    | GoalStepRow
    | undefined
  if (!row) throw new Error(`Goal step not found: ${id}`)
  return rowToStep(row)
}

export function createGoalStep(goalId: string, title: string): GoalStep {
  const db = getDb()
  const clean = title.trim()
  if (!clean) throw new Error('Goal step title is empty')
  getGoal(goalId) // throws if the parent is gone
  const { next } = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM goal_steps WHERE goal_id = ?')
    .get(goalId) as { next: number }
  const id = crypto.randomUUID()
  db.prepare(
    `INSERT INTO goal_steps (id, goal_id, title, done, sort_order, created_at)
     VALUES (?, ?, ?, 0, ?, ?)`
  ).run(id, goalId, clean, next, new Date().toISOString())
  return getStep(id)
}

export function updateGoalStep(id: string, patch: GoalStepPatch): GoalStep {
  const current = getStep(id)
  const title = patch.title !== undefined && patch.title.trim() ? patch.title.trim() : current.title
  getDb()
    .prepare('UPDATE goal_steps SET title = ?, done = ? WHERE id = ?')
    .run(title, (patch.done !== undefined ? patch.done : current.done) ? 1 : 0, id)
  return getStep(id)
}

export function deleteGoalStep(id: string): void {
  getDb().prepare('DELETE FROM goal_steps WHERE id = ?').run(id)
}

export function reorderGoalSteps(goalId: string, ids: string[]): void {
  const db = getDb()
  const place = db.prepare('UPDATE goal_steps SET sort_order = ? WHERE id = ? AND goal_id = ?')
  db.exec('BEGIN')
  try {
    ids.forEach((id, i) => place.run(i + 1, id, goalId))
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// ---------- entries ----------

/** Every entry of every goal, newest first within each. */
export function listGoalEntries(): GoalEntry[] {
  const rows = getDb()
    .prepare('SELECT * FROM goal_entries ORDER BY goal_id, date DESC, created_at DESC')
    .all() as unknown as GoalEntryRow[]
  return rows.map(rowToEntry)
}

/** Record a measurement, or one step of a manual tally.
 *
 *  The first measurement on a number goal stamps its start value, if it hasn't
 *  got one: a bar with no baseline reads nearly full the moment you log a real
 *  lift, which answers the wrong question. Later entries leave it alone — by
 *  then it is a field the user owns. */
export function addGoalEntry(input: GoalEntryInput): GoalEntry {
  const db = getDb()
  const goal = getGoal(input.goalId)
  if (!Number.isFinite(input.value)) throw new Error('Goal entry value is not a number')
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  db.exec('BEGIN')
  try {
    db.prepare(
      `INSERT INTO goal_entries (id, goal_id, date, value, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, goal.id, input.date, input.value, input.note?.trim() || null, now)

    if (goal.kind === 'number' && goal.startValue === null) {
      db.prepare('UPDATE goals SET start_value = ?, updated_at = ? WHERE id = ?').run(
        input.value,
        now,
        goal.id
      )
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  const row = db.prepare('SELECT * FROM goal_entries WHERE id = ?').get(id) as
    | GoalEntryRow
    | undefined
  if (!row) throw new Error(`Goal entry not found: ${id}`)
  return rowToEntry(row)
}

export function deleteGoalEntry(id: string): void {
  getDb().prepare('DELETE FROM goal_entries WHERE id = ?').run(id)
}
