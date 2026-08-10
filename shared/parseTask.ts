// Natural-language quick add: "lab report fri 5pm !high #ecse200" becomes a
// TaskInput with the date, time, priority and tags stripped out of the title.
//
// Deliberately local and synchronous. The assistant can do this too, but that's
// a network round-trip to Groq that needs an API key — far too slow for the
// thing you use to catch a thought before it's gone. This runs on every
// keystroke instead, so the quick-add box can show you what it understood.
//
// The rule throughout: only consume a token when it is unambiguously a
// modifier. Anything not recognized stays in the title, because silently
// eating a word out of someone's task is much worse than missing a date.

// Lives in shared/ rather than src/ because it's pure domain logic with no
// renderer or Node dependency, and main runs it headlessly to verify it
// (PLANNER_PARSE_TEST). It carries its own two date helpers so shared/ never
// has to reach back into the renderer for them.

import type { Priority, TaskInput } from './types'

function todayYMD(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function addDaysYMD(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const s = new Date(y, m - 1, d + days)
  return `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`
}

export interface ParsedTask extends TaskInput {
  /** The chunks that were consumed, for the "what I understood" hint. */
  matched: { label: string; kind: 'date' | 'time' | 'priority' | 'tag' }[]
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6
}

const PRIORITY_WORDS: Record<string, Priority> = {
  low: 1,
  med: 2, medium: 2,
  high: 3, urgent: 3
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12
}

/** Day-of-week index for a YYYY-MM-DD, 0=Sun, in local time. */
function dowOf(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

/** The next date falling on `dow`. Today only counts when `includeToday`. */
function nextWeekday(from: string, dow: number, includeToday: boolean): string {
  const delta = (dow - dowOf(from) + 7) % 7
  return addDaysYMD(from, delta === 0 && !includeToday ? 7 : delta)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Clamp a day to the length of its month so "feb 31" can't produce Mar 3. */
function clampDay(year: number, month: number, day: number): string {
  const last = new Date(year, month, 0).getDate()
  return `${year}-${pad(month)}-${pad(Math.min(day, last))}`
}

export function parseTask(raw: string, today = todayYMD()): ParsedTask {
  const matched: ParsedTask['matched'] = []
  let dueDate: string | null = null
  let dueTime: string | null = null
  let priority: Priority = 0
  const tags: string[] = []

  // Work on tokens so a modifier is only ever a whole word — "sat" must not be
  // pulled out of "saturate", and "#" only tags when it starts a token.
  const tokens = raw.split(/\s+/).filter(Boolean)
  const kept: string[] = []

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    const low = tok.toLowerCase()

    // #tag — normalized the same way the tag picker does, so quick-add and the
    // editor can never create two spellings of one tag.
    if (low.startsWith('#') && low.length > 1) {
      const tag = normalizeTagToken(low.slice(1))
      if (tag) {
        tags.push(tag)
        matched.push({ label: `#${tag}`, kind: 'tag' })
        continue
      }
    }

    // !high / !2
    if (low.startsWith('!') && low.length > 1) {
      const word = low.slice(1)
      const p = PRIORITY_WORDS[word] ?? (/^[1-3]$/.test(word) ? (Number(word) as Priority) : null)
      if (p) {
        priority = p
        matched.push({ label: `!${word}`, kind: 'priority' })
        continue
      }
    }

    // Times: 5pm, 5:30pm, 17:00. A bare "5" is never a time — far too eager.
    if (dueTime === null) {
      const t = parseTime(low)
      if (t) {
        dueTime = t
        matched.push({ label: low, kind: 'time' })
        continue
      }
    }

    if (dueDate === null) {
      // today / tomorrow / tmr
      if (low === 'today' || low === 'tonight') {
        dueDate = today
        matched.push({ label: low, kind: 'date' })
        continue
      }
      if (low === 'tomorrow' || low === 'tmr' || low === 'tmrw') {
        dueDate = addDaysYMD(today, 1)
        matched.push({ label: low, kind: 'date' })
        continue
      }

      // "next friday" — consume both tokens, and always mean the *following*
      // week's one even if today is a Friday.
      if (low === 'next' && i + 1 < tokens.length) {
        const nextTok = tokens[i + 1].toLowerCase().replace(/[.,]$/, '')
        if (nextTok in WEEKDAYS) {
          dueDate = addDaysYMD(nextWeekday(today, WEEKDAYS[nextTok], false), 7)
          matched.push({ label: `next ${nextTok}`, kind: 'date' })
          i++
          continue
        }
        if (nextTok === 'week') {
          dueDate = addDaysYMD(today, 7)
          matched.push({ label: 'next week', kind: 'date' })
          i++
          continue
        }
      }

      // Bare weekday — the soonest one that isn't today.
      const bare = low.replace(/[.,]$/, '')
      if (bare in WEEKDAYS) {
        dueDate = nextWeekday(today, WEEKDAYS[bare], false)
        matched.push({ label: bare, kind: 'date' })
        continue
      }

      // "aug 14" / "14 aug"
      const monthName = bare in MONTHS ? bare : null
      if (monthName && i + 1 < tokens.length) {
        const dayTok = tokens[i + 1].replace(/(st|nd|rd|th)$/i, '').replace(/[.,]$/, '')
        if (/^\d{1,2}$/.test(dayTok)) {
          dueDate = resolveMonthDay(today, MONTHS[monthName], Number(dayTok))
          matched.push({ label: `${bare} ${dayTok}`, kind: 'date' })
          i++
          continue
        }
      }
      const asDay = bare.replace(/(st|nd|rd|th)$/i, '')
      if (/^\d{1,2}$/.test(asDay) && i + 1 < tokens.length) {
        const monthTok = tokens[i + 1].toLowerCase().replace(/[.,]$/, '')
        if (monthTok in MONTHS) {
          dueDate = resolveMonthDay(today, MONTHS[monthTok], Number(asDay))
          matched.push({ label: `${asDay} ${monthTok}`, kind: 'date' })
          i++
          continue
        }
      }

      // 2026-08-14
      if (/^\d{4}-\d{2}-\d{2}$/.test(bare)) {
        dueDate = bare
        matched.push({ label: bare, kind: 'date' })
        continue
      }
    }

    kept.push(tok)
  }

  // A time with no date means today — "call mom 6pm" is about tonight.
  if (dueTime && !dueDate) dueDate = today

  return {
    title: kept.join(' ').replace(/\s+/g, ' ').trim(),
    dueDate,
    dueTime,
    priority,
    tags,
    matched
  }
}

/** "5pm", "5:30pm", "17:00", "9a" → "HH:mm". Bare numbers are rejected. */
function parseTime(tok: string): string | null {
  const ampm = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)$/.exec(tok)
  if (ampm) {
    let h = Number(ampm[1])
    if (h < 1 || h > 12) return null
    const m = ampm[2] ? Number(ampm[2]) : 0
    if (m > 59) return null
    const isPm = ampm[3][0] === 'p'
    if (isPm && h !== 12) h += 12
    if (!isPm && h === 12) h = 0
    return `${pad(h)}:${pad(m)}`
  }
  // 24-hour only with an explicit colon, so "17" alone stays in the title.
  const h24 = /^(\d{1,2}):(\d{2})$/.exec(tok)
  if (h24) {
    const h = Number(h24[1])
    const m = Number(h24[2])
    if (h > 23 || m > 59) return null
    return `${pad(h)}:${pad(m)}`
  }
  return null
}

/** A month/day with no year means the next time it happens. */
function resolveMonthDay(today: string, month: number, day: number): string {
  const year = Number(today.slice(0, 4))
  const candidate = clampDay(year, month, day)
  return candidate >= today ? candidate : clampDay(year + 1, month, day)
}

/**
 * Snap parsed tags onto the vocabulary already in use.
 *
 * Typing `#ecse200` should land on the existing `ecse-200` rather than create a
 * near-twin — nobody types the hyphen, but the tag picker produces one from
 * "ECSE 200". Matching ignores separators entirely, so ecse200 / ecse-200 /
 * ECSE.200 all resolve to whichever spelling the vocabulary already holds.
 *
 * Kept out of parseTask itself: the parser stays pure and vocabulary-free, and
 * only callers that have the tag list (quick add, the palette) reconcile.
 */
export function reconcileTags(parsed: string[], known: string[]): string[] {
  const bare = (s: string) => s.replace(/[^a-z0-9]/g, '')
  const byBare = new Map(known.map((k) => [bare(k), k]))
  const out: string[] = []
  for (const tag of parsed) {
    const hit = byBare.get(bare(tag)) ?? tag
    if (!out.includes(hit)) out.push(hit)
  }
  return out
}

/** Mirrors TaskEditor's normalizeTag — lowercase-kebab, so a tag written here
 *  and a tag written there are the same tag. */
function normalizeTagToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-+#.]/g, '')
    .slice(0, 24)
}
