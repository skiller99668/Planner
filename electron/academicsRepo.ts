// Terms → courses → lectures persistence for the Academics module.

import type {
  Course,
  CourseInput,
  CoursePatch,
  Lecture,
  LectureInput,
  LecturePatch,
  Term,
  TermInput,
  TermPatch
} from '../shared/types'
import { TAG_COLORS } from '../shared/types'
import { deleteThreadsFor } from './chatRepo'
import { getDb } from './db'

interface TermRow {
  id: string
  name: string
  color: string
  archived: number
  sort_order: number
  created_at: string
}

interface CourseRow {
  id: string
  code: string
  name: string
  term_id: string | null
  color: string
  archived: number
  sort_order: number
  created_at: string
}

interface LectureRow {
  id: string
  course_id: string
  title: string
  lecture_date: string
  summary: string
  created_at: string
  updated_at: string
}

const rowToTerm = (r: TermRow): Term => ({
  id: r.id,
  name: r.name,
  color: r.color,
  archived: r.archived === 1,
  sortOrder: r.sort_order,
  createdAt: r.created_at
})

const rowToCourse = (r: CourseRow): Course => ({
  id: r.id,
  code: r.code,
  name: r.name,
  termId: r.term_id,
  color: r.color,
  archived: r.archived === 1,
  sortOrder: r.sort_order,
  createdAt: r.created_at
})

const rowToLecture = (r: LectureRow): Lecture => ({
  id: r.id,
  courseId: r.course_id,
  title: r.title,
  lectureDate: r.lecture_date,
  summary: r.summary,
  createdAt: r.created_at,
  updatedAt: r.updated_at
})

/** Only a real palette swatch is stored. The colour picker can't offer
 *  anything else, but the value crosses IPC, and a hex that isn't on the
 *  palette would render as a swatch the picker then can't show as selected. */
function paletteColor(color: string | undefined, fallback: string): string {
  return color && (TAG_COLORS as readonly string[]).includes(color) ? color : fallback
}

/** The palette swatch used least by what's already on screen, so a new term or
 *  course arrives visually distinct without anyone having to pick.
 *
 *  `avoid` takes a swatch out of the running even when it's otherwise free —
 *  a course drawn in its own term's colour reads as a second copy of the
 *  folder heading rather than as a course. */
function leastUsedColor(inUse: string[], avoid?: string | null): string {
  const pool = TAG_COLORS.filter((c) => c !== avoid)
  const counts = new Map<string, number>(pool.map((c) => [c, 0]))
  for (const c of inUse) if (counts.has(c)) counts.set(c, counts.get(c)! + 1)
  let best: string = pool[0]
  for (const c of pool) if (counts.get(c)! < counts.get(best)!) best = c
  return best
}

// ---------- terms ----------

/** Every term, archived ones included — the page keeps those on their own
 *  shelf rather than pretending they were never there. */
export function listTerms(): Term[] {
  const rows = getDb()
    .prepare('SELECT * FROM terms ORDER BY sort_order, created_at')
    .all() as unknown as TermRow[]
  return rows.map(rowToTerm)
}

export function getTerm(id: string): Term {
  const row = getDb().prepare('SELECT * FROM terms WHERE id = ?').get(id) as TermRow | undefined
  if (!row) throw new Error(`Term not found: ${id}`)
  return rowToTerm(row)
}

export function createTerm(input: TermInput): Term {
  const db = getDb()
  const id = crypto.randomUUID()
  const used = (db.prepare('SELECT color FROM terms').all() as unknown as { color: string }[]).map(
    (r) => r.color
  )
  const { next } = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM terms')
    .get() as { next: number }
  db.prepare(
    `INSERT INTO terms (id, name, color, archived, sort_order, created_at)
     VALUES (?, ?, ?, 0, ?, ?)`
  ).run(
    id,
    input.name.trim(),
    paletteColor(input.color, leastUsedColor(used)),
    next,
    new Date().toISOString()
  )
  return getTerm(id)
}

export function updateTerm(id: string, patch: TermPatch): Term {
  const current = getTerm(id)
  // An empty rename is a no-op rather than a way to blank a folder: the inline
  // editor commits on blur, so a stray click elsewhere would otherwise erase it.
  const name = patch.name !== undefined && patch.name.trim() ? patch.name.trim() : current.name
  getDb()
    .prepare('UPDATE terms SET name = ?, color = ?, archived = ? WHERE id = ?')
    .run(
      name,
      paletteColor(patch.color, current.color),
      (patch.archived !== undefined ? patch.archived : current.archived) ? 1 : 0,
      id
    )
  return getTerm(id)
}

/** Drops the folder, not its contents. The courses inside fall back to unfiled
 *  (term_id → NULL through the FK) and keep every lecture and chat: deleting a
 *  semester by mis-click must not cost a semester of notes. */
export function deleteTerm(id: string): void {
  getDb().prepare('DELETE FROM terms WHERE id = ?').run(id)
}

