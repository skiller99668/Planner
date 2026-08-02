import { useEffect, useState } from 'react'
import type { AppInfo } from '../../shared/ipc'

const ROADMAP: { phase: string; name: string; status: 'done' | 'now' | 'next' }[] = [
  { phase: '1', name: 'Foundation — shell, database, tray, notifications', status: 'done' },
  { phase: '2', name: 'Tasks — capture, tags, reminders, recurring series', status: 'now' },
  { phase: '3', name: 'Gym — PPL cycle, weekly grid, streaks', status: 'next' },
  { phase: '4', name: 'Academics — lectures, summaries, Groq chat', status: 'next' },
  { phase: '5', name: 'Events + Career — tournaments, fairs, pipeline', status: 'next' }
]

export default function DashboardPage() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [notifyResult, setNotifyResult] = useState<'idle' | 'sent' | 'unsupported'>('idle')

  useEffect(() => {
    window.planner?.ping().then(setInfo).catch(() => setInfo(null))
  }, [])

  const testNotification = async () => {
    const ok = await window.planner?.testNotification()
    setNotifyResult(ok ? 'sent' : 'unsupported')
    setTimeout(() => setNotifyResult('idle'), 4000)
  }

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })

  return (
    <div>
      <p className="text-muted font-mono text-[11px] tracking-[0.16em] uppercase">{today}</p>
      <h1 className="font-display mt-1 text-xl font-semibold">Dashboard</h1>
      <p className="text-muted mt-3 max-w-xl leading-relaxed">
        The dashboard fills in as each module lands — today&apos;s tasks, the lift on deck,
        upcoming registration windows, and your weekly application count will all live here.
      </p>

      <div className="mt-6 grid max-w-2xl gap-4 sm:grid-cols-2">
        {/* System check card — Phase 1's functional deliverable. */}
        <section className="border-line bg-panel rounded-lg border p-5">
          <p className="text-muted font-mono text-[11px] tracking-[0.16em] uppercase">
            System check
          </p>
          {info ? (
            <dl className="mt-3 space-y-1.5 font-mono text-[12px]">
              <Row k="app" v={`v${info.version}${info.packaged ? '' : ' (dev)'}`} />
              <Row k="electron" v={info.electron} />
              <Row k="database" v={`schema v${info.schemaVersion}`} ok />
              <Row k="storage" v={shortenPath(info.dbPath)} title={info.dbPath} />
            </dl>
          ) : (
            <p className="text-danger mt-3 font-mono text-[12px]">
              bridge offline — running outside Electron?
            </p>
          )}
          <button
            onClick={testNotification}
            className="border-line bg-panel2 hover:border-amber/60 mt-4 rounded-md border px-3 py-1.5 text-[12.5px] font-medium transition-colors"
          >
            {notifyResult === 'idle' && 'Send test notification'}
            {notifyResult === 'sent' && 'Sent — check your toasts'}
            {notifyResult === 'unsupported' && 'Notifications unavailable'}
          </button>
        </section>

        {/* Build roadmap */}
        <section className="border-line bg-panel rounded-lg border p-5">
          <p className="text-muted font-mono text-[11px] tracking-[0.16em] uppercase">
            Build roadmap
          </p>
          <ol className="mt-3 space-y-2.5">
            {ROADMAP.map((r) => (
              <li key={r.phase} className="flex items-start gap-2.5 text-[12.5px] leading-snug">
                <span
                  aria-hidden
                  className={`led mt-1 ${
                    r.status === 'done'
                      ? 'text-ok'
                      : r.status === 'now'
                        ? 'text-amber'
                        : 'text-line'
                  }`}
                />
                <span className={r.status === 'next' ? 'text-muted' : ''}>{r.name}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}

function Row({ k, v, ok, title }: { k: string; v: string; ok?: boolean; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className={`truncate text-right ${ok ? 'text-ok' : ''}`} title={title ?? v}>
        {v}
      </dd>
    </div>
  )
}

function shortenPath(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts.length > 3 ? `…\\${parts.slice(-2).join('\\')}` : p
}
