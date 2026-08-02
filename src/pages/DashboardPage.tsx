import { useEffect, useState } from 'react'
import type { AppInfo } from '../../shared/ipc'
import type { GymType } from '../../shared/types'
import type { ModuleId } from '../components/Sidebar'
import { dueLabel, todayYMD, ymdOfIso } from '../lib/dates'
import { deriveGym, useGym, useGymTarget } from '../lib/useGym'
import { useTasks } from '../lib/useTasks'

const ROADMAP: { phase: string; name: string; status: 'done' | 'now' | 'next' }[] = [
  { phase: '1', name: 'Foundation — shell, database, tray, notifications', status: 'done' },
  { phase: '2', name: 'Tasks — capture, tags, reminders, recurring series', status: 'done' },
  { phase: '3', name: 'Gym — PPL cycle, weekly grid, streaks', status: 'done' },
  { phase: '4', name: 'Academics + Assistant — lectures, chat, AI tools', status: 'done' },
  { phase: '5', name: 'Events + Career — tournaments, fairs, pipeline', status: 'now' }
]

const GYM_LABEL: Record<GymType, string> = {
  push: 'Push', pull: 'Pull', legs: 'Legs', other: 'Other'
}

export default function DashboardPage({ onNavigate }: { onNavigate: (m: ModuleId) => void }) {
  const store = useTasks()
  const gym = useGym()
  const gymTarget = useGymTarget()
  const g = deriveGym(gym.sessions, gymTarget)
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

  const today = todayYMD()
  const dueToday = store.tasks
    .filter((t) => t.status === 'open' && t.dueAt && ymdOfIso(t.dueAt) <= today)
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))
  const overdueCount = dueToday.filter((t) => t.dueAt && ymdOfIso(t.dueAt) < today).length

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })

  return (
    <div>
      <p className="text-muted font-mono text-[11px] tracking-[0.16em] uppercase">{todayLabel}</p>
      <h1 className="font-display mt-1 text-xl font-semibold">Dashboard</h1>

      {/* Today */}
      <section className="border-line bg-panel mt-6 max-w-2xl rounded-lg border p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-muted font-mono text-[11px] tracking-[0.16em] uppercase">
            Today{overdueCount > 0 && <span className="text-danger"> · {overdueCount} overdue</span>}
          </p>
          <button
            onClick={() => onNavigate('tasks')}
            className="text-muted hover:text-amber font-mono text-[11px] transition-colors"
          >
            all tasks →
          </button>
        </div>
        {dueToday.length === 0 ? (
          <p className="text-muted mt-3 text-[13px]">
            {store.loaded ? 'Clear for today. Add tasks with a due date and they show up here.' : '…'}
          </p>
        ) : (
          <ul className="mt-3 space-y-1">
            {dueToday.slice(0, 8).map((t) => {
              const isOverdue = t.dueAt !== null && ymdOfIso(t.dueAt) < today
              return (
                <li key={t.id} className="flex items-center gap-3">
                  <button
                    role="checkbox"
                    aria-checked={false}
                    aria-label={`Complete: ${t.title}`}
                    onClick={() => void store.toggleTask(t)}
                    className="border-line hover:border-amber/70 bg-bench h-[16px] w-[16px] shrink-0 rounded-[5px] border transition-colors"
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{t.title}</span>
                  {t.dueAt && (
                    <span
                      className={`font-mono text-[10.5px] ${isOverdue ? 'text-danger' : 'text-muted'}`}
                    >
                      {dueLabel(t.dueAt, t.allDay)}
                    </span>
                  )}
                </li>
              )
            })}
            {dueToday.length > 8 && (
              <li className="text-muted font-mono text-[10.5px]">+ {dueToday.length - 8} more</li>
            )}
          </ul>
        )}
      </section>

      {/* Gym */}
      <section className="border-line bg-panel mt-4 max-w-2xl rounded-lg border p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-muted font-mono text-[11px] tracking-[0.16em] uppercase">Gym</p>
          <button
            onClick={() => onNavigate('gym')}
            className="text-muted hover:text-amber font-mono text-[11px] transition-colors"
          >
            details →
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-4">
          {g.today.length > 0 ? (
            <p className="text-[13.5px]">
              <span className="text-ok font-semibold">
                {[...new Set(g.today.map((s) => GYM_LABEL[s.type]))].join(' + ')} ✓
              </span>
              <span className="text-muted ml-2 font-mono text-[11px]">
                tomorrow: {GYM_LABEL[g.nextType].toLowerCase()}
              </span>
            </p>
          ) : (
            <button
              onClick={() => void gym.log({ date: todayYMD(), type: g.nextType })}
              className="bg-amber text-bench rounded-md px-3 py-1.5 text-[12.5px] font-semibold"
              title="One tap: log today's workout"
            >
              Log {GYM_LABEL[g.nextType]} day
            </button>
          )}
          <div className="flex items-center gap-1" aria-label={`${g.weekCount} of ${gymTarget} sessions this week`}>
            {g.weekDates.map((d) => (
              <span
                key={d}
                className={`h-2 w-2 rounded-full ${
                  g.byDate.has(d) ? 'bg-amber' : d === todayYMD() ? 'border-amber border' : 'bg-line'
                }`}
              />
            ))}
            <span className={`ml-2 font-mono text-[11px] ${g.weekMet ? 'text-ok' : 'text-muted'}`}>
              {g.weekCount}/{gymTarget}
            </span>
          </div>
        </div>
      </section>

      <div className="mt-4 grid max-w-2xl gap-4 sm:grid-cols-2">
        {/* System check */}
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
