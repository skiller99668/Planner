// Live internship feed aggregated from community-maintained GitHub repos.
// Two shapes are supported:
//   - JSON  : SimplifyJobs-style listings.json (also used by forks)
//   - MD    : speedyapply-style markdown tables (Company|Position|Location|…)
// All sources are public, fetched on demand (button press), cached 10 minutes,
// merged and de-duplicated by application URL. A dead source degrades to a
// warning line, never an empty page.

import type { JobPosting } from '../shared/types'

interface SourceDef {
  id: string
  label: string
  kind: 'json' | 'markdown'
  urls: string[] // tried in order until one responds
  category: string // fallback category for markdown rows
  /** True when every listing in the file belongs to the 2027 cycle, so rows
   *  need no term/season check (e.g. vanshb03 tags season "Summer", no year).
   *  False for files that also carry older cycles (SimplifyJobs). */
  repoScoped?: boolean
}

const SOURCES: SourceDef[] = [
  {
    id: 'simplify',
    label: 'SimplifyJobs',
    kind: 'json',
    urls: [
      'https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json',
      'https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/main/.github/scripts/listings.json'
    ],
    category: 'Software'
  },
  {
    id: 'vansh',
    label: 'vanshb03',
    kind: 'json',
    urls: [
      'https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/dev/.github/scripts/listings.json',
      'https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/main/.github/scripts/listings.json'
    ],
    category: 'Software',
    repoScoped: true
  },
  {
    id: 'speedy-swe-intl',
    label: 'speedyapply SWE (intl)',
    kind: 'markdown',
    urls: ['https://raw.githubusercontent.com/speedyapply/2027-SWE-College-Jobs/main/INTERN_INTL.md'],
    category: 'Software'
  },
  {
    id: 'speedy-swe-usa',
    label: 'speedyapply SWE (US)',
    kind: 'markdown',
    urls: ['https://raw.githubusercontent.com/speedyapply/2027-SWE-College-Jobs/main/README.md'],
    category: 'Software'
  },
  {
    id: 'speedy-ai-intl',
    label: 'speedyapply AI (intl)',
    kind: 'markdown',
    urls: ['https://raw.githubusercontent.com/speedyapply/2027-AI-College-Jobs/main/INTERN_INTL.md'],
    category: 'AI/ML/Data'
  },
  {
    id: 'speedy-ai-usa',
    label: 'speedyapply AI (US)',
    kind: 'markdown',
    urls: ['https://raw.githubusercontent.com/speedyapply/2027-AI-College-Jobs/main/README.md'],
    category: 'AI/ML/Data'
  }
]

const CACHE_MS = 10 * 60_000
const MAX_POSTINGS = 1200
const FETCH_TIMEOUT_MS = 30_000

export interface SourceStatus {
  id: string
  label: string
  ok: boolean
  count: number
  error?: string
}

export type JobsFeedResult =
  | { ok: true; postings: JobPosting[]; fetchedAt: string; sources: SourceStatus[] }
  | { ok: false; error: string }

let cache: { at: number; postings: JobPosting[]; sources: SourceStatus[] } | null = null

export async function fetchJobs(force = false): Promise<JobsFeedResult> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) {
    return {
      ok: true,
      postings: cache.postings,
      fetchedAt: new Date(cache.at).toISOString(),
      sources: cache.sources
    }
  }

  const results = await Promise.all(SOURCES.map(loadSource))
  const sources = results.map((r) => r.status)
  const merged = dedupe(results.flatMap((r) => r.postings))

  if (merged.length === 0) {
    const why = sources.find((s) => !s.ok)?.error ?? 'no postings returned'
    return { ok: false, error: why }
  }

  cache = { at: Date.now(), postings: merged, sources }
  return { ok: true, postings: merged, fetchedAt: new Date().toISOString(), sources }
}

async function loadSource(
  src: SourceDef
): Promise<{ postings: JobPosting[]; status: SourceStatus }> {
  let lastError = 'unreachable'
  for (const url of src.urls) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timer)
      if (!res.ok) {
        lastError = `HTTP ${res.status}`
        continue
      }
      const body = await res.text()
      const postings =
        src.kind === 'json' ? parseJsonListings(body, src) : parseMarkdownTables(body, src)
      return {
        postings,
        status: { id: src.id, label: src.label, ok: true, count: postings.length }
      }
    } catch (err) {
      lastError = (err as Error).name === 'AbortError' ? 'timed out' : (err as Error).message
    }
  }
  return {
    postings: [],
    status: { id: src.id, label: src.label, ok: false, count: 0, error: lastError }
  }
}

// ---------- JSON (SimplifyJobs shape) ----------

interface RawListing {
  id?: string
  company_name?: string
  title?: string
  category?: string
  active?: boolean
  is_visible?: boolean
  terms?: string[]
  season?: string
  locations?: string[]
  url?: string
  date_posted?: number // unix seconds
}

