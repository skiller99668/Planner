import { useState } from 'react'
import DateField from '../components/DateField'
import Select from '../components/Select'
import type { GymSession, GymType } from '../../shared/types'
import { Burst, useCelebrate, useFlash, useThresholdCross } from '../components/Celebrate'
import { addDaysYMD, todayYMD } from '../lib/dates'
import { progressColor, progressPct } from '../lib/progress'
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
  const [selectedDate, setSelectedDate] = useState(todayYMD())
  const [logKey, fireLog] = useCelebrate()
  const [targetKey, fireTarget] = useCelebrate()
  // Grid-cell burst, tagged with the logged date so only that cell celebrates
  // (and merely selecting a day never triggers it).
  const [cellBurst, setCellBurst] = useState({ date: '', key: 0 })
  // Crossing the weekly target is the milestone moment, so it gets its own flourish.
  useThresholdCross(g.weekCount, target, fireTarget)
  const ringOn = useFlash(logKey, 900)
  const sheenOn = useFlash(targetKey)

  const today = todayYMD()
  const isToday = selectedDate === today
  const selSessions = g.byDate.get(selectedDate) ?? []
  const loggedSel = selSessions.length > 0

  // Log a workout for whichever day is in focus, with the full celebration —
  // the same dopamine hit whether it's today or a day you're backfilling.
  const logFor = (date: string, type: GymType, alreadyDone: boolean) => {
    if (!alreadyDone) {
      fireLog()
      setCellBurst((p) => ({ date, key: p.key + 1 }))
    }
    void store.log({ date, type })
  }

  const viewStart = addDaysYMD(g.weekStart, weekOffset * 7)
  const viewDates = Array.from({ length: 7 }, (_, i) => addDaysYMD(viewStart, i))
  const viewCount = viewDates.filter((d) => g.byDate.has(d)).length
  const viewMet = viewCount >= target
  const viewPct = progressPct(viewCount, target)

  return (
    <div>
      <h1 className="text-[26px] font-bold">Gym</h1>
      <p className="text-muted mt-0.5 text-[13.5px]">Push · Pull · Legs</p>

      {/* Cycle + one-tap log */}
      <section
        className={`bg-surface relative mt-6 max-w-2xl overflow-hidden rounded-[20px] p-6 shadow-[var(--shadow-soft)] ${
          ringOn ? 'animate-ring' : ''
        }`}
      >
        {isToday ? (
          !loggedSel ? (
            <>
              <p className="text-muted text-[13px] font-medium">Up next</p>
              <p className="text-azure mt-1 text-[30px] leading-tight font-bold">
                {TYPE_LABEL[g.nextType]}
              </p>
            </>
          ) : (
            <>
              <p className="text-muted text-[13px] font-medium">Done today</p>
              <p className="text-mint mt-1 flex items-baseline gap-2.5 text-[30px] leading-tight font-bold">
                {[...new Set(selSessions.map((s) => TYPE_LABEL[s.type]))].join(' + ')}
                <span className="text-muted text-[13px] font-medium">
                  {TYPE_LABEL[g.nextType]} tomorrow
                </span>
              </p>
            </>
          )
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted text-[13px] font-medium">{formatDay(selectedDate)}</p>
              <button
                onClick={() => setSelectedDate(today)}
                className="text-muted hover:text-azure text-[12.5px] font-medium transition-colors"
              >
                Back to today
              </button>
            </div>
            <p
              className={`mt-1 text-[30px] leading-tight font-bold ${
                loggedSel ? 'text-mint' : 'text-faint'
              }`}
            >
              {loggedSel
                ? [...new Set(selSessions.map((s) => TYPE_LABEL[s.type]))].join(' + ')
                : 'Not logged'}
            </p>
          </>
        )}

        <div className="mt-5 flex gap-2.5">
          {PPL_ORDER.map((t) => {
            const suggested = isToday && t === g.nextType && !loggedSel
            const doneSel = selSessions.some((s) => s.type === t)
            return (
              <span key={t} className="relative flex-1">
                <button
                  onClick={() => logFor(selectedDate, t, doneSel)}
                  className={`tactile w-full rounded-[14px] px-3 py-3.5 text-[14.5px] font-bold ${
                    doneSel
                      ? 'bg-mint/15 text-mint'
                      : suggested
                        ? 'bg-azure text-bg shadow-[var(--shadow-soft)]'
                        : 'bg-raised text-muted hover:text-ink'
                  }`}
                >
                  {TYPE_LABEL[t]}
                </button>
                {doneSel && <Burst fireKey={logKey} count={9} spread={44} />}
              </span>
            )
          })}
        </div>
        {loggedSel && (
          <button
            onClick={() => void store.remove(selSessions[0].id)}
            className="text-faint hover:text-coral mt-3 text-[12.5px] transition-colors"
          >
            Undo
          </button>
        )}
      </section>

      {/* Week grid + streak */}
      <section
        className={`bg-surface relative mt-4 max-w-2xl overflow-hidden rounded-[20px] p-6 shadow-[var(--shadow-soft)] ${
          sheenOn ? 'animate-sheen' : ''
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setWeekOffset((o) => Math.max(-MAX_WEEKS_BACK, o - 1))}
              disabled={weekOffset <= -MAX_WEEKS_BACK}
              aria-label="Previous week"
              className="text-muted hover:text-azure tactile rounded-lg px-1.5 text-[16px] disabled:opacity-25"
            >
              ‹
            </button>
            <p className="min-w-32 text-center text-[13px] font-semibold">
              {weekOffset === 0 ? 'This week' : weekLabel(viewStart)}
            </p>
            <button
              onClick={() => setWeekOffset((o) => Math.min(0, o + 1))}
              disabled={weekOffset === 0}
              aria-label="Next week"
              className="text-muted hover:text-azure tactile rounded-lg px-1.5 text-[16px] disabled:opacity-25"
            >
              ›
            </button>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="text-muted hover:text-azure ml-1 text-[12.5px] transition-colors"
              >
                Today
              </button>
            )}
          </div>
          <p className="nums text-[13px] font-semibold">
            <span className={viewMet ? 'text-mint' : 'text-ink'}>{viewCount}</span>
            <span className="text-faint"> / {target}</span>
          </p>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {viewDates.map((date, i) => {
            const sessions = g.byDate.get(date) ?? []
            const isTodayCell = date === today
            const isFuture = date > today
            const isSel = date === selectedDate
            return (
              <button
                key={date}
                type="button"
                disabled={isFuture}
                aria-pressed={isSel}
                onClick={() => setSelectedDate(date)}
                className={`tactile relative flex h-16 flex-col items-center justify-center gap-1 rounded-[13px] text-center transition-colors ${
                  isSel ? 'ring-azure ring-2' : isTodayCell ? 'ring-azure/50 ring-2' : ''
                } ${sessions.length ? 'bg-mint/15' : 'bg-bg'} ${
                  isFuture ? 'cursor-default opacity-40' : 'hover:bg-raised'
                }`}
                title={`${date}${sessions.length ? ` · ${sessions.map((s) => TYPE_LABEL[s.type]).join(', ')}` : ''}`}
              >
                <span className="text-faint text-[10.5px] font-semibold">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'][i]}
                </span>
                <span
                  className={`text-[13px] font-bold ${
                    sessions.length ? 'text-mint' : 'text-faint/50'
                  }`}
                >
                  {sessions.length
                    ? [...new Set(sessions.map((s) => TYPE_SHORT[s.type]))].join('+')
                    : '·'}
                </span>
                <Burst fireKey={date === cellBurst.date ? cellBurst.key : 0} count={9} spread={40} />
              </button>
            )
          })}
        </div>
        <p className="text-faint mt-2 text-[11.5px]">
          {isToday ? 'Tap any day to log a workout for it.' : 'Logging for the selected day.'}
        </p>

        <div
          role="progressbar"
          aria-valuenow={viewCount}
          aria-valuemin={0}
          aria-valuemax={target}
          aria-label={`${viewCount} of ${target} workouts this week`}
          className="bg-bg mt-4 h-1.5 overflow-hidden rounded-full"
        >
          <div
            className="h-full rounded-full transition-[width,background-color] duration-500 ease-(--ease-spring)"
            style={{ width: `${viewPct}%`, background: progressColor(viewPct) }}
          />
        </div>

        <div className="text-muted mt-4 flex gap-6 text-[12.5px]">
          <span>
            <span className={`nums font-bold ${g.weekStreak > 0 ? 'text-gold' : 'text-ink'}`}>
              {g.weekStreak}
            </span>{' '}
            week streak
          </span>
          <span>
            <span className="nums text-ink font-bold">{g.totalSessions}</span> sessions logged
          </span>
        </div>
      </section>

      {/* History */}
      <section className="mt-6 max-w-2xl">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-bold">History</h2>
          <button
            onClick={() => setBackfillOpen((o) => !o)}
            className="text-muted hover:text-azure text-[12.5px] font-medium transition-colors"
          >
            {backfillOpen ? 'Close' : 'Log a past day'}
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
          <p className="text-muted mt-3 text-[13.5px]">
            No sessions yet — the cycle starts with Push.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {store.sessions.slice(0, 30).map((s) => (
              <li key={s.id}>
                <div className="group bg-surface hover:bg-raised flex items-center gap-3 rounded-[14px] px-3.5 py-2.5 shadow-[var(--shadow-soft)] transition-colors">
                  <span className="bg-mint/15 text-mint w-10 shrink-0 rounded-full py-1 text-center text-[11.5px] font-bold">
                    {TYPE_SHORT[s.type]}
                  </span>
                  <button
                    onClick={() => setEditingId(editingId === s.id ? null : s.id)}
                    className="min-w-0 flex-1 text-left"
                    title="Edit session"
                  >
                    <span className="text-[13.5px] font-medium">{formatDay(s.date)}</span>
                    <span className="text-muted ml-2 text-[12.5px]">{TYPE_LABEL[s.type]}</span>
                    {s.notes && (
                      <span className="text-faint ml-2 truncate text-[12px]">
                        {s.notes.split('\n')[0]}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => void store.remove(s.id)}
                    aria-label={`Delete session ${s.date}`}
                    className="text-faint hover:text-coral tactile rounded-lg p-1.5"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="1.9" strokeLinecap="round" aria-hidden>
                      <path d="M5 7.5h14M10 11v5.5M14 11v5.5M6.5 7.5 7.5 19h9l1-11.5M9.5 7.5V5h5v2.5" />
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
    <div className="bg-surface mt-2 flex flex-wrap items-end gap-3 rounded-[16px] p-4 shadow-[var(--shadow-soft)]">
      <div>
        <span className="text-muted mb-1.5 block text-[12px] font-semibold">
          Day
        </span>
        <DateField
          value={date}
          ariaLabel="Day"
          max={todayYMD()}
          clearable={false}
          onChange={setDate}
        />
      </div>
      <div>
        <span className="text-muted mb-1.5 block text-[12px] font-semibold">
          Workout
        </span>
        <Select
          value={type}
          ariaLabel="Workout"
          onChange={(val) => setType(val as GymType)}
          options={[
            { value: 'push', label: 'Push' },
            { value: 'pull', label: 'Pull' },
            { value: 'legs', label: 'Legs' },
            { value: 'other', label: 'Other' }
          ]}
        />
      </div>
      <button
        onClick={() => void onLog(date, type)}
        disabled={!date || date > todayYMD()}
        className="tactile btn-primary rounded-[11px] px-4 py-2 text-[13px] font-bold disabled:opacity-35"
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
    <div className="bg-surface mt-1.5 mb-2 rounded-[16px] p-4 shadow-[var(--shadow-lift)]">
      <div className="flex gap-2">
        {(['push', 'pull', 'legs', 'other'] as GymType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`tactile rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold ${
              type === t ? 'btn-primary' : 'bg-raised text-muted hover:text-ink'
            }`}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <textarea
        rows={3}
        className="bg-bg placeholder:text-faint focus:ring-azure/60 mt-3 w-full resize-y rounded-[10px] px-3 py-2 text-[13px] outline-none focus:ring-1"
        placeholder={'Sets & reps, PRs, how it felt…\nBench 80×5×3 · OHP 45×8×3'}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={onCancel} className="text-muted hover:text-ink px-3 py-2 text-[13px]">
          Cancel
        </button>
        <button
          onClick={() => void onSave({ type, notes: notes.trim() || null })}
          className="tactile btn-primary rounded-[11px] px-4 py-2 text-[13px] font-bold"
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
