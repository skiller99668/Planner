// Events — a calendar you create straight into, in month, week, day or list
// view. Click any day (or drag across hours in week/day) and a bubble opens
// there with the title focused; Enter saves. Clicking an event opens the same
// bubble in read mode. Imports and hackathon links sit below the grid, where
// they don't compete with the calendar.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConfirm } from '../components/ConfirmProvider'
import TimeField, { formatTimeLabel } from '../components/TimeField'
import DateField from '../components/DateField'
import Select from '../components/Select'
import { useAnchoredStyle, useDismiss } from '../components/Popover'
import type { EventKind, FeedEvent, PlannerEvent } from '../../shared/types'
import { addDaysYMD, localYMD, todayYMD } from '../lib/dates'

/** One row per kind: label and the hue it carries everywhere on this page. */
const KINDS: { id: EventKind; label: string; color: string }[] = [
  { id: 'badminton', label: 'Badminton', color: '#4FC3F7' },
  { id: 'hackathon', label: 'Hackathon', color: '#A78BFA' },
  { id: 'career', label: 'Career', color: '#F5C56B' },
  { id: 'academic', label: 'Academic', color: '#4FD6AC' },
  { id: 'other', label: 'Other', color: '#93A4C8' }
]
const KIND_COLOR = Object.fromEntries(KINDS.map((k) => [k.id, k.color])) as Record<
  EventKind,
  string
>
const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.id, k.label])) as Record<
  EventKind,
  string
>

/** Hackathons worth knowing about — opened in the browser, not scraped. */
const HACKATHON_LINKS = [
  { name: 'MLH 2026–27 season', url: 'https://mlh.io/seasons/2026/events' },
  { name: 'McHacks (McGill)', url: 'https://mchacks.ca' },
  { name: 'ConUHacks (Concordia)', url: 'https://conuhacks.io' },
  { name: 'HackTheNorth (Waterloo)', url: 'https://hackthenorth.com' },
  { name: 'Devpost hackathons', url: 'https://devpost.com/hackathons' }
]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const inputCls =
  'bg-bg rounded-[10px] px-2.5 py-1.5 text-[13px] placeholder:text-faint outline-none focus:ring-1 focus:ring-azure/60'

// POPUP_CLASS's chrome with the roomier padding a bubble needs. Spelled out
// rather than appended to it: two padding utilities on one element resolve by
// stylesheet order, not by which was written last.
const BUBBLE_CLASS =
  'bg-raised animate-pop fixed z-50 rounded-[16px] p-3.5 shadow-[var(--shadow-lift)]'

/** Wide enough for the start/end rows to keep their fields on one line. */
const BUBBLE_W = 348

/** Height of one hour in the week/day grids, and the granularity a drag snaps
 *  to. 56px keeps a 30-minute block tall enough to hold a title. */
const HOUR_H = 56
const SNAP_MIN = 15

type View = 'month' | 'week' | 'day' | 'list'
const VIEWS: View[] = ['month', 'week', 'day', 'list']

/** What the anchored bubble is showing, and the rect it hangs off. A create
 *  bubble carries the period the drag described, when there was one. */
type Bubble =
  | {
      mode: 'create'
      rect: DOMRect
      date: string
      time?: string
      endDate?: string
      endTime?: string
    }
  | { mode: 'event'; rect: DOMRect; id: string }
  | { mode: 'day'; rect: DOMRect; date: string }
  | null

