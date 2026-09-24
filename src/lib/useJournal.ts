// The journal's renderer-side store.
//
// Unlike the other stores here, this one can be *closed*: every list and read
// call fails while the journal is locked, because the key that would decrypt
// them lives in the main process and isn't there yet. So `status` gates
// everything, and locking throws the cached entries away rather than leaving
// decrypted text sitting in renderer memory behind a hidden screen.

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { JournalEntry, JournalEntryMeta, JournalStatus, Mood } from '../../shared/types'

export interface JournalStore {
  /** null until the first status check comes back — distinct from "not set
   *  up", so the setup screen can't flash on a journal that already exists. */
  status: JournalStatus | null
  entries: JournalEntryMeta[]
  refresh: () => Promise<void>
  setPasscode: (passcode: string) => Promise<void>
  changePasscode: (current: string, next: string) => Promise<boolean>
  /** Replace a forgotten passcode, keeping the entries. False when there is
   *  no OS wrapper to open the data key with — see status.recoverable. */
  resetPasscode: (next: string) => Promise<boolean>
  unlock: (passcode: string) => Promise<boolean>
  lock: () => Promise<void>
  reset: () => Promise<void>
  get: (date: string) => Promise<JournalEntry | null>
  save: (date: string, body: string) => Promise<void>
  setMood: (date: string, mood: Mood | null) => Promise<void>
  remove: (date: string) => Promise<void>
}

export function useJournal(): JournalStore {
  const [status, setStatus] = useState<JournalStatus | null>(null)
  const [entries, setEntries] = useState<JournalEntryMeta[]>([])

  const refresh = useCallback(async () => {
    if (!window.planner) return
    const s = await window.planner.journalStatus()
    setStatus(s)
    setEntries(s.unlocked ? await window.planner.journalList() : [])
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return useMemo<JournalStore>(
    () => ({
      status,
      entries,
      refresh,
      setPasscode: async (passcode) => {
        if (!window.planner) return
        setStatus(await window.planner.journalSetPasscode(passcode))
        setEntries(await window.planner.journalList())
      },
      changePasscode: async (current, next) => {
        if (!window.planner) return false
        const { ok } = await window.planner.journalChangePasscode(current, next)
        return ok
      },
      resetPasscode: async (next) => {
        if (!window.planner) return false
        const { ok } = await window.planner.journalResetPasscode(next)
        if (ok) await refresh()
        return ok
      },
      unlock: async (passcode) => {
        if (!window.planner) return false
        const { ok } = await window.planner.journalUnlock(passcode)
        if (ok) await refresh()
        return ok
      },
      lock: async () => {
        if (!window.planner) return
        setEntries([]) // don't leave plaintext in memory behind a locked screen
        setStatus(await window.planner.journalLock())
      },
      reset: async () => {
        if (!window.planner) return
        setEntries([])
        setStatus(await window.planner.journalReset())
      },
      get: (date) => window.planner?.journalGet(date) ?? Promise.resolve(null),
      save: async (date, body) => {
        if (!window.planner) return
        await window.planner.journalSave(date, body)
        setEntries(await window.planner.journalList())
      },
      setMood: async (date, mood) => {
        if (!window.planner) return
        await window.planner.journalSetMood(date, mood)
        setEntries(await window.planner.journalList())
      },
      remove: async (date) => {
        if (!window.planner) return
        await window.planner.journalDelete(date)
        setEntries(await window.planner.journalList())
      }
    }),
    [status, entries, refresh]
  )
}

/** Everything written so far, for the line under the title. */
export function totalWords(entries: { words: number }[]): number {
  return entries.reduce((n, e) => n + e.words, 0)
}

/** "2026-09-09" → "Wednesday, September 9" — the entry's whole title. */
export function journalTitle(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })
}

/** Short form for the date rail: "Sep 9". The year only appears when it isn't
 *  the current one, so a normal list stays quiet. */
export function journalShortDate(ymd: string, today: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const sameYear = ymd.slice(0, 4) === today.slice(0, 4)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' })
  })
}
