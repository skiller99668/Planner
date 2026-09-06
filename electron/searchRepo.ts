// Cross-module search: one query, hits from every table that holds something
// you'd go looking for by name.
//
// LIKE rather than FTS5. At a personal planner's scale — thousands of rows at
// the very most — a table scan is microseconds, and FTS would add a virtual
// table, triggers to keep it in sync, and a second thing to migrate. Revisit
// only if this ever shows up in a profile.

import type { SearchHit } from '../shared/types'
import { getDb } from './db'
import { localYMDFromIso } from './tasksRepo'

/** Per-module cap, so one noisy table can't crowd out the others. */
const PER_MODULE = 6

/** Escape LIKE wildcards so searching for "100%" doesn't match everything. */
function likeTerm(query: string): string {
  return `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

export function searchAll(rawQuery: string): SearchHit[] {
  const query = rawQuery.trim()
  if (query.length < 2) return [] // one letter matches everything; not useful
  const db = getDb()
  const term = likeTerm(query)
  const hits: SearchHit[] = []

  // --- tasks (skipped occurrences are invisible everywhere else too) ---
  const tasks = db
    .prepare(
      // One row per repeating series, not one per occurrence — a weekly lab
      // would otherwise return eight identical hits and bury everything else.
      // Prefer its earliest open occurrence; fall back to the earliest done one
      // so a finished series is still findable.
      `SELECT id, title, notes, due_at, status FROM tasks
       WHERE status != 'skipped'
         AND (title LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\')
         AND (series_id IS NULL OR id = (
               SELECT t2.id FROM tasks t2
               WHERE t2.series_id = tasks.series_id AND t2.status != 'skipped'
               ORDER BY (t2.status = 'done'), t2.occurrence_date
               LIMIT 1
             ))
       ORDER BY (status = 'done'), COALESCE(due_at, '9999') LIMIT ?`
    )
    .all(term, term, PER_MODULE) as unknown as {
    id: string
    title: string
    notes: string | null
    due_at: string | null
    status: string
  }[]
  for (const t of tasks) {
    hits.push({
      module: 'task',
      id: t.id,
      title: t.title,
      subtitle: t.due_at ? `due ${localYMDFromIso(t.due_at)}` : null,
      date: t.due_at ? localYMDFromIso(t.due_at) : null,
      done: t.status === 'done'
    })
  }

  // --- events ---
  const events = db
    .prepare(
      `SELECT id, title, location, start_at FROM events
       WHERE skipped = 0
         AND (title LIKE ? ESCAPE '\\' OR location LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\')
       ORDER BY start_at DESC LIMIT ?`
    )
    .all(term, term, term, PER_MODULE) as unknown as {
    id: string
    title: string
    location: string | null
    start_at: string
  }[]
  for (const e of events) {
    const day = localYMDFromIso(e.start_at)
    hits.push({
      module: 'event',
      id: e.id,
      title: e.title,
      subtitle: e.location ? `${day} · ${e.location}` : day,
      date: day,
      done: new Date(e.start_at).getTime() < Date.now()
    })
  }

  // --- applications ---
  const apps = db
    .prepare(
      `SELECT id, company, role, status FROM applications
       WHERE company LIKE ? ESCAPE '\\' OR role LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\'
       ORDER BY updated_at DESC LIMIT ?`
    )
    .all(term, term, term, PER_MODULE) as unknown as {
    id: string
    company: string
    role: string
    status: string
  }[]
  for (const a of apps) {
    hits.push({
      module: 'application',
      id: a.id,
      title: `${a.company} — ${a.role}`,
      subtitle: a.status,
      date: null,
      done: a.status === 'rejected' || a.status === 'ghosted'
    })
  }

  // --- lectures (carry their course code, which is how you'd look for one) ---
  const lectures = db
    .prepare(
      `SELECT l.id, l.title, l.lecture_date, c.code FROM lectures l
       JOIN courses c ON c.id = l.course_id
       WHERE l.title LIKE ? ESCAPE '\\' OR l.summary LIKE ? ESCAPE '\\' OR c.code LIKE ? ESCAPE '\\'
       ORDER BY l.lecture_date DESC LIMIT ?`
    )
    .all(term, term, term, PER_MODULE) as unknown as {
    id: string
    title: string
    lecture_date: string
    code: string
  }[]
  for (const l of lectures) {
    hits.push({
      module: 'lecture',
      id: l.id,
      title: l.title,
      subtitle: `${l.code} · ${l.lecture_date}`,
      date: l.lecture_date,
      done: false
    })
  }

  // --- leetcode ---
  const problems = db
    .prepare(
      `SELECT id, title, difficulty, topic, date FROM leetcode_problems
       WHERE title LIKE ? ESCAPE '\\' OR topic LIKE ? ESCAPE '\\'
       ORDER BY date DESC LIMIT ?`
    )
    .all(term, term, PER_MODULE) as unknown as {
    id: string
    title: string
    difficulty: string
    topic: string | null
    date: string
  }[]
  for (const p of problems) {
    hits.push({
      module: 'leetcode',
      id: p.id,
      title: p.title,
      subtitle: p.topic ? `${p.difficulty} · ${p.topic}` : p.difficulty,
      date: p.date,
      done: false
    })
  }

  // --- goals (and their steps, which is where the specifics usually live) ---
  const goals = db
    .prepare(
      `SELECT g.id, g.title, g.month, g.kind, g.archived,
              (SELECT s.title FROM goal_steps s
                WHERE s.goal_id = g.id AND s.title LIKE ? ESCAPE '\\'
                ORDER BY s.sort_order LIMIT 1) AS step
       FROM goals g
       WHERE g.title LIKE ? ESCAPE '\\'
          OR EXISTS (SELECT 1 FROM goal_steps s
                      WHERE s.goal_id = g.id AND s.title LIKE ? ESCAPE '\\')
       ORDER BY g.month DESC, g.sort_order LIMIT ?`
    )
    .all(term, term, term, PER_MODULE) as unknown as {
    id: string
    title: string
    month: string
    kind: string
    archived: number
    step: string | null
  }[]
  for (const g of goals) {
    hits.push({
      module: 'goal',
      id: g.id,
      title: g.title,
      // When the match was a step rather than the goal, say which step —
      // otherwise the hit looks like it came back for no reason.
      subtitle: g.step ? `${monthLabel(g.month)} · ${g.step}` : monthLabel(g.month),
      date: `${g.month}-01`,
      done: g.archived === 1
    })
  }

  // A title that starts with what you typed is almost always the one you meant,
  // then whole-word matches, then everything else. Finished things sink.
  const q = query.toLowerCase()
  const rank = (h: SearchHit): number => {
    const t = h.title.toLowerCase()
    if (t.startsWith(q)) return 0
    if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t)) return 1
    return 2
  }
  return hits.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    const r = rank(a) - rank(b)
    if (r !== 0) return r
    return (b.date ?? '').localeCompare(a.date ?? '')
  })
}

/** "2026-09" → "Sep 2026", so a goal hit says which month it belongs to. */
function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return month
  return `${new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short' })} ${y}`
}
