import GaugeDial from './GaugeDial.jsx'
import { thisWeekCount } from '../lib/store.js'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Morning'
  if (h < 18) return 'Afternoon'
  return 'Evening'
}

export default function Dashboard({ plannerData, onLogGym, onLogBadminton, onToggleTask }) {
  const { data } = plannerData
  const gymCount = thisWeekCount(data.gymSessions)
  const badmintonCount = thisWeekCount(data.badmintonSessions)
  const gpa = data.goalTargets.gpa.current

  const openTasks = data.tasks
    .filter((t) => !t.done)
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
    .slice(0, 6)

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs font-mono text-muted uppercase tracking-widest">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        <h1 className="font-display text-2xl font-semibold mt-1">Good {greeting()}.</h1>
      </div>

      {/* Goal gauges, connected by a circuit-trace line - the signature element */}
      <div className="relative bg-panel border border-line rounded-xl p-6">
        <div className="absolute left-6 right-6 top-1/2 h-px bg-line -z-0 hidden sm:block" />
        <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-6 z-10">
          <GaugeDial value={gpa} target={data.goalTargets.gpa.target} label="GPA floor" color="#F2A93B" />
          <GaugeDial value={gymCount} target={data.goalTargets.gymPerWeek.target} label="lifts/wk" color="#ED1B2F" unit="x" />
          <GaugeDial value={badmintonCount} target={data.goalTargets.badmintonPerWeek.target} label="badminton/wk" color="#4FB6C4" unit="x" />
          <GaugeDial value={data.applications.filter(a=>a.stage!=='wishlist').length} target={10} label="apps sent" color="#F2A93B" />
        </div>
      </div>

      {/* Quick log actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {['push', 'pull', 'legs'].map((t) => (
          <button
            key={t}
            onClick={() => onLogGym(t)}
            className="border border-line bg-panel rounded-lg py-3 text-sm font-medium capitalize hover:border-accent/50 hover:bg-accent/10 transition-colors"
          >
            + Log {t} day
          </button>
        ))}
        <button
          onClick={() => onLogBadminton('practice')}
          className="border border-line bg-panel rounded-lg py-3 text-sm font-medium hover:border-cyan/50 hover:bg-cyan/10 transition-colors"
        >
          + Log badminton
        </button>
      </div>

      {/* Today / upcoming tasks */}
      <div className="bg-panel border border-line rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold">Upcoming tasks</h2>
          <span className="text-xs font-mono text-muted">{openTasks.length} open</span>
        </div>
        {openTasks.length === 0 ? (
          <p className="text-sm text-muted">Nothing on the list yet. Add tasks from the All Tasks tab.</p>
        ) : (
          <ul className="divide-y divide-line">
            {openTasks.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2.5">
                <button
                  onClick={() => onToggleTask(t.id)}
                  className="w-4 h-4 rounded-full border border-muted shrink-0 hover:border-cyan"
                  aria-label="Mark complete"
                />
                <span className="text-sm flex-1">{t.title}</span>
                <span className="text-xs font-mono text-muted capitalize">{t.category}</span>
                {t.dueDate && <span className="text-xs font-mono text-amber">{t.dueDate}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
