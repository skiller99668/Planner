// Gym data hook + all derived training math (cycle position, week counts,
// streak). Pure derivations live here so GymPage and Dashboard share them.

import { useCallback, useEffect, useState } from 'react'
import type { GymLogInput, GymPatch, GymSession, GymType } from '../../shared/types'
import { addDaysYMD, localYMD, todayYMD } from './dates'

export const PPL_ORDER: GymType[] = ['push', 'pull', 'legs']

export interface GymDerived {
  /** Sessions grouped by date (newest first). */
  byDate: Map<string, GymSession[]>
  /** Sunday of the current week (weeks run Sun–Sat). */
  weekStart: string
  /** Dates (Sun..Sat) of the current week. */
  weekDates: string[]
  /** Distinct training days this week. */
  weekCount: number
  /** Suggested next type in the P→P→L cycle. */
  nextType: GymType
  /** Today's sessions, if any. */
  today: GymSession[]
  /** Consecutive completed weeks (before this one) meeting the target. */
  weekStreak: number
  /** Whether the current week already meets the target. */
  weekMet: boolean
  totalSessions: number
}

/** Sunday of the week containing ymd (weeks run Sun–Sat, per Skyler). */
export function weekStartOf(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return localYMD(new Date(y, m - 1, d - date.getDay()))
}

export function deriveGym(sessions: GymSession[], target: number): GymDerived {
  const today = todayYMD()
  const byDate = new Map<string, GymSession[]>()
  for (const s of sessions) {
    const list = byDate.get(s.date)
    if (list) list.push(s)
    else byDate.set(s.date, [s])
  }

  const weekStart = weekStartOf(today)
  const weekDates = Array.from({ length: 7 }, (_, i) => addDaysYMD(weekStart, i))
  const weekCount = weekDates.filter((d) => byDate.has(d)).length

  // Next in cycle: successor of the most recent push/pull/legs session.
  let nextType: GymType = 'push'
  const lastPpl = sessions.find((s) => PPL_ORDER.includes(s.type)) // list is newest-first
  if (lastPpl) {
    nextType = PPL_ORDER[(PPL_ORDER.indexOf(lastPpl.type) + 1) % PPL_ORDER.length]
  }

  // Streak: walk back one completed week at a time while the target held.
  let weekStreak = 0
  for (let ws = addDaysYMD(weekStart, -7); ; ws = addDaysYMD(ws, -7)) {
    const count = Array.from({ length: 7 }, (_, i) => addDaysYMD(ws, i)).filter((d) =>
      byDate.has(d)
    ).length
    if (count >= target) weekStreak++
    else break
    if (weekStreak > 260) break // safety
  }

  return {
    byDate,
    weekStart,
    weekDates,
    weekCount,
    nextType,
    today: byDate.get(today) ?? [],
    weekStreak,
    weekMet: weekCount >= target,
    totalSessions: sessions.length
  }
}

export interface GymStore {
  sessions: GymSession[]
  loaded: boolean
  log: (input: GymLogInput) => Promise<void>
  update: (id: string, patch: GymPatch) => Promise<void>
  remove: (id: string) => Promise<void>
}

export function useGym(): GymStore {
  const [sessions, setSessions] = useState<GymSession[]>([])
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    if (!window.planner) return
    setSessions(await window.planner.gymList())
    setLoaded(true)
  }, [])

  useEffect(() => {
    void refresh()
    // Assistant tools can log sessions from anywhere — stay in sync.
    return window.planner?.onTasksChanged(() => void refresh())
  }, [refresh])

  const wrap = useCallback(
    async (op: () => Promise<unknown>) => {
      await op()
      await refresh()
    },
    [refresh]
  )

  return {
    sessions,
    loaded,
    log: (input) => wrap(() => window.planner!.gymLog(input)),
    update: (id, patch) => wrap(() => window.planner!.gymUpdate(id, patch)),
    remove: (id) => wrap(() => window.planner!.gymDelete(id))
  }
}

/** Hook a settings value without dragging the whole settings page along. */
export function useGymTarget(): number {
  const [target, setTarget] = useState(5)
  useEffect(() => {
    window.planner
      ?.getSettings()
      .then((s) => setTarget(s.targets.gymPerWeek))
      .catch(() => {})
  }, [])
  return target
}