export default function EventsPage() {
  const [events, setEvents] = useState<PlannerEvent[]>([])
  const [loaded, setLoaded] = useState(false)
  const [importKind, setImportKind] = useState<EventKind>('badminton')
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [showPast, setShowPast] = useState(false)
  const [view, setView] = useState<View>('month')
  const [cursor, setCursor] = useState(() => new Date())
  const [bubble, setBubble] = useState<Bubble>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Badminton Québec import panel
  const [bqOpen, setBqOpen] = useState(false)
  const [bqEvents, setBqEvents] = useState<FeedEvent[]>([])
  const [bqPicked, setBqPicked] = useState<ReadonlySet<string>>(new Set())
  const [bqBusy, setBqBusy] = useState(false)
  const [bqError, setBqError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!window.planner) return
    setEvents(await window.planner.eventsList())
    setLoaded(true)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const closeBubble = useCallback(() => setBubble(null), [])

  const now = Date.now()
  const upcoming = useMemo(
    () => events.filter((e) => new Date(e.endAt ?? e.startAt).getTime() >= now - 12 * 3600_000),
    [events, now]
  )
  const past = useMemo(
    () =>
      events
        .filter((e) => new Date(e.endAt ?? e.startAt).getTime() < now - 12 * 3600_000)
        .reverse()
        .slice(0, 15),
    [events, now]
  )

  const byMonth = useMemo(() => {
    const groups: { label: string; items: PlannerEvent[] }[] = []
    for (const e of upcoming) {
      const label = new Date(e.startAt)
        .toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        .toUpperCase()
      const last = groups[groups.length - 1]
      if (last && last.label === label) last.items.push(e)
      else groups.push({ label, items: [e] })
    }
    return groups
  }, [upcoming])

  /** Every day an event covers, so multi-day events show across the grid. */
  const byDay = useMemo(() => {
    const map = new Map<string, PlannerEvent[]>()
    for (const e of events) {
      const { startDay, endDay } = spanOf(e)
      let d = startDay
      for (let guard = 0; guard < 400 && d <= endDay; guard++) {
        const list = map.get(d)
        if (list) list.push(e)
        else map.set(d, [e])
        d = addDaysYMD(d, 1)
      }
    }
    return map
  }, [events])

  /** Days covered by an open registration window, and how urgent each is.
   *  This is the point of the calendar: the window is the deadline, not the
   *  tournament date. */
  const regDays = useMemo(() => {
    const map = new Map<string, RegDay>()
    for (const e of events) {
      if (!e.regOpensAt || !e.regClosesAt || e.registered) continue
      // A window that has already closed is history, not a deadline — leaving
      // it on the grid paints old weeks urgent-red for something you can no
      // longer act on.
      if (new Date(e.regClosesAt).getTime() < now) continue
      const open = localYMD(new Date(e.regOpensAt))
      const close = localYMD(new Date(e.regClosesAt))
      const closesIn = Math.ceil((new Date(e.regClosesAt).getTime() - now) / 86_400_000)
      let d = open
      for (let guard = 0; guard < 60 && d <= close; guard++) {
        map.set(d, { isStart: d === open, isEnd: d === close, urgent: closesIn <= 3, title: e.title })
        d = addDaysYMD(d, 1)
      }
    }
    return map
  }, [events, now])

  /** The window to act on: one that's open now, else the next to open. */
  const lead = useMemo(() => {
    const windows = events
      .filter((e) => e.regOpensAt && e.regClosesAt && !e.registered)
      .map((e) => ({
        event: e,
        opens: new Date(e.regOpensAt!).getTime(),
        closes: new Date(e.regClosesAt!).getTime()
      }))
      .filter((w) => w.closes > now)
      .sort((a, b) => a.closes - b.closes)
    return windows.find((w) => w.opens <= now) ?? windows[0] ?? null
  }, [events, now])

  const doImport = async () => {
    if (!window.planner) return
    const res = await window.planner.eventsImportIcs(importKind)
    if (res.canceled) return
    setImportMsg(`Imported ${res.imported}${res.skipped ? ` · ${res.skipped} already known` : ''}`)
    setTimeout(() => setImportMsg(null), 5000)
    await refresh()
  }

  const fetchBq = async () => {
    if (!window.planner) return
    setBqOpen(true)
    setBqBusy(true)
    setBqError(null)
    const res = await window.planner.eventsFetchBadminton(bqEvents.length > 0)
    setBqBusy(false)
    if (res.ok) {
      setBqEvents(res.events)
      setBqPicked(new Set())
    } else {
      setBqError(res.error)
    }
  }

  const importBq = async () => {
    if (!window.planner) return
    const chosen = bqEvents.filter((e) => bqPicked.has(e.uid))
    if (chosen.length === 0) return
    setBqBusy(true)
    const res = await window.planner.eventsImportFeed(chosen)
    setBqBusy(false)
    setImportMsg(`Added ${res.imported}${res.skipped ? ` · ${res.skipped} already tracked` : ''}`)
    setTimeout(() => setImportMsg(null), 5000)
    setBqOpen(false)
    await refresh()
  }

  const month = cursor.getMonth()
  const year = cursor.getFullYear()
  const today = todayYMD()
  const cursorDay = localYMD(cursor)

  // The days the view is looking at: one, seven, or the month behind it.
  // Nav, title and the day a bare "Create" lands on all read off this.
  const weekDays = useMemo(() => {
    const start = addDaysYMD(cursorDay, -cursor.getDay())
    return Array.from({ length: 7 }, (_, i) => addDaysYMD(start, i))
  }, [cursorDay, cursor])
  const gridDays = view === 'day' ? [cursorDay] : weekDays

  const step = (dir: number) => {
    if (view === 'week') setCursor(shiftDays(cursor, 7 * dir))
    else if (view === 'day') setCursor(shiftDays(cursor, dir))
    else setCursor(new Date(year, month + dir, 1))
  }

  // "Create" with no day in mind lands on today when today is on screen,
  // otherwise on the first day you're looking at. Compared as strings:
  // new Date('2026-08-08') is UTC midnight, which is the 7th west of Greenwich.
  const inMonth = today.slice(0, 7) === `${year}-${String(month + 1).padStart(2, '0')}`
  const defaultDay =
    view === 'week' || view === 'day'
      ? (gridDays.includes(today) ? today : gridDays[0])
      : inMonth
        ? today
        : localYMD(new Date(year, month, 1))

  const bubbleEvent =
    bubble?.mode === 'event' ? (events.find((e) => e.id === bubble.id) ?? null) : null

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <h1 className="mr-2 text-[26px] font-bold">
            <RangeTitle view={view} month={month} year={year} days={gridDays} />
          </h1>
          {view !== 'list' && (
            <>
              <button
                onClick={() => step(-1)}
                aria-label={`Previous ${view}`}
                className="tactile text-muted hover:text-ink hover:bg-surface rounded-[10px] px-2 py-1.5"
              >
                <Caret dir="left" />
              </button>
              <button
                onClick={() => step(1)}
                aria-label={`Next ${view}`}
                className="tactile text-muted hover:text-ink hover:bg-surface rounded-[10px] px-2 py-1.5"
              >
                <Caret dir="right" />
              </button>
              <button
                onClick={() => setCursor(new Date())}
                className="tactile text-muted hover:text-ink hover:bg-surface ml-1 rounded-[10px] px-3 py-1.5 text-[12.5px] font-medium"
              >
                Today
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-surface flex rounded-[11px] p-0.5" role="group" aria-label="View">
            {VIEWS.map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`tactile rounded-[9px] px-3 py-1.5 text-[12.5px] font-medium capitalize ${
                  view === v ? 'btn-primary' : 'text-muted hover:text-ink'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={(e) =>
              setBubble({
                mode: 'create',
                rect: e.currentTarget.getBoundingClientRect(),
                date: defaultDay
              })
            }
            className="tactile btn-primary rounded-[11px] px-4 py-2 text-[13px] font-bold"
          >
            Create
          </button>
        </div>
      </div>

      {lead && <RegLead lead={lead} now={now} />}

      {view === 'month' ? (
        <MonthGrid
          year={year}
          month={month}
          byDay={byDay}
          regDays={regDays}
          activeDay={bubble && bubble.mode !== 'event' ? bubble.date : null}
          onOpen={setBubble}
        />
      ) : view === 'week' || view === 'day' ? (
        <TimeGrid
          days={gridDays}
          byDay={byDay}
          regDays={regDays}
          today={today}
          activeDay={bubble && bubble.mode !== 'event' ? bubble.date : null}
          onOpen={setBubble}
          onPickDay={
            view === 'week'
              ? (ymd) => {
                  setCursor(parseYMD(ymd))
                  setView('day')
                }
              : undefined
          }
        />
      ) : (
        <ListView
          loaded={loaded}
          byMonth={byMonth}
          past={past}
          showPast={showPast}
          setShowPast={setShowPast}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          onChanged={refresh}
        />
      )}

      {bubble?.mode === 'create' && (
        <QuickCreate
          rect={bubble.rect}
          date={bubble.date}
          time={bubble.time}
          endDate={bubble.endDate}
          endTime={bubble.endTime}
          onClose={closeBubble}
          onCreated={async () => {
            await refresh()
            closeBubble()
          }}
        />
      )}
      {bubbleEvent && bubble?.mode === 'event' && (
        <EventBubble
          rect={bubble.rect}
          event={bubbleEvent}
          onClose={closeBubble}
          onChanged={refresh}
        />
      )}
      {bubble?.mode === 'day' && (
        <DayBubble
          rect={bubble.rect}
          date={bubble.date}
          events={byDay.get(bubble.date) ?? []}
          onClose={closeBubble}
          onPick={(id, rect) => setBubble({ mode: 'event', rect, id })}
        />
      )}

      <SourcesBar
        importKind={importKind}
        setImportKind={setImportKind}
        importMsg={importMsg}
        onIcs={() => void doImport()}
        onBq={() => void fetchBq()}
      />

      {bqOpen && (
        <BadmintonPanel
          busy={bqBusy}
          error={bqError}
          events={bqEvents}
          known={new Set(events.map((e) => e.externalUid).filter(Boolean) as string[])}
          picked={bqPicked}
          setPicked={setBqPicked}
          onImport={() => void importBq()}
          onClose={() => setBqOpen(false)}
          onRefetch={() => void fetchBq()}
        />
      )}
    </div>
  )
}

/** A day inside an open registration window. */
interface RegDay {
  isStart: boolean
  isEnd: boolean
  urgent: boolean
  title: string
}

interface Lead {
  event: PlannerEvent
  opens: number
  closes: number
}

// ---------- month grid ----------

function MonthGrid({
  year,
  month,
  byDay,
  regDays,
  activeDay,
  onOpen
}: {
  year: number
  month: number
  byDay: Map<string, PlannerEvent[]>
  regDays: Map<string, RegDay>
  activeDay: string | null
  onOpen: (b: Bubble) => void
}) {
  const first = new Date(year, month, 1)
  const gridStart = addDaysYMD(localYMD(first), -first.getDay())
  const weeks = Math.ceil((first.getDay() + new Date(year, month + 1, 0).getDate()) / 7)
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDaysYMD(gridStart, i))
  const today = todayYMD()

  return (
    <div className="mt-5">
      <div className="grid grid-cols-7 gap-px">
        {DOW.map((d) => (
          <span key={d} className="text-faint pb-2 text-center text-[11px] font-semibold tracking-wide">
            {d}
          </span>
        ))}
      </div>
      {/* The hairline gap between cells is the grid's own background showing
          through, so the month reads as one surface rather than 35 cards. */}
      <div className="bg-line/40 grid grid-cols-7 gap-px overflow-hidden rounded-[14px]">
        {days.map((ymd) => (
          <DayCell
            key={ymd}
            ymd={ymd}
            month={month}
            today={today}
            active={ymd === activeDay}
            events={byDay.get(ymd) ?? []}
            reg={regDays.get(ymd)}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  )
}

function DayCell({
  ymd,
  month,
  today,
  active,
  events,
  reg,
  onOpen
}: {
  ymd: string
  month: number
  today: string
  active: boolean
  events: PlannerEvent[]
  reg: RegDay | undefined
  onOpen: (b: Bubble) => void
}) {
  const d = new Date(`${ymd}T00:00:00`)
  const outside = d.getMonth() !== month
  const isToday = ymd === today
  const shown = events.slice(0, 3)
  const hidden = events.length - shown.length
  const cell = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={cell}
      className={`group relative min-h-[104px] transition-colors ${
        outside ? 'bg-surface/40' : 'bg-surface/85'
      } ${active ? 'bg-raised' : 'hover:bg-raised'}`}
    >
      {/* The cell's empty area is the create affordance, as its own button
          underneath the chips — so a chip is never nested inside it. */}
      <button
        onClick={() =>
          onOpen({
            mode: 'create',
            rect: cell.current!.getBoundingClientRect(),
            date: ymd
          })
        }
        aria-label={`Add an event on ${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`}
        className="absolute inset-0 h-full w-full cursor-pointer"
      />

      <div className="pointer-events-none relative flex h-full flex-col gap-1 p-1.5 pb-3">
        <div className="flex items-center justify-between">
          <span
            className={`nums inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1 text-[11.5px] font-semibold ${
              isToday ? 'btn-primary' : outside ? 'text-faint' : 'text-muted'
            }`}
          >
            {d.getDate()}
          </span>
          {/* Reinforces that the cell is clickable without adding permanent ink. */}
          <span
            aria-hidden
            className="text-faint pr-0.5 text-[15px] leading-none opacity-0 transition-opacity group-hover:opacity-100"
          >
            +
          </span>
        </div>

        {shown.map((e) => (
          <EventChip key={e.id} event={e} ymd={ymd} onOpen={onOpen} />
        ))}
        {hidden > 0 && (
          <button
            onClick={(ev) =>
              onOpen({ mode: 'day', rect: ev.currentTarget.getBoundingClientRect(), date: ymd })
            }
            className="text-muted hover:text-ink pointer-events-auto px-1 text-left text-[10.5px] font-medium transition-colors"
          >
            {hidden} more
          </button>
        )}
      </div>

      {reg && (
        <span
          aria-hidden
          title={`Registration open — ${reg.title}`}
          className={`absolute right-0 bottom-1.5 left-0 h-[3px] ${
            reg.urgent ? 'bg-coral' : 'bg-gold'
          } ${reg.isStart ? 'ml-1.5 rounded-l-full' : ''} ${reg.isEnd ? 'mr-1.5 rounded-r-full' : ''}`}
        />
      )}
    </div>
  )
}

function EventChip({
  event,
  ymd,
  onOpen
}: {
  event: PlannerEvent
  ymd: string
  onOpen: (b: Bubble) => void
}) {
  const color = KIND_COLOR[event.kind]
  const d = new Date(event.startAt)
  // Only the first day of a run carries the clock; the rest carry a marker
  // saying the event came from somewhere to the left.
  const continues = localYMD(d) !== ymd

  return (
    <button
      onClick={(e) =>
        onOpen({ mode: 'event', rect: e.currentTarget.getBoundingClientRect(), id: event.id })
      }
      title={`${event.title} · ${shortRange(event)}`}
      className="pointer-events-auto flex w-full items-center gap-1 truncate rounded-[5px] px-1.5 py-[2px] text-left text-[10.5px] font-medium transition-opacity hover:opacity-80"
      style={{ color, background: `${color}22` }}
    >
      {continues ? (
        <span className="shrink-0 opacity-60" aria-hidden>
          ‹
        </span>
      ) : (
        !isAllDayIso(event.startAt) && <span className="nums shrink-0 opacity-75">{shortTime(d)}</span>
      )}
      <span className="truncate">{event.title}</span>
    </button>
  )
}

// ---------- week & day grid ----------

/** The hour grid behind both week and day view — a day is just a week of one
 *  column, so there is one layout, one drag handler and one now-line rather
 *  than two that drift apart.
 *
 *  Anything that isn't a single timed block (all-day entries, multi-day runs,
 *  open registration windows) lives in the band above the hours, where it can
 *  span columns; the scrolling body below holds only what has an hour. */
function TimeGrid({
  days,
  byDay,
  regDays,
  today,
  activeDay,
  onOpen,
  onPickDay
}: {
  days: string[]
  byDay: Map<string, PlannerEvent[]>
  regDays: Map<string, RegDay>
  today: string
  activeDay: string | null
  onOpen: (b: Bubble) => void
  onPickDay?: (ymd: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const now = useNow(60_000)

  const bands = useMemo(() => layoutBands(days, byDay, regDays), [days, byDay, regDays])

  // Open on the working day rather than at midnight: the earliest thing in
  // range, or 8am when the range is empty. Keyed to the range so scrolling
  // around inside a week isn't undone by an unrelated re-render.
  const openAt = useMemo(() => {
    let earliest = 8 * 60
    for (const ymd of days) {
      for (const e of byDay.get(ymd) ?? []) {
        if (isAllDayIso(e.startAt)) continue
        const d = new Date(e.startAt)
        if (localYMD(d) === ymd) earliest = Math.min(earliest, d.getHours() * 60 + d.getMinutes())
      }
    }
    return Math.max(0, earliest - 30)
  }, [days, byDay])

  useEffect(() => {
    scroller.current?.scrollTo({ top: (openAt / 60) * HOUR_H })
  }, [days[0], days.length, openAt])

  const gutter = 'w-[58px] shrink-0'

  return (
    <div className="border-line/60 bg-surface/50 mt-5 overflow-hidden rounded-[14px] border">
      {/* Header: the dates the columns stand for. */}
      <div className="border-line/50 flex border-b">
        <div className={gutter} />
        {days.map((ymd) => {
          const d = parseYMD(ymd)
          const isToday = ymd === today
          return (
            <div key={ymd} className="border-line/40 min-w-0 flex-1 border-l px-1 py-2">
              <button
                onClick={() => onPickDay?.(ymd)}
                disabled={!onPickDay}
                title={onPickDay ? 'Open this day' : undefined}
                className="tactile mx-auto flex flex-col items-center gap-0.5 rounded-[10px] px-2 py-0.5 disabled:cursor-default"
              >
                <span className="text-faint text-[10.5px] font-semibold tracking-wide uppercase">
                  {DOW[d.getDay()]}
                </span>
                <span
                  className={`nums inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-full px-1 text-[14px] font-semibold ${
                    isToday ? 'btn-primary' : ymd === activeDay ? 'bg-raised text-ink' : 'text-ink'
                  }`}
                >
                  {d.getDate()}
                </span>
              </button>
            </div>
          )
        })}
      </div>

      <BandRow days={days} bands={bands} onOpen={onOpen} />

      {/* The hours. The gutter scrolls with them so labels stay on their line. */}
      <div
        ref={scroller}
        className="relative flex overflow-y-auto overscroll-contain"
        style={{ height: `min(64vh, ${24 * HOUR_H}px)` }}
      >
        <div className={`${gutter} relative`} style={{ height: 24 * HOUR_H }}>
          {Array.from({ length: 23 }, (_, i) => (
            <span
              key={i}
              className="text-faint nums absolute right-2 text-[10.5px]"
              style={{ top: (i + 1) * HOUR_H - 7 }}
            >
              {formatTimeLabel(fromMin((i + 1) * 60))}
            </span>
          ))}
        </div>
        {days.map((ymd) => (
          <DayColumn
            key={ymd}
            ymd={ymd}
            events={byDay.get(ymd) ?? []}
            now={now}
            isToday={ymd === today}
            dense={days.length > 1}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  )
}

/** One column of hours: the blocks that live in it, plus the drag that draws a
 *  new one. Dragging is the point of this view — a period you sketch with the
 *  pointer arrives in the create bubble already filled in. */
function DayColumn({
  ymd,
  events,
  now,
  isToday,
  dense,
  onOpen
}: {
  ymd: string
  events: PlannerEvent[]
  now: number
  isToday: boolean
  /** A week's worth of columns, where a split block has no room to spare. */
  dense: boolean
  onOpen: (b: Bubble) => void
}) {
  const body = useRef<HTMLDivElement>(null)
  const anchor = useRef<number | null>(null)
  const [sel, setSel] = useState<{ from: number; to: number } | null>(null)

  const blocks = useMemo(() => layoutDay(ymd, events), [ymd, events])

  const minutesAt = (clientY: number) => {
    const r = body.current!.getBoundingClientRect()
    const raw = ((clientY - r.top) / HOUR_H) * 60
    return Math.max(0, Math.min(1440, Math.round(raw / SNAP_MIN) * SNAP_MIN))
  }

  /** Anchor the create bubble on the slot itself, not the pointer. */
  const rectFor = (from: number, to: number) => {
    const r = body.current!.getBoundingClientRect()
    return new DOMRect(r.left, r.top + (from / 60) * HOUR_H, r.width, ((to - from) / 60) * HOUR_H)
  }

  const finish = (clientY: number) => {
    const start = anchor.current
    anchor.current = null
    setSel(null)
    if (start === null) return
    const m = minutesAt(clientY)
    let from = Math.min(start, m)
    let to = Math.max(start, m)
    // A click is a drag of no length: give it the default hour, from the half
    // hour it landed in.
    if (to - from < SNAP_MIN) {
      from = Math.min(23 * 60 + 30, Math.floor(from / 30) * 30)
      to = from + 60
    }
    onOpen({
      mode: 'create',
      rect: rectFor(from, to),
      date: ymd,
      time: fromMin(from),
      endDate: to >= 1440 ? addDaysYMD(ymd, 1) : ymd,
      endTime: fromMin(to % 1440)
    })
  }

  const nowMin = (() => {
    const d = new Date(now)
    return d.getHours() * 60 + d.getMinutes()
  })()

  return (
    <div
      ref={body}
      className="border-line/40 relative min-w-0 flex-1 border-l"
      style={{
        height: 24 * HOUR_H,
        // Hour lines as the surface's own texture — 24 painted divs per column
        // would be 168 elements in week view for something a gradient draws.
        backgroundImage: `repeating-linear-gradient(to bottom, var(--color-line) 0 1px, transparent 1px ${HOUR_H}px)`,
        backgroundSize: `100% ${HOUR_H}px`
      }}
    >
      <div
        className="absolute inset-0 cursor-cell"
        aria-hidden
        onPointerDown={(e) => {
          if (e.button !== 0) return
          const m = minutesAt(e.clientY)
          anchor.current = m
          setSel({ from: m, to: m })
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (anchor.current === null) return
          const m = minutesAt(e.clientY)
          setSel({ from: Math.min(anchor.current, m), to: Math.max(anchor.current, m) })
        }}
        onPointerUp={(e) => finish(e.clientY)}
        onPointerCancel={() => {
          anchor.current = null
          setSel(null)
        }}
      />

      {sel && sel.to > sel.from && (
        <div
          aria-hidden
          className="bg-azure/25 border-azure/70 pointer-events-none absolute right-1 left-0.5 rounded-[6px] border"
          style={{ top: (sel.from / 60) * HOUR_H, height: ((sel.to - sel.from) / 60) * HOUR_H }}
        >
          <span className="text-azure nums absolute top-0.5 left-1.5 text-[10px] font-semibold">
            {formatTimeLabel(fromMin(sel.from))} – {formatTimeLabel(fromMin(sel.to % 1440))}
          </span>
        </div>
      )}

      {blocks.map((b) => (
        <TimeBlock key={b.event.id} block={b} dense={dense} onOpen={onOpen} />
      ))}

      {isToday && (
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 left-0 z-10 flex items-center"
          style={{ top: (nowMin / 60) * HOUR_H }}
        >
          <span className="bg-coral -ml-[3px] h-[7px] w-[7px] shrink-0 rounded-full" />
          <span className="bg-coral/70 h-px flex-1" />
        </div>
      )}
    </div>
  )
}

function TimeBlock({
  block,
  dense,
  onOpen
}: {
  block: Block
  dense: boolean
  onOpen: (b: Bubble) => void
}) {
  const { event, from, to, col, cols } = block
  const color = KIND_COLOR[event.kind]
  const height = ((to - from) / 60) * HOUR_H
  // Under ~34px the two lines don't fit, so they sit side by side instead.
  // A button also centres its content, which a tall block must not do — it
  // has to read from the top, where the hour line puts it.
  const tight = height < 34
  // A block sharing a week column has no room for a range; the start alone
  // still says the thing the range was there to say.
  const clock = dense && cols > 1 ? shortTime(new Date(event.startAt)) : shortRange(event)

  return (
    <button
      onClick={(e) =>
        onOpen({ mode: 'event', rect: e.currentTarget.getBoundingClientRect(), id: event.id })
      }
      title={`${event.title} · ${shortRange(event)}`}
      className={`absolute flex overflow-hidden rounded-[7px] px-1.5 text-left transition-[filter,box-shadow] hover:brightness-115 hover:shadow-[var(--shadow-soft)] ${
        tight ? 'items-center gap-1 py-0' : 'flex-col py-1'
      }`}
      style={{
        top: (from / 60) * HOUR_H + 1,
        height: Math.max(16, height - 2),
        left: `calc(${(col / cols) * 100}% + 2px)`,
        width: `calc(${(1 / cols) * 100}% - 5px)`,
        color,
        background: `${color}26`,
        boxShadow: `inset 2.5px 0 0 ${color}`
      }}
    >
      <span className="min-w-0 truncate text-[11px] font-semibold">{event.title}</span>
      <span className={`nums truncate text-[10px] opacity-80 ${tight ? 'shrink-0' : ''}`}>
        {clock}
      </span>
    </button>
  )
}

/** The band above the hours: all-day runs, multi-day events and the open
 *  registration windows, each a bar across the days it covers. */
function BandRow({
  days,
  bands,
  onOpen
}: {
  days: string[]
  bands: Band[]
  onOpen: (b: Bubble) => void
}) {
  // Always drawn, even empty: it keeps the hours from jumping as you page
  // between weeks, and it's the only place to start an all-day event here.
  const rows = bands.length ? Math.max(...bands.map((b) => b.row)) + 1 : 1

  return (
    <div className="border-line/50 flex border-b">
      <div className="text-faint w-[58px] shrink-0 self-center pr-2 text-right text-[10px] font-semibold">
        all-day
      </div>
      <div
        className="min-w-0 flex-1 gap-y-1 py-1.5 pr-1"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, 20px)`
        }}
      >
        {days.map((ymd, i) => (
          <button
            key={`slot:${ymd}`}
            onClick={(e) =>
              onOpen({ mode: 'create', rect: e.currentTarget.getBoundingClientRect(), date: ymd })
            }
            aria-label={`Add an all-day event on ${parseYMD(ymd).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric'
            })}`}
            className="hover:bg-raised/70 rounded-[6px] transition-colors"
            style={{ gridColumn: i + 1, gridRow: '1 / -1' }}
          />
        ))}
        {bands.map((b) =>
          b.event ? (
            <button
              key={b.key}
              onClick={(e) =>
                onOpen({ mode: 'event', rect: e.currentTarget.getBoundingClientRect(), id: b.event!.id })
              }
              title={b.label}
              className="flex items-center gap-1 truncate rounded-[6px] px-1.5 text-left text-[10.5px] font-medium transition-opacity hover:opacity-80"
              style={{
                gridColumn: `${b.from + 1} / ${b.to + 2}`,
                gridRow: b.row + 1,
                marginLeft: 2,
                marginRight: 2,
                color: b.color,
                background: `${b.color}26`
              }}
            >
              {b.clippedStart && <span aria-hidden>‹</span>}
              <span className="truncate">{b.label}</span>
              {b.clippedEnd && <span className="ml-auto" aria-hidden>›</span>}
            </button>
          ) : (
            <div
              key={b.key}
              title={b.label}
              className="flex items-center truncate rounded-[6px] px-1.5 text-[10.5px] font-semibold"
              style={{
                gridColumn: `${b.from + 1} / ${b.to + 2}`,
                gridRow: b.row + 1,
                marginLeft: 2,
                marginRight: 2,
                color: b.color,
                background: `${b.color}1f`,
                border: `1px dashed ${b.color}66`
              }}
            >
              <span className="truncate">{b.label}</span>
            </div>
          )
        )}
      </div>
    </div>
  )
}

/** A timed block, placed. `col`/`cols` split the column between events that
 *  overlap, so a double-booking shows as two halves rather than one hiding
 *  behind the other. */
interface Block {
  event: PlannerEvent
  from: number
  to: number
  col: number
  cols: number
}

function layoutDay(ymd: string, events: PlannerEvent[]): Block[] {
  const dayStart = parseYMD(ymd).getTime()
  const segs = events
    // Whole-day and multi-day entries belong to the band above, not to an hour.
    .filter((e) => {
      const span = spanOf(e)
      return !isAllDayIso(e.startAt) && span.startDay === span.endDay
    })
    .map((e) => ({
      event: e,
      from: Math.max(0, Math.min(1440, (new Date(e.startAt).getTime() - dayStart) / 60_000)),
      to: Math.max(0, Math.min(1440, (endMsOf(e) - dayStart) / 60_000))
    }))
    .map((s) => ({ ...s, to: Math.max(s.to, s.from + SNAP_MIN) }))
    .sort((a, b) => a.from - b.from || b.to - a.to)

  const out: Block[] = []
  let cluster: typeof segs = []
  let clusterEnd = -1

  const flush = () => {
    if (cluster.length === 0) return
    const colEnds: number[] = []
    const placed = cluster.map((s) => {
      let c = colEnds.findIndex((end) => end <= s.from)
      if (c === -1) {
        c = colEnds.length
        colEnds.push(s.to)
      } else {
        colEnds[c] = s.to
      }
      return { ...s, col: c }
    })
    for (const p of placed) out.push({ ...p, cols: colEnds.length })
    cluster = []
    clusterEnd = -1
  }

  for (const s of segs) {
    if (s.from >= clusterEnd) flush()
    cluster.push(s)
    clusterEnd = Math.max(clusterEnd, s.to)
  }
  flush()
  return out
}

/** A bar in the all-day band. `event` is null for a registration window, which
 *  is a deadline rather than something you can open. */
interface Band {
  key: string
  label: string
  color: string
  from: number
  to: number
  row: number
  clippedStart: boolean
  clippedEnd: boolean
  event: PlannerEvent | null
}

function layoutBands(
  days: string[],
  byDay: Map<string, PlannerEvent[]>,
  regDays: Map<string, RegDay>
): Band[] {
  const first = days[0]
  const last = days[days.length - 1]
  const index = new Map(days.map((d, i) => [d, i]))

  // Everything the band owns: whole-day entries and anything crossing midnight.
  const seen = new Set<string>()
  const spanning: { event: PlannerEvent; startDay: string; endDay: string }[] = []
  for (const ymd of days) {
    for (const e of byDay.get(ymd) ?? []) {
      if (seen.has(e.id)) continue
      const { startDay, endDay } = spanOf(e)
      if (!isAllDayIso(e.startAt) && startDay === endDay) continue
      seen.add(e.id)
      spanning.push({ event: e, startDay, endDay })
    }
  }

  const bars: Omit<Band, 'row'>[] = spanning
    .map(({ event, startDay, endDay }) => ({
      key: event.id,
      label: event.title,
      color: KIND_COLOR[event.kind],
      from: index.get(startDay < first ? first : startDay)!,
      to: index.get(endDay > last ? last : endDay)!,
      clippedStart: startDay < first,
      clippedEnd: endDay > last,
      event
    }))
    .sort((a, b) => a.from - b.from || b.to - a.to)

  // Registration windows arrive as a per-day map; walk the range to turn the
  // days back into the runs they came from.
  interface Run {
    title: string
    urgent: boolean
    from: number
  }
  let run: Run | null = null
  const closeRun = (open: Run | null, toIdx: number) => {
    if (!open) return
    bars.push({
      key: `reg:${open.title}:${open.from}`,
      label: `Registration — ${open.title}`,
      color: open.urgent ? '#FF7A7A' : '#F5C56B',
      from: open.from,
      to: toIdx,
      clippedStart: false,
      clippedEnd: false,
      event: null
    })
  }
  days.forEach((ymd, i) => {
    const reg = regDays.get(ymd)
    if (!reg || (run && run.title !== reg.title)) {
      closeRun(run, i - 1)
      run = null
    }
    if (reg && !run) run = { title: reg.title, urgent: reg.urgent, from: i }
  })
  closeRun(run, days.length - 1)

  // Pack into as few rows as fit: a bar drops to the next row only when the
  // one above is still occupied where it starts.
  const rowEnds: number[] = []
  return bars.map((b) => {
    let row = rowEnds.findIndex((end) => end < b.from)
    if (row === -1) {
      row = rowEnds.length
      rowEnds.push(b.to)
    } else {
      rowEnds[row] = b.to
    }
    return { ...b, row }
  })
}

/** The kind row, shared by create and edit. Selected reads as filled in the
 *  kind's own hue; the rest sit back so the choice is obvious at a glance. */
function KindPicker({
  kind,
  onChange
}: {
  kind: EventKind
  onChange: (k: EventKind) => void
}) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-1" role="group" aria-label="Kind">
      {KINDS.map((k) => {
        const on = kind === k.id
        return (
          <button
            key={k.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(k.id)}
            className={`tactile rounded-full px-2.5 py-1 text-[11.5px] transition-colors ${
              on ? 'font-semibold' : 'bg-surface text-faint hover:text-muted font-medium'
            }`}
            style={on ? { color: '#0b1120', background: k.color } : undefined}
          >
            {k.label}
          </button>
        )
      })}
    </div>
  )
}

