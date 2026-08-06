// LeetCode problem log. One row per solved problem (manual or synced). This is
// the source of truth for the Career page's weekly "dsa" count. Weekly/streak
// math lives in the renderer (src/lib/useLeetcode.ts).

import type {
  LeetcodeDifficulty,
  LeetcodeLogInput,
  LeetcodePatch,
  LeetcodeProblem,
  LeetcodeSyncResult
} from '../shared/types'
import { getDb } from './db'
import { fetchProblemMeta, fetchRecentSolves } from './leetcodeFeed'

interface LcRow {
  id: string
  date: string
  title: string
  slug: string | null
  difficulty: string
  topic: string | null
  url: string | null
  notes: string | null
  source: string
  created_at: string
}

function rowToProblem(r: LcRow): LeetcodeProblem {
  return {
    id: r.id,
    date: r.date,
    title: r.title,
    slug: r.slug,
    difficulty: r.difficulty as LeetcodeDifficulty,
    topic: r.topic,
    url: r.url,
    notes: r.notes,
    source: r.source === 'leetcode' ? 'leetcode' : 'manual',
    createdAt: r.created_at
  }
}

function urlFor(slug: string | null | undefined, explicit?: string | null): string | null {
  if (explicit) return explicit
  return slug ? `https://leetcode.com/problems/${slug}/` : null
}

export function listLeetcode(): LeetcodeProblem[] {
  const rows = getDb()
    .prepare('SELECT * FROM leetcode_problems ORDER BY date DESC, created_at DESC')
    .all() as unknown as LcRow[]
  return rows.map(rowToProblem)
}

export function logLeetcode(input: LeetcodeLogInput): LeetcodeProblem {
  const id = crypto.randomUUID()
  getDb()
    .prepare(
      `INSERT INTO leetcode_problems (id, date, title, slug, difficulty, topic, url, notes, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)`
    )
    .run(
      id,
      input.date,
      input.title.trim(),
      input.slug ?? null,
      input.difficulty,
      input.topic?.trim() || null,
      urlFor(input.slug, input.url),
      input.notes?.trim() || null,
      new Date().toISOString()
    )
  return getLeetcode(id)
}

export function updateLeetcode(id: string, patch: LeetcodePatch): LeetcodeProblem {
  const cur = getLeetcode(id)
  getDb()
    .prepare(
      `UPDATE leetcode_problems
         SET date = ?, title = ?, difficulty = ?, topic = ?, url = ?, notes = ?
       WHERE id = ?`
    )
    .run(
      patch.date ?? cur.date,
      (patch.title ?? cur.title).trim(),
      patch.difficulty ?? cur.difficulty,
      patch.topic !== undefined ? patch.topic : cur.topic,
      patch.url !== undefined ? patch.url : cur.url,
      patch.notes !== undefined ? patch.notes : cur.notes,
      id
    )
  return getLeetcode(id)
}

export function deleteLeetcode(id: string): void {
  getDb().prepare('DELETE FROM leetcode_problems WHERE id = ?').run(id)
}

/** Pull recent accepted solves for a username; insert the new ones. Best-effort. */
export async function syncLeetcode(username: string): Promise<LeetcodeSyncResult> {
  const name = username.trim()
  if (!name) return { added: 0, warning: 'Add a LeetCode username first.' }

  const recent = await fetchRecentSolves(name, true)
  if (!recent.ok) return { added: 0, warning: `LeetCode sync failed: ${recent.error}` }

  const db = getDb()
  const exists = db.prepare(
    `SELECT 1 FROM leetcode_problems WHERE slug = ? AND date = ? AND source = 'leetcode' LIMIT 1`
  )
  const insert = db.prepare(
    `INSERT OR IGNORE INTO leetcode_problems
       (id, date, title, slug, difficulty, topic, url, notes, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'leetcode', ?)`
  )

  let added = 0
  // Oldest first so a run of new solves reads chronologically in the history.
  for (const s of [...recent.solves].reverse()) {
    if (exists.get(s.slug, s.date)) continue
    const meta = await fetchProblemMeta(s.slug)
    const info = insert.run(
      crypto.randomUUID(),
      s.date,
      s.title,
      s.slug,
      meta.difficulty,
      meta.topic,
      `https://leetcode.com/problems/${s.slug}/`,
      new Date().toISOString()
    ) as { changes: number | bigint }
    added += Number(info.changes)
  }
  return { added }
}

function getLeetcode(id: string): LeetcodeProblem {
  const row = getDb().prepare('SELECT * FROM leetcode_problems WHERE id = ?').get(id) as
    | LcRow
    | undefined
  if (!row) throw new Error(`LeetCode problem not found: ${id}`)
  return rowToProblem(row)
}
