import { useCallback, useEffect, useMemo, useState } from 'react'
import DateField from '../components/DateField'
import Select from '../components/Select'
import type { JobSourceStatus } from '../../shared/ipc'
import type {
  Application,
  ApplicationStatus,
  ApplicationTrack,
  CareerWeekStats,
  JobPosting,
  Settings
} from '../../shared/types'

// Most community lists don't carry a Hardware category, so hardware roles are
// found by title as well — otherwise the Hardware track hides almost everything.
const HARDWARE_RE =
  /hardware|embedded|firmware|fpga|asic|vlsi|silicon|semiconductor|chip design|electrical|electronic|analog|mixed.signal|\brf\b|pcb|circuit|robotic|mechatronic|signal processing|verification engineer|physical design|power system/i

const CANADA_RE =
  /canada|montr[eé]al|toronto|vancouver|ottawa|waterloo|qu[eé]bec|calgary|edmonton|halifax|mississauga|burnaby|kitchener|winnipeg|,\s*(on|qc|bc|ab|ns|mb|sk)\b/i
const REMOTE_RE = /remote|anywhere/i

function matchesTrack(p: JobPosting, focus: 'swe' | 'hardware'): boolean {
  return focus === 'hardware'
    ? p.category === 'Hardware' || HARDWARE_RE.test(p.title)
    : p.category !== 'Hardware' // software track = everything but tagged hardware
}

const PIPELINE: { id: ApplicationStatus; label: string; hint?: string }[] = [
  { id: 'wishlist', label: 'Wishlist' },
  { id: 'applied', label: 'Applied' },
  {
    id: 'oa',
    label: 'OA — online assessment',
    hint: 'Online Assessment: the timed coding/aptitude test companies send after you apply, usually on HackerRank or CodeSignal'
  },
  { id: 'interview', label: 'Interview' },
  { id: 'offer', label: 'Offer' }
]
const CLOSED: ApplicationStatus[] = ['rejected', 'ghosted']

const TRACK_META: Record<ApplicationTrack, { label: string; cls: string }> = {
  swe: { label: 'swe', cls: 'text-violet' },
  hardware: { label: 'hw', cls: 'text-azure' },
  research: { label: 'research', cls: 'text-mint' }
}

// Stable, top-level links only — labels carry the guidance.
const RESOURCES: Record<'swe' | 'hardware', { name: string; url: string; note: string }[]> = {
  swe: [
    { name: 'SimplifyJobs internship list', url: 'https://github.com/SimplifyJobs', note: 'the Summer 2027 repo — check daily in Aug–Oct' },
    { name: 'NeetCode roadmap', url: 'https://neetcode.io', note: 'DSA prep path; your weekly problem target' },
    { name: 'LeetCode', url: 'https://leetcode.com', note: 'company-tagged problems before OAs' },
    { name: 'McGill CaPS', url: 'https://www.mcgill.ca/caps', note: 'myFuture postings + fall career fairs' },
    { name: 'levels.fyi', url: 'https://www.levels.fyi', note: 'intern comp data for negotiating' }
  ],
  hardware: [
    { name: 'McGill CaPS', url: 'https://www.mcgill.ca/caps', note: 'hardware co-ops post here more than anywhere' },
    { name: 'IEEE Xtreme / student branch', url: 'https://www.ieee.org', note: 'competitions that read well on a hardware resume' },
    { name: 'SimplifyJobs internship list', url: 'https://github.com/SimplifyJobs', note: 'filter for hardware/embedded roles' },
    { name: 'Digi-Key TechForum', url: 'https://www.digikey.ca', note: 'parts for the portfolio projects that get you hired' }
  ]
}

const WATCHLIST = [
  {
    id: 'sure',
    name: 'SURE — Summer Undergraduate Research in Engineering',
    url: 'https://www.mcgill.ca/engineering',
    note: 'McGill-internal research internships. Applications historically open Jan–Feb for summer. Professors pick from applicants — email 2–3 profs whose labs interest you before the portal opens.'
  },
  {
    id: 'usra',
    name: 'NSERC USRA',
    url: 'https://www.nserc-crsng.gc.ca',
    note: 'Federally funded research award held at McGill. Internal McGill deadline is typically late Feb–Mar. Needs a supervising prof — same outreach as SURE covers both.'
  }
]