/** The period an event covers: start date + time over end date + time, sized
 *  so the dates get the room they need and the times don't.
 *
 *  The end tracks the start rather than sitting there going stale — moving the
 *  start day carries the end with it, and giving a start time to an event that
 *  had none proposes the hour after. An all-day event has no end *time* to
 *  set, so that field steps aside until there's a start time to end. */
function WhenFields({ when, onChange }: { when: When; onChange: (w: When) => void }) {
  const { day, time, endDay, endTime } = when

  const setDay = (next: string) => {
    if (!next) return
    const shift = daysBetween(day, next)
    onChange(normalizeWhen({ ...when, day: next, endDay: endDay ? addDaysYMD(endDay, shift) : '' }))
  }

  const setTime = (next: string) => {
    // Losing the start time makes it all-day, which has no end time either;
    // gaining one keeps the length it had, or proposes the hour after.
    if (!next) return onChange(normalizeWhen({ ...when, time: '', endTime: '' }))
    const length = durationMinutes(when) || 60
    onChange(normalizeWhen(withDuration({ ...when, time: next }, length)))
  }

  const setEndTime = (next: string) => {
    if (!next) return onChange({ ...when, endTime: '' })
    // An end before the start means it runs past midnight, not backwards.
    const rolls = !!time && next <= time && (!endDay || endDay === day)
    onChange(
      normalizeWhen({ ...when, endTime: next, endDay: rolls ? addDaysYMD(day, 1) : endDay || day })
    )
  }

  const rowCls = 'flex items-center gap-1.5'
  const labelCls = 'text-faint w-[38px] shrink-0 text-[11.5px] font-semibold'

  return (
    <div className="mt-3 grid gap-1.5">
      <div className={rowCls}>
        <span className={labelCls}>Starts</span>
        <DateField
          value={day}
          ariaLabel="Start date"
          clearable={false}
          className="min-w-0 flex-1"
          onChange={setDay}
        />
        <TimeField
          value={time}
          ariaLabel="Start time"
          placeholder="All day"
          className="w-[98px] shrink-0"
          onChange={setTime}
        />
      </div>
      <div className={rowCls}>
        <span className={labelCls}>Ends</span>
        <DateField
          value={endDay || day}
          ariaLabel="End date"
          min={day}
          clearable={false}
          className="min-w-0 flex-1"
          onChange={(next) => onChange(normalizeWhen({ ...when, endDay: next }))}
        />
        <TimeField
          value={endTime}
          ariaLabel="End time"
          placeholder={time ? 'Open' : 'All day'}
          disabled={!time}
          title={time ? undefined : 'Set a start time first'}
          className="w-[98px] shrink-0"
          onChange={setEndTime}
        />
      </div>
      <p className="text-faint pl-[44px] text-[11px]">{describeWhen(when)}</p>
    </div>
  )
}

