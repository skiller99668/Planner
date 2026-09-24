// Journal — one entry a day, behind a passcode.
//
// The writing surface is deliberately empty: no placeholder, no prompt, no
// formatting bar. A blank page asks nothing of you, which is the point of
// keeping one. Everything else on the page is arranged to stay out of its way
// — the date is the title because you never have to think of one, and the day
// saves itself so there is no moment where writing stops to be filed.
//
// The lock is real (see electron/journalRepo.ts): bodies are encrypted, the
// key lives in main for the length of a run, and locking drops the decrypted
// text out of renderer memory rather than covering it up.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useFlash } from '../components/Celebrate'
import { useConfirm } from '../components/ConfirmProvider'
import type { JournalEntryMeta, Mood } from '../../shared/types'
import { todayYMD } from '../lib/dates'
import { progressColor } from '../lib/progress'
import {
  journalShortDate,
  journalTitle,
  totalWords,
  useJournal,
  type JournalStore
} from '../lib/useJournal'

/** How long typing has to pause before the day is written. Long enough not to
 *  encrypt on every keystroke, short enough that closing the app mid-thought
 *  can't lose a sentence — and blur flushes it anyway. */
const AUTOSAVE_MS = 700

const inputCls =
  'bg-bg border-line rounded-[11px] border px-3 py-2 text-[13.5px] placeholder:text-faint focus:border-azure/60 outline-none'

export default function JournalPage() {
  const store = useJournal()

  if (!store.status) return null // one frame, rather than flashing the wrong screen
  if (!store.status.configured) return <SetupScreen store={store} />
  if (!store.status.unlocked) return <LockScreen store={store} />
  return <JournalDesk store={store} />
}

// ---------- the lock ----------

