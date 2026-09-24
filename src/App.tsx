import { useEffect, useRef, useState } from 'react'
import { ConfirmProvider } from './components/ConfirmProvider'
import { AssistantProvider } from './components/AssistantProvider'
import AssistantPanel from './components/AssistantPanel'
import ShortcutHelp from './components/ShortcutHelp'
import {
  KEYBIND_ACTIONS,
  bindingFor,
  isEditableTarget,
  isGlobalBinding,
  matchesBinding,
  type KeybindAction
} from './lib/keybinds'
import CommandPalette from './components/CommandPalette'
import Sidebar, { type ModuleId } from './components/Sidebar'
import AcademicsPage from './pages/AcademicsPage'
import CareerPage from './pages/CareerPage'
import DashboardPage from './pages/DashboardPage'
import EventsPage from './pages/EventsPage'
import GoalsPage from './pages/GoalsPage'
import JournalPage from './pages/JournalPage'
import GymPage from './pages/GymPage'
import LeetcodePage from './pages/LeetcodePage'
import SettingsPage from './pages/SettingsPage'
import TasksPage from './pages/TasksPage'

const MODULE_IDS: ModuleId[] = [
  'dashboard', 'tasks', 'academics', 'gym', 'events', 'career', 'leetcode', 'goals', 'journal',
  'settings'
]

/** Initial view can be deep-linked via URL hash (set by PLANNER_OPEN / notifications). */
function initialView(): ModuleId {
  const hash = window.location.hash.replace('#', '')
  return (MODULE_IDS as string[]).includes(hash) ? (hash as ModuleId) : 'dashboard'
}

export default function App() {
  const [active, setActive] = useState<ModuleId>(initialView)
  // Bumped to ask the Tasks page to focus its quick-add box / tag filter
  // (these survive the navigation the shortcut triggers).
  const [focusTaskNonce, setFocusTaskNonce] = useState(0)
  const [focusFilterNonce, setFocusFilterNonce] = useState(0)
  const [helpOpen, setHelpOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  // The palette's own binding, shown in its footer. Read from the same ref the
  // keydown handler uses, so a rebind is reflected without a reload.
  const [paletteBinding, setPaletteBinding] = useState('ctrl+k')
  // Live keybind overrides, read inside the keydown handler without re-subscribing.
  const keybindsRef = useRef<Record<string, string>>({})

  useEffect(() => {
    const loadKeybinds = () => {
      window.planner
        ?.getSettings()
        .then((s) => {
          keybindsRef.current = s.keybinds ?? {}
          setPaletteBinding(bindingFor('commandPalette', keybindsRef.current))
        })
        .catch(() => {})
    }
    loadKeybinds()

    // Each action's effect. TypeScript forces an entry for every KeybindAction,
    // so adding a shortcut to the registry can't silently do nothing.
    const handlers: Record<KeybindAction, () => void> = {
      commandPalette: () => setPaletteOpen((o) => !o),
      newTask: () => {
        setActive('tasks')
        setFocusTaskNonce((n) => n + 1)
      },
      focusTagFilter: () => {
        setActive('tasks')
        setFocusFilterNonce((n) => n + 1)
      },
      toggleAssistant: () => window.dispatchEvent(new Event('planner:toggle-assistant')),
      toggleShortcutHelp: () => setHelpOpen((o) => !o),
      goDashboard: () => setActive('dashboard'),
      goTasks: () => setActive('tasks'),
      goAcademics: () => setActive('academics'),
      goGym: () => setActive('gym'),
      goEvents: () => setActive('events'),
      goCareer: () => setActive('career'),
      goLeetcode: () => setActive('leetcode'),
      goGoals: () => setActive('goals'),
      goJournal: () => setActive('journal'),
      goSettings: () => setActive('settings')
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return
      for (const action of KEYBIND_ACTIONS) {
        const binding = bindingFor(action.id, keybindsRef.current)
        if (!binding || !matchesBinding(e, binding)) continue
        // Bare (non-modifier) shortcuts must not hijack typing inside a field.
        if (!isGlobalBinding(binding) && isEditableTarget(e.target)) continue
        e.preventDefault()
        handlers[action.id]()
        return
      }
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('planner:settings-changed', loadKeybinds)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('planner:settings-changed', loadKeybinds)
    }
  }, [])

  return (
    <ConfirmProvider>
    <AssistantProvider>
    <div className="flex h-full">
      <Sidebar active={active} onNavigate={setActive} />
      <main className="app-canvas min-w-0 flex-1 overflow-y-auto">
        {/* The calendar is a wide surface; every other page reads better narrow. */}
        <div
          className={`mx-auto py-10 ${
            active === 'events' ? 'max-w-6xl px-6' : 'max-w-3xl px-10'
          }`}
        >
          {active === 'dashboard' ? (
            <DashboardPage onNavigate={setActive} />
          ) : active === 'tasks' ? (
            <TasksPage focusNonce={focusTaskNonce} filterNonce={focusFilterNonce} />
          ) : active === 'academics' ? (
            <AcademicsPage />
          ) : active === 'gym' ? (
            <GymPage />
          ) : active === 'events' ? (
            <EventsPage />
          ) : active === 'career' ? (
            <CareerPage onNavigate={setActive} />
          ) : active === 'leetcode' ? (
            <LeetcodePage />
          ) : active === 'goals' ? (
            <GoalsPage />
          ) : active === 'journal' ? (
            <JournalPage />
          ) : (
            <SettingsPage />
          )}
        </div>
      </main>
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <CommandPalette
        open={paletteOpen}
        binding={paletteBinding}
        onClose={() => setPaletteOpen(false)}
        onNavigate={setActive}
        onNewTask={() => {
          setActive('tasks')
          setFocusTaskNonce((n) => n + 1)
        }}
      />
      <AssistantPanel />
    </div>
    </AssistantProvider>
    </ConfirmProvider>
  )
}
