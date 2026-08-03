// Tag vocabulary: the `tags` table UNION every tag currently in use on a
// task or series. Standalone tags can be created before any task uses them;
// deleting a tag also strips it from everything that carries it.

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

export function listTags(): string[] {
  const db = getDb()
  const set = new Set<string>()
  for (const r of db.prepare('SELECT name FROM tags').all() as unknown as { name: string }[]) {
    set.add(r.name)
  }
  const rows = db
    .prepare(
      `SELECT tags FROM tasks WHERE status != 'skipped'
       UNION ALL SELECT tags FROM task_series WHERE active = 1`
    )
    .all() as unknown as { tags: string }[]
  for (const r of rows) for (const t of parseTags(r.tags)) set.add(t)
  return [...set].sort()
}

export function createTag(raw: string): string[] {
  const name = normalizeTag(raw)
  if (name.length >= 2) {
    getDb()
      .prepare('INSERT INTO tags (name, created_at) VALUES (?, ?) ON CONFLICT(name) DO NOTHING')
      .run(name, new Date().toISOString())
  }
  return listTags()
}

/** Removes the tag from the vocabulary and from every task/series using it. */
export function deleteTag(name: string): string[] {
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
