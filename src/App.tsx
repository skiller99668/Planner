import { useState } from 'react'
import Sidebar, { type ModuleId } from './components/Sidebar'
import DashboardPage from './pages/DashboardPage'
import PlaceholderPage from './pages/PlaceholderPage'
import SettingsPage from './pages/SettingsPage'
import TasksPage from './pages/TasksPage'

const MODULE_IDS: ModuleId[] = [
  'dashboard', 'tasks', 'academics', 'gym', 'events', 'career', 'settings'
]

/** Initial view can be deep-linked via URL hash (set by PLANNER_OPEN / notifications). */
function initialView(): ModuleId {
  const hash = window.location.hash.replace('#', '')
  return (MODULE_IDS as string[]).includes(hash) ? (hash as ModuleId) : 'dashboard'
}

const PLACEHOLDERS: Record<
  Exclude<ModuleId, 'dashboard' | 'settings' | 'tasks'>,
  { title: string; phase: string; blurb: string; items: string[] }
> = {
  academics: {
    title: 'Academics',
    phase: 'Phase 4',
    blurb: 'Courses and lectures, your post-lecture summaries, and a Groq-powered chat that already knows what the course covered.',
    items: ['Courses + lectures', 'Lecture summaries', 'AI chat per lecture', 'AI-suggested tasks']
  },
  gym: {
    title: 'Gym',
    phase: 'Phase 3',
    blurb: 'The PPL cycle tracker: it knows what today is, you tap once to log it. Weekly grid against your 5–6 target and your current streak.',
    items: ['Next-in-cycle', 'One-tap logging', 'Weekly grid + streak', 'Optional set/rep log']
  },
  events: {
    title: 'Events',
    phase: 'Phase 5',
    blurb: 'Badminton tournaments with registration-window alarms computed from Badminton Québec rules, McGill career fairs, and ICS import.',
    items: ['ICS import', 'Registration alarms', 'Career fair tracker', 'Deadline watchlist']
  },
  career: {
    title: 'Career',
    phase: 'Phase 5',
    blurb: 'The Summer 2027 pipeline: application kanban, weekly prep targets treated like gym targets, and SURE/USRA deadlines you cannot miss.',
    items: ['Application kanban', 'Weekly targets', 'Resource shelf', 'Research deadline watchlist']
  }
}

export default function App() {
  const [active, setActive] = useState<ModuleId>(initialView)

  return (
    <div className="flex h-full">
      <Sidebar active={active} onNavigate={setActive} />
      <main className="bg-bench-grid min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-8 py-8">
          {active === 'dashboard' ? (
            <DashboardPage onNavigate={setActive} />
          ) : active === 'tasks' ? (
            <TasksPage />
          ) : active === 'settings' ? (
            <SettingsPage />
          ) : (
            <PlaceholderPage {...PLACEHOLDERS[active]} />
          )}
        </div>
      </main>
    </div>
  )
}
