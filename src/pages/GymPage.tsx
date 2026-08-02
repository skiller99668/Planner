import { useState } from 'react'
import type { GymSession, GymType } from '../../shared/types'
import { addDaysYMD, todayYMD } from '../lib/dates'
import { deriveGym, PPL_ORDER, useGym, useGymTarget } from '../lib/useGym'

const TYPE_LABEL: Record<GymType, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  other: 'Other'
}
const TYPE_SHORT: Record<GymType, string> = { push: 'P', pull: 'PL', legs: 'L', other: '•' }

const MAX_WEEKS_BACK = 25 // history fetch covers ~26 weeks

export default function GymPage() {
  const store = useGym()
  const target = useGymTarget()
  const g = deriveGym(store.sessions, target)
  const [backfillOpen, setBackfillOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [weekOffset, setWeekOffset] = useState(0) // 0 = current, negative = past

  const loggedToday = g.today.length > 0

  const viewStart = addDaysYMD(g.weekStart, weekOffset * 7)
  const viewDates = Array.from({ length: 7 }, (_, i) => addDaysYMD(viewStart, i))
  const viewCount = viewDates.filter((d) => g.byDate.has(d)).length
  const viewMet = viewCount >= target

  return (
    <div>
      <p className="text-muted font-mono text-[11px] tracking-[0.16em] uppercase">
        Training · push / pull / legs
      </p>
      <h1 className="font-display mt-1 text-xl font-semibold">Gym</h1>

      {/* Cycle + one-tap log */}
      <section className="border-line bg-panel mt-6 max-w-2xl rounded-lg border p-5">
        {!loggedToday ? (
          <>
            <p className="text-muted font-mono text-[11px] tracking-[0.16em] uppercase">
              Next in cycle
            </p>
            <p className="font-display text-amber mt-1 text-2xl font-semibold tracking-wide">
              {TYPE_LABEL[g.nextType]} day
            </p>
          </>
        ) : (
          <>
            <p className="text-muted font-mono text-[11px] tracking-[0.16em] uppercase">
              Logged today
            </p>
            <p className="font-display text-ok mt-1 flex items-center gap-2 text-2xl font-semibold tracking-wide">
              {[...new Set(g.today.map((s) => TYPE_LABEL[s.type]))].join(' + ')} ✓
              <span className="text-muted font-mono text-[11px] font-normal">
                tomorrow: {TYPE_LABEL[g.nextType].toLowerCase()}
              </span>
            </p>
          </>
        )}

        <div className="mt-4 flex gap-2">
          {PPL_ORDER.map((t) => {
            const suggested = t === g.nextType && !loggedToday
            return (
              <button
                key={t}
                onClick={() => void store.log({ date: todayYMD(), type: t })}
                className={`flex-1 rounded-md px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${
                  suggested
                    ? 'bg-amber text-bench'
                    : 'border-line bg-panel2 hover:border-amber/60 border'
                }`}
                title={`Log ${TYPE_LABEL[t]} for today`}
              >
                {TYPE_LABEL[t]}
              </button>
            )
          })}
        </div>
        {loggedToday && (
          <button
            onClick={() => void store.remove(g.today[0].id)}
            className="text-muted hover:text-danger mt-2 font-mono text-[10.5px] transition-colors"
          >
            undo today&apos;s log
          </button>
        )}
      </section>

      {/* Week grid + streak */}
      <section className="border-line bg-panel mt-4 max-w-2xl rounded-lg border p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setWeekOffset((o) => Math.max(-MAX_WEEKS_BACK, o - 1))}
              disabled={weekOffset <= -MAX_WEEKS_BACK}
              aria-label="Previous week"
              className="text-muted hover:text-amber rounded px-1 font-mono text-[13px] transition-colors disabled:opacity-30"
            >
              ‹
            </button>
            <p className="text-muted min-w-32 text-center font-mono text-[11px] tracking-[0.16em] uppercase">
              {weekOffset === 0 ? 'This week' : weekLabel(viewStart)}
            </p>
            <button
              onClick={() => setWeekOffset((o) => Math.min(0, o + 1))}
              disabled={weekOffset === 0}
              aria-label="Next week"
              className="text-muted hover:text-amber rounded px-1 font-mono text-[13px] transition-colors disabled:opacity-30"
            >
              ›
            </button>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="text-muted hover:text-amber ml-1 font-mono text-[10.5px] transition-colors"
              >
                today
              </button>
            )}
          </div>
          <p className="font-mono text-[11px]">
            <span className={viewMet ? 'text-ok' : 'text-ink'}>{viewCount}</span>
            <span className="text-muted"> / {target}</span>
            {viewMet && <span className="text-ok"> · target met</span>}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {viewDates.map((date, i) => {
            const sessions = g.byDate.get(date) ?? []
            const isToday = date === todayYMD()
            const isFuture = date > todayYMD()
            return (
              <div
                key={date}
                className={`flex h-14 flex-col items-center justify-center gap-0.5 rounded-md border text-center ${
                  isToday ? 'border-amber/70' : 'border-line'
                } ${sessions.length ? 'bg-panel2' : 'bg-bench'} ${isFuture ? 'opacity-45' : ''}`}
                title={`${date}${sessions.length ? ` · ${sessions.map((s) => TYPE_LABEL[s.type]).join(', ')}` : ''}`}
              >
                <span className="text-muted font-mono text-[9.5px]">
                  {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][i]}
                </span>
                <span
                  className={`font-mono text-[12px] font-semibold ${
                    sessions.length ? 'text-amber' : 'text-line'
                  }`}
                >
                  {sessions.length
                    ? [...new Set(sessions.map((s) => TYPE_SHORT[s.type]))].join('+')
                    : '—'}
                </span>
              </div>
            )
          })}
        </div>

        <div className="bg-line mt-3 h-1 overflow-hidden rounded-full">
          <div
            className={`h-full rounded-full transition-all ${viewMet ? 'bg-ok' : 'bg-amber'}`}
            style={{ width: `${Math.min(100, (viewCount / target) * 100)}%` }}
          />
        </div>

        <div className="text-muted mt-3 flex gap-5 font-mono text-[11px]">
          <span>
            <span className={g.weekStreak > 0 ? 'text-amber' : ''}>{g.weekStreak}</span> week
            streak at target
          </span>
          <span>{g.totalSessions} sessions in last 6 months</span>
        </div>
      </section>

      {/* History */}
      <section className="mt-6 max-w-2xl">
        <div className="flex items-baseline justify-between">
          <h2 className="text-muted font-mono text-[11px] tracking-[0.16em] uppercase">
            History
          </h2>
          <button
            onClick={() => setBackfillOpen((o) => !o)}
            className="text-muted hover:text-amber font-mono text-[11px] transition-colors"
          >
            {backfillOpen ? 'close' : '+ log a past day'}
          </button>
        </div>

        {backfillOpen && (
          <Backfill
            onLog={async (date, type) => {
              await store.log({ date, type })
              setBackfillOpen(false)
            }}
          />
        )}

        {store.sessions.length === 0 && store.loaded ? (
          <p className="text-muted mt-3 text-[13px]">
            No sessions yet. Tap today&apos;s workout above — the cycle starts with Push.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {store.sessions.slice(0, 30).map((s) => (
              <li key={s.id}>
                <div className="group border-line/60 bg-panel/60 hover:bg-panel flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors">
                  <span className="bg-panel2 text-amber w-9 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-[10.5px] font-semibold">
                    {TYPE_SHORT[s.type]}
                  </span>
                  <button
                    onClick={() => setEditingId(editingId === s.id ? null : s.id)}
                    className="min-w-0 flex-1 text-left"
                    title="Edit session"
                  >
                    <span className="text-[13px]">{formatDay(s.date)}</span>
                    <span className="text-muted ml-2 text-[12px]">{TYPE_LABEL[s.type]}</span>
                    {s.notes && (
                      <span className="text-muted ml-2 truncate font-mono text-[10.5px]">
                        {s.notes.split('\n')[0]}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => void store.remove(s.id)}
                    aria-label={`Delete session ${s.date}`}
                    className="text-muted hover:text-danger px-1 opacity-45 transition-all group-hover:opacity-100"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="1.75" strokeLinecap="round" aria-hidden>
                      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                    </svg>
                  </button>
                </div>
                {editingId === s.id && (
                  <SessionEditor
                    session={s}
                    onSave={async (patch) => {
                      await store.update(s.id, patch)
                      setEditingId(null)
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Backfill({ onLog }: { onLog: (date: string, type: GymType) => Promise<void> }) {
  const [date, setDate] = useState(addDaysYMD(todayYMD(), -1))
  const [type, setType] = useState<GymType>('push')
  return (
    <div className="border-line bg-panel mt-2 flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <div>
        <label className="text-muted mb-1 block font-mono text-[10.5px] uppercase" htmlFor="bf-date">
          Day
        </label>
        <input
          id="bf-date"
          type="date"
          max={todayYMD()}
          className="bg-bench border-line focus:border-amber/60 rounded-md border px-2.5 py-1.5 text-[13px]"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div>
        <label className="text-muted mb-1 block font-mono text-[10.5px] uppercase" htmlFor="bf-type">
          Workout
        </label>
        <select
          id="bf-type"
          className="bg-bench border-line focus:border-amber/60 rounded-md border px-2.5 py-1.5 text-[13px]"
          value={type}
          onChange={(e) => setType(e.target.value as GymType)}
        >
          <option value="push">Push</option>
          <option value="pull">Pull</option>
          <option value="legs">Legs</option>
          <option value="other">Other</option>
        </select>
      </div>
      <button
        onClick={() => void onLog(date, type)}
        disabled={!date || date > todayYMD()}
        className="bg-amber text-bench rounded-md px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-40"
      >
        Log
      </button>
    </div>
  )
}

function SessionEditor({
  session,
  onSave,
  onCancel
}: {
  session: GymSession
  onSave: (patch: { type: GymType; notes: string | null }) => Promise<void>
  onCancel: () => void
}) {
  const [type, setType] = useState<GymType>(session.type)
  const [notes, setNotes] = useState(session.notes ?? '')
  return (
    <div className="border-line bg-panel mt-1 mb-2 rounded-lg border p-3">
      <div className="flex gap-2">
        {(['push', 'pull', 'legs', 'other'] as GymType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`rounded-md px-2.5 py-1 font-mono text-[11px] transition-colors ${
              type === t ? 'bg-amber text-bench font-semibold' : 'bg-panel2 text-muted hover:text-ink'
            }`}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <textarea
        rows={3}
        className="bg-bench border-line placeholder:text-muted/60 focus:border-amber/60 mt-2 w-full resize-y rounded-md border px-2.5 py-1.5 font-mono text-[12px]"
        placeholder={'Sets & reps, PRs, how it felt…\nBench 80×5×3 · OHP 45×8×3'}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={onCancel} className="text-muted hover:text-ink px-3 py-1.5 text-[12.5px]">
          Cancel
        </button>
        <button
          onClick={() => void onSave({ type, notes: notes.trim() || null })}
          className="bg-amber text-bench rounded-md px-3.5 py-1.5 text-[12.5px] font-semibold"
        >
          Save
        </button>
      </div>
    </div>
  )
}

/** "Jul 19 – 25" (adds year when it differs from now). */
function weekLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number)
  const start = new Date(y, m - 1, d)
  const end = new Date(y, m - 1, d + 6)
  const sameYear = start.getFullYear() === new Date().getFullYear()
  const fmt = (dt: Date, withMonth: boolean) =>
    dt.toLocaleDateString(undefined, {
      month: withMonth ? 'short' : undefined,
      day: 'numeric',
      year: sameYear ? undefined : '2-digit'
    })
  return `${fmt(start, true)} – ${fmt(end, start.getMonth() !== end.getMonth())}`
}

function formatDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const today = todayYMD()
  if (ymd === today) return 'Today'
  if (ymd === addDaysYMD(today, -1)) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
  })
}
