// Badminton Québec calendar fetcher.
//
// They publish no whole-calendar .ics, but their events plugin (EventON) emits
// a schema.org Event JSON-LD block per event. Reading that is far steadier
// than scraping markup: it survives restyles, and the fields are already
// normalised. Fetched on demand, never polled.

import type { FeedEvent } from '../shared/types'

const CALENDAR_URL = 'https://www.badmintonquebec.com/calendrier-evenements-27388'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36'

let cache: { at: number; events: FeedEvent[] } | null = null
const CACHE_MS = 10 * 60_000

export type FeedResult =
  | { ok: true; events: FeedEvent[]; fetchedAt: string }
  | { ok: false; error: string }

export async function fetchBadmintonQuebec(force = false): Promise<FeedResult> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) {
    return { ok: true, events: cache.events, fetchedAt: new Date(cache.at).toISOString() }
  }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)
    // A default fetch UA gets filtered by their host; a browser one doesn't.
    const res = await fetch(CALENDAR_URL, {
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: 'text/html' }
    })
    clearTimeout(timer)
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const events = parseEvents(await res.text())
    if (events.length === 0) {
      return { ok: false, error: 'No events found — their calendar page may have changed' }
    }
    cache = { at: Date.now(), events }
    return { ok: true, events, fetchedAt: new Date().toISOString() }
  } catch (err) {
    const aborted = (err as Error).name === 'AbortError'
    return { ok: false, error: aborted ? 'Timed out' : (err as Error).message }
  }
}

export function parseEvents(html: string): FeedEvent[] {
  const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
  const out: FeedEvent[] = []
  const seen = new Set<string>()

  for (const [, raw] of blocks) {
    if (!/"@type"\s*:\s*"Event"/.test(raw)) continue
    // Field-by-field rather than JSON.parse: their blocks carry unescaped
    // characters that make strict parsing fail on some events.
    const title = decode(pick(raw, 'name'))
    const start = normalizeDate(pick(raw, 'startDate'))
    if (!title || !start) continue
    const url = pick(raw, 'url')
    const uid = url || `bq:${title}:${start}`
    if (seen.has(uid)) continue
    seen.add(uid)

    out.push({
      uid,
      title,
      startDate: start,
      endDate: normalizeDate(pick(raw, 'endDate')) || null,
      url: url || null,
      location: decode(pickLocationName(raw)) || null
    })
  }
  return out.sort((a, b) => a.startDate.localeCompare(b.startDate))
}

function pick(raw: string, key: string): string {
  const m = new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`).exec(raw)
  return m ? m[1].trim() : ''
}

function pickLocationName(raw: string): string {
  const loc = /"location"\s*:\s*\{([\s\S]*?)\}/.exec(raw)
  return loc ? pick(loc[1], 'name') : ''
}

/** Their dates come through unpadded, e.g. "2026-6-25". */
function normalizeDate(v: string): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v.trim())
  if (!m) return ''
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

function decode(s: string): string {
  return s
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\s+/g, ' ')
    .trim()
}
