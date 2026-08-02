// Minimal ICS (RFC 5545) VEVENT parser — enough for Badminton Québec and
// McGill calendar exports. Handles line unfolding, DATE vs DATE-TIME values,
// UTC ("Z") vs floating/TZID times (treated as local wall time, which is
// correct for events in the user's own timezone).

import crypto from 'node:crypto'

export interface IcsEvent {
  uid: string
  summary: string
  startAt: string // ISO
  endAt: string | null
  location: string | null
  url: string | null
  description: string | null
}

export function parseIcs(text: string): IcsEvent[] {
  // Unfold: CRLF (or LF) followed by space/tab continues the previous line.
  const unfolded = text.replace(/\r?\n[ \t]/g, '')
  const lines = unfolded.split(/\r?\n/)

  const events: IcsEvent[] = []
  let cur: Record<string, { params: string; value: string }> | null = null

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      cur = {}
      continue
    }
    if (line === 'END:VEVENT') {
      if (cur) {
        const ev = toEvent(cur)
        if (ev) events.push(ev)
      }
      cur = null
      continue
    }
    if (!cur) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const left = line.slice(0, colon)
    const value = line.slice(colon + 1)
    const semi = left.indexOf(';')
    const name = (semi < 0 ? left : left.slice(0, semi)).toUpperCase()
    const params = semi < 0 ? '' : left.slice(semi + 1)
    cur[name] = { params, value }
  }
  return events
}

function toEvent(props: Record<string, { params: string; value: string }>): IcsEvent | null {
  const summary = unescapeText(props.SUMMARY?.value ?? '').trim()
  const start = props.DTSTART ? parseIcsDate(props.DTSTART.params, props.DTSTART.value) : null
  if (!summary || !start) return null
  const end = props.DTEND ? parseIcsDate(props.DTEND.params, props.DTEND.value) : null
  const uid =
    props.UID?.value.trim() ||
    `ics-${crypto.createHash('sha1').update(`${summary}|${start}`).digest('hex').slice(0, 16)}`
  return {
    uid,
    summary,
    startAt: start,
    endAt: end,
    location: unescapeText(props.LOCATION?.value ?? '').trim() || null,
    url: props.URL?.value.trim() || null,
    description: unescapeText(props.DESCRIPTION?.value ?? '').trim() || null
  }
}

function parseIcsDate(params: string, value: string): string | null {
  const v = value.trim()
  // All-day: VALUE=DATE or a bare 8-digit date → local midnight.
  if (/VALUE=DATE(?!-)/i.test(params) || /^\d{8}$/.test(v)) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v)
    if (!m) return null
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toISOString()
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v)
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  if (z) {
    return new Date(
      Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0))
    ).toISOString()
  }
  // Floating or TZID-qualified: treat as local wall time.
  return new Date(
    Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0)
  ).toISOString()
}

function unescapeText(s: string): string {
  return s
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}
