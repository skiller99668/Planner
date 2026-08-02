// Courses + lectures persistence for the Academics module.

import type { Course, CourseInput, Lecture, LectureInput, LecturePatch } from '../shared/types'
import { deleteThreadsFor } from './chatRepo'
import { getDb } from './db'

// Accent colors cycled across new courses (lab-bench palette relatives).
const COURSE_COLORS = ['#F2A93B', '#56C1D6', '#57C785', '#C792EA', '#E5484D', '#7C8BA1']

interface CourseRow {
  id: string
  code: string
  name: string
  term: string
  color: string
  archived: number
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

const rowToCourse = (r: CourseRow): Course => ({
  id: r.id,
  code: r.code,
  name: r.name,
  term: r.term,
  color: r.color,
  archived: r.archived === 1,
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

// ---------- courses ----------

export function listCourses(): Course[] {
  const rows = getDb()
    .prepare('SELECT * FROM courses WHERE archived = 0 ORDER BY created_at')
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
  const id = crypto.randomUUID()
  const count = (
    getDb().prepare('SELECT COUNT(*) AS n FROM courses').get() as { n: number }
  ).n
  getDb()
    .prepare(
      `INSERT INTO courses (id, code, name, term, color, archived, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`
    )
    .run(
      id,
      input.code.trim(),
      input.name.trim(),
      input.term.trim(),
      COURSE_COLORS[count % COURSE_COLORS.length],
      new Date().toISOString()
    )
  return getCourse(id)
}

export function deleteCourse(id: string): void {
  const lectures = getDb()
    .prepare('SELECT id FROM lectures WHERE course_id = ?')
    .all(id) as unknown as { id: string }[]
  for (const l of lectures) deleteThreadsFor('lecture', l.id)
  deleteThreadsFor('course', id)
  getDb().prepare('DELETE FROM courses WHERE id = ?').run(id) // lectures cascade
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
  getDb()
    .prepare(
      'UPDATE lectures SET title = ?, lecture_date = ?, summary = ?, updated_at = ? WHERE id = ?'
    )
    .run(
      (patch.title ?? current.title).trim(),
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
