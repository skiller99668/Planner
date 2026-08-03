import { useEffect, useState } from 'react'
import type { GymType, PlannerEvent } from '../../shared/types'
import { Burst, CheckCircle, useCelebrate } from '../components/Celebrate'
import type { ModuleId } from '../components/Sidebar'
import { dueLabel, todayYMD, ymdOfIso } from '../lib/dates'
import { deriveGym, useGym, useGymTarget } from '../lib/useGym'
import { useTasks } from '../lib/useTasks'

const GYM_LABEL: Record<GymType, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  other: 'Other'
}

export default function DashboardPage({ onNavigate }: { onNavigate: (m: ModuleId) => void }) {
  const store = useTasks()
  const gym = useGym()
  const gymTarget = useGymTarget()
  const g = deriveGym(gym.sessions, gymTarget)
  const [events, setEvents] = useState<PlannerEvent[]>([])
  const [gymKey, fireGym] = useCelebrate()
  // Hold a ticked-off task in the list briefly so its animation can finish.
  const [lingering, setLingering] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    window.planner?.eventsList().then(setEvents).catch(() => {})
  }, [])

  const today = todayYMD()
  const dueToday = store.tasks
    .filter(
      (t) =>
        (t.status === 'open' || lingering.has(t.id)) && t.dueAt && ymdOfIso(t.dueAt) <= today
    )
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))
  const overdue = dueToday.filter((t) => t.dueAt && ymdOfIso(t.dueAt) < today).length
  const doneToday = store.tasks.filter(
    (t) => t.status === 'done' && t.doneAt && ymdOfIso(t.doneAt) === today
  ).length

  const upcoming = events
    .filter((e) => new Date(e.startAt).getTime() >= Date.now() - 12 * 3600_000)
    .slice(0, 3)

  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Afternoon' : 'Evening'

  return (
    <div className="animate-rise">
      <p className="text-muted text-[13.5px]">
        {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      </p>
      <h1 className="mt-1 text-[30px] leading-tight font-bold">{greeting}, Skyler</h1>

      {/* Today's tasks */}
      <section className="bg-surface mt-7 rounded-[20px] p-6 shadow-[var(--shadow-soft)]">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-bold">
            Today
            {overdue > 0 && <span className="text-coral ml-2 text-[13px]">{overdue} overdue</span>}
          </h2>
          <button
            onClick={() => onNavigate('tasks')}
            className="text-muted hover:text-azure text-[12.5px] font-medium transition-colors"
          >
            All tasks
          </button>
        </div>

        {dueToday.length === 0 ? (
          <p className="text-muted mt-3 text-[13.5px]">
            {!store.loaded
              ? ' '
              : doneToday > 0
                ? `All done — ${doneToday} finished today.`
                : 'Nothing due today.'}
          </p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {dueToday.slice(0, 6).map((t) => {
              const isOverdue = t.dueAt !== null && ymdOfIso(t.dueAt) < today
              return (
                <li key={t.id} className="flex items-center gap-3">
                  <CheckCircle
                    size={18}
                    checked={t.status === 'done'}
                    label={`Complete: ${t.title}`}
                    onChange={() => {
                      if (t.status === 'open') {
                        setLingering((prev) => new Set(prev).add(t.id))
                        setTimeout(
                          () =>
                            setLingering((prev) => {
                              const next = new Set(prev)
                              next.delete(t.id)
                              return next
                            }),
                          1000
                        )
                      }
                      void store.toggleTask(t)
                    }}
                  />
                  <span
                    className={`min-w-0 flex-1 truncate text-[13.5px] ${
                      t.status === 'done' ? 'text-muted line-through' : ''
                    }`}
                  >
                    {t.title}
                  </span>
                  {t.dueAt && (
                    <span className={`nums text-[12px] ${isOverdue ? 'text-coral' : 'text-muted'}`}>
                      {dueLabel(t.dueAt, t.allDay)}
                    </span>
                  )}
                </li>
              )
            })}
            {dueToday.length > 6 && (
              <li className="text-faint text-[12.5px]">+{dueToday.length - 6} more</li>
            )}
          </ul>
        )}
      </section>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {/* Gym */}
        <section className="bg-surface relative rounded-[20px] p-6 shadow-[var(--shadow-soft)]">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-bold">Gym</h2>
            <span className="nums text-muted text-[12.5px]">
              <span className={g.weekMet ? 'text-mint font-bold' : 'text-ink font-bold'}>
                {g.weekCount}
              </span>
              /{gymTarget}
            </span>
          </div>

          {g.today.length > 0 ? (
            <p className="text-mint mt-3 text-[17px] font-bold">
              {[...new Set(g.today.map((s) => GYM_LABEL[s.type]))].join(' + ')} done
            </p>
          ) : (
            <span className="relative mt-3 inline-block">
              <button
                onClick={() => {
                  fireGym()
                  void gym.log({ date: todayYMD(), type: g.nextType })
                }}
                className="tactile btn-primary rounded-[13px] px-4 py-2.5 text-[13.5px] font-bold"
              >
                Log {GYM_LABEL[g.nextType]}
              </button>
              <Burst fireKey={gymKey} count={9} spread={40} />
            </span>
          )}

          <div className="mt-4 flex gap-1.5" aria-hidden>
            {g.weekDates.map((d) => (
              <span
                key={d}
                className={`h-1.5 flex-1 rounded-full ${
                  g.byDate.has(d) ? 'bg-mint' : d === today ? 'bg-azure/40' : 'bg-raised'
                }`}
              />
            ))}
          </div>
        </section>

        {/* Coming up */}
        <section className="bg-surface rounded-[20px] p-6 shadow-[var(--shadow-soft)]">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-bold">Coming up</h2>
            <button
              onClick={() => onNavigate('events')}
              className="text-muted hover:text-azure text-[12.5px] font-medium transition-colors"
            >
              Events
            </button>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-muted mt-3 text-[13.5px]">Nothing scheduled.</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {upcoming.map((e) => {
                const d = new Date(e.startAt)
                const regOpen =
                  e.regOpensAt &&
                  e.regClosesAt &&
                  !e.registered &&
                  Date.now() >= new Date(e.regOpensAt).getTime() &&
                  Date.now() < new Date(e.regClosesAt).getTime()
                return (
                  <li key={e.id} className="flex items-baseline gap-3 text-[13px]">
                    <span className="nums text-coral w-11 shrink-0 font-semibold">
                      {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{e.title}</span>
                    {regOpen && (
                      <span className="bg-gold/20 text-gold shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold">
                        register
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