/** The four fields that describe a period, as the form holds them. */
interface When {
  day: string
  time: string
  endDay: string
  endTime: string
}

/** Nothing may end before it starts. Whatever the user just touched stays put;
 *  the end is what gives. */
function normalizeWhen(w: When): When {
  const endDay = w.endDay && w.endDay >= w.day ? w.endDay : w.day
  if (!w.time) return { ...w, endDay, endTime: '' }
  if (endDay === w.day && w.endTime && w.endTime <= w.time) {
    return withDuration({ ...w, endDay }, 60)
  }
  return { ...w, endDay }
}

/** The period in one line, so the fields above are never ambiguous. */
function describeWhen(w: When): string {
  const extraDays = countDays(w.day, w.endDay || w.day) - 1
  if (!w.time) return extraDays ? `All day · ${extraDays + 1} days` : 'All day'
  if (!w.endTime) return `At ${formatTimeLabel(w.time)}`
  const span = `${formatTimeLabel(w.time)} – ${formatTimeLabel(w.endTime)}`
  return `${span}${extraDays ? ` (+${extraDays}d)` : ''} · ${formatDuration(durationMinutes(w))}`
}

/** The `When` an existing event is already describing. */
function whenOf(event: PlannerEvent): When {
  const start = new Date(event.startAt)
  const allDay = isAllDayIso(event.startAt)
  const end = event.endAt ? new Date(event.endAt) : null
  return {
    day: localYMD(start),
    time: allDay ? '' : hm(event.startAt),
    endDay: end ? localYMD(end) : '',
    endTime: end && !allDay ? hm(event.endAt!) : ''
  }
}

