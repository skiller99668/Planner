// Events — a month calendar you create straight into. Click any day and a
// bubble opens on that day with the title focused; Enter saves. Clicking an
// event opens the same bubble in read mode. Imports and hackathon links sit
// below the grid, where they don't compete with the calendar.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConfirm } from '../components/ConfirmProvider'
import TimeField from '../components/TimeField'
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

/** What the anchored bubble is showing, and the rect it hangs off. */
type Bubble =
  | { mode: 'create'; rect: DOMRect; date: string }
  | { mode: 'event'; rect: DOMRect; id: string }
  | { mode: 'day'; rect: DOMRect; date: string }
  | null

export default function EventsPage() {
  const [events, setEvents] = useState<PlannerEvent[]>([])
  const [loaded, setLoaded] = useState(false)
  const [importKind, setImportKind] = useState<EventKind>('badminton')
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [showPast, setShowPast] = useState(false)
  const [view, setView] = useState<'month' | 'list'>('month')
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
      const start = localYMD(new Date(e.startAt))
      const end = e.endAt ? localYMD(new Date(e.endAt)) : start
      let d = start
      for (let guard = 0; guard < 400 && d <= end; guard++) {
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
  // "Create" with no day in mind lands on today when today is on screen,
  // otherwise on the 1st of the month you're looking at. Compared as strings:
  // new Date('2026-08-08') is UTC midnight, which is the 7th west of Greenwich.
  const defaultDay =
    today.slice(0, 7) === `${year}-${String(month + 1).padStart(2, '0')}`
      ? today
      : localYMD(new Date(year, month, 1))

  const bubbleEvent =
    bubble?.mode === 'event' ? (events.find((e) => e.id === bubble.id) ?? null) : null

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <h1 className="mr-2 text-[26px] font-bold">
            {view === 'month' ? (
              <>
                {MONTHS[month]} <span className="text-muted font-semibold">{year}</span>
              </>
            ) : (
              'Events'
            )}
          </h1>
          {view === 'month' && (
            <>
              <button
                onClick={() => setCursor(new Date(year, month - 1, 1))}
                aria-label="Previous month"
                className="tactile text-muted hover:text-ink hover:bg-surface rounded-[10px] px-2 py-1.5"
              >
                <Caret dir="left" />
              </button>
              <button
                onClick={() => setCursor(new Date(year, month + 1, 1))}
                aria-label="Next month"
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
            {(['month', 'list'] as const).map((v) => (
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
          <EventChip key={e.id} event={e} onOpen={onOpen} />
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

function EventChip({ event, onOpen }: { event: PlannerEvent; onOpen: (b: Bubble) => void }) {
  const color = KIND_COLOR[event.kind]
  const d = new Date(event.startAt)
  const timed = d.getHours() !== 0 || d.getMinutes() !== 0

  return (
    <button
      onClick={(e) =>
        onOpen({ mode: 'event', rect: e.currentTarget.getBoundingClientRect(), id: event.id })
      }
      title={event.title}
      className="pointer-events-auto flex w-full items-center gap-1 truncate rounded-[5px] px-1.5 py-[2px] text-left text-[10.5px] font-medium transition-opacity hover:opacity-80"
      style={{ color, background: `${color}22` }}
    >
      {timed && <span className="nums shrink-0 opacity-75">{shortTime(d)}</span>}
      <span className="truncate">{event.title}</span>
    </button>
  )
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

/** Date + time, sized so the date gets the room it needs and the time doesn't. */
function WhenRow({
  day,
  time,
  onDay,
  onTime
}: {
  day: string
  time: string
  onDay: (ymd: string) => void
  onTime: (hm: string) => void
}) {
  return (
    <div className="mt-3 flex items-center gap-1.5">
      <DateField
        value={day}
        ariaLabel="Event date"
        clearable={false}
        className="flex-1"
        onChange={onDay}
      />
      <TimeField
        value={time}
        ariaLabel="Event time"
        placeholder="All day"
        className="w-[104px]"
        onChange={onTime}
      />
    </div>
  )
}

// ---------- anchored bubbles ----------

/** Google-Calendar-style quick create: the title is the only required field,
 *  everything else is pre-filled from the day you clicked, Enter saves. */
function QuickCreate({
  rect,
  date,
  onClose,
  onCreated
}: {
  rect: DOMRect
  date: string
  onClose: () => void
  onCreated: () => Promise<void>
}) {
  const ref = useRef<HTMLDivElement>(null)
  const style = useAnchoredStyle(rect, ref, 330)
  useDismiss(true, onClose, ref)

  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<EventKind>('other')
  const [day, setDay] = useState(date)
  const [time, setTime] = useState('')
  const [location, setLocation] = useState('')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [autoReg, setAutoReg] = useState(true)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!title.trim() || !day || !window.planner || busy) return
    setBusy(true)
    await window.planner.eventsCreate({
      title,
      kind,
      date: day,
      time: time || null,
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

      <WhenRow day={day} time={time} onDay={setDay} onTime={setTime} />
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
          disabled={!title.trim() || !day || busy}
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
  const style = useAnchoredStyle(rect, ref, 330)
  useDismiss(true, onClose, ref)
  const confirm = useConfirm()

  const start = new Date(event.startAt)
  const allDay = start.getHours() === 0 && start.getMinutes() === 0
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(event.title)
  const [kind, setKind] = useState<EventKind>(event.kind)
  const [day, setDay] = useState(localYMD(start))
  const [time, setTime] = useState(allDay ? '' : hm(event.startAt))
  const [location, setLocation] = useState(event.location ?? '')
  const [url, setUrl] = useState(event.url ?? '')
  const [notes, setNotes] = useState(event.notes ?? '')
  const [autoReg, setAutoReg] = useState(event.regOpensAt !== null)

  const color = KIND_COLOR[event.kind]

  const save = async () => {
    if (!title.trim() || !day || !window.planner) return
    await window.planner.eventsUpdate(event.id, {
      title,
      kind,
      date: day,
      time: time || null,
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
          <WhenRow day={day} time={time} onDay={setDay} onTime={setTime} />
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
              disabled={!title.trim() || !day}
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
              <p className="text-muted nums mt-0.5 text-[12.5px]">
                {start.toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric'
                })}
                {allDay
                  ? ''
                  : ` · ${start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`}
              </p>
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
        {events.map((e) => {
          const start = new Date(e.startAt)
          const timed = start.getHours() !== 0 || start.getMinutes() !== 0
          return (
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
                {timed && (
                  <span className="text-muted nums shrink-0 text-[11px]">
                    {start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </span>
                )}
              </button>
            </li>
          )
        })}
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
            {allDay
              ? 'all day'
              : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
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