const inputCls =
  'bg-bg border-line rounded-[11px] border px-2.5 py-1.5 text-[13px] placeholder:text-muted/60 focus:border-azure/60'

export default function CareerPage() {
  const [apps, setApps] = useState<Application[]>([])
  const [stats, setStats] = useState<CareerWeekStats | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)

  const refresh = useCallback(async () => {
    if (!window.planner) return
    const [a, s, st] = await Promise.all([
      window.planner.appsList(),
      window.planner.careerWeekStats(),
      window.planner.getSettings()
    ])
    setApps(a)
    setStats(s)
    setSettings(st)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const focus = settings?.internshipTrackFocus ?? 'swe'
  const targets = settings?.targets

  const setFocus = async (f: 'swe' | 'hardware') => {
    if (!window.planner) return
    setSettings(await window.planner.patchSettings({ internshipTrackFocus: f }))
  }

  const log = async (kind: 'dsa' | 'networking') => {
    await window.planner?.careerLogAdd(kind)
    await refresh()
  }
  const unlog = async (kind: 'dsa' | 'networking') => {
    await window.planner?.careerLogUndo(kind)
    await refresh()
  }

  const closed = apps.filter((a) => CLOSED.includes(a.status))

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold">Career</h1>
          <p className="text-muted mt-0.5 text-[13.5px]">Summer 2027</p>
        </div>
        <div className="bg-surface flex rounded-[11px] p-0.5" role="group" aria-label="Track focus">
          {(['swe', 'hardware'] as const).map((f) => (
            <button
              key={f}
              onClick={() => void setFocus(f)}
              className={`tactile rounded-[9px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                focus === f ? 'btn-primary font-semibold' : 'text-muted hover:text-ink'
              }`}
            >
              {f === 'swe' ? 'SWE' : 'Hardware'}
            </button>
          ))}
        </div>
      </div>

      {/* Weekly scoreboard */}
      {stats && targets && (
        <div className="mt-5 grid max-w-2xl grid-cols-3 gap-3">
          <ScoreTile
            label="applications"
            value={stats.applications}
            target={targets.applicationsPerWeek}
          />
          <ScoreTile
            label="dsa problems"
            value={stats.dsa}
            target={targets.dsaPerWeek}
            onAdd={() => void log('dsa')}
            onUndo={stats.dsa > 0 ? () => void unlog('dsa') : undefined}
          />
          <ScoreTile
            label="networking"
            value={stats.networking}
            target={targets.networkingPerWeek}
            onAdd={() => void log('networking')}
            onUndo={stats.networking > 0 ? () => void unlog('networking') : undefined}
          />
        </div>
      )}

      {/* Pipeline */}
      <AddApplication defaultTrack={focus} onCreated={refresh} />

      <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
        {PIPELINE.map((col) => {
          const items = apps.filter((a) => a.status === col.id)
          return (
            <div key={col.id} className="w-52 shrink-0">
              <p
                className="text-muted text-[12px] font-semibold"
                title={col.hint}
              >
                {col.label} <span className="opacity-60">· {items.length}</span>
              </p>
              <div className="mt-1.5 space-y-1.5">
                {items.map((a) => (
                  <AppCard
                    key={a.id}
                    app={a}
                    expanded={expandedId === a.id}
                    onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
                    onChanged={refresh}
                  />
                ))}
                {items.length === 0 && (
                  <div className="border-line/40 text-muted/40 rounded-[11px] border border-dashed px-2 py-3 text-center nums text-[11.5px]">
                    —
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {closed.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowClosed((s) => !s)}
            className="text-muted hover:text-ink text-[13px] font-bold transition-colors"
          >
            {showClosed ? '▾' : '▸'} Closed · {closed.length}
          </button>
          {showClosed && (
            <ul className="mt-2 max-w-2xl space-y-1 opacity-70">
              {closed.map((a) => (
                <li key={a.id}>
                  <AppCard
                    app={a}
                    expanded={expandedId === a.id}
                    onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
                    onChanged={refresh}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Live internship feed */}
      <JobFeed focus={focus} apps={apps} onAdded={refresh} />

      {/* Research watchlist (the 15%) */}
      <section className="mt-8 max-w-2xl">
        <h2 className="text-muted text-[13px] font-bold">
          Research watchlist — SURE / USRA
        </h2>
        <div className="mt-2 space-y-2">
          {WATCHLIST.map((w) => (
            <WatchlistItem key={w.id} item={w} />
          ))}
        </div>
      </section>

      {/* Resource shelf */}
      <section className="mt-8 max-w-2xl">
        <h2 className="text-muted text-[13px] font-bold">
          Resources · {focus === 'swe' ? 'software' : 'hardware'} focus
        </h2>
        <ul className="mt-2 space-y-1">
          {RESOURCES[focus].map((r) => (
            <li key={r.name} className="flex items-baseline gap-2 text-[13px]">
              <button
                onClick={() => void window.planner?.openExternal(r.url)}
                className="text-violet shrink-0 hover:underline"
              >
                {r.name}
              </button>
              <span className="text-muted text-[12px]">{r.note}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

// ---------- job feed ----------

function JobFeed({
  focus,
  apps,
  onAdded
}: {
  focus: 'swe' | 'hardware'
  apps: Application[]
  onAdded: () => Promise<void>
}) {
  const [postings, setPostings] = useState<JobPosting[]>([])
  const [sources, setSources] = useState<JobSourceStatus[]>([])
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [region, setRegion] = useState<'all' | 'canada' | 'remote'>('all')
  const [trackOnly, setTrackOnly] = useState(true)
  const [limit, setLimit] = useState(40)

  // Match by normalized URL so a posting added earlier is still recognized.
  const knownUrls = useMemo(
    () => new Map(apps.filter((a) => a.url).map((a) => [normUrl(a.url!), a.id])),
    [apps]
  )

  const load = async (force = false) => {
    if (!window.planner || loading) return
    setLoading(true)
    setError(null)
    const res = await window.planner.jobsFetch(force)
    setLoading(false)
    if (res.ok) {
      setPostings(res.postings)
      setSources(res.sources)
      setFetchedAt(res.fetchedAt)
    } else {
      setError(res.error)
    }
  }

  // Track filter first; every chip count below is derived from this same set,
  // so a chip can never advertise more jobs than the list will show.
  const trackFiltered = useMemo(
    () => (trackOnly ? postings.filter((p) => matchesTrack(p, focus)) : postings),
    [postings, focus, trackOnly]
  )

  const counts = useMemo(
    () => ({
      all: trackFiltered.length,
      canada: trackFiltered.filter((p) => p.locations.some((l) => CANADA_RE.test(l))).length,
      remote: trackFiltered.filter((p) => p.locations.some((l) => REMOTE_RE.test(l))).length
    }),
    [trackFiltered]
  )

  const matching = useMemo(() => {
    const q = search.trim().toLowerCase()
    return trackFiltered
      .filter((p) => {
        if (region === 'canada') return p.locations.some((l) => CANADA_RE.test(l))
        if (region === 'remote') return p.locations.some((l) => REMOTE_RE.test(l))
        return true
      })
      .filter(
        (p) =>
          !q ||
          p.company.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q) ||
          p.locations.some((l) => l.toLowerCase().includes(q))
      )
  }, [trackFiltered, region, search])

  const visible = matching.slice(0, limit)

  return (
    <section className="mt-8 max-w-2xl">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-muted text-[13px] font-bold">
          Live postings · Summer 2027
        </h2>
        <span className="text-muted/60 nums text-[11px]">
        </span>
        <div className="flex-1" />
        {fetchedAt && (
          <span className="text-muted/60 nums text-[11px]">
            {postings.length} jobs · {new Date(fetchedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <button
          onClick={() => void load(postings.length > 0)}
          disabled={loading}
          className="bg-surface text-muted hover:text-ink rounded-[11px] px-3 py-1.5 text-[12.5px] transition-colors disabled:opacity-50"
        >
          {loading ? 'Fetching…' : postings.length ? 'Refresh' : 'Fetch postings'}
        </button>
      </div>

      {error && (
        <p className="text-coral mt-2 nums text-[12px]">
          Feed unavailable: {error}. Try again in a minute.
        </p>
      )}

      {sources.some((s) => !s.ok) && (
        <p className="text-muted/70 mt-2 nums text-[11.5px]">
          {sources.filter((s) => !s.ok).map((s) => `${s.label} unavailable (${s.error})`).join(' · ')}
        </p>
      )}

      {postings.length > 0 && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              className={`${inputCls} min-w-40 flex-1`}
              placeholder="Filter company, role, location…"
              aria-label="Filter postings"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="bg-surface flex rounded-[11px] p-0.5" role="group" aria-label="Region">
              {([
                ['all', `all (${counts.all})`],
                ['canada', `canada (${counts.canada})`],
                ['remote', `remote (${counts.remote})`]
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => { setRegion(id); setLimit(40) }}
                  aria-pressed={region === id}
                  className={`rounded px-2.5 py-1 nums text-[12px] transition-colors ${
                    region === id ? 'btn-primary font-semibold' : 'text-muted hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => { setTrackOnly((t) => !t); setLimit(40) }}
              aria-pressed={!trackOnly}
              title={
                trackOnly
                  ? `Only ${focus === 'swe' ? 'software' : 'hardware'} roles — click to show every posting`
                  : 'Showing every posting regardless of track'
              }
              className={`rounded-full border px-2.5 py-1 nums text-[12px] transition-colors ${
                trackOnly
                  ? 'border-line text-muted hover:text-ink'
                  : 'border-azure/60 text-azure bg-azure/10'
              }`}
            >
              {trackOnly ? `${focus === 'swe' ? 'swe' : 'hardware'} only` : 'all roles'}
            </button>
          </div>

          {visible.length === 0 ? (
            <p className="text-muted mt-3 text-[13px]">
              {region === 'canada'
                ? 'No Canadian postings match this filter. Most Canadian internships post later in the season (Sep–Jan)'
                : 'Nothing matches that filter'}
              {trackOnly && ` — or click “${focus === 'swe' ? 'swe' : 'hardware'} only” to drop the track filter.`}
            </p>
          ) : (
            <>
              <ul className="mt-2 space-y-1">
                {visible.map((p) => {
                  const existingId = knownUrls.get(normUrl(p.url))
                  return (
                    <li
                      key={p.id}
                      className="group bg-surface hover:bg-surface flex items-center gap-3 rounded-[16px] px-3 py-2 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px]">
                          <span className="font-medium">{p.company}</span>
                          <span className="text-muted"> — {p.title}</span>
                        </p>
                        <p className="text-muted mt-0.5 truncate nums text-[11.5px]">
                          {p.locations.join(' · ') || 'location n/a'}
                          {p.salary && <span className="text-mint"> · {p.salary}</span>}
                          {p.postedAt && ` · ${relAge(p.postedAt)}`}
                        </p>
                      </div>
                      <button
                        onClick={() => void window.planner?.openExternal(p.url)}
                        className="text-violet shrink-0 nums text-[12px] hover:underline"
                      >
                        open ↗
                      </button>
                      <button
                        onClick={async () => {
                          if (!window.planner) return
                          if (existingId) {
                            await window.planner.appsDelete(existingId)
                          } else {
                            await window.planner.appsCreate({
                              company: p.company,
                              role: p.title,
                              track: p.category === 'Hardware' ? 'hardware' : 'swe',
                              url: p.url
                            })
                          }
                          await onAdded()
                        }}
                        title={existingId ? 'Remove from pipeline' : 'Add to pipeline'}
                        className={`shrink-0 rounded-[11px] border px-2 py-1 nums text-[12px] transition-colors ${
                          existingId
                            ? 'border-mint/40 text-mint hover:border-coral/60 hover:text-coral'
                            : 'border-line text-muted hover:border-azure/60 hover:text-ink'
                        }`}
                      >
                        {existingId ? 'Added' : 'Add'}
                      </button>
                    </li>
                  )
                })}
              </ul>
              {matching.length > visible.length && (
                <button
                  onClick={() => setLimit((l) => l + 40)}
                  className="text-muted hover:text-azure mt-2 nums text-[12px] transition-colors"
                >
                  show more ({matching.length - visible.length} more)
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}

/** Same normalization the main process uses, so add/remove round-trips. */
function normUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.host.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

function relAge(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return '1d ago'
  return `${days}d ago`
}

// ---------- pieces ----------

function ScoreTile({
  label,
  value,
  target,
  onAdd,
  onUndo
}: {
  label: string
  value: number
  target: number
  onAdd?: () => void
  onUndo?: () => void
}) {
  const met = value >= target
  return (
    <div className="bg-surface rounded-[16px] p-3.5">
      <p className="text-muted text-[12px] font-semibold">{label}</p>
      <div className="mt-1 flex items-center justify-between">
        <p className="font-mono text-lg leading-none font-semibold">
          <span className={met ? 'text-mint' : ''}>{value}</span>
          <span className="text-muted text-[12px]"> / {target}</span>
        </p>
        {onAdd && (
          <div className="flex gap-1">
            {onUndo && (
              <button
                onClick={onUndo}
                aria-label={`Undo ${label}`}
                className="border-line text-muted hover:text-coral h-6 w-6 rounded border nums text-[12.5px] transition-colors"
              >
                −
              </button>
            )}
            <button
              onClick={onAdd}
              aria-label={`Log ${label}`}
              className="bg-azure text-bg h-6 w-6 rounded font-mono text-[13px] font-bold"
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function AddApplication({
  defaultTrack,
  onCreated
}: {
  defaultTrack: ApplicationTrack
  onCreated: () => Promise<void>
}) {
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [track, setTrack] = useState<ApplicationTrack>(defaultTrack)
  const [url, setUrl] = useState('')

  useEffect(() => setTrack(defaultTrack), [defaultTrack])

  const add = async () => {
    if (!company.trim() || !role.trim() || !window.planner) return
    await window.planner.appsCreate({ company, role, track, url: url || null })
    setCompany('')
    setRole('')
    setUrl('')
    await onCreated()
  }

  return (
    <div className="bg-surface mt-5 flex max-w-2xl flex-wrap items-end gap-2 rounded-[16px] p-4">
      <div className="min-w-32 flex-1">
        <label className="text-muted mb-1 block text-[12px] font-semibold" htmlFor="ap-company">
          Company
        </label>
        <input id="ap-company" className={`${inputCls} w-full`} placeholder="Matrox"
          value={company} onChange={(e) => setCompany(e.target.value)} />
      </div>
      <div className="min-w-40 flex-1">
        <label className="text-muted mb-1 block text-[12px] font-semibold" htmlFor="ap-role">
          Role
        </label>
        <input id="ap-role" className={`${inputCls} w-full`} placeholder="SWE Intern — Summer 2027"
          value={role} onChange={(e) => setRole(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add()} />
      </div>
      <div>
        <span className="text-muted mb-1 block text-[12px] font-semibold">
          Track
        </span>
        <Select
          value={track}
          ariaLabel="Track"
          onChange={(val) => setTrack(val as ApplicationTrack)}
          options={[
            { value: 'swe', label: 'SWE' },
            { value: 'hardware', label: 'Hardware' },
            { value: 'research', label: 'Research' }
          ]}
        />
      </div>
      <button
        onClick={() => void add()}
        disabled={!company.trim() || !role.trim()}
        className="btn-primary rounded-[11px] px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-40"
      >
        Add
      </button>
      <input className={`${inputCls} w-full`} placeholder="Posting URL (optional)"
        aria-label="Posting URL" value={url} onChange={(e) => setUrl(e.target.value)} />
    </div>
  )
}

function AppCard({
  app,
  expanded,
  onToggle,
  onChanged
}: {
  app: Application
  expanded: boolean
  onToggle: () => void
  onChanged: () => Promise<void>
}) {
  const idx = PIPELINE.findIndex((p) => p.id === app.status)
  const canAdvance = idx >= 0 && idx < PIPELINE.length - 1
  const meta = TRACK_META[app.track]

  const patch = async (p: Parameters<NonNullable<typeof window.planner>['appsUpdate']>[1]) => {
    await window.planner?.appsUpdate(app.id, p)
    await onChanged()
  }

  return (
    <div className="border-line/60 bg-surface/80 rounded-[11px]">
      <div className="group flex items-start gap-1.5 px-2.5 py-2">
        <button onClick={onToggle} className="min-w-0 flex-1 text-left">
          <p className="truncate text-[12.5px] font-medium">{app.company}</p>
          <p className="text-muted truncate text-[11px]">{app.role}</p>
          <p className={`mt-0.5 nums text-[11px] ${meta.cls}`}>
            {meta.label}
            {app.deadline && <span className="text-muted"> · due {app.deadline}</span>}
            {app.nextActionDate && <span className="text-azure"> · next {app.nextActionDate}</span>}
          </p>
        </button>
        <div className="flex shrink-0 flex-col items-center gap-1">
          {canAdvance && (
            <button
              onClick={() => void patch({ status: PIPELINE[idx + 1].id })}
              title={`Move to ${PIPELINE[idx + 1].label}`}
              aria-label={`Advance ${app.company} to ${PIPELINE[idx + 1].label}`}
              className="text-muted hover:text-azure font-mono text-[13px] leading-none transition-colors"
            >
              →
            </button>
          )}
          <button
            onClick={() => {
              if (window.confirm(`Remove ${app.company} — ${app.role} from the pipeline?`))
                void window.planner?.appsDelete(app.id).then(onChanged)
            }}
            title="Remove from pipeline"
            aria-label={`Remove ${app.company} from pipeline`}
            className="text-muted/60 hover:text-coral font-mono text-[15px] leading-none transition-colors"
          >
            ×
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-line/60 space-y-2 border-t px-2.5 py-2">
          <Select
            value={app.status}
            ariaLabel="Status"
            className="w-full"
            onChange={(val) => void patch({ status: val as ApplicationStatus })}
            options={[
              { value: 'wishlist', label: 'Wishlist' },
              { value: 'applied', label: 'Applied' },
              { value: 'oa', label: 'Online assessment' },
              { value: 'interview', label: 'Interview' },
              { value: 'offer', label: 'Offer' },
              { value: 'rejected', label: 'Rejected' },
              { value: 'ghosted', label: 'Ghosted' }
            ]}
          />
          <input
            className={`${inputCls} w-full py-1 text-[11.5px]`}
            placeholder="Next action (e.g. follow up with recruiter)"
            defaultValue={app.nextAction ?? ''}
            onBlur={(e) => {
              const v = e.target.value.trim() || null
              if (v !== app.nextAction) void patch({ nextAction: v })
            }}
          />
          <div className="flex items-center gap-2">
            <DateField
              value={app.nextActionDate ?? ''}
              ariaLabel="Next action date"
              placeholder="Follow up"
              onChange={(ymd) => void patch({ nextActionDate: ymd || null })}
            />
            {app.url && (
              <button
                onClick={() => void window.planner?.openExternal(app.url!)}
                className="text-violet nums text-[12px] hover:underline"
              >
                posting ↗
              </button>
            )}
            <button
              onClick={() => {
                if (window.confirm(`Remove ${app.company} — ${app.role} from the pipeline?`))
                  void window.planner?.appsDelete(app.id).then(onChanged)
              }}
              className="text-muted/60 hover:text-coral ml-auto nums text-[12px] transition-colors"
            >
              remove
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function WatchlistItem({ item }: { item: { name: string; url: string; note: string } }) {
  const [date, setDate] = useState('')
  const [tracked, setTracked] = useState(false)

  const track = async () => {
    if (!date || !window.planner) return
    await window.planner.eventsCreate({
      title: `${item.name.split('—')[0].trim()} deadline`,
      kind: 'academic',
      date,
      time: null,
      url: item.url,
      autoRegWindow: false
    })
    setTracked(true)
  }

  return (
    <div className="bg-surface rounded-[16px] p-3.5">
      <div className="flex items-baseline gap-2">
        <button
          onClick={() => void window.planner?.openExternal(item.url)}
          className="text-mint text-[13px] font-medium hover:underline"
        >
          {item.name}
        </button>
      </div>
      <p className="text-muted mt-1 text-[12px] leading-relaxed">{item.note}</p>
      <div className="mt-2 flex items-center gap-2">
        {tracked ? (
          <span className="text-mint nums text-[12px]">Added to Events</span>
        ) : (
          <>
            <DateField
              value={date}
              ariaLabel={`${item.name} deadline`}
              placeholder="Deadline"
              onChange={setDate}
            />
            <button
              onClick={() => void track()}
              disabled={!date}
              className="bg-surface2 hover:border-azure/60 rounded-[11px] px-2.5 py-1 nums text-[12px] transition-colors disabled:opacity-40"
            >
              Track deadline
            </button>
            <span className="text-muted/60 nums text-[11px]">

            </span>
          </>
        )}
      </div>
    </div>
  )
}
