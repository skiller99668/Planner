// Subtask persistence: the checklist under a task.
//
// Nothing here touches the reminders table. Subtasks have no due time of their
// own, so there is nothing for the scheduler to fire — the parent task keeps
// owning that. Rows go away with their parent through ON DELETE CASCADE, so
// deleteTask needs no changes either.

import type { Subtask, SubtaskPatch } from '../shared/types'
import { getDb } from './db'

interface SubtaskRow {
  id: string
  task_id: string
  title: string
  done: number
  sort_order: number
  created_at: string
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

function getSubtask(id: string): Subtask {
  const row = getDb().prepare('SELECT * FROM subtasks WHERE id = ?').get(id) as
    | SubtaskRow
    | undefined
  if (!row) throw new Error(`Subtask not found: ${id}`)
  return rowToSubtask(row)
}

// ---------- writes ----------

/** Append a step to a task's checklist. Titles are trimmed; an empty one is
 *  refused rather than stored, so the list can't grow blank rows. */
export function createSubtask(taskId: string, title: string): Subtask {
  const clean = title.trim()
  if (!clean) throw new Error('Subtask title is empty')

  const db = getDb()
  const parent = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId) as
    | { id: string }
    | undefined
  if (!parent) throw new Error(`Task not found: ${taskId}`)

  // Append: one past whatever is currently last. Fractional positions survive
  // here, which is what lets a later drag-to-reorder slot between two rows
  // without renumbering the list.
  const { next } = db
    .prepare(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM subtasks WHERE task_id = ?'
    )
    .get(taskId) as { next: number }

  const id = crypto.randomUUID()
  db.prepare(
    `INSERT INTO subtasks (id, task_id, title, done, sort_order, created_at)
     VALUES (?, ?, ?, 0, ?, ?)`
  ).run(id, taskId, clean, next, new Date().toISOString())
  return getSubtask(id)
}

export function updateSubtask(id: string, patch: SubtaskPatch): Subtask {
  const current = getSubtask(id)
  // An empty retitle is a no-op rather than a way to blank a row: the inline
  // editor commits on blur, so a stray click would otherwise erase the title.
  const title = patch.title !== undefined && patch.title.trim() ? patch.title.trim() : current.title
  const done = patch.done !== undefined ? patch.done : current.done

  getDb()
    .prepare('UPDATE subtasks SET title = ?, done = ? WHERE id = ?')
    .run(title, done ? 1 : 0, id)
  return getSubtask(id)
}

export function deleteSubtask(id: string): void {
  getDb().prepare('DELETE FROM subtasks WHERE id = ?').run(id)
}

/** Rewrite one task's checklist order: the given ids take positions 1..n.
 *  Ids belonging to another task are ignored, so a stale list can't drag
 *  someone else's rows around. */
export function reorderSubtasks(taskId: string, ids: string[]): void {
  const db = getDb()
  const place = db.prepare('UPDATE subtasks SET sort_order = ? WHERE id = ? AND task_id = ?')
  db.exec('BEGIN')
  try {
    ids.forEach((id, i) => place.run(i + 1, id, taskId))
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
