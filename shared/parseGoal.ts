// Natural-language quick add for goals: "bench 175 -> 190 lbs" becomes a
// number goal with a start, a target and a unit, its numbers stripped out of
// the title.
//
// The same bargain as parseTask, for the same reason: local, synchronous, and
// run on every keystroke so the composer can show what it understood before
// you commit. And the same rule throughout — only consume a token when it is
// unambiguously a modifier. Anything not recognized stays in the title,
// because silently eating a word out of someone's goal is much worse than
// missing a target.
//
// It understands numbers and nothing else. Deliberately no dates: a goal
// already has a month, so "aug", "friday" and "by the 15th" are part of what
// the goal *says*, and eating them would be pure loss.

import type { GoalKind } from './types'

export interface ParsedGoal {
  title: string
  kind: GoalKind
  startValue: number | null
  targetValue: number
  unit: string | null
  /** The chunks that were consumed, for the "what I understood" hint. Only
   *  text actually taken out of the title appears here — the inferred kind is
   *  not a chip, because it's a control you can change, and a chip that argues
   *  with a control is noise. */
  matched: { label: string; kind: 'start' | 'target' | 'unit' }[]
}

/** Units that make a number a measurement rather than a tally. Kept tight and
 *  physical, and with no single letters except % and $ — "m" and "s" start far
 *  too many words to be safe to eat. */
const UNITS = new Set([
  'lbs', 'lb', 'pounds', 'kg', 'kgs', 'g',
  'min', 'mins', 'minutes', 'hr', 'hrs', 'hours', 'sec', 'secs',
  'km', 'mi', 'miles', 'cm', 'ft',
  '%'
])

/** Written between a start and a target. "to" only counts with a number in
 *  front of it, which is what keeps "apply to 20 jobs" out of this branch. */
const ARROWS = new Set(['->', '-->', '=>', '→', 'to'])

/** The one piece of date knowledge in the file, and it exists only to refuse:
 *  a bare number after a month name is a day of the month, so "ship by aug 30"
 *  keeps its 30 instead of becoming a goal to reach thirty of something. */
const MONTH_WORDS = new Set([
  'jan', 'january', 'feb', 'february', 'mar', 'march', 'apr', 'april', 'may',
  'jun', 'june', 'jul', 'july', 'aug', 'august', 'sep', 'sept', 'september',
  'oct', 'october', 'nov', 'november', 'dec', 'december'
])

interface NumberRead {
  value: number
  unit: string | null
  /** How many tokens it took, so a unit standing alone is consumed too. */
  consumed: number
  /** The number's own text, for the hint. */
  numLabel: string
  /** Set only when the unit was its own token, so the hint doesn't report it
   *  twice. */
  unitLabel: string | null
}

/** Read a number starting at `i`, or null if that token isn't one.
 *
 *  Whole tokens only, exactly as parseTask refuses to pull "sat" out of
 *  "saturate": this is what leaves ECSE200, v2.1 and 24/7 alone. A suffix that
 *  isn't a known unit rejects the whole token rather than being dropped —
 *  "run 5k" stays the title "run 5k" instead of becoming a goal to reach 5. */
function readNumber(tokens: string[], i: number): NumberRead | null {
  const tok = tokens[i]
  if (tok === undefined) return null
  const m = /^(\$)?(\d+(?:\.\d+)?)([a-z%]*)$/i.exec(tok)
  if (!m) return null

  const [, dollar, digits, rawSuffix] = m
  const value = Number(digits)
  if (!Number.isFinite(value)) return null

  const suffix = rawSuffix.toLowerCase()
  if (suffix && !UNITS.has(suffix)) return null // "5k" is not five kilo-anything
  if (dollar && suffix) return null // "$5kg" is not a thing

  // A bare four-digit year is a word, not a target. "finish 2026 taxes" is a
  // checklist called exactly that.
  if (!dollar && !suffix && /^\d{4}$/.test(digits) && value >= 1900 && value <= 2099) {
    return null
  }

  if (dollar) return { value, unit: '$', consumed: 1, numLabel: tok, unitLabel: null }
  if (suffix) return { value, unit: suffix, consumed: 1, numLabel: tok, unitLabel: null }

  // A unit standing as its own token: "190 lbs".
  const next = tokens[i + 1]?.toLowerCase()
  if (next && UNITS.has(next)) {
    return { value, unit: next, consumed: 2, numLabel: tok, unitLabel: tokens[i + 1] }
  }
  return { value, unit: null, consumed: 1, numLabel: tok, unitLabel: null }
}

