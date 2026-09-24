// Subtask persistence: the checklist under a task.
//
// Nothing here touches the reminders table. Subtasks have no due time of their
// own, so there is nothing for the scheduler to fire — the parent task keeps
// owning that. Rows go away with their parent through ON DELETE CASCADE, so
// deleteTask needs no changes either.
//
// A repeating task's checklist belongs to its series. The template lives in
// series_subtasks and each occurrence is stamped from it when it's generated.
// Adding, renaming, deleting or reordering a step on one occurrence rewrites
// the template and every *later open* occurrence; ticking a step stays on the
// occurrence it was ticked on. Earlier and finished occurrences are history
// and keep the checklist they had.

import type { Subtask, SubtaskPatch } from '../shared/types'
import { getDb } from './db'

interface SubtaskRow {
  id: string
  task_id: string
  title: string
  done: number
  sort_order: number
  created_at: string
  template_id: string | null
}

function rowToSubtask(r: SubtaskRow): Subtask {
  return {
    id: r.id,
    taskId: r.task_id,
    title: r.title,
    done: r.done === 1,
    sortOrder: r.sort_order,
    createdAt: r.created_at
  }
}

// ---------- queries ----------

/** Every subtask in the DB, in list order within each task.
 *
 *  One query for the lot rather than one per task: the renderer already
 *  refetches everything after each mutation, and grouping by taskId there is
 *  cheaper than a round trip per expanded row. */
export function listSubtasks(): Subtask[] {
  const rows = getDb()
    .prepare('SELECT * FROM subtasks ORDER BY task_id, sort_order, created_at')
    .all() as unknown as SubtaskRow[]
  return rows.map(rowToSubtask)
}

function getSubtaskRow(id: string): SubtaskRow {
  const row = getDb().prepare('SELECT * FROM subtasks WHERE id = ?').get(id) as
    | SubtaskRow
    | undefined
  if (!row) throw new Error(`Subtask not found: ${id}`)
  return row
}

function getSubtask(id: string): Subtask {
  return rowToSubtask(getSubtaskRow(id))
}

// ---------- series plumbing ----------

interface SeriesPlace {
  seriesId: string
  occurrenceDate: string
}

/** Where a task sits in its series, or null for a standalone one (or a
 *  skipped occurrence, which nobody sees and so shouldn't steer the rest). */
function seriesPlaceOf(taskId: string): SeriesPlace | null {
  const row = getDb()
    .prepare('SELECT series_id, occurrence_date, status FROM tasks WHERE id = ?')
    .get(taskId) as
    | { series_id: string | null; occurrence_date: string | null; status: string }
    | undefined
  if (!row || !row.series_id || !row.occurrence_date || row.status === 'skipped') return null
  return { seriesId: row.series_id, occurrenceDate: row.occurrence_date }
}

/** The open occurrences dated after `place` — the ones a checklist edit reaches. */
function laterOpenOccurrences(place: SeriesPlace): string[] {
  const rows = getDb()
    .prepare(
      `SELECT id FROM tasks
       WHERE series_id = ? AND status = 'open' AND occurrence_date > ?`
    )
    .all(place.seriesId, place.occurrenceDate) as unknown as { id: string }[]
  return rows.map((r) => r.id)
}

/** One past whatever is currently last. Fractional positions survive here,
 *  which is what lets a drag-to-reorder slot between two rows without
 *  renumbering the list. */
function nextSortOrder(taskId: string): number {
  const { next } = getDb()
    .prepare(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM subtasks WHERE task_id = ?'
    )
    .get(taskId) as { next: number }
  return next
}