/** The `When` as the IPC layer wants it. */
function whenToInput(w: When) {
  return {
    date: w.day,
    time: w.time || null,
    endDate: w.endDay && w.endDay !== w.day ? w.endDay : null,
    endTime: w.time ? w.endTime || null : null
  }
}

// ---------- anchored bubbles ----------

/** Google-Calendar-style quick create: the title is the only required field,
 *  everything else is pre-filled from the day you clicked, Enter saves. */
function QuickCreate({
  rect,
  date,
  time: initialTime,
  endDate,
  endTime: initialEndTime,
  onClose,
  onCreated
}: {
  rect: DOMRect
  date: string
  time?: string
  endDate?: string
  endTime?: string
  onClose: () => void
  onCreated: () => Promise<void>
}) {
  const ref = useRef<HTMLDivElement>(null)
  const style = useAnchoredStyle(rect, ref, BUBBLE_W)
  useDismiss(true, onClose, ref)

  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<EventKind>('other')
  const [when, setWhen] = useState<When>(() =>
    normalizeWhen({
      day: date,
      time: initialTime ?? '',
      endDay: endDate ?? '',
      endTime: initialEndTime ?? ''
    })
  )
  const [location, setLocation] = useState('')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [autoReg, setAutoReg] = useState(true)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!title.trim() || !when.day || !window.planner || busy) return
    setBusy(true)
    await window.planner.eventsCreate({
      title,
      kind,
      ...whenToInput(when),
      location: location || null,
      url: url || null,
      notes: notes || null,
      autoRegWindow: kind === 'badminton' ? autoReg : false
    })
    await onCreated()
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="New event"
      style={style}
      className={BUBBLE_CLASS}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save()
      }}
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void save()
          }
        }}
        placeholder="Add title"
        aria-label="Event title"
        className="border-line focus:border-azure placeholder:text-faint w-full border-b bg-transparent pb-1.5 text-[16px] font-semibold outline-none transition-colors"
      />

      <WhenFields when={when} onChange={setWhen} />
      <KindPicker kind={kind} onChange={setKind} />

      {more && (
        <div className="mt-2.5 grid gap-1.5">
          <input
            className={inputCls}
            placeholder="Location"
            aria-label="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <input
            className={inputCls}
            placeholder="Link"
            aria-label="Link"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <textarea
            rows={2}
            className={`${inputCls} resize-y`}
            placeholder="Notes"
            aria-label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {kind === 'badminton' && (
            <label className="text-muted flex items-center gap-1.5 text-[12px]">
              <input
                type="checkbox"
                className="accent-(--color-gold)"
                checked={autoReg}
                onChange={(e) => setAutoReg(e.target.checked)}
              />
              Registration alarms
            </label>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <button
          onClick={() => setMore((m) => !m)}
          className="text-muted hover:text-ink text-[12.5px] font-medium transition-colors"
        >
          {more ? 'Fewer options' : 'More options'}
        </button>
        <button
          onClick={() => void save()}
          disabled={!title.trim() || !when.day || busy}
          className="tactile btn-primary rounded-[10px] px-4 py-1.5 text-[12.5px] font-bold disabled:opacity-35"
        >
          Save
        </button>
      </div>
    </div>
  )
}

/** The detail bubble for an existing event, which flips into an edit form in
 *  place rather than sending you somewhere else. */
function EventBubble({
  rect,
  event,
  onClose,
  onChanged
}: {
  rect: DOMRect
  event: PlannerEvent
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const ref = useRef<HTMLDivElement>(null)
  const style = useAnchoredStyle(rect, ref, BUBBLE_W)
  useDismiss(true, onClose, ref)
  const confirm = useConfirm()

  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(event.title)
  const [kind, setKind] = useState<EventKind>(event.kind)
  const [when, setWhen] = useState<When>(() => whenOf(event))
  const [location, setLocation] = useState(event.location ?? '')
  const [url, setUrl] = useState(event.url ?? '')
  const [notes, setNotes] = useState(event.notes ?? '')
  const [autoReg, setAutoReg] = useState(event.regOpensAt !== null)

  const color = KIND_COLOR[event.kind]

  const save = async () => {
    if (!title.trim() || !when.day || !window.planner) return
    await window.planner.eventsUpdate(event.id, {
      title,
      kind,
      ...whenToInput(when),
      location: location || null,
      url: url || null,
      notes: notes || null,
      autoRegWindow: kind === 'badminton' ? autoReg : false
    })
    await onChanged()
    setEditing(false)
  }

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${event.title}”?`,
      body: 'It comes off your calendar for good.',
      confirmLabel: 'Delete',
      danger: true
    })
    if (!ok) return
    await window.planner?.eventsDelete(event.id)
    await onChanged()
    onClose()
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={event.title}
      style={style}
      className={BUBBLE_CLASS}
      onKeyDown={(e) => {
        if (editing && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save()
      }}
    >
      {editing ? (
        <>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void save()
              }
            }}
            aria-label="Event title"
            className="border-line focus:border-azure w-full border-b bg-transparent pb-1.5 text-[16px] font-semibold outline-none transition-colors"
          />
          <WhenFields when={when} onChange={setWhen} />
          <KindPicker kind={kind} onChange={setKind} />
          <div className="mt-2.5 grid gap-1.5">
            <input
              className={inputCls}
              placeholder="Location"
              aria-label="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            <input
              className={inputCls}
              placeholder="Link"
              aria-label="Link"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <textarea
              rows={2}
              className={`${inputCls} resize-y`}
              placeholder="Notes"
              aria-label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            {kind === 'badminton' && (
              <label className="text-muted flex items-center gap-1.5 text-[12px]">
                <input
                  type="checkbox"
                  className="accent-(--color-gold)"
                  checked={autoReg}
                  onChange={(e) => setAutoReg(e.target.checked)}
                />
                Registration alarms
              </label>
            )}
          </div>
          <div className="mt-3 flex items-center justify-end gap-1">
            <button
              onClick={() => setEditing(false)}
              className="text-muted hover:text-ink rounded-[10px] px-3 py-1.5 text-[12.5px] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void save()}
              disabled={!title.trim() || !when.day}
              className="tactile btn-primary rounded-[10px] px-4 py-1.5 text-[12.5px] font-bold disabled:opacity-35"
            >
              Save
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-[7px] h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ background: color }}
            />
            <div className="min-w-0 flex-1">
              <h2 className="text-[15.5px] leading-snug font-semibold">{event.title}</h2>
              <p className="text-muted nums mt-0.5 text-[12.5px]">{longWhen(event)}</p>
            </div>
            <span className="text-faint shrink-0 text-[11px]">{KIND_LABEL[event.kind]}</span>
          </div>

          {(event.location || event.notes) && (
            <div className="text-muted mt-2.5 space-y-1 text-[12.5px]">
              {event.location && <p>{event.location}</p>}
              {event.notes && <p className="whitespace-pre-wrap">{event.notes}</p>}
            </div>
          )}

          {event.url && (
            <button
              onClick={() => void window.planner?.openExternal(event.url!)}
              className="text-azure mt-2 block max-w-full truncate text-left text-[12.5px] hover:underline"
            >
              {event.url} ↗
            </button>
          )}

          {event.regOpensAt && event.regClosesAt && (
            <div className="border-line mt-3 border-t pt-2.5">
              <RegDetail event={event} />
              <button
                onClick={() =>
                  void window.planner
                    ?.eventsUpdate(event.id, { registered: !event.registered })
                    .then(onChanged)
                }
                className={`tactile mt-2 rounded-[10px] border px-2.5 py-1 text-[12px] transition-colors ${
                  event.registered
                    ? 'border-mint/50 text-mint bg-mint/10'
                    : 'border-line text-muted hover:text-ink'
                }`}
              >
                {event.registered ? 'Registered ✓' : 'Mark as registered'}
              </button>
            </div>
          )}

          <div className="border-line mt-3 flex items-center gap-1 border-t pt-2.5">
            <button
              onClick={() => setEditing(true)}
              className="text-muted hover:text-ink hover:bg-surface rounded-[10px] px-2.5 py-1.5 text-[12.5px] font-medium transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => void remove()}
              className="text-muted hover:text-coral hover:bg-surface rounded-[10px] px-2.5 py-1.5 text-[12.5px] font-medium transition-colors"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** Everything on one day, when the cell couldn't show it all. */
function DayBubble({
  rect,
  date,
  events,
  onClose,
  onPick
}: {
  rect: DOMRect
  date: string
  events: PlannerEvent[]
  onClose: () => void
  onPick: (id: string, rect: DOMRect) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const style = useAnchoredStyle(rect, ref, 240)
  useDismiss(true, onClose, ref)
  const d = new Date(`${date}T00:00:00`)

  return (
    <div ref={ref} role="dialog" aria-label="Events on this day" style={style} className={BUBBLE_CLASS}>
      <p className="text-muted mb-2 text-[12px] font-semibold">
        {d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      </p>
      <ul className="space-y-1">
        {events.map((e) => (
          <li key={e.id}>
            <button
              onClick={(ev) => onPick(e.id, ev.currentTarget.getBoundingClientRect())}
              className="hover:bg-surface flex w-full items-center gap-2 rounded-[9px] px-2 py-1.5 text-left transition-colors"
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ background: KIND_COLOR[e.kind] }}
              />
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{e.title}</span>
              {!isAllDayIso(e.startAt) && (
                <span className="text-muted nums shrink-0 text-[11px]">{shortRange(e)}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------- registration ----------

/** The one thing this calendar exists to surface: the window you have to act
 *  inside. Open windows lead with the time left; future ones just wait. */
function RegLead({ lead, now }: { lead: Lead; now: number }) {
  const isOpen = lead.opens <= now
  const days = Math.ceil((isOpen ? lead.closes - now : lead.opens - now) / 86_400_000)
  const soon = isOpen && days <= 3

  return (
    <div
      className={`mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] px-4 py-3 ${
        isOpen ? (soon ? 'bg-coral/12' : 'bg-gold/12') : 'bg-surface'
      }`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          isOpen ? (soon ? 'bg-coral animate-pulse' : 'bg-gold') : 'bg-faint'
        }`}
        aria-hidden
      />
      <span
        className={`text-[13.5px] font-bold ${soon ? 'text-coral' : isOpen ? 'text-gold' : 'text-muted'}`}
      >
        {isOpen ? 'Registration open' : 'Registration opens'}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13.5px]">{lead.event.title}</span>
      <span className={`nums text-[13px] font-semibold ${soon ? 'text-coral' : 'text-muted'}`}>
        {isOpen
          ? days <= 0
            ? 'closes today'
            : `${days} day${days === 1 ? '' : 's'} left`
          : `in ${days} day${days === 1 ? '' : 's'}`}
      </span>
      {isOpen && lead.event.url && (
        <button
          onClick={() => void window.planner?.openExternal(lead.event.url!)}
          className="tactile btn-primary rounded-[10px] px-3 py-1.5 text-[12.5px] font-bold"
        >
          Register
        </button>
      )}
    </div>
  )
}

