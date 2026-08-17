// Today — the page you land on, built to be read in about three seconds.
//
// Three tiers of decreasing weight rather than a grid of equal cards:
//   1. the day    — what happens today, tasks and timed events in one list,
//                   uncontained because it IS the content
//   2. trackers   — gym and leetcode, deliberately identical in shape so both
//                   read in a single glance: a bar toward this week's target
//   3. the horizon— upcoming events and live postings, quiet and click-through

import { useEffect, useMemo, useState } from 'react'
import type {
  JobPosting,
  LeetcodeDifficulty,
  GymType,
  PlannerEvent,
  Task
} from '../../shared/types'
import { Burst, CheckCircle, TASK_BURST, useCelebrate } from '../components/Celebrate'
import type { ModuleId } from '../components/Sidebar'
import { addDaysYMD, localYMD, timeOfIso, todayYMD, ymdOfIso } from '../lib/dates'
import { topPostings } from '../lib/jobs'
import { progressColor, progressPct } from '../lib/progress'
import { deriveGym, useGym, useGymTarget } from '../lib/useGym'
import { deriveLeetcode, useDsaTarget, useLeetcode } from '../lib/useLeetcode'
import { collapseSeries, useTasks } from '../lib/useTasks'

const GYM_LABEL: Record<GymType, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  other: 'Other'
}

const KIND_COLOR: Record<PlannerEvent['kind'], string> = {
  badminton: '#4FC3F7',
  hackathon: '#A78BFA',
  career: '#F5C56B',
  academic: '#4FD6AC',
  other: '#93A4C8'
}

/** One line in the Today list — a task to tick off or an event to be aware of. */
type DayItem =
  | { type: 'task'; at: number | null; task: Task }
  | { type: 'event'; at: number | null; event: PlannerEvent }

