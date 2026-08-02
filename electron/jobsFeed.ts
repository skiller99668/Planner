// Live internship feed from the SimplifyJobs Summer-Internships repo — the
// community-maintained list this app's user would otherwise refresh by hand.
// Public repo, machine-readable listings.json, no auth. Fetched on demand
// (button press), cached 10 minutes, never polled in the background.

import type { JobPosting } from '../shared/types'

const SOURCES = [
  'https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json',
  'https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/main/.github/scripts/listings.json'
]

const CACHE_MS = 10 * 60_000
const MAX_POSTINGS = 400

interface RawListing {
  id?: string
  company_name?: string
  title?: string
  category?: string
  active?: boolean
  terms?: string[]
  locations?: string[]
  url?: string
  date_posted?: number // unix seconds
}

let cache: { at: number; postings: JobPosting[] } | null = null

export type JobsFeedResult =
  | { ok: true; postings: JobPosting[]; fetchedAt: string }
  | { ok: false; error: string }

export async function fetchJobs(): Promise<JobsFeedResult> {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return { ok: true, postings: cache.postings, fetchedAt: new Date(cache.at).toISOString() }
  }

  let lastError = 'No source reachable'
  for (const url of SOURCES) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 30_000)
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timer)
      if (!res.ok) {
        lastError = `HTTP ${res.status} from ${new URL(url).pathname.split('/')[2]}`
        continue
      }
      const raw = (await res.json()) as RawListing[]
      const postings = normalize(raw)
      cache = { at: Date.now(), postings }
      return { ok: true, postings, fetchedAt: new Date().toISOString() }
    } catch (err) {
      lastError = (err as Error).name === 'AbortError' ? 'Request timed out' : (err as Error).message
    }
  }
  return { ok: false, error: lastError }
}

function normalize(raw: RawListing[]): JobPosting[] {
  const cutoff = Date.now() / 1000 - 60 * 86_400 // for untermed entries
  return raw
    .filter((r) => {
      if (r.active !== true || !r.company_name || !r.title || !r.url) return false
      const terms = r.terms ?? []
      if (terms.includes('Summer 2027')) return true
      // Some postings carry no term — keep only fresh ones.
      return terms.length === 0 && (r.date_posted ?? 0) >= cutoff
    })
    .sort((a, b) => (b.date_posted ?? 0) - (a.date_posted ?? 0))
    .slice(0, MAX_POSTINGS)
    .map((r) => ({
      id: r.id ?? r.url!,
      company: r.company_name!,
      title: r.title!,
      category: r.category ?? 'Software',
      locations: (r.locations ?? []).slice(0, 4),
      url: r.url!,
      postedAt: r.date_posted ? new Date(r.date_posted * 1000).toISOString() : null
    }))
}