function inTransaction(fn: () => void): void {
  const db = getDb()
  db.exec('BEGIN')
  try {
    fn()
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

/** Copy a series' checklist template onto a freshly generated occurrence,
 *  every step unticked. Materialization calls this for new rows only. */
export function stampSeriesChecklist(taskId: string, seriesId: string): void {
  const db = getDb()
  const template = db
    .prepare(
      'SELECT id, title, sort_order FROM series_subtasks WHERE series_id = ? ORDER BY sort_order, created_at'
    )
    .all(seriesId) as unknown as { id: string; title: string; sort_order: number }[]
  if (template.length === 0) return
  const insert = db.prepare(
    `INSERT INTO subtasks (id, task_id, title, done, sort_order, created_at, template_id)
     VALUES (?, ?, ?, 0, ?, ?, ?)`
  )
  const now = new Date().toISOString()
  for (const t of template) {
    insert.run(crypto.randomUUID(), taskId, t.title, t.sort_order, now, t.id)
  }
}

/** Seed a brand-new series' template from a task's checklist — used when a
 *  one-off task is turned into a repeating one, so its steps come along. */
export function seedSeriesChecklist(seriesId: string, fromTaskId: string): void {
  getDb()
    .prepare(
      `INSERT INTO series_subtasks (id, series_id, title, sort_order, created_at)
       SELECT lower(hex(randomblob(16))), ?, title, sort_order, created_at
       FROM subtasks WHERE task_id = ?`
    )
    .run(seriesId, fromTaskId)
}

/** Ticked steps on a series' open occurrences from `fromDate` on, keyed by
 *  occurrence date. A series edit regenerates those rows; this lets it put
 *  the ticks back afterwards instead of silently clearing today's progress. */
export function captureSeriesTicks(
  seriesId: string,
  fromDate: string
): Map<string, Set<string>> {
  const rows = getDb()
    .prepare(
      `SELECT t.occurrence_date AS date, s.template_id AS tid
       FROM subtasks s JOIN tasks t ON t.id = s.task_id
       WHERE t.series_id = ? AND t.status = 'open' AND t.occurrence_date >= ?
         AND s.done = 1 AND s.template_id IS NOT NULL`
    )
    .all(seriesId, fromDate) as unknown as { date: string; tid: string }[]
  const out = new Map<string, Set<string>>()
  for (const r of rows) {
    const set = out.get(r.date) ?? new Set<string>()
    set.add(r.tid)
    out.set(r.date, set)
  }
  return out
}

export function restoreSeriesTicks(seriesId: string, ticks: Map<string, Set<string>>): void {
  const tick = getDb().prepare(
    `UPDATE subtasks SET done = 1
     WHERE template_id = ?
       AND task_id = (SELECT id FROM tasks WHERE series_id = ? AND occurrence_date = ?)`
  )
  for (const [date, tids] of ticks) for (const tid of tids) tick.run(tid, seriesId, date)
}

// ---------- writes ----------

/** Append a step to a task's checklist. Titles are trimmed; an empty one is
 *  refused rather than stored, so the list can't grow blank rows. On a
 *  repeating task the step joins the series template and every later open
 *  occurrence too. */
export function createSubtask(taskId: string, title: string): Subtask {
  const clean = title.trim()
  if (!clean) throw new Error('Subtask title is empty')

  const db = getDb()
  const parent = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId) as
    | { id: string }
    | undefined
  if (!parent) throw new Error(`Task not found: ${taskId}`)

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const insert = db.prepare(
    `INSERT INTO subtasks (id, task_id, title, done, sort_order, created_at, template_id)
     VALUES (?, ?, ?, 0, ?, ?, ?)`
  )
  const place = seriesPlaceOf(taskId)

  inTransaction(() => {
    if (!place) {
      insert.run(id, taskId, clean, nextSortOrder(taskId), now, null)
      return
    }
    const templateId = crypto.randomUUID()
    const { next } = db
      .prepare(
        'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM series_subtasks WHERE series_id = ?'
      )
      .get(place.seriesId) as { next: number }
    db.prepare(
      `INSERT INTO series_subtasks (id, series_id, title, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(templateId, place.seriesId, clean, next, now)
    insert.run(id, taskId, clean, nextSortOrder(taskId), now, templateId)
    for (const other of laterOpenOccurrences(place)) {
      insert.run(crypto.randomUUID(), other, clean, nextSortOrder(other), now, templateId)
    }
  })
  return getSubtask(id)
}

export function updateSubtask(id: string, patch: SubtaskPatch): Subtask {
  const current = getSubtaskRow(id)
  // An empty retitle is a no-op rather than a way to blank a row: the inline
  // editor commits on blur, so a stray click would otherwise erase the title.
  const title =
    patch.title !== undefined && patch.title.trim() ? patch.title.trim() : current.title
  const done = patch.done !== undefined ? patch.done : current.done === 1
  const templateId = current.template_id
  const place = templateId ? seriesPlaceOf(current.task_id) : null
  const db = getDb()

  inTransaction(() => {
    db.prepare('UPDATE subtasks SET title = ?, done = ? WHERE id = ?').run(title, done ? 1 : 0, id)
    // A rename carries forward through the series; a tick never does.
    if (place && templateId && title !== current.title) {
      db.prepare('UPDATE series_subtasks SET title = ? WHERE id = ?').run(title, templateId)
      const rename = db.prepare(
        'UPDATE subtasks SET title = ? WHERE task_id = ? AND template_id = ?'
      )
      for (const other of laterOpenOccurrences(place)) rename.run(title, other, templateId)
    }
  })
  return getSubtask(id)
}

export function deleteSubtask(id: string): void {
  const db = getDb()
  const row = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id) as
    | SubtaskRow
    | undefined
  if (!row) return
  const templateId = row.template_id
  const place = templateId ? seriesPlaceOf(row.task_id) : null

  inTransaction(() => {
    db.prepare('DELETE FROM subtasks WHERE id = ?').run(id)
    if (place && templateId) {
      const drop = db.prepare('DELETE FROM subtasks WHERE task_id = ? AND template_id = ?')
      for (const other of laterOpenOccurrences(place)) drop.run(other, templateId)
      // Earlier occurrences keep their copy; ON DELETE SET NULL unlinks it.
      db.prepare('DELETE FROM series_subtasks WHERE id = ?').run(templateId)
    }
  })
}

/** Rewrite one task's checklist order: the given ids take positions 1..n.
 *  Ids belonging to another task are ignored, so a stale list can't drag
 *  someone else's rows around. On a repeating task the order is mirrored into
 *  the template and the later open occurrences. */
export function reorderSubtasks(taskId: string, ids: string[]): void {
  const db = getDb()
  const place = db.prepare('UPDATE subtasks SET sort_order = ? WHERE id = ? AND task_id = ?')
  const series = seriesPlaceOf(taskId)

  inTransaction(() => {
    ids.forEach((id, i) => place.run(i + 1, id, taskId))
    if (!series) return
    db.prepare(
      `UPDATE series_subtasks SET sort_order =
         (SELECT s.sort_order FROM subtasks s
          WHERE s.task_id = ? AND s.template_id = series_subtasks.id)
       WHERE series_id = ?
         AND id IN (SELECT template_id FROM subtasks WHERE task_id = ? AND template_id IS NOT NULL)`
    ).run(taskId, series.seriesId, taskId)
    const follow = db.prepare(
      `UPDATE subtasks SET sort_order =
         (SELECT sort_order FROM series_subtasks WHERE id = subtasks.template_id)
       WHERE task_id = ? AND template_id IS NOT NULL`
    )
    for (const other of laterOpenOccurrences(series)) follow.run(other)
  })
}