export default function DashboardPage({ onNavigate }: { onNavigate: (m: ModuleId) => void }) {
  const store = useTasks()
  const gym = useGym()
  const gymTarget = useGymTarget()
  const g = deriveGym(gym.sessions, gymTarget)
  const leet = useLeetcode()
  const dsaTarget = useDsaTarget()
  const l = deriveLeetcode(leet.problems, dsaTarget)

  const [events, setEvents] = useState<PlannerEvent[]>([])
  const [gymKey, fireGym] = useCelebrate()
  // Hold a ticked-off task in the list briefly so its animation can finish.
  const [lingering, setLingering] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    window.planner?.eventsList().then(setEvents).catch(() => {})
  }, [])

  const today = todayYMD()

  const linger = (id: string) => {
    setLingering((prev) => new Set(prev).add(id))
    setTimeout(
      () =>
        setLingering((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        }),
      1000
    )
  }

  const openTasks = useMemo(
    () =>
      collapseSeries(
        store.tasks.filter(
          (t) =>
            (t.status === 'open' || lingering.has(t.id)) && t.dueAt && ymdOfIso(t.dueAt) <= today
        )
      ),
    [store.tasks, lingering, today]
  )
  const overdue = openTasks.filter((t) => t.dueAt && ymdOfIso(t.dueAt) < today).length
  const doneToday = store.tasks.filter(
    (t) => t.status === 'done' && t.doneAt && ymdOfIso(t.doneAt) === today
  ).length

  /** Tasks due today (or late) and events happening today, on one timeline. */
  const dayItems = useMemo<DayItem[]>(() => {
    const items: DayItem[] = openTasks.map((t) => ({
      type: 'task',
      at: t.allDay || !t.dueAt ? null : new Date(t.dueAt).getTime(),
      task: t
    }))
    for (const e of events) {
      const start = localYMD(new Date(e.startAt))
      const end = e.endAt ? localYMD(new Date(e.endAt)) : start
      if (today < start || today > end) continue
      const d = new Date(e.startAt)
      const allDay = d.getHours() === 0 && d.getMinutes() === 0
      items.push({ type: 'event', at: allDay ? null : d.getTime(), event: e })
    }
    // Timed things in clock order, then the all-day ones — you scan a day by
    // "when", and undated items have no place on that spine.
    return items.sort((a, b) => {
      if (a.at === null && b.at === null) return 0
      if (a.at === null) return 1
      if (b.at === null) return -1
      return a.at - b.at
    })
  }, [openTasks, events, today])

  /** Next few events. A tournament that lives in the DB as one row per day
   *  collapses to a single line with a range — three identical titles in a
   *  four-line list tells you less than three different ones. */
  const upcoming = useMemo(() => {
    const future = events.filter(
      (e) => new Date(e.startAt).getTime() >= Date.now() - 12 * 3600_000
    )
    const runs: { event: PlannerEvent; through: string | null }[] = []
    for (const e of future) {
      const day = localYMD(new Date(e.startAt))
      const last = runs[runs.length - 1]
      if (last && last.event.title === e.title) {
        const prevEnd = last.through ?? localYMD(new Date(last.event.startAt))
        if (addDaysYMD(prevEnd, 1) === day || prevEnd === day) {
          last.through = day
          continue
        }
      }
      runs.push({ event: e, through: null })
    }
    return runs.slice(0, 4)
  }, [events])

  const hour = new Date().getHours()
  const greeting =
    hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Afternoon' : 'Evening'

  return (
    <div className="animate-rise">
      <p className="text-muted text-meta">
        {new Date().toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric'
        })}
      </p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-display leading-tight font-bold">{greeting}, Skyler</h1>
        {overdue > 0 && (
          <button
            onClick={() => onNavigate('tasks')}
            className="text-coral text-meta font-semibold hover:underline"
          >
            {overdue} overdue
          </button>
        )}
      </div>

      {/* ---- 1. the day ---- */}
      <section className="mt-9">
        <div className="flex items-baseline justify-between">
          <h2 className="section-label">Today</h2>
          <button
            onClick={() => onNavigate('tasks')}
            className="text-muted hover:text-azure text-meta font-medium transition-colors"
          >
            All tasks
          </button>
        </div>

        {dayItems.length === 0 ? (
          <p className="text-muted text-body mt-3">
            {!store.loaded
              ? ' '
              : doneToday > 0
                ? `All clear — ${doneToday} finished today.`
                : 'Nothing due today.'}
          </p>
        ) : (
          <ul className="mt-3">
            {dayItems.map((item) =>
              item.type === 'task' ? (
                <TaskLine
                  key={item.task.id}
                  task={item.task}
                  today={today}
                  onToggle={() => {
                    if (item.task.status === 'open') linger(item.task.id)
                    void store.toggleTask(item.task)
                  }}
                />
              ) : (
                <EventLine
                  key={item.event.id}
                  event={item.event}
                  onOpen={() => onNavigate('events')}
                />
              )
            )}
          </ul>
        )}
      </section>

      {/* ---- 2. trackers ---- */}
      <section className="mt-9">
        <h2 className="section-label">Trackers</h2>
        <div className="surface-recessed mt-3 overflow-hidden">
          <TrackerRow
            label="Gym"
            count={g.weekCount}
            target={gymTarget}
            met={g.weekMet}
            onOpen={() => onNavigate('gym')}
            action={
              g.today.length > 0 ? (
                <span className="text-mint text-meta font-bold">
                  {[...new Set(g.today.map((s) => GYM_LABEL[s.type]))].join(' + ')} done
                </span>
              ) : (
                <span className="relative inline-block">
                  <button
                    onClick={() => {
                      fireGym()
                      void gym.log({ date: today, type: g.nextType })
                    }}
                    className="tactile btn-primary text-meta rounded-[10px] px-3 py-1.5 font-bold"
                  >
                    Log {GYM_LABEL[g.nextType]}
                  </button>
                  <Burst fireKey={gymKey} count={9} spread={40} />
                </span>
              )
            }
          />

          <div className="bg-line/40 h-px" />

          <LeetcodeRow
            derived={l}
            target={dsaTarget}
            today={today}
            onLog={(input) => leet.log(input)}
            onOpen={() => onNavigate('leetcode')}
          />
        </div>
      </section>

      {/* ---- 3. the horizon ---- */}
      <div className="mt-9 grid gap-x-10 gap-y-9 sm:grid-cols-2">
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="section-label">Coming up</h2>
            <button
              onClick={() => onNavigate('events')}
              className="text-muted hover:text-azure text-meta font-medium transition-colors"
            >
              Calendar
            </button>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-muted text-body mt-3">Nothing scheduled.</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {upcoming.map((r) => (
                <UpcomingLine
                  key={r.event.id}
                  event={r.event}
                  through={r.through}
                  onOpen={() => onNavigate('events')}
                />
              ))}
            </ul>
          )}
        </section>

        <JobsRail onOpen={() => onNavigate('career')} />
      </div>
    </div>
  )
}