function RegDetail({ event }: { event: PlannerEvent }) {
  const now = Date.now()
  const opens = new Date(event.regOpensAt!).getTime()
  const closes = new Date(event.regClosesAt!).getTime()
  const state = event.registered
    ? { text: 'Registered', cls: 'text-mint' }
    : now < opens
      ? { text: `Registration opens ${relDays(opens)}`, cls: 'text-muted' }
      : now < closes
        ? { text: `Registration open · closes ${relDays(closes)}`, cls: 'text-azure' }
        : { text: 'Registration closed', cls: 'text-coral/80' }

  return (
    <>
      <p className={`text-[12.5px] font-semibold ${state.cls}`}>{state.text}</p>
      <p className="text-faint nums mt-1 text-[11.5px] leading-relaxed">
        opens {fmtDT(event.regOpensAt!)} · closes {fmtDT(event.regClosesAt!)} · draws{' '}
        {fmtDT(drawsAt(event.startAt))}
      </p>
    </>
  )
}

function RegBadge({ event }: { event: PlannerEvent }) {
  if (!event.regOpensAt || !event.regClosesAt || event.registered) return null
  const now = Date.now()
  const opens = new Date(event.regOpensAt).getTime()
  const closes = new Date(event.regClosesAt).getTime()

  if (now < opens) {
    return (
      <span className="text-muted border-line rounded-full border px-2 py-0.5 nums text-[11px]">
        reg opens {relDays(opens)}
      </span>
    )
  }
  if (now < closes) {
    return (
      <span className="border-azure/60 text-azure bg-azure/10 animate-pulse rounded-full border px-2 py-0.5 nums text-[11px] font-semibold">
        REG OPEN · closes {relDays(closes)}
      </span>
    )
  }
  return (
    <span className="text-coral/80 border-coral/40 rounded-full border px-2 py-0.5 nums text-[11px]">
      reg closed
    </span>
  )
}