function SetupScreen({ store }: { store: JournalStore }) {
  const [pass, setPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [error, setError] = useState<string | null>(null)

  const tooShort = pass.length > 0 && pass.trim().length < 4
  const mismatch = confirmPass.length > 0 && pass !== confirmPass
  const ready = pass.trim().length >= 4 && pass === confirmPass

  const submit = async () => {
    if (!ready) return
    try {
      await store.setPasscode(pass)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set the passcode')
    }
  }

  return (
    <div>
      <h1 className="text-[26px] font-bold">Journal</h1>
      <p className="text-muted mt-0.5 text-[13.5px]">Private, and locked with a passcode you set</p>

      <div className="surface-recessed mt-6 max-w-lg p-6">
        <p className="text-[15px] font-semibold">Choose a passcode</p>
        <p className="text-muted mt-1.5 text-[13px] leading-relaxed">
          Everything you write is encrypted, and this unlocks it. Forget it and you can set a new
          one from the lock screen without losing anything — which also means someone signed in to
          this Windows account could do the same.
        </p>

        <div className="mt-4 grid gap-2">
          <input
            autoFocus
            type="password"
            value={pass}
            onChange={(e) => {
              setPass(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && document.getElementById('jrnl-confirm')?.focus()}
            placeholder="Passcode"
            aria-label="Passcode"
            className={inputCls}
          />
          <input
            id="jrnl-confirm"
            type="password"
            value={confirmPass}
            onChange={(e) => {
              setConfirmPass(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            placeholder="Again"
            aria-label="Confirm passcode"
            className={inputCls}
          />
        </div>

        {(tooShort || mismatch || error) && (
          <p className="text-coral/90 mt-2 text-[12.5px]">
            {error ?? (tooShort ? 'At least 4 characters.' : "Those don't match.")}
          </p>
        )}

        <button
          onClick={() => void submit()}
          disabled={!ready}
          className="btn-primary tactile mt-4 rounded-[11px] px-4 py-2 text-[13px] font-bold disabled:opacity-40"
        >
          Lock it
        </button>
      </div>
    </div>
  )
}

function LockScreen({ store }: { store: JournalStore }) {
  const confirm = useConfirm()
  const [pass, setPass] = useState('')
  const [wrong, setWrong] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [fresh, setFresh] = useState('')
  const [failed, setFailed] = useState(false)

  const submit = async () => {
    if (!pass) return
    const ok = await store.unlock(pass)
    if (!ok) {
      setWrong(true)
      setPass('')
    }
  }

  const recoverable = store.status?.recoverable ?? false

  const doReset = async () => {
    if (fresh.trim().length < 4) return
    const ok = await store.resetPasscode(fresh)
    if (!ok) setFailed(true)
  }

  // Picking a new passcode outright, which the OS-held copy of the data key
  // makes possible without giving anything up.
  if (resetting) {
    return (
      <div>
        <h1 className="text-[26px] font-bold">Journal</h1>
        <div className="surface-recessed mt-6 max-w-md p-6">
          <p className="text-[15px] font-semibold">Set a new passcode</p>
          <p className="text-muted mt-1.5 text-[13px] leading-relaxed">
            Your entries stay exactly where they are — only the passcode changes.
          </p>
          <input
            autoFocus
            type="password"
            value={fresh}
            onChange={(e) => {
              setFresh(e.target.value)
              setFailed(false)
            }}
            onKeyDown={(e) => e.key === 'Enter' && void doReset()}
            placeholder="New passcode"
            aria-label="New passcode"
            className={`${inputCls} mt-4 w-full`}
          />
          {failed && (
            <p className="text-coral/90 mt-2 text-[12.5px]">
              This journal can't be reopened on this account — erasing it is the only way on.
            </p>
          )}
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => void doReset()}
              disabled={fresh.trim().length < 4}
              className="btn-primary tactile rounded-[11px] px-4 py-2 text-[13px] font-bold disabled:opacity-40"
            >
              Set it
            </button>
            <button
              onClick={() => {
                setResetting(false)
                setFresh('')
                setFailed(false)
              }}
              className="text-muted hover:text-ink text-[12.5px] font-medium transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-[26px] font-bold">Journal</h1>

      <div className="surface-recessed mt-6 flex max-w-md flex-col items-center p-8">
        <IconLock />
        <div className="mt-4 w-full">
          <input
            autoFocus
            type="password"
            value={pass}
            onChange={(e) => {
              setPass(e.target.value)
              setWrong(false)
            }}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            placeholder="Passcode"
            aria-label="Passcode"
            className={`${inputCls} w-full text-center`}
          />
        </div>
        {wrong && <p className="text-coral/90 mt-2 text-[12.5px]">Not that one.</p>}
        <button
          onClick={() => void submit()}
          disabled={!pass}
          className="btn-primary tactile mt-4 w-full rounded-[11px] px-4 py-2 text-[13px] font-bold disabled:opacity-40"
        >
          Unlock
        </button>

        <button
          onClick={async () => {
            if (recoverable) {
              setResetting(true)
              return
            }
            // No OS-held copy of the data key: this journal predates the
            // recovery wrapper or came from another Windows account, so the
            // entries genuinely cannot be reopened.
            const ok = await confirm({
              title: 'Erase the journal?',
              body: "This journal has no recovery copy on this account, so a forgotten passcode can't be worked around. The only way on is to delete every entry and start over.",
              confirmLabel: 'Erase everything',
              danger: true
            })
            if (ok) await store.reset()
          }}
          className="text-faint hover:text-azure mt-5 text-[12px] transition-colors"
        >
          Forgot it?
        </button>
      </div>
    </div>
  )
}

// ---------- the journal ----------

function JournalDesk({ store }: { store: JournalStore }) {
  const confirm = useConfirm()
  const today = todayYMD()
  const [openDate, setOpenDate] = useState(today)
  const [body, setBody] = useState('')
  const [loadedDate, setLoadedDate] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState(0)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  // What's typed but not yet written, and for which day. Held in a ref so the
  // debounce timer and the unmount flush both see the current value without
  // re-arming on every keystroke.
  const pending = useRef<{ date: string; body: string } | null>(null)
  const timer = useRef<number | null>(null)
  const saved = useFlash(savedAt, 2000)

  const flush = useCallback(async () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    const p = pending.current
    if (!p) return
    pending.current = null
    await store.save(p.date, p.body)
    setSavedAt(Date.now())
  }, [store])

  // Load whichever day is open. Flushing first is what stops a paragraph typed
  // on the 9th from landing on the 8th when you click away mid-sentence.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await flush()
      const entry = await store.get(openDate)
      if (cancelled) return
      setBody(entry?.body ?? '')
      setLoadedDate(openDate)
      // Open a day and the cursor is already in it — the whole page is one
      // field, so there is nothing else it could sensibly be waiting on.
      areaRef.current?.focus()
    })()
    return () => {
      cancelled = true
    }
    // Keyed on the date alone: `store` changes identity whenever entries do,
    // and reloading on that would pull the field out from under the cursor
    // every time an autosave lands.
  }, [openDate])

  // Last write wins on the way out — closing the app mid-sentence shouldn't
  // cost the sentence.
  useEffect(() => () => void flush(), [flush])

  const onType = (next: string) => {
    setBody(next)
    pending.current = { date: openDate, body: next }
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flush(), AUTOSAVE_MS)
  }

  // Today always has a row, written or not — the point of the page is that
  // today is already open and waiting.
  const rows: JournalEntryMeta[] = store.entries.some((e) => e.date === today)
    ? store.entries
    : [{ id: 'today', date: today, mood: null, excerpt: '', words: 0, updatedAt: '' }, ...store.entries]

  const openEntry = store.entries.find((e) => e.date === openDate) ?? null
  // Counted from the field rather than the saved row, so it moves with the
  // typing instead of stepping every time an autosave lands.
  const words = body.trim() ? body.trim().split(/\s+/).length : 0
  const lifetime = totalWords(store.entries)

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold">Journal</h1>
          {store.entries.length > 0 && (
            <p className="text-muted nums mt-0.5 text-[13px]">
              {store.entries.length} {store.entries.length === 1 ? 'entry' : 'entries'} ·{' '}
              {lifetime.toLocaleString()} {lifetime === 1 ? 'word' : 'words'}
            </p>
          )}
        </div>
        <button
          onClick={async () => {
            await flush()
            await store.lock()
          }}
          className="tactile text-muted hover:text-ink hover:bg-surface flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[12.5px] font-medium"
        >
          <IconLock small />
          Lock
        </button>
      </div>

      <div className="mt-5 flex min-h-0 flex-1 gap-6">
        {/* the days */}
        <ul className="w-44 shrink-0 space-y-0.5 overflow-y-auto pr-1">
          {rows.map((e) => {
            const active = e.date === openDate
            return (
              <li key={e.date}>
                <button
                  onClick={() => setOpenDate(e.date)}
                  className={`flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left transition-colors ${
                    active ? 'bg-raised text-ink' : 'text-muted hover:bg-surface'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="nums block text-[12.5px] font-semibold">
                      {e.date === today ? 'Today' : journalShortDate(e.date, today)}
                    </span>
                    {e.excerpt && (
                      <span className="text-faint block truncate text-[11.5px]">{e.excerpt}</span>
                    )}
                    {e.words > 0 && (
                      <span className="text-faint nums block text-[10.5px]">{e.words} words</span>
                    )}
                  </span>
                  {e.mood && <MoodFace mood={e.mood} size={15} filled />}
                </button>
              </li>
            )
          })}
        </ul>

        {/* the page */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[19px] font-semibold tracking-[-0.02em]">
              {journalTitle(openDate)}
            </h2>
            <span
              className={`text-faint nums shrink-0 text-[11.5px] transition-opacity ${
                saved ? 'opacity-100' : 'opacity-0'
              }`}
            >
              saved
            </span>
          </div>

          {/* Deliberately no placeholder and no toolbar. */}
          <textarea
            ref={areaRef}
            value={loadedDate === openDate ? body : ''}
            onChange={(e) => onType(e.target.value)}
            onBlur={() => void flush()}
            spellCheck
            aria-label={`Journal entry for ${journalTitle(openDate)}`}
            className="text-ink mt-3 min-h-0 flex-1 resize-none bg-transparent text-[14.5px] leading-[1.85] outline-none"
          />

          <div className="border-line/40 mt-3 flex items-center justify-between gap-4 border-t pt-3">
            <MoodPicker
              value={openEntry?.mood ?? null}
              onPick={(m) => {
                void flush().then(() => store.setMood(openDate, m))
              }}
            />
            <span className="text-faint nums ml-auto shrink-0 text-[12px]">
              {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
            </span>
            {openEntry && (
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: `Delete ${journalTitle(openDate)}?`,
                    body: 'The entry and its rating go for good.',
                    confirmLabel: 'Delete',
                    danger: true
                  })
                  if (!ok) return
                  pending.current = null
                  await store.remove(openDate)
                  setBody('')
                }}
                className="text-faint hover:text-coral shrink-0 text-[12px] transition-colors"
              >
                delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- mood ----------

const MOODS: Mood[] = [1, 2, 3, 4, 5]

/** Sad → happy straight off the progress ramp: coral at the bottom, gold in
 *  the middle, mint at the top. Reusing progressColor rather than picking five
 *  hexes means a rough day reads the same colour here as a missed target does
 *  on every other page, and retuning that ramp retunes these faces with it. */
const moodColor = (m: Mood): string => progressColor(((m - 1) / 4) * 100)

const MOOD_LABEL: Record<Mood, string> = {
  1: 'Rough',
  2: 'Low',
  3: 'Fine',
  4: 'Good',
  5: 'Great'
}

function MoodPicker({ value, onPick }: { value: Mood | null; onPick: (m: Mood | null) => void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="How was today">
      {MOODS.map((m) => {
        const on = value === m
        return (
          <button
            key={m}
            type="button"
            aria-pressed={on}
            aria-label={MOOD_LABEL[m]}
            title={MOOD_LABEL[m]}
            // Picking the face already showing clears it — a rating you can't
            // take back is a rating you hesitate to give.
            onClick={() => onPick(on ? null : m)}
            className={`tactile rounded-full p-1 transition-all ${
              on ? 'bg-surface' : 'opacity-45 hover:opacity-100'
            }`}
          >
            <MoodFace mood={m} size={26} filled={on} />
          </button>
        )
      })}
    </div>
  )
}

/** One face. The mouth is a single quadratic whose control point walks from
 *  well below the baseline to well above it, so the five read as one continuous
 *  scale rather than five drawings that happen to sit together. */
function MoodFace({ mood, size = 24, filled = false }: { mood: Mood; size?: number; filled?: boolean }) {
  // 1 → +5 (frown), 3 → 0 (flat), 5 → −5 (smile)
  const curve = (3 - mood) * 2.5
  const color = moodColor(mood)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9.2" fill={filled ? color : 'none'} fillOpacity={filled ? 0.14 : 0} />
      <circle cx="8.9" cy="10" r="1.05" fill={color} stroke="none" />
      <circle cx="15.1" cy="10" r="1.05" fill={color} stroke="none" />
      <path d={`M8.2 ${15.4 + curve * 0.35} Q12 ${15.4 - curve} 15.8 ${15.4 + curve * 0.35}`} />
    </svg>
  )
}

function IconLock({ small = false }: { small?: boolean }) {
  const s = small ? 13 : 26
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={small ? '' : 'text-faint'}
      aria-hidden
    >
      <rect x="4" y="10.5" width="16" height="10" rx="2.6" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  )
}