// ---------- the day ----------

function TaskLine({
  task,
  today,
  onToggle
}: {
  task: Task
  today: string
  onToggle: () => void
}) {
  const isDone = task.status === 'done'
  const late = !isDone && task.dueAt !== null && ymdOfIso(task.dueAt) < today

  return (
    <li className="group flex items-center gap-3 py-2">
      <CheckCircle
        size={18}
        checked={isDone}
        burst={TASK_BURST}
        label={`${isDone ? 'Reopen' : 'Complete'}: ${task.title}`}
        onChange={onToggle}
      />
      <span
        className={`text-body min-w-0 flex-1 truncate ${
          isDone ? 'text-muted line-through' : ''
        }`}
      >
        {task.title}
      </span>
      <span className={`nums text-meta shrink-0 ${late ? 'text-coral' : 'text-muted'}`}>
        {late
          ? lateLabel(task.dueAt!)
          : task.allDay || !task.dueAt
            ? 'all day'
            : timeOfIso(task.dueAt)}
      </span>
    </li>
  )
}

function EventLine({ event, onOpen }: { event: PlannerEvent; onOpen: () => void }) {
  const d = new Date(event.startAt)
  const allDay = d.getHours() === 0 && d.getMinutes() === 0

  return (
    <li>
      <button onClick={onOpen} className="flex w-full items-center gap-3 py-2 text-left">
        {/* Square, not a circle — nothing here is tickable, and the shape says so. */}
        <span
          aria-hidden
          className="ml-[3px] h-3 w-3 shrink-0 rounded-[3px]"
          style={{ background: KIND_COLOR[event.kind] }}
        />
        <span className="text-body min-w-0 flex-1 truncate">{event.title}</span>
        <span className="nums text-meta text-muted shrink-0">
          {allDay ? 'all day' : timeOfIso(event.startAt)}
        </span>
      </button>
    </li>
  )
}

// ---------- trackers ----------

/** The shared shape. Gym and LeetCode are the same kind of object — a weekly
 *  target, a bar showing how near it is, one logging action — so they get the
 *  same row and differ only in their action. */
function TrackerRow({
  label,
  count,
  target,
  met,
  action,
  onOpen
}: {
  label: string
  count: number
  target: number
  met: boolean
  action: React.ReactNode
  onOpen: () => void
}) {
  const pct = progressPct(count, target)

  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      <button
        onClick={onOpen}
        className="hover:text-azure text-body w-20 shrink-0 text-left font-semibold transition-colors"
      >
        {label}
      </button>

      <span className="nums text-meta text-muted w-10 shrink-0">
        <span className={met ? 'text-mint font-bold' : 'text-ink font-bold'}>{count}</span>
        <span aria-hidden>/</span>
        {target}
      </span>

      {/* One continuous bar, not a segment per weekday: the question this row
          answers is "how close am I", not "which days did I go". It takes the
          row's slack so the distance left to run is legible at a glance, and
          its colour carries the same answer for anyone reading at a glance. */}
      <span
        role="progressbar"
        aria-valuenow={count}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-label={`${label}: ${count} of ${target} this week`}
        className="bg-raised relative h-1.5 min-w-[72px] flex-1 overflow-hidden rounded-full"
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-500 ease-(--ease-spring)"
          style={{ width: `${pct}%`, background: progressColor(pct) }}
        />
      </span>

      <span className="shrink-0">{action}</span>
    </div>
  )
}

