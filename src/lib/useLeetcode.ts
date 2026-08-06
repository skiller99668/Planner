// LeetCode data hook + derived stats (weekly count, streak, difficulty mix).
// Mirrors useGym: pure derivations live here so the page and any summary tile
// share them. The weekly goal reuses the existing dsaPerWeek target.

import { useCallback, useEffect, useState } from 'react'
import type {
  LeetcodeLogInput,
  LeetcodePatch,
  LeetcodeProblem,
  LeetcodeSyncResult
} from '../../shared/types'
import { addDaysYMD, todayYMD } from './dates'
import { weekStartOf } from './useGym'

export interface DiffCounts {
  easy: number
  medium: number
  hard: number
}

export interface LeetcodeDerived {
  /** Problems grouped by solve date (newest-first within the source list). */
  byDate: Map<string, LeetcodeProblem[]>
  weekStart: string
  weekDates: string[]
  /** Problems solved in the current Sun–Sat week. */
  weekCount: number
  weekMet: boolean
  /** Consecutive prior weeks (before this one) that met the target. */
  weekStreak: number
  totalSolved: number
  diffAll: DiffCounts
  diffWeek: DiffCounts
}

const emptyDiff = (): DiffCounts => ({ easy: 0, medium: 0, hard: 0 })

export function deriveLeetcode(problems: LeetcodeProblem[], target: number): LeetcodeDerived {
  const today = todayYMD()
  const byDate = new Map<string, LeetcodeProblem[]>()
  for (const p of problems) {
    const list = byDate.get(p.date)
    if (list) list.push(p)
    else byDate.set(p.date, [p])
  }

  const weekStart = weekStartOf(today)
  const weekDates = Array.from({ length: 7 }, (_, i) => addDaysYMD(weekStart, i))
  const weekSet = new Set(weekDates)

  const diffAll = emptyDiff()
  const diffWeek = emptyDiff()
  let weekCount = 0
  for (const p of problems) {
    diffAll[p.difficulty]++
    if (weekSet.has(p.date)) {
      weekCount++
      diffWeek[p.difficulty]++
    }
  }

  const countInWeek = (ws: string): number => {
    const dates = new Set(Array.from({ length: 7 }, (_, i) => addDaysYMD(ws, i)))
    let n = 0
    for (const p of problems) if (dates.has(p.date)) n++
    return n
  }

  let weekStreak = 0
  if (target > 0) {
    for (let ws = addDaysYMD(weekStart, -7); ; ws = addDaysYMD(ws, -7)) {
      if (countInWeek(ws) >= target) weekStreak++
      else break
      if (weekStreak > 260) break // safety
    }
  }

  return {
    byDate,
    weekStart,
    weekDates,
    weekCount,
    weekMet: target > 0 && weekCount >= target,
    weekStreak,
    totalSolved: problems.length,
    diffAll,
    diffWeek
  }
}

export interface LeetcodeStore {
  problems: LeetcodeProblem[]
  loaded: boolean
  log: (input: LeetcodeLogInput) => Promise<void>
  update: (id: string, patch: LeetcodePatch) => Promise<void>
  remove: (id: string) => Promise<void>
  sync: (username: string) => Promise<LeetcodeSyncResult>
}

export function useLeetcode(): LeetcodeStore {
  const [problems, setProblems] = useState<LeetcodeProblem[]>([])
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    if (!window.planner) return
    setProblems(await window.planner.leetcodeList())
    setLoaded(true)
  }, [])

  useEffect(() => {
    void refresh()
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
    problems,
    loaded,
    log: (input) => wrap(() => window.planner!.leetcodeLog(input)),
    update: (id, patch) => wrap(() => window.planner!.leetcodeUpdate(id, patch)),
    remove: (id) => wrap(() => window.planner!.leetcodeDelete(id)),
    sync: async (username) => {
      const res = await window.planner!.leetcodeSync(username)
      await refresh()
      return res
    }
  }
}

/** The weekly LeetCode goal — reuses the existing dsaPerWeek target. */
export function useDsaTarget(): number {
  const [target, setTarget] = useState(5)
  useEffect(() => {
    window.planner
      ?.getSettings()
      .then((s) => setTarget(s.targets.dsaPerWeek))
      .catch(() => {})
  }, [])
  return target
}