function parseJsonListings(body: string, src: SourceDef): JobPosting[] {
  let raw: RawListing[]
  try {
    raw = JSON.parse(body) as RawListing[]
  } catch {
    return []
  }
  const freshCutoff = Date.now() / 1000 - 90 * 86_400
  return raw
    .filter((r) => {
      if (r.active !== true || r.is_visible === false) return false
      if (!r.company_name || !r.title || !r.url) return false
      if (src.repoScoped) return true // whole file is the 2027 cycle
      const terms = [...(r.terms ?? []), r.season ?? ''].join(' ')
      if (/2027/.test(terms)) return true
      // Untermed rows: keep only recent ones so stale postings don't pile up.
      return terms.trim() === '' && (r.date_posted ?? 0) >= freshCutoff
    })
    .map((r) => ({
      id: `${src.id}:${r.id ?? r.url!}`,
      company: clean(r.company_name!),
      title: clean(r.title!),
      category: r.category ?? src.category,
      locations: (r.locations ?? []).map(clean).filter(Boolean).slice(0, 4),
      url: r.url!,
      salary: null,
      source: src.label,
      postedAt: r.date_posted ? new Date(r.date_posted * 1000).toISOString() : null
    }))
}

// ---------- Markdown tables (speedyapply shape) ----------

function parseMarkdownTables(body: string, src: SourceDef): JobPosting[] {
  const out: JobPosting[] = []
  const lines = body.split(/\r?\n/)
  let cols: Record<string, number> | null = null

  for (const line of lines) {
    if (!line.startsWith('|')) {
      cols = null // a table ended
      continue
    }
    const cells = splitRow(line)
    // Header row defines the column layout (US files add a Salary column).
    if (/^company$/i.test(stripTags(cells[0] ?? ''))) {
      cols = {}
      cells.forEach((c, i) => {
        cols![stripTags(c).trim().toLowerCase()] = i
      })
      continue
    }
    if (!cols || /^-+$/.test(stripTags(cells[0] ?? '').replace(/[|: ]/g, ''))) continue

    const company = clean(stripTags(cells[cols.company ?? 0] ?? ''))
    const title = clean(stripTags(cells[cols.position ?? 1] ?? ''))
    const postingCell = cells[cols.posting ?? cells.length - 2] ?? ''
    const url = firstHref(postingCell)
    // Rows without an apply link are closed/locked listings.
    if (!company || !title || !url) continue

    const locationRaw = cells[cols.location ?? 2] ?? ''
    const salary = clean(stripTags(cells[cols.salary ?? -1] ?? ''))
    const age = clean(stripTags(cells[cols.age ?? cells.length - 1] ?? ''))

    out.push({
      id: `${src.id}:${url}`,
      company,
      title,
      category: src.category,
      locations: stripTags(locationRaw.replace(/<br\s*\/?>/gi, '|'))
        .split('|')
        .map(clean)
        .filter(Boolean)
        .slice(0, 4),
      url,
      salary: salary && salary !== '-' ? salary : null,
      source: src.label,
      postedAt: ageToIso(age)
    })
  }
  return out
}

function splitRow(line: string): string[] {
  // Trim the leading/trailing pipe, then split on the remaining ones.
  // Cell content is HTML but never contains a raw '|'.
  const inner = line.replace(/^\|/, '').replace(/\|\s*$/, '')
  return inner.split('|').map((c) => c.trim())
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
}

function firstHref(cell: string): string | null {
  const m = /href="([^"]+)"/i.exec(cell)
  if (!m) return null
  const url = m[1].trim()
  return /^https?:\/\//i.test(url) ? url : null
}

/** "4d" / "17h" / "3mo" / "1yr" → approximate ISO timestamp. */
function ageToIso(age: string): string | null {
  const m = /^(\d+)\s*(h|d|w|mo|yr?)$/i.exec(age.trim())
  if (!m) return null
  const n = Number(m[1])
  const unitMs: Record<string, number> = {
    h: 3600_000,
    d: 86_400_000,
    w: 7 * 86_400_000,
    mo: 30 * 86_400_000,
    y: 365 * 86_400_000,
    yr: 365 * 86_400_000
  }
  const ms = unitMs[m[2].toLowerCase()]
  if (!ms) return null
  return new Date(Date.now() - n * ms).toISOString()
}

// ---------- merge ----------

function dedupe(list: JobPosting[]): JobPosting[] {
  const byKey = new Map<string, JobPosting>()
  for (const p of list) {
    const key = normalizeUrl(p.url)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, p)
      continue
    }
    // Keep the richer record: prefer one with a salary, then a known date.
    const better =
      (p.salary && !existing.salary) || (!existing.postedAt && p.postedAt) ? p : existing
    // Preserve the earliest known posting date and any salary we've seen.
    byKey.set(key, {
      ...better,
      salary: better.salary ?? existing.salary ?? p.salary ?? null,
      postedAt: existing.postedAt ?? p.postedAt ?? null
    })
  }
  return [...byKey.values()]
    .sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''))
    .slice(0, MAX_POSTINGS)
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    // Tracking params differ between lists for the same posting.
    return `${u.host.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

function clean(s: string): string {
  return s
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '') // emoji/badges
    .replace(/\s+/g, ' ')
    .trim()
}