/** Order of the shelves themselves: the ids take positions 1..n. */
export function reorderTerms(ids: string[]): void {
  const db = getDb()
  const place = db.prepare('UPDATE terms SET sort_order = ? WHERE id = ?')
  db.exec('BEGIN')
  try {
    ids.forEach((id, i) => place.run(i + 1, id))
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// ---------- courses ----------

/** Every course, archived ones included. The renderer decides what to show —
 *  Academics keeps an archived shelf, the events picker offers only live
 *  courses — and both are served by this one fetch. */
export function listCourses(): Course[] {
  const rows = getDb()
    .prepare('SELECT * FROM courses ORDER BY sort_order, created_at')
    .all() as unknown as CourseRow[]
  return rows.map(rowToCourse)
}

export function getCourse(id: string): Course {
  const row = getDb().prepare('SELECT * FROM courses WHERE id = ?').get(id) as
    | CourseRow
    | undefined
  if (!row) throw new Error(`Course not found: ${id}`)
  return rowToCourse(row)
}

export function createCourse(input: CourseInput): Course {
  const db = getDb()
  const id = crypto.randomUUID()
  // Only live courses count toward the tally: an archived semester's colours
  // are off-screen, so reusing them costs nothing.
  const used = (
    db.prepare('SELECT color FROM courses WHERE archived = 0').all() as unknown as {
      color: string
    }[]
  ).map((r) => r.color)
  const { next } = db
    .prepare(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM courses
       WHERE IFNULL(term_id, '') = IFNULL(?, '')`
    )
    .get(input.termId) as { next: number }
  const termColor = input.termId
    ? ((db.prepare('SELECT color FROM terms WHERE id = ?').get(input.termId) as
        | { color: string }
        | undefined)?.color ?? null)
    : null
  db.prepare(
    `INSERT INTO courses (id, code, name, term_id, color, archived, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(
    id,
    input.code.trim(),
    input.name.trim(),
    input.termId,
    paletteColor(input.color, leastUsedColor(used, termColor)),
    next,
    new Date().toISOString()
  )
  return getCourse(id)
}

export function updateCourse(id: string, patch: CoursePatch): Course {
  const db = getDb()
  const current = getCourse(id)
  const code = patch.code !== undefined && patch.code.trim() ? patch.code.trim() : current.code
  const name = patch.name !== undefined && patch.name.trim() ? patch.name.trim() : current.name
  const termId = patch.termId !== undefined ? patch.termId : current.termId

  // Moved to another shelf, where the position it was hand-placed at means
  // nothing: land it at the end of the shelf it arrives on.
  let sortOrder = current.sortOrder
  if (termId !== current.termId) {
    const { next } = db
      .prepare(
        `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM courses
         WHERE IFNULL(term_id, '') = IFNULL(?, '') AND id != ?`
      )
      .get(termId, id) as { next: number }
    sortOrder = next
  }

  db.prepare(
    `UPDATE courses SET code = ?, name = ?, term_id = ?, color = ?, archived = ?, sort_order = ?
     WHERE id = ?`
  ).run(
    code,
    name,
    termId,
    paletteColor(patch.color, current.color),
    (patch.archived !== undefined ? patch.archived : current.archived) ? 1 : 0,
    sortOrder,
    id
  )
  return getCourse(id)
}

export function deleteCourse(id: string): void {
  const db = getDb()
  const lectures = db
    .prepare('SELECT id FROM lectures WHERE course_id = ?')
    .all(id) as unknown as { id: string }[]
  // One transaction: the chats are deleted before the course row, and a row
  // delete that then failed would have thrown away conversations belonging to
  // a course that is still there.
  db.exec('BEGIN')
  try {
    for (const l of lectures) deleteThreadsFor('lecture', l.id)
    deleteThreadsFor('course', id)
    db.prepare('DELETE FROM courses WHERE id = ?').run(id) // lectures cascade
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

/** Order within one term's shelf: the ids take positions 1..n. Scoped to the
 *  term so a drag can never reshuffle a shelf it didn't touch. */
export function reorderCourses(termId: string | null, ids: string[]): void {
  const db = getDb()
  const place = db.prepare(
    `UPDATE courses SET sort_order = ? WHERE id = ? AND IFNULL(term_id, '') = IFNULL(?, '')`
  )
  db.exec('BEGIN')
  try {
    ids.forEach((id, i) => place.run(i + 1, id, termId))
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// ---------- lectures ----------

export function listLectures(courseId: string): Lecture[] {
  const rows = getDb()
    .prepare('SELECT * FROM lectures WHERE course_id = ? ORDER BY lecture_date DESC, created_at DESC')
    .all(courseId) as unknown as LectureRow[]
  return rows.map(rowToLecture)
}

export function getLecture(id: string): Lecture {
  const row = getDb().prepare('SELECT * FROM lectures WHERE id = ?').get(id) as
    | LectureRow
    | undefined
  if (!row) throw new Error(`Lecture not found: ${id}`)
  return rowToLecture(row)
}

export function createLecture(input: LectureInput): Lecture {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  getDb()
    .prepare(
      `INSERT INTO lectures (id, course_id, title, lecture_date, summary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, input.courseId, input.title.trim(), input.lectureDate, input.summary ?? '', now, now)
  return getLecture(id)
}

export function updateLecture(id: string, patch: LecturePatch): Lecture {
  const current = getLecture(id)
  // Same rule as a term rename: an empty title is ignored rather than stored,
  // so a blurred inline editor can't blank the row.
  const title = patch.title !== undefined && patch.title.trim() ? patch.title.trim() : current.title
  getDb()
    .prepare(
      'UPDATE lectures SET title = ?, lecture_date = ?, summary = ?, updated_at = ? WHERE id = ?'
    )
    .run(
      title,
      patch.lectureDate ?? current.lectureDate,
      patch.summary !== undefined ? patch.summary : current.summary,
      new Date().toISOString(),
      id
    )
  return getLecture(id)
}

export function deleteLecture(id: string): void {
  deleteThreadsFor('lecture', id)
  getDb().prepare('DELETE FROM lectures WHERE id = ?').run(id)
}

/** Recent lectures in the same course (for chat context), newest first. */
export function recentCourseLectures(courseId: string, excludeId: string, limit = 4): Lecture[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM lectures WHERE course_id = ? AND id != ?
       ORDER BY lecture_date DESC, created_at DESC LIMIT ?`
    )
    .all(courseId, excludeId, limit) as unknown as LectureRow[]
  return rows.map(rowToLecture)
}
