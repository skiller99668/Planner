// Monthly goals, and the arithmetic that turns any of the three kinds into one
// bar. Mirrors useGym/useLeetcode: the pure derivation lives here beside the
// store hook, so the Goals page and the Today section can never disagree about
// what a goal's number is.

import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  Goal,
  GoalEntry,
  GoalEntryInput,
  GoalInput,
  GoalPatch,
  GoalStep,
  GoalStepPatch
} from '../../shared/types'
import { progressPct } from './progress'

/** What a goal reduces to once its kind stops mattering. */
export interface GoalDerived {
  current: number
  target: number
  /** 0–100, through the same progressPct the gym and leetcode bars use. */
  pct: number
  met: boolean
  /** The numerals beside the bar: "175 → 190 lbs", "2 of 5 steps", "12 / 20". */
  label: string
  /** number goals: the best measurement so far, in the goal's own direction. */
  best: number | null
  /** number goals: the most recent measurement, which is often not the best. */
  latest: number | null
  stepsDone: number
  stepsTotal: number
  /** Whether the bar is reading another page rather than this goal's own rows. */
  linked: boolean
}

/** True when the goal counts down rather than up — losing weight, cutting a
 *  mile time. Everything about "best" and "how far along" inverts. */
export function isDescending(goal: Goal): boolean {
  return goal.startValue !== null && goal.targetValue < goal.startValue
}

