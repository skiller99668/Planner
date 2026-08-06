// Best-effort LeetCode sync via the site's (unofficial) GraphQL endpoint.
// On-demand only, browser-like headers, short cache, and every failure degrades
// to a warning string — never throws to the UI. Two queries:
//   - recentAcSubmissionList(username) → recent accepted solves (title, slug, ts)
//   - question(titleSlug) → difficulty + topic tags (fetched only for new slugs)

import type { LeetcodeDifficulty } from '../shared/types'

const GRAPHQL = 'https://leetcode.com/graphql'
const TIMEOUT_MS = 20_000
const RECENT_CACHE_MS = 10 * 60_000
const RECENT_LIMIT = 20

export interface RawSolve {
  title: string
  slug: string
  date: string // YYYY-MM-DD (local)
}

export interface ProblemMeta {
  difficulty: LeetcodeDifficulty
  topic: string | null
}

export type RecentResult = { ok: true; solves: RawSolve[] } | { ok: false; error: string }

const recentCache = new Map<string, { at: number; solves: RawSolve[] }>()
const metaCache = new Map<string, ProblemMeta>()

const RECENT_QUERY = `query recentAc($username: String!, $limit: Int!) {
  recentAcSubmissionList(username: $username, limit: $limit) { title titleSlug timestamp }
}`

const META_QUERY = `query q($titleSlug: String!) {
  question(titleSlug: $titleSlug) { difficulty topicTags { name } }
}`

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(GRAPHQL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        // LeetCode blocks non-browser agents; present as one.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Referer: 'https://leetcode.com',
        Origin: 'https://leetcode.com'
      },
      body: JSON.stringify({ query, variables })
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] }
    if (json.errors?.length) throw new Error(json.errors[0].message)
    if (!json.data) throw new Error('no data returned')
    return json.data
  } finally {
    clearTimeout(timer)
  }
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function normDifficulty(d: string | undefined): LeetcodeDifficulty {
  const s = (d ?? '').toLowerCase()
  return s === 'easy' || s === 'hard' ? s : 'medium'
}

/** Recent accepted solves for a username (10-min cache; `force` bypasses it). */
export async function fetchRecentSolves(username: string, force = false): Promise<RecentResult> {
  const key = username.toLowerCase()
  const cached = recentCache.get(key)
  if (!force && cached && Date.now() - cached.at < RECENT_CACHE_MS) {
    return { ok: true, solves: cached.solves }
  }
  try {
    const data = await graphql<{
      recentAcSubmissionList: { title: string; titleSlug: string; timestamp: string }[] | null
    }>(RECENT_QUERY, { username, limit: RECENT_LIMIT })
    const solves: RawSolve[] = (data.recentAcSubmissionList ?? []).map((s) => ({
      title: s.title,
      slug: s.titleSlug,
      date: ymd(new Date(Number(s.timestamp) * 1000))
    }))
    recentCache.set(key, { at: Date.now(), solves })
    return { ok: true, solves }
  } catch (err) {
    const msg = (err as Error).name === 'AbortError' ? 'timed out' : (err as Error).message
    return { ok: false, error: msg }
  }
}

/** Difficulty + primary topic for a problem slug (per-process cache; never throws). */
export async function fetchProblemMeta(slug: string): Promise<ProblemMeta> {
  const cached = metaCache.get(slug)
  if (cached) return cached
  try {
    const data = await graphql<{
      question: { difficulty: string; topicTags: { name: string }[] } | null
    }>(META_QUERY, { titleSlug: slug })
    const q = data.question
    const meta: ProblemMeta = {
      difficulty: normDifficulty(q?.difficulty),
      topic: q?.topicTags?.[0]?.name ?? null
    }
    metaCache.set(slug, meta)
    return meta
  } catch {
    // Unknown difficulty defaults to medium; the user can correct it after sync.
    return { difficulty: 'medium', topic: null }
  }
}