interface RangeRead {
  start: NumberRead
  target: NumberRead
  /** Index just past the last token the range consumed. */
  end: number
}

/** `<number> <arrow> <number>` starting at `i`, or null. */
function readRange(tokens: string[], i: number): RangeRead | null {
  const left = readNumber(tokens, i)
  if (!left) return null
  const arrow = tokens[i + left.consumed]?.toLowerCase()
  if (!arrow || !ARROWS.has(arrow)) return null
  const right = readNumber(tokens, i + left.consumed + 1)
  if (!right) return null
  return { start: left, target: right, end: i + left.consumed + 1 + right.consumed }
}

/** A count of *things* — "20 jobs", "12 books". Three letters minimum so "12
 *  is" and other stray plurals can't flip the kind. */
function isPluralNoun(tok: string | undefined): boolean {
  if (!tok) return false
  const low = tok.toLowerCase().replace(/[.,!?]$/, '')
  return /^[a-z]{3,}s$/.test(low) && !UNITS.has(low)
}

/** An explicit multiplier is a count by construction: x20, 20x, ×20. */
function readMultiplier(tok: string): number | null {
  const m = /^(?:[x×](\d+)|(\d+)[x×])$/i.exec(tok)
  if (!m) return null
  const n = Number(m[1] ?? m[2])
  return Number.isFinite(n) && n > 0 ? n : null
}

export function parseGoal(raw: string): ParsedGoal {
  const matched: ParsedGoal['matched'] = []
  const tokens = raw.split(/\s+/).filter(Boolean)
  const kept: string[] = []

  let kind: GoalKind = 'checklist'
  let startValue: number | null = null
  let targetValue = 0
  let unit: string | null = null
  let found = false // only the first numeric construct in the line is consumed

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]

    if (found) {
      kept.push(tok)
      continue
    }

    // "175 -> 190", "175 to 190", and "from 175 to 190" — the leading "from"
    // is only eaten once the whole shape behind it checks out.
    const isFrom = tok.toLowerCase() === 'from'
    const range = readRange(tokens, isFrom ? i + 1 : i)
    if (range) {
      kind = 'number'
      startValue = range.start.value
      targetValue = range.target.value
      // Either side may carry the unit: "175lbs -> 190" and "175 -> 190 lbs"
      // both mean pounds.
      unit = range.target.unit ?? range.start.unit
      matched.push({ label: range.start.numLabel, kind: 'start' })
      matched.push({ label: range.target.numLabel, kind: 'target' })
      if (unit) matched.push({ label: unit, kind: 'unit' })
      i = range.end - 1
      found = true
      continue
    }

    // x20 / 20x
    const mult = readMultiplier(tok)
    if (mult !== null) {
      kind = 'counter'
      targetValue = mult
      matched.push({ label: tok, kind: 'target' })
      found = true
      continue
    }

    // "aug 30" is a date, and a goal already has a month of its own. Checked
    // here rather than in readNumber so a range still wins: "aug 175 -> 190"
    // is a target either way, while a lone number after a month name is a day.
    const afterMonth =
      i > 0 && MONTH_WORDS.has(tokens[i - 1].toLowerCase().replace(/[.,]$/, ''))
    const num = afterMonth ? null : readNumber(tokens, i)
    if (num) {
      // A unit makes it a measurement; a countable noun after it makes it a
      // tally. With neither, a bare number is a measurement: guessing "number"
      // for a tally gives you a start/target line you can still type into,
      // while guessing "counter" for "bench 190" puts a +1 button next to a
      // bench press, which reads as broken rather than merely wrong.
      if (num.unit === null && isPluralNoun(tokens[i + num.consumed])) {
        kind = 'counter'
      } else {
        kind = 'number'
        unit = num.unit
      }
      targetValue = num.value
      matched.push({ label: num.numLabel, kind: 'target' })
      if (num.unitLabel) matched.push({ label: num.unitLabel, kind: 'unit' })
      i += num.consumed - 1
      found = true
      continue
    }

    kept.push(tok)
  }

  return {
    title: kept.join(' ').replace(/\s{2,}/g, ' ').trim(),
    kind,
    startValue,
    targetValue,
    unit,
    matched
  }
}
