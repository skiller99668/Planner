// AI auto-tagging for new tasks and series.
//
// Ground rules (enforced in CODE after the model returns — the prompt asks,
// the guards guarantee):
//   1. User tags are never removed or replaced; AI tags only merge in.
//   2. The user's existing vocabulary is preferred over inventing tags.
//   3. At most one course-code tag (e.g. ecse-200) on a task, ever. If the
//      user already set one, AI course suggestions are dropped entirely.
//   4. The row is re-read before writing so edits made while the request was
//      in flight are merged with, not clobbered.
// Fails silent: no key / offline / bad output → task simply keeps its tags.

import { chatComplete } from './groq'
import { getDb } from './db'
import { getSettings } from './settings'
import { getSeries } from './recurrence'
import { getTask } from './tasksRepo'

// dept letters + number, tolerant of "ecse200" / "ecse-200" / "ecse 200"
const COURSE_RE = /^[a-z]{2,5}[- ]?\d{2,3}[a-z]?$/

const MAX_AI_TAGS = 2
const MAX_TOTAL_TAGS = 5

export async function autoTagTask(taskId: string, notify: () => void): Promise<void> {
  await autoTag('task', taskId, notify)
}

export async function autoTagSeries(seriesId: string, notify: () => void): Promise<void> {
  await autoTag('series', seriesId, notify)
}

async function autoTag(kind: 'task' | 'series', id: string, notify: () => void): Promise<void> {
  try {
    if (!getSettings().aiAutoTag) return
    const item = kind === 'task' ? getTask(id) : getSeries(id)
    const suggested = await suggestTags(item.title, item.notes, item.tags)
    if (suggested.length === 0) return

    // Re-read: the user may have edited tags while the request was in flight.
    const fresh = kind === 'task' ? getTask(id) : getSeries(id)
    const merged = mergeTags(fresh.tags, suggested)
    if (merged.join('\n') === fresh.tags.join('\n')) return

    const now = new Date().toISOString()
    if (kind === 'task') {
      getDb()
        .prepare('UPDATE tasks SET tags = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(merged), now, id)
    } else {
      getDb()
        .prepare('UPDATE task_series SET tags = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(merged), now, id)
      // Propagate to open occurrences, merging per-row (some may be edited).
      const rows = getDb()
        .prepare(`SELECT id, tags FROM tasks WHERE series_id = ? AND status = 'open'`)
        .all(id) as unknown as { id: string; tags: string }[]
      const upd = getDb().prepare('UPDATE tasks SET tags = ?, updated_at = ? WHERE id = ?')
      for (const r of rows) {
        let existing: string[] = []
        try {
          const parsed = JSON.parse(r.tags)
          if (Array.isArray(parsed)) existing = parsed.filter((t) => typeof t === 'string')
        } catch { /* treat as untagged */ }
        upd.run(JSON.stringify(mergeTags(existing, suggested)), now, r.id)
      }
    }
    notify()
  } catch (err) {
    // Includes "not found" when the item was deleted mid-flight — fine.
    console.error(`[autoTag] skipped for ${kind} ${id}:`, err)
  }
}

async function suggestTags(
  title: string,
  notes: string | null,
  userTags: string[]
): Promise<string[]> {
  const vocab = existingVocabulary()
  const raw = await chatComplete({
    jsonObject: true,
    temperature: 0,
    maxTokens: 120,
    model: getSettings().groqModel ?? undefined,
    messages: [
      {
        role: 'system',
        content:
          'You tag tasks in a personal planner for an electrical-engineering student ' +
          '(school, labs, gym, badminton, career/internships, errands). ' +
          'Respond with ONLY a JSON object: {"tags": ["..."]}.'
      },
      {
        role: 'user',
        content: [
          `Task title: ${JSON.stringify(title)}`,
          notes ? `Notes: ${JSON.stringify(notes)}` : null,
          `Tags the user already set (do not repeat or contradict): ${JSON.stringify(userTags)}`,
          `Existing tag vocabulary (STRONGLY prefer these): ${JSON.stringify(vocab)}`,
          '',
          'Suggest 0-2 additional tags. Rules:',
          '- lowercase-kebab-case, 2-20 chars',
          '- reuse vocabulary tags whenever one fits; invent only if nothing fits',
          '- never suggest a synonym or re-spelling of a tag the user already set',
          `- course codes look like "ecse-200"; a task can have at most ONE course code, ` +
            'so if the user already set one, suggest no course code at all',
          '- when unsure, return {"tags": []}'
        ]
          .filter((l): l is string => l !== null)
          .join('\n')
      }
    ]
  })
  if (!raw) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''))
  } catch {
    return []
  }
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { tags?: unknown }).tags)
      ? (parsed as { tags: unknown[] }).tags
      : []
  return list
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim().toLowerCase().replace(/\s+/g, '-'))
    .filter((t) => t.length >= 2 && t.length <= 24)
}

/** Merge AI suggestions into user tags under the hard guards. */
export function mergeTags(userTags: string[], aiTags: string[]): string[] {
  const userHasCourse = userTags.some((t) => COURSE_RE.test(t))
  const out = [...userTags]
  let aiAdded = 0
  let courseAdded = false
  for (const tag of aiTags) {
    if (aiAdded >= MAX_AI_TAGS || out.length >= MAX_TOTAL_TAGS) break
    if (out.includes(tag)) continue
    if (COURSE_RE.test(tag)) {
      // Rule 3: never a second course code, from any source.
      if (userHasCourse || courseAdded) continue
      courseAdded = true
    }
    out.push(tag)
    aiAdded++
  }
  return out
}

function existingVocabulary(): string[] {
  const rows = getDb()
    .prepare(
      `SELECT tags FROM tasks WHERE status != 'skipped'
       UNION ALL SELECT tags FROM task_series WHERE active = 1`
    )
    .all() as unknown as { tags: string }[]
  const set = new Set<string>()
  for (const r of rows) {
    try {
      const parsed = JSON.parse(r.tags)
      if (Array.isArray(parsed)) for (const t of parsed) if (typeof t === 'string') set.add(t)
    } catch { /* skip corrupt rows */ }
  }
  return [...set].sort().slice(0, 60)
}