/** LeetCode can't be a one-click log the way gym is — a solve needs a problem
 *  name — so the row opens into a single inline line instead of a form. */
function LeetcodeRow({
  derived,
  target,
  today,
  onLog,
  onOpen
}: {
  derived: ReturnType<typeof deriveLeetcode>
  target: number
  today: string
  onLog: (input: { date: string; title: string; difficulty: LeetcodeDifficulty }) => Promise<void>
  onOpen: () => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [difficulty, setDifficulty] = useState<LeetcodeDifficulty>('medium')
  const [key, fire] = useCelebrate()

  const submit = async () => {
    if (!title.trim()) return
    fire()
    await onLog({ date: today, title: title.trim(), difficulty })
    setTitle('')
    setOpen(false)
  }

  if (open) {
    return (
      <div className="flex items-center gap-2 px-4 py-3.5">
        {/* Keeps the row's identity while it's open — without it the expanded
            line reads as an orphan input floating under Gym. */}
        <span className="text-body w-20 shrink-0 font-semibold">LeetCode</span>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void submit()
            } else if (e.key === 'Escape') {
              setTitle('')
              setOpen(false)
            }
          }}
          placeholder="Problem name"
          aria-label="Problem name"
          className="bg-bg text-body placeholder:text-faint focus:ring-azure/60 min-w-0 flex-1 rounded-[10px] px-3 py-1.5 outline-none focus:ring-1"
        />
        <div className="flex shrink-0 gap-1" role="group" aria-label="Difficulty">
          {(['easy', 'medium', 'hard'] as const).map((d) => (
            <button
              key={d}
              aria-pressed={difficulty === d}
              onClick={() => setDifficulty(d)}
              title={d}
              className={`tactile text-meta w-8 rounded-[9px] py-1.5 font-bold capitalize ${
                difficulty === d ? DIFF_ON[d] : 'bg-bg text-faint hover:text-muted'
              }`}
            >
              {d[0].toUpperCase()}
            </button>
          ))}
        </div>
        <span className="relative inline-block shrink-0">
          <button
            onClick={() => void submit()}
            disabled={!title.trim()}
            className="tactile btn-primary text-meta rounded-[10px] px-3 py-1.5 font-bold disabled:opacity-35"
          >
            Log
          </button>
          <Burst fireKey={key} count={9} spread={40} />
        </span>
      </div>
    )
  }

  return (
    <TrackerRow
      label="LeetCode"
      count={derived.weekCount}
      target={target}
      met={derived.weekMet}
      onOpen={onOpen}
      action={
        <button
          onClick={() => setOpen(true)}
          className="tactile btn-primary text-meta rounded-[10px] px-3 py-1.5 font-bold"
        >
          Log solve
        </button>
      }
    />
  )
}

const DIFF_ON: Record<LeetcodeDifficulty, string> = {
  easy: 'bg-mint/20 text-mint',
  medium: 'bg-gold/20 text-gold',
  hard: 'bg-coral/20 text-coral'
}

// ---------- horizon ----------

