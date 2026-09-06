import { useEffect, useState, type ReactElement } from 'react'
import type { AppInfo } from '../../shared/ipc'
import { useAssistant } from './AssistantProvider'

export type ModuleId =
  | 'dashboard'
  | 'tasks'
  | 'academics'
  | 'gym'
  | 'events'
  | 'career'
  | 'leetcode'
  | 'goals'
  | 'settings'

const NAV: { id: ModuleId; label: string; icon: ReactElement }[] = [
  { id: 'dashboard', label: 'Today', icon: <IconHome /> },
  { id: 'tasks', label: 'Tasks', icon: <IconCheck /> },
  { id: 'academics', label: 'Academics', icon: <IconBook /> },
  { id: 'gym', label: 'Gym', icon: <IconBarbell /> },
  { id: 'events', label: 'Events', icon: <IconCalendar /> },
  { id: 'career', label: 'Career', icon: <IconBriefcase /> },
  // Appended rather than slotted next to Today, where it belongs
  // conceptually: NAV order matches Ctrl+1..7 one-for-one, and inserting in
  // the middle would renumber every page after it.
  { id: 'leetcode', label: 'LeetCode', icon: <IconCode /> },
  { id: 'goals', label: 'Goals', icon: <IconTarget /> }
]

export default function Sidebar({
  active,
  onNavigate
}: {
  active: ModuleId
  onNavigate: (id: ModuleId) => void
}) {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    window.planner?.ping().then(setInfo).catch(() => setInfo(null))
  }, [])

  return (
    <aside className="sidebar-wash flex w-[212px] shrink-0 flex-col px-3 py-4">
      <div className="flex items-center gap-2.5 px-3 pt-1 pb-6">
        <span className="logo-mark text-bg flex h-7 w-7 items-center justify-center rounded-[9px]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M5 12.5l4.5 4.5L19 7"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="text-[15px] font-bold tracking-tight">Planner</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5" aria-label="Sections">
        {NAV.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={active === item.id}
            onClick={() => onNavigate(item.id)}
          />
        ))}
        <div className="flex-1" />
        <AssistantButton />
        <NavButton
          item={{ id: 'settings', label: 'Settings', icon: <IconGear /> }}
          active={active === 'settings'}
          onClick={() => onNavigate('settings')}
        />
      </nav>

      {info && (
        <p className="text-faint px-3 pt-3 text-[10.5px]">
          v{info.version}
          {info.packaged ? '' : ' · dev'}
        </p>
      )}
    </aside>
  )
}

function NavButton({
  item,
  active,
  onClick
}: {
  item: { id: ModuleId; label: string; icon: ReactElement }
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`tactile relative flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[14px] ${
        active
          ? 'bg-raised text-ink font-semibold shadow-[var(--shadow-soft)]'
          : 'text-muted hover:bg-raised/50 hover:text-ink font-medium'
      }`}
    >
      {active && (
        <span
          aria-hidden
          className="bg-azure absolute top-1/2 -left-0.5 h-5 w-[3px] -translate-y-1/2 rounded-full shadow-[0_0_10px_var(--color-azure)]"
        />
      )}
      <span className={active ? 'text-azure' : ''}>{item.icon}</span>
      {item.label}
    </button>
  )
}

/** Toggles the app-wide assistant drawer; highlights while it's open. */
function AssistantButton() {
  const { open, toggle } = useAssistant()
  return (
    <button
      onClick={toggle}
      aria-pressed={open}
      aria-label="Toggle assistant"
      className={`tactile relative flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[14px] ${
        open
          ? 'bg-raised text-ink font-semibold shadow-[var(--shadow-soft)]'
          : 'text-muted hover:bg-raised/50 hover:text-ink font-medium'
      }`}
    >
      {open && (
        <span
          aria-hidden
          className="bg-azure absolute top-1/2 -left-0.5 h-5 w-[3px] -translate-y-1/2 rounded-full shadow-[0_0_10px_var(--color-azure)]"
        />
      )}
      <span className={open ? 'text-azure' : ''}>
        <IconSpark />
      </span>
      Assistant
    </button>
  )
}

/* ---- icons: 2px round strokes, softer than the old hairlines ---- */

function svg(paths: ReactElement) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths}
    </svg>
  )
}

function IconHome() {
  return svg(
    <>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
    </>
  )
}
function IconSpark() {
  return svg(
    <>
      <path d="M12 3.5c.6 3.6 1.9 5 5.5 5.5-3.6.6-4.9 1.9-5.5 5.5-.6-3.6-1.9-4.9-5.5-5.5 3.6-.5 4.9-1.9 5.5-5.5Z" />
      <path d="M17.5 15c.3 1.8 1 2.5 2.8 2.8-1.8.3-2.5 1-2.8 2.7-.3-1.7-1-2.4-2.7-2.7 1.7-.3 2.4-1 2.7-2.8Z" />
    </>
  )
}
function IconCheck() {
  return svg(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.4 2.4 4.6-5.2" />
    </>
  )
}
function IconBook() {
  return svg(
    <>
      <path d="M5 4.5h9a3 3 0 0 1 3 3V20a2.5 2.5 0 0 0-2.5-2.5H5Z" />
      <path d="M5 4.5V20" />
      <path d="M19 8v11.5" />
    </>
  )
}
function IconBarbell() {
  return svg(
    <>
      <path d="M8 12h8" />
      <rect x="4" y="8.5" width="4" height="7" rx="1.6" />
      <rect x="16" y="8.5" width="4" height="7" rx="1.6" />
    </>
  )
}
function IconCalendar() {
  return svg(
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="3.5" />
      <path d="M3.5 10h17M8.5 3.5v4M15.5 3.5v4" />
    </>
  )
}
function IconBriefcase() {
  return svg(
    <>
      <rect x="3.5" y="7.5" width="17" height="12.5" rx="3.5" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
    </>
  )
}
function IconCode() {
  return svg(
    <>
      <path d="m8.5 8-4 4 4 4" />
      <path d="m15.5 8 4 4-4 4" />
    </>
  )
}
function IconTarget() {
  return svg(
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.4" />
    </>
  )
}
function IconGear() {
  return svg(
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0V20a1.6 1.6 0 0 0-2.7-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4 13.4H3.8a2 2 0 1 1 0-4H4a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V2.6a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.2a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1Z" />
    </>
  )
}