function fmt(n: number): string {
  // Measurements are rarely whole (3.9 GPA, 8.5 km) but tallies always are,
  // and "12.0 / 20" reads like a rounding error.
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

/**
 * The one place a goal becomes a number.
 *
 * `number` goals use the **best** measurement, not the latest: a bad day must
 * not erase a personal best, which is the whole reason entries are dated rows
 * rather than a column on the goal. Direction decides which way "best" runs.
 */
export function deriveGoal(goal: Goal, steps: GoalStep[], entries: GoalEntry[]): GoalDerived {
  const stepsTotal = steps.length
  const stepsDone = steps.filter((s) => s.done).length

  if (goal.kind === 'checklist') {
    const pct = progressPct(stepsDone, stepsTotal)
    return {
      current: stepsDone,
      target: stepsTotal,
      pct,
      // An empty checklist is not a met one, however you divide it.
      met: stepsTotal > 0 && stepsDone === stepsTotal,
      label: stepsTotal === 0 ? 'no steps yet' : `${stepsDone} of ${stepsTotal} steps`,
      best: null,
      latest: null,
      stepsDone,
      stepsTotal,
      linked: false
    }
  }

  if (goal.kind === 'counter') {
    const current = goal.source ? goal.autoCount : entries.reduce((n, e) => n + e.value, 0)
    const target = goal.targetValue
    return {
      current,
      target,
      pct: progressPct(current, target),
      met: target > 0 && current >= target,
      label: `${fmt(current)} / ${fmt(target)}${goal.unit ? ` ${goal.unit}` : ''}`,
      best: null,
      latest: null,
      stepsDone,
      stepsTotal,
      linked: goal.source !== null
    }
  }

  // ---- number ----
  const desc = isDescending(goal)
  const values = entries.map((e) => e.value)
  const best = values.length ? (desc ? Math.min(...values) : Math.max(...values)) : null
  // Entries arrive newest-first from the repo, so the head is the latest.
  const latest = entries.length ? entries[0].value : null

  const start = goal.startValue
  const target = goal.targetValue
  const current = best ?? start ?? 0

  // Distance covered over distance to cover, which is direction-agnostic once
  // both sides are absolute. Without a start there is no span to be a share
  // of, so the bar stays empty rather than inventing a baseline of zero.
  const span = start === null ? 0 : Math.abs(target - start)
  const moved = start === null ? 0 : Math.abs(current - start)
  const pct = progressPct(moved, span)
  const met = start !== null && (desc ? current <= target : current >= target)

  const unit = goal.unit ? ` ${goal.unit}` : ''
  return {
    current,
    target,
    pct,
    met,
    label:
      start === null
        ? `→ ${fmt(target)}${unit}`
        : `${fmt(current)} → ${fmt(target)}${unit}`,
    best,
    latest,
    stepsDone,
    stepsTotal,
    linked: false
  }
}

export interface GoalsStore {
  goals: Goal[]
  /** Every goal's steps and entries, grouped by goal id. */
  steps: Map<string, GoalStep[]>
  entries: Map<string, GoalEntry[]>
  /** False until the first fetch lands, so an empty state can't flash. */
  loaded: boolean
  month: string
  setMonth: (month: string) => void
  refresh: () => Promise<void>
  create: (input: GoalInput) => Promise<Goal | null>
  update: (id: string, patch: GoalPatch) => Promise<void>
  remove: (id: string) => Promise<void>
  reorder: (ids: string[]) => Promise<void>
  carry: (id: string, month: string) => Promise<void>
  addStep: (goalId: string, title: string) => Promise<void>
  updateStep: (id: string, patch: GoalStepPatch) => Promise<void>
  removeStep: (id: string) => Promise<void>
  reorderSteps: (goalId: string, ids: string[]) => Promise<void>
  addEntry: (input: GoalEntryInput) => Promise<void>
  removeEntry: (id: string) => Promise<void>
}

/** YYYY-MM for a date, local. */
export function monthOf(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Step a YYYY-MM by whole months, so ‹ › is arithmetic and not string edits. */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  return monthOf(new Date(y, m - 1 + delta, 1))
}

/** "2026-09" → "September 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export function useGoals(initialMonth = monthOf()): GoalsStore {
  const [month, setMonth] = useState(initialMonth)
  const [goals, setGoals] = useState<Goal[]>([])
  const [stepRows, setStepRows] = useState<GoalStep[]>([])
  const [entryRows, setEntryRows] = useState<GoalEntry[]>([])
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    if (!window.planner) return
    const [g, s, e] = await Promise.all([
      window.planner.goalsList(month),
      window.planner.goalStepsList(),
      window.planner.goalEntriesList()
    ])
    setGoals(g)
    setStepRows(s)
    setEntryRows(e)
    setLoaded(true)
  }, [month])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const steps = useMemo(() => groupBy(stepRows), [stepRows])
  const entries = useMemo(() => groupBy(entryRows), [entryRows])

  // Every mutation refetches rather than patching local state: the repo owns
  // the rules (a first measurement stamps the start value, a kind change is
  // refused once there's history), and re-reading is how the page sees them.
  const wrap = useCallback(
    async (work: Promise<unknown>) => {
      await work
      await refresh()
    },
    [refresh]
  )

  return {
    goals,
    steps,
    entries,
    loaded,
    month,
    setMonth,
    refresh,
    create: async (input) => {
      if (!window.planner) return null
      const created = await window.planner.goalsCreate(input)
      await refresh()
      return created
    },
    update: (id, patch) => wrap(window.planner!.goalsUpdate(id, patch)),
    remove: (id) => wrap(window.planner!.goalsDelete(id)),
    reorder: async (ids) => {
      // Placed locally before the round trip: the drag hook drops its
      // transforms the moment the pointer lifts, so a re-render still holding
      // the old order makes the row bounce back before it settles.
      const at = new Map(ids.map((id, i) => [id, i + 1]))
      setGoals((prev) =>
        [...prev]
          .map((g) => (at.has(g.id) ? { ...g, sortOrder: at.get(g.id)! } : g))
          .sort((a, b) => a.sortOrder - b.sortOrder)
      )
      await wrap(window.planner!.goalsReorder(month, ids))
    },
    carry: (id, to) => wrap(window.planner!.goalsCarry(id, to)),
    addStep: (goalId, title) => wrap(window.planner!.goalStepsCreate(goalId, title)),
    updateStep: (id, patch) => wrap(window.planner!.goalStepsUpdate(id, patch)),
    removeStep: (id) => wrap(window.planner!.goalStepsDelete(id)),
    reorderSteps: async (goalId, ids) => {
      const at = new Map(ids.map((id, i) => [id, i + 1]))
      setStepRows((prev) =>
        [...prev]
          .map((s) => (at.has(s.id) ? { ...s, sortOrder: at.get(s.id)! } : s))
          .sort((a, b) => a.sortOrder - b.sortOrder)
      )
      await wrap(window.planner!.goalStepsReorder(goalId, ids))
    },
    addEntry: (input) => wrap(window.planner!.goalEntryAdd(input)),
    removeEntry: (id) => wrap(window.planner!.goalEntryDelete(id))
  }
}

function groupBy<T extends { goalId: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const list = map.get(r.goalId)
    if (list) list.push(r)
    else map.set(r.goalId, [r])
  }
  return map
}
