// Posting classification shared by the Career page and the homepage rail.
// These regexes decide what a "hardware role" or a "Canadian role" is, so they
// live in one place — two copies would drift and the two surfaces would
// disagree about the same posting.

import type { JobPosting } from '../../shared/types'

// Most community lists don't carry a Hardware category, so hardware roles are
// found by title as well — otherwise the Hardware track hides almost everything.
export const HARDWARE_RE =
  /hardware|embedded|firmware|fpga|asic|vlsi|silicon|semiconductor|chip design|electrical|electronic|analog|mixed.signal|\brf\b|pcb|circuit|robotic|mechatronic|signal processing|verification engineer|physical design|power system/i

export const CANADA_RE =
  /canada|montr[eé]al|toronto|vancouver|ottawa|waterloo|qu[eé]bec|calgary|edmonton|halifax|mississauga|burnaby|kitchener|winnipeg|,\s*(on|qc|bc|ab|ns|mb|sk)\b/i

export const REMOTE_RE = /remote|anywhere/i

export function matchesTrack(p: JobPosting, focus: 'swe' | 'hardware'): boolean {
  return focus === 'hardware'
    ? p.category === 'Hardware' || HARDWARE_RE.test(p.title)
    : p.category !== 'Hardware' // software track = everything but tagged hardware
}

export function isCanadian(p: JobPosting): boolean {
  return p.locations.some((l) => CANADA_RE.test(l))
}

export function isRemote(p: JobPosting): boolean {
  return p.locations.some((l) => REMOTE_RE.test(l))
}

/** The handful worth showing on the homepage: the user's track, Canadian roles
 *  first (they're the ones that are actually applicable), then the rest.
 *
 *  One posting per company — the big lists carry a dozen near-identical reqs
 *  from the same employer, and four rows of the same two names tells you less
 *  than four different ones. */
export function topPostings(
  postings: JobPosting[],
  focus: 'swe' | 'hardware',
  limit = 4
): JobPosting[] {
  const onTrack = postings.filter((p) => matchesTrack(p, focus))
  const ranked = [...onTrack.filter(isCanadian), ...onTrack.filter((p) => !isCanadian(p))]

  const seen = new Set<string>()
  const out: JobPosting[] = []
  for (const p of ranked) {
    const company = p.company.trim().toLowerCase()
    if (seen.has(company)) continue
    seen.add(company)
    out.push(p)
    if (out.length === limit) break
  }
  return out
}