// ---------- list view ----------

function ListView({
  loaded,
  byMonth,
  past,
  showPast,
  setShowPast,
  expandedId,
  setExpandedId,
  onChanged
}: {
  loaded: boolean
  byMonth: { label: string; items: PlannerEvent[] }[]
  past: PlannerEvent[]
  showPast: boolean
  setShowPast: (f: (s: boolean) => boolean) => void
  expandedId: string | null
  setExpandedId: (id: string | null) => void
  onChanged: () => Promise<void>
}) {
  return (
    <>
      {byMonth.length === 0 && loaded ? (
        <p className="text-muted mt-8 text-[13.5px]">
          Nothing coming up. Switch to Month and click a day to add something.
        </p>
      ) : (
        byMonth.map((group) => (
          <section key={group.label} className="mt-6">
            <h2 className="text-muted text-[13px] font-bold">{group.label}</h2>
            <ul className="mt-2 max-w-2xl space-y-1">
              {group.items.map((e) => (
                <EventRow
                  key={e.id}
                  event={e}
                  expanded={expandedId === e.id}
                  onToggle={() => setExpandedId(expandedId === e.id ? null : e.id)}
                  onChanged={onChanged}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {past.length > 0 && (
        <section className="mt-8">
          <button
            onClick={() => setShowPast((s) => !s)}
            className="text-muted hover:text-ink text-[13px] font-semibold transition-colors"
          >
            {showPast ? '▾' : '▸'} Past · {past.length}
          </button>
          {showPast && (
            <ul className="mt-2 max-w-2xl space-y-1 opacity-60">
              {past.map((e) => (
                <EventRow
                  key={e.id}
                  event={e}
                  expanded={expandedId === e.id}
                  onToggle={() => setExpandedId(expandedId === e.id ? null : e.id)}
                  onChanged={onChanged}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  )
}

function EventRow({
  event,
  expanded,
  onToggle,
  onChanged
}: {
  event: PlannerEvent
  expanded: boolean
  onToggle: () => void
  onChanged: () => Promise<void>
}) {
  const confirm = useConfirm()
  const rowRef = useRef<HTMLDivElement>(null)
  const d = new Date(event.startAt)
  const allDay = d.getHours() === 0 && d.getMinutes() === 0
  const color = KIND_COLOR[event.kind]

  return (
    <li>
      <div
        ref={rowRef}
        className="group bg-surface hover:bg-raised flex items-center gap-3 rounded-[16px] px-3 py-2.5 shadow-[var(--shadow-soft)] transition-colors"
      >
        <div className="w-12 shrink-0 text-center">
          <div className="nums text-[15px] leading-none font-semibold" style={{ color }}>
            {d.getDate()}
          </div>
          <div className="text-muted mt-0.5 text-[9px] uppercase">
            {d.toLocaleDateString(undefined, { weekday: 'short' })}
          </div>
        </div>
        <button onClick={onToggle} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px]">{event.title}</span>
            <span
              className="rounded-full px-2 py-0.5 text-[11px]"
              style={{ color, background: `${color}1f` }}
            >
              {KIND_LABEL[event.kind].toLowerCase()}
            </span>
            <RegBadge event={event} />
          </div>
          <div className="text-muted nums mt-0.5 text-[12px]">
            {allDay ? allDayLabel(event) : shortRange(event)}
            {event.location ? ` · ${event.location}` : ''}
          </div>
        </button>
        {event.kind === 'badminton' && event.regClosesAt && (
          <button
            onClick={() =>
              void window.planner
                ?.eventsUpdate(event.id, { registered: !event.registered })
                .then(onChanged)
            }
            className={`tactile rounded-[11px] border px-2 py-1 nums text-[12px] transition-colors ${
              event.registered
                ? 'border-mint/50 text-mint bg-mint/10'
                : 'border-line text-muted hover:text-ink'
            }`}
            title={event.registered ? 'Registered' : 'Mark as registered'}
          >
            {event.registered ? 'Registered' : 'Register?'}
          </button>
        )}
        <button
          onClick={async () => {
            const ok = await confirm({
              title: `Delete “${event.title}”?`,
              body: 'It comes off your calendar for good.',
              confirmLabel: 'Delete',
              danger: true
            })
            if (!ok) return
            await window.planner?.eventsDelete(event.id)
            await onChanged()
          }}
          aria-label={`Delete ${event.title}`}
          className="text-muted hover:text-coral px-1 opacity-45 transition-all group-hover:opacity-100"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.75" strokeLinecap="round" aria-hidden>
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
          </svg>
        </button>
      </div>

      {expanded && rowRef.current && (
        <EventBubble
          rect={rowRef.current.getBoundingClientRect()}
          event={event}
          onClose={onToggle}
          onChanged={onChanged}
        />
      )}
    </li>
  )
}

// ---------- sources ----------

function SourcesBar({
  importKind,
  setImportKind,
  importMsg,
  onIcs,
  onBq
}: {
  importKind: EventKind
  setImportKind: (k: EventKind) => void
  importMsg: string | null
  onIcs: () => void
  onBq: () => void
}) {
  return (
    <section className="border-line/70 mt-8 border-t pt-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-faint mr-1 text-[12px] font-semibold">Bring events in</span>
        <button
          onClick={onBq}
          className="tactile bg-surface text-muted hover:text-ink rounded-[11px] px-3 py-1.5 text-[12.5px] font-medium"
        >
          Badminton Québec
        </button>
        <button
          onClick={onIcs}
          className="tactile bg-surface text-muted hover:text-ink rounded-[11px] px-3 py-1.5 text-[12.5px] font-medium"
        >
          Import .ics
        </button>
        <Select
          value={importKind}
          ariaLabel="Import as"
          className="bg-surface"
          onChange={(val) => setImportKind(val as EventKind)}
          options={KINDS.map((k) => ({ value: k.id, label: `as ${k.label.toLowerCase()}` }))}
        />
        {importMsg && <span className="text-mint text-[12.5px]">{importMsg}</span>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="text-faint text-[12px] font-semibold">Find hackathons</span>
        {HACKATHON_LINKS.map((h) => (
          <button
            key={h.url}
            onClick={() => void window.planner?.openExternal(h.url)}
            className="text-azure text-[12.5px] hover:underline"
          >
            {h.name} ↗
          </button>
        ))}
      </div>
    </section>
  )
}

// ---------- Badminton Québec import ----------

function BadmintonPanel({
  busy,
  error,
  events,
  known,
  picked,
  setPicked,
  onImport,
  onClose,
  onRefetch
}: {
  busy: boolean
  error: string | null
  events: FeedEvent[]
  known: Set<string>
  picked: ReadonlySet<string>
  setPicked: (s: ReadonlySet<string>) => void
  onImport: () => void
  onClose: () => void
  onRefetch: () => void
}) {
  const toggle = (uid: string) => {
    const next = new Set(picked)
    if (next.has(uid)) next.delete(uid)
    else next.add(uid)
    setPicked(next)
  }

  return (
    <div className="bg-surface mt-3 max-w-2xl rounded-[16px] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-bold">Badminton Québec calendar</p>
        <div className="flex items-center gap-3">
          <button
            onClick={onRefetch}
            disabled={busy}
            className="text-muted hover:text-ink text-[12px] disabled:opacity-50"
          >
            {busy ? 'Fetching…' : 'Refresh'}
          </button>
          <button onClick={onClose} className="text-muted hover:text-ink text-[12px]">
            Close
          </button>
        </div>
      </div>

      {error && <p className="text-coral mt-2 text-[12.5px]">{error}</p>}
      {busy && events.length === 0 && (
        <p className="text-muted mt-2 text-[13px]">Reading their calendar…</p>
      )}

      {events.length > 0 && (
        <>
          <ul className="mt-3 space-y-1">
            {events.map((e) => {
              const already = known.has(e.uid)
              const on = picked.has(e.uid)
              return (
                <li key={e.uid}>
                  <button
                    onClick={() => !already && toggle(e.uid)}
                    disabled={already}
                    className={`flex w-full items-center gap-3 rounded-[11px] px-2.5 py-2 text-left transition-colors ${
                      already ? 'opacity-45' : on ? 'bg-raised' : 'hover:bg-raised/60'
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border-2 ${
                        on || already ? 'border-azure bg-azure text-bg' : 'border-line'
                      }`}
                    >
                      {(on || already) && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="M5 12.5l4.5 4.5L19 7"
                            stroke="currentColor"
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{e.title}</span>
                      <span className="text-muted nums block text-[11.5px]">
                        {e.startDate}
                        {e.endDate && e.endDate !== e.startDate ? ` → ${e.endDate}` : ''}
                        {e.location ? ` · ${e.location}` : ''}
                      </span>
                    </span>
                    {already && <span className="text-mint shrink-0 text-[11px]">tracked</span>}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-faint text-[11.5px]">
              Registration alarms are computed for each one you add.
            </p>
            <button
              onClick={onImport}
              disabled={picked.size === 0 || busy}
              className="tactile btn-primary rounded-[11px] px-4 py-2 text-[13px] font-bold disabled:opacity-35"
            >
              Add {picked.size || ''}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ---------- helpers ----------

function Caret({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === 'left' ? 'm14.5 5-7 7 7 7' : 'm9.5 5 7 7-7 7'} />
    </svg>
  )
}

/** Chip-sized clock: "7 PM" rather than "07:00 PM", so the title keeps the row. */
function shortTime(d: Date): string {
  return d
    .toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: d.getMinutes() === 0 ? undefined : '2-digit'
    })
    .replace(/\s/g, ' ')
}

function hm(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ---------- periods ----------

/** Local midnight is how the schema spells "all-day". */
function isAllDayIso(iso: string): boolean {
  const d = new Date(iso)
  return d.getHours() === 0 && d.getMinutes() === 0
}

/** When an event actually ends. An untimed end is an hour, which is what the
 *  hour grid has to draw something. */
function endMsOf(e: PlannerEvent): number {
  const start = new Date(e.startAt).getTime()
  if (!e.endAt) return start + 3600_000
  return Math.max(new Date(e.endAt).getTime(), start + 60_000)
}

/** The days an event covers, both inclusive. An all-day event ends *on* its
 *  end date; a timed one that runs to midnight belongs to the day before, not
 *  to the day it touches for zero minutes. */
function spanOf(e: PlannerEvent): { startDay: string; endDay: string } {
  const startDay = localYMD(new Date(e.startAt))
  if (!e.endAt) return { startDay, endDay: startDay }
  const end = new Date(e.endAt)
  const endDay = isAllDayIso(e.startAt)
    ? localYMD(end)
    : localYMD(new Date(end.getTime() - 60_000))
  return { startDay, endDay: endDay < startDay ? startDay : endDay }
}

/** "2 – 3:30 PM" for a timed event; the start alone when there's no end. */
function shortRange(e: PlannerEvent): string {
  const start = new Date(e.startAt)
  if (isAllDayIso(e.startAt)) return allDayLabel(e)
  if (!e.endAt) return shortTime(start)
  return `${shortTime(start)} – ${shortTime(new Date(e.endAt))}`
}

function allDayLabel(e: PlannerEvent): string {
  const { startDay, endDay } = spanOf(e)
  const days = countDays(startDay, endDay)
  return days > 1 ? `all day · ${days} days` : 'all day'
}

/** The full period, spelled out for the detail bubble. */
function longWhen(e: PlannerEvent): string {
  const start = new Date(e.startAt)
  const { startDay, endDay } = spanOf(e)
  const dayOf = (d: Date) =>
    d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  if (isAllDayIso(e.startAt)) {
    if (startDay === endDay) return `${dayOf(start)} · all day`
    return `${dayOf(start)} → ${dayOf(parseYMD(endDay))}`
  }
  if (!e.endAt) return `${dayOf(start)} · ${shortTime(start)}`
  const end = new Date(e.endAt)
  if (startDay === endDay) {
    return `${dayOf(start)} · ${shortTime(start)} – ${shortTime(end)} · ${formatDuration(
      (end.getTime() - start.getTime()) / 60_000
    )}`
  }
  return `${dayOf(start)} ${shortTime(start)} → ${dayOf(end)} ${shortTime(end)}`
}

/** "1h 30m", "45m", "3 days" — short enough to sit under the fields. */
function formatDuration(mins: number): string {
  if (mins <= 0) return '0m'
  if (mins % 1440 === 0 && mins >= 1440) {
    const d = mins / 1440
    return `${d} day${d === 1 ? '' : 's'}`
  }
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  if (!h) return `${m}m`
  return m ? `${h}h ${m}m` : `${h}h`
}

// ---------- clock & calendar arithmetic ----------

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function fromMin(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function parseYMD(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function shiftDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseYMD(b).getTime() - parseYMD(a).getTime()) / 86_400_000)
}

/** Inclusive day count: same day is 1. */
function countDays(a: string, b: string): number {
  return Math.max(1, daysBetween(a, b) + 1)
}

/** How long the form's period runs, in minutes. */
function durationMinutes(w: When): number {
  if (!w.time || !w.endTime) return 0
  return toMin(w.endTime) - toMin(w.time) + (countDays(w.day, w.endDay || w.day) - 1) * 1440
}

/** Rebuild the end from the start plus a length, rolling into the next day
 *  when the length carries it past midnight. */
function withDuration(w: When, mins: number): When {
  const total = toMin(w.time) + Math.max(SNAP_MIN, mins)
  return { ...w, endDay: addDaysYMD(w.day, Math.floor(total / 1440)), endTime: fromMin(total) }
}

/** Re-renders on a timer so the now-line moves. */
function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}

/** The heading over the calendar, which is a different unit in every view. */
function RangeTitle({
  view,
  month,
  year,
  days
}: {
  view: View
  month: number
  year: number
  days: string[]
}) {
  if (view === 'list') return <>Events</>
  if (view === 'month') {
    return (
      <>
        {MONTHS[month]} <span className="text-muted font-semibold">{year}</span>
      </>
    )
  }
  if (view === 'day') {
    const d = parseYMD(days[0])
    return (
      <>
        {d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}{' '}
        <span className="text-muted font-semibold">{d.getFullYear()}</span>
      </>
    )
  }
  const from = parseYMD(days[0])
  const to = parseYMD(days[days.length - 1])
  const same = from.getMonth() === to.getMonth()
  return (
    <>
      {MONTHS[from.getMonth()].slice(0, 3)} {from.getDate()} –{' '}
      {same ? '' : `${MONTHS[to.getMonth()].slice(0, 3)} `}
      {to.getDate()} <span className="text-muted font-semibold">{to.getFullYear()}</span>
    </>
  )
}

function relDays(ts: number): string {
  const days = Math.round((ts - Date.now()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days}d`
}

function fmtDT(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}

/** Draws are posted start − 8 days at 16:30 (BQ rule); derived, not stored. */
function drawsAt(startAt: string): string {
  const d = new Date(startAt)
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 8, 16, 30)
  return local.toISOString()
}
