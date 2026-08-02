import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EventKind, PlannerEvent } from '../../shared/types'

const KIND_META: Record<EventKind, { label: string; cls: string }> = {
  badminton: { label: 'badminton', cls: 'text-cyan border-cyan/40 bg-cyan/10' },
  career: { label: 'career', cls: 'text-amber border-amber/40 bg-amber/10' },
  academic: { label: 'academic', cls: 'text-ok border-ok/40 bg-ok/10' },
  other: { label: 'other', cls: 'text-muted border-line bg-panel2' }
}

const inputCls =
  'bg-bench border-line rounded-md border px-2.5 py-1.5 text-[13px] placeholder:text-muted/60 focus:border-amber/60'

export default function EventsPage() {
  const [events, setEvents] = useState<PlannerEvent[]>([])
  const [loaded, setLoaded] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [importKind, setImportKind] = useState<EventKind>('badminton')
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [showPast, setShowPast] = useState(false)

  const refresh = useCallback(async () => {
    if (!window.planner) return
    setEvents(await window.planner.eventsList())
    setLoaded(true)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

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
      const d = new Date(e.startAt)
      const label = d
        .toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        .toUpperCase()
      const last = groups[groups.length - 1]
      if (last && last.label === label) last.items.push(e)
      else groups.push({ label, items: [e] })
    }
    return groups
  }, [upcoming])

  const doImport = async () => {
    if (!window.planner) return
    const res = await window.planner.eventsImportIcs(importKind)
    if (res.canceled) return
    setImportMsg(`Imported ${res.imported}${res.skipped ? ` · ${res.skipped} already known` : ''}`)
    setTimeout(() => setImportMsg(null), 5000)
    await refresh()
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="text-muted font-mono text-[11px] tracking-[0.16em] uppercase">
            Tournaments · career fairs · deadlines
          </p>
          <h1 className="font-display mt-1 text-xl font-semibold">Events</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Import kind"
            className="bg-panel border-line text-muted rounded-md border px-2 py-1.5 font-mono text-[11px]"
            value={importKind}
            onChange={(e) => setImportKind(e.target.value as EventKind)}
          >
            <option value="badminton">as badminton</option>
            <option value="career">as career</option>
            <option value="academic">as academic</option>
            <option value="other">as other</option>
          </select>
          <button
            onClick={() => void doImport()}
            className="border-line bg-panel text-muted hover:text-ink rounded-md border px-3 py-1.5 text-[12.5px] transition-colors"
            title="Import a .ics file (Badminton Québec event pages export these)"
          >
            Import .ics
          </button>
        </div>
      </div>

      {importMsg && (
        <p className="text-ok mt-2 font-mono text-[11px]">{importMsg}</p>
      )}

      <AddEventForm onCreated={refresh} />

      {upcoming.length === 0 && loaded ? (
        <p className="text-muted mt-8 text-[13.5px]">
          Nothing coming up. Add a tournament above — registration alarms come free.
        </p>
      ) : (
        byMonth.map((group) => (
          <section key={group.label} className="mt-6">
            <h2 className="text-muted font-mono text-[11px] tracking-[0.16em] uppercase">
              {group.label}
            </h2>
            <ul className="mt-2 max-w-2xl space-y-1">
              {group.items.map((e) => (
                <EventRow
                  key={e.id}
                  event={e}
                  expanded={expandedId === e.id}
                  onToggle={() => setExpandedId(expandedId === e.id ? null : e.id)}
                  onChanged={refresh}
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
            className="text-muted hover:text-ink font-mono text-[11px] tracking-[0.16em] uppercase transition-colors"
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
                  onChanged={refresh}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

// ---------- add form ----------

function AddEventForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<EventKind>('badminton')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [location, setLocation] = useState('')
  const [url, setUrl] = useState('')
  const [autoReg, setAutoReg] = useState(true)

  const add = async () => {
    if (!title.trim() || !date || !window.planner) return
    await window.planner.eventsCreate({
      title,
      kind,
      date,
      time: time || null,
      location: location || null,
      url: url || null,
      autoRegWindow: kind === 'badminton' ? autoReg : false
    })
    setTitle('')
    setDate('')
    setTime('')
    setLocation('')
    setUrl('')
    await onCreated()
  }

  return (
    <div className="border-line bg-panel mt-5 max-w-2xl rounded-lg border p-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-44 flex-1">
          <label className="text-muted mb-1 block font-mono text-[10.5px] uppercase" htmlFor="ev-title">
            New event
          </label>
          <input id="ev-title" className={`${inputCls} w-full`}
            placeholder="Invitation de Montréal — Élite/ABC"
            value={title} onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()} />
        </div>
        <div>
          <label className="text-muted mb-1 block font-mono text-[10.5px] uppercase" htmlFor="ev-kind">
            Kind
          </label>
          <select id="ev-kind" className={inputCls} value={kind}
            onChange={(e) => setKind(e.target.value as EventKind)}>
            <option value="badminton">Badminton</option>
            <option value="career">Career</option>
            <option value="academic">Academic</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="text-muted mb-1 block font-mono text-[10.5px] uppercase" htmlFor="ev-date">
            Date
          </label>
          <input id="ev-date" type="date" className={inputCls} value={date}
            onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="text-muted mb-1 block font-mono text-[10.5px] uppercase" htmlFor="ev-time">
            Time
          </label>
          <input id="ev-time" type="time" className={inputCls} value={time}
            onChange={(e) => setTime(e.target.value)} />
        </div>
        <button
          onClick={() => void add()}
          disabled={!title.trim() || !date}
          className="bg-amber text-bench rounded-md px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-40"
        >
          Add
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input className={`${inputCls} min-w-40 flex-1`} placeholder="Location (optional)"
          aria-label="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
        <input className={`${inputCls} min-w-40 flex-1`} placeholder="URL (optional)"
          aria-label="URL" value={url} onChange={(e) => setUrl(e.target.value)} />
        {kind === 'badminton' && (
          <label className="text-muted flex items-center gap-1.5 font-mono text-[10.5px]">
            <input type="checkbox" className="accent-(--color-amber)" checked={autoReg}
              onChange={(e) => setAutoReg(e.target.checked)} />
            BQ registration alarms
          </label>
        )}
      </div>
    </div>
  )
}

// ---------- row ----------

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
  const d = new Date(event.startAt)
  const allDay = d.getHours() === 0 && d.getMinutes() === 0
  const meta = KIND_META[event.kind]

  return (
    <li>
      <div className="group border-line/60 bg-panel/60 hover:bg-panel flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors">
        <div className="w-12 shrink-0 text-center">
          <div className="text-amber font-mono text-[15px] leading-none font-semibold">
            {d.getDate()}
          </div>
          <div className="text-muted font-mono text-[9px] uppercase">
            {d.toLocaleDateString(undefined, { weekday: 'short' })}
          </div>
        </div>
        <button onClick={onToggle} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px]">{event.title}</span>
            <span className={`rounded-full border px-2 py-0.5 font-mono text-[9.5px] ${meta.cls}`}>
              {meta.label}
            </span>
            <RegBadge event={event} />
          </div>
          <div className="text-muted mt-0.5 font-mono text-[10.5px]">
            {allDay ? 'all day' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            {event.location ? ` · ${event.location}` : ''}
          </div>
        </button>
        {event.kind === 'badminton' && event.regClosesAt && (
          <button
            onClick={() => void window.planner?.eventsUpdate(event.id, { registered: !event.registered }).then(onChanged)}
            className={`rounded-md border px-2 py-1 font-mono text-[10.5px] transition-colors ${
              event.registered
                ? 'border-ok/50 text-ok bg-ok/10'
                : 'border-line text-muted hover:text-ink'
            }`}
            title={event.registered ? 'You are registered' : 'Mark as registered (silences close alarm)'}
          >
            {event.registered ? 'registered ✓' : 'registered?'}
          </button>
        )}
        <button
          onClick={() => void window.planner?.eventsDelete(event.id).then(onChanged)}
          aria-label={`Delete ${event.title}`}
          className="text-muted hover:text-danger px-1 opacity-0 transition-all group-hover:opacity-100"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.75" strokeLinecap="round" aria-hidden>
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="border-line bg-panel mt-1 mb-2 rounded-lg border p-3 font-mono text-[11px]">
          {event.regOpensAt && (
            <p>
              <span className="text-muted">reg opens&nbsp;&nbsp;</span>
              {fmtDT(event.regOpensAt)}
            </p>
          )}
          {event.regClosesAt && (
            <p>
              <span className="text-muted">reg closes&nbsp;</span>
              {fmtDT(event.regClosesAt)}
            </p>
          )}
          {event.regOpensAt && (
            <p>
              <span className="text-muted">draws&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
              {fmtDT(drawsAt(event.startAt))} (posted by BQ)
            </p>
          )}
          {event.url && (
            <p className="mt-1">
              <button
                onClick={() => void window.planner?.openExternal(event.url!)}
                className="text-cyan hover:underline"
              >
                {event.url}
              </button>
            </p>
          )}
          {event.notes && <p className="text-muted mt-1 whitespace-pre-wrap">{event.notes}</p>}
          {!event.regOpensAt && !event.url && !event.notes && (
            <p className="text-muted">No extra details. Reminder fires the day before.</p>
          )}
        </div>
      )}
    </li>
  )
}

function RegBadge({ event }: { event: PlannerEvent }) {
  if (!event.regOpensAt || !event.regClosesAt) return null
  const now = Date.now()
  const opens = new Date(event.regOpensAt).getTime()
  const closes = new Date(event.regClosesAt).getTime()

  if (event.registered) return null // row shows the green "registered ✓" control
  if (now < opens) {
    return (
      <span className="text-muted border-line rounded-full border px-2 py-0.5 font-mono text-[9.5px]">
        reg opens {relDays(opens)}
      </span>
    )
  }
  if (now < closes) {
    return (
      <span className="border-amber/60 text-amber bg-amber/10 animate-pulse rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-semibold">
        REG OPEN · closes {relDays(closes)}
      </span>
    )
  }
  return (
    <span className="text-danger/80 border-danger/40 rounded-full border px-2 py-0.5 font-mono text-[9.5px]">
      reg closed
    </span>
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
