// Tag vocabulary: the `tags` table UNION every tag currently in use on a
// task or series. Standalone tags can be created before any task uses them;
// deleting a tag also strips it from everything that carries it.

import { TAG_COLORS, type Tag } from '../shared/types'
import { getDb } from './db'

/** Same normalisation as the renderer's picker, enforced server-side too. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-+#.]/g, '')
    .slice(0, 24)
}

function parseTags(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

export function listTags(): Tag[] {
  const db = getDb()
  const chosen = new Map<string, string | null>()
  for (const r of db.prepare('SELECT name, color FROM tags').all() as unknown as {
    name: string
    color: string | null
  }[]) {
    chosen.set(r.name, r.color)
  }

  const names = new Set<string>(chosen.keys())
  const rows = db
    .prepare(
      `SELECT tags FROM tasks WHERE status != 'skipped'
       UNION ALL SELECT tags FROM task_series WHERE active = 1`
    )
    .all() as unknown as { tags: string }[]
  for (const r of rows) for (const t of parseTags(r.tags)) names.add(t)

  // Assign a colour to anything that hasn't got one, choosing the least-used
  // swatch so a handful of tags spread across the palette instead of
  // clustering on whatever a name hash happens to land on. Persisted on first
  // sight, so a tag's colour never changes underneath the user afterwards.
  const sorted = [...names].sort()
  const counts = new Map<string, number>(TAG_COLORS.map((c) => [c, 0]))
  for (const c of chosen.values()) {
    if (c && counts.has(c)) counts.set(c, counts.get(c)! + 1)
  }
  const assign = db.prepare(
    `INSERT INTO tags (name, created_at, color) VALUES (?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET color = excluded.color`
  )
  const now = new Date().toISOString()
  const out: Tag[] = []
  for (const name of sorted) {
    let color = chosen.get(name) ?? null
    if (!color) {
      let best: string = TAG_COLORS[0]
      for (const c of TAG_COLORS) if (counts.get(c)! < counts.get(best)!) best = c
      color = best
      counts.set(color, counts.get(color)! + 1)
      assign.run(name, now, color)
    }
    out.push({ name, color })
  }
  return out
}

export function createTag(raw: string, color?: string): Tag[] {
  const name = normalizeTag(raw)
  if (name.length >= 1) {
    const valid = color && (TAG_COLORS as readonly string[]).includes(color) ? color : null
    getDb()
      .prepare(
        `INSERT INTO tags (name, created_at, color) VALUES (?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET color = COALESCE(excluded.color, tags.color)`
      )
      .run(name, new Date().toISOString(), valid)
  }
  return listTags()
}

/** A tag may exist only inside tasks.tags, so this upserts the row. */
export function setTagColor(raw: string, color: string): Tag[] {
  const name = normalizeTag(raw)
  if (name) {
    getDb()
      .prepare(
        `INSERT INTO tags (name, created_at, color) VALUES (?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET color = excluded.color`
      )
      .run(name, new Date().toISOString(), color)
  }
  return listTags()
}

/** Removes the tag from the vocabulary and from every task/series using it. */
export function deleteTag(name: string): Tag[] {
  const db = getDb()
  db.prepare('DELETE FROM tags WHERE name = ?').run(name)

  for (const [table, where] of [
    ['tasks', "status != 'skipped'"],
    ['task_series', 'active = 1']
  ] as const) {
    const rows = db
      .prepare(`SELECT id, tags FROM ${table} WHERE ${where} AND tags LIKE ?`)
      .all(`%"${name}"%`) as unknown as { id: string; tags: string }[]
    const update = db.prepare(`UPDATE ${table} SET tags = ?, updated_at = ? WHERE id = ?`)
    const now = new Date().toISOString()
    for (const r of rows) {
      const kept = parseTags(r.tags).filter((t) => t !== name)
      if (kept.length !== parseTags(r.tags).length) {
        update.run(JSON.stringify(kept), now, r.id)
      }
    }
  }
  return listTags()
}