function UpcomingLine({
  event,
  through,
  onOpen
}: {
  event: PlannerEvent
  /** Last day of a run of same-titled events, when it spans more than one. */
  through: string | null
  onOpen: () => void
}) {
  const d = new Date(event.startAt)
  const regOpen =
    event.regOpensAt &&
    event.regClosesAt &&
    !event.registered &&
    Date.now() >= new Date(event.regOpensAt).getTime() &&
    Date.now() < new Date(event.regClosesAt).getTime()

  return (
    <li>
      <button onClick={onOpen} className="flex w-full items-baseline gap-3 text-left">
        <span
          className="nums text-meta w-[74px] shrink-0 font-semibold"
          style={{ color: KIND_COLOR[event.kind] }}
        >
          {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          {through && `–${new Date(`${through}T00:00:00`).getDate()}`}
        </span>
        <span className="text-body min-w-0 flex-1 truncate">{event.title}</span>
        {regOpen && (
          <span className="bg-gold/20 text-gold text-micro shrink-0 rounded-full px-2 py-0.5 font-bold">
            register
          </span>
        )}
      </button>
    </li>
  )
}

/** Live internship postings. The feed is fetched on demand with a ~10-minute
 *  cache and is never polled — landing here counts as the demand. It must never
 *  hold up the page, so the section renders immediately and fills in late; a
 *  dead source degrades to one quiet line. */
function JobsRail({ onOpen }: { onOpen: () => void }) {
  const [postings, setPostings] = useState<JobPosting[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [focus, setFocus] = useState<'swe' | 'hardware'>('swe')

  useEffect(() => {
    let alive = true
    void (async () => {
      if (!window.planner) return
      try {
        const settings = await window.planner.getSettings()
        if (alive) setFocus(settings.internshipTrackFocus)
        const res = await window.planner.jobsFetch()
        if (!alive) return
        if (res.ok) {
          setPostings(res.postings)
          setState('ready')
        } else {
          setState('failed')
        }
      } catch {
        if (alive) setState('failed')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const shown = useMemo(() => topPostings(postings, focus), [postings, focus])

  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="section-label">Postings</h2>
        <button
          onClick={onOpen}
          className="text-muted hover:text-azure text-meta font-medium transition-colors"
        >
          Career
        </button>
      </div>

      {state === 'loading' ? (
        <ul className="mt-3 space-y-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <li key={i} className="space-y-1.5">
              <span className="bg-raised block h-3 w-2/3 rounded-full" />
              <span className="bg-raised/60 block h-2.5 w-1/3 rounded-full" />
            </li>
          ))}
        </ul>
      ) : state === 'failed' ? (
        <p className="text-muted text-body mt-3">
          Couldn&rsquo;t reach the job lists.{' '}
          <button onClick={onOpen} className="text-azure hover:underline">
            Open Career
          </button>
        </p>
      ) : shown.length === 0 ? (
        <p className="text-muted text-body mt-3">No {focus === 'swe' ? 'software' : 'hardware'} postings right now.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {shown.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => void window.planner?.openExternal(p.url)}
                title={`${p.company} — ${p.title}`}
                className="group block w-full text-left"
              >
                <span className="text-body block truncate">
                  <span className="font-semibold">{p.company}</span>
                  <span className="text-muted"> · {p.title}</span>
                </span>
                <span className="text-meta text-faint group-hover:text-muted block truncate transition-colors">
                  {p.locations[0] ?? 'Location not listed'}
                  {p.salary ? ` · ${p.salary}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ---------- helpers ----------

/** How late something is, for tasks that slipped past their day. */
function lateLabel(dueAt: string): string {
  // Parsed as local wall time: new Date('2026-08-10') would be UTC midnight,
  // which is the previous day west of Greenwich.
  const atLocalNoon = (ymd: string): number => {
    const [y, m, d] = ymd.split('-').map(Number)
    return new Date(y, m - 1, d).getTime()
  }
  const days = Math.round((atLocalNoon(todayYMD()) - atLocalNoon(ymdOfIso(dueAt))) / 86_400_000)
  if (days <= 0) return 'late'
  if (days === 1) return 'yesterday'
  return `${days}d late`
}
