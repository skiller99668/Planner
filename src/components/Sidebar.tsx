import { useEffect, useState, type ReactElement } from 'react'
import type { AppInfo } from '../../shared/ipc'

export type ModuleId =
  | 'dashboard'
  | 'tasks'
  | 'academics'
  | 'gym'
  | 'events'
  | 'career'
  | 'settings'

const NAV: { id: ModuleId; label: string; icon: ReactElement }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <IconGrid /> },
  { id: 'tasks', label: 'Tasks', icon: <IconCheck /> },
  { id: 'academics', label: 'Academics', icon: <IconBook /> },
  { id: 'gym', label: 'Gym', icon: <IconBarbell /> },
  { id: 'events', label: 'Events', icon: <IconCalendar /> },
  { id: 'career', label: 'Career', icon: <IconBriefcase /> }
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
    <aside className="border-line bg-bench flex w-56 shrink-0 flex-col border-r">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-6">
        <span className="led text-amber" aria-hidden />
        <span className="font-mono text-[13px] font-semibold tracking-[0.18em] uppercase">
          Planner
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label="Modules">
        {NAV.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={active === item.id}
            onClick={() => onNavigate(item.id)}
          />
        ))}
        <div className="flex-1" />
        <NavButton
          item={{ id: 'settings', label: 'Settings', icon: <IconGear /> }}
          active={active === 'settings'}
          onClick={() => onNavigate('settings')}
        />
      </nav>

      {/* Instrument status readout: proves main-process IPC + DB are alive. */}
      <div className="border-line text-muted mt-3 border-t px-5 py-3 font-mono text-[10.5px] leading-relaxed">
        {info ? (
          <>
            <div className="flex items-center gap-1.5">
              <span className="led text-ok" aria-hidden />
              <span>
                db ok · schema v{info.schemaVersion}
              </span>
            </div>
            <div>
              v{info.version} · electron {info.electron.split('.')[0]}
              {info.packaged ? '' : ' · dev'}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="led text-danger" aria-hidden />
            <span>bridge offline</span>
          </div>
        )}
      </div>
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
      className={`relative flex items-center gap-3 rounded-md px-3 py-2 text-left text-[13.5px] transition-colors ${
        active
          ? 'bg-panel2 text-ink font-medium'
          : 'text-muted hover:bg-panel hover:text-ink'
      }`}
    >
      {/* channel indicator */}
      <span
        aria-hidden
        className={`absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-full transition-colors ${
          active ? 'bg-amber' : 'bg-transparent'
        }`}
      />
      <span className="opacity-80">{item.icon}</span>
      {item.label}
    </button>
  )
}

/* ---- 18px stroke icons ---- */

function svg(paths: ReactElement) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths}
    </svg>
  )
}

function IconGrid() {
  return svg(
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  )
}
function IconCheck() {
  return svg(
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5.5" />
    </>
  )
}
function IconBook() {
  return svg(
    <>
      <path d="M4 19V5a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v14" />
      <path d="M4 19a2 2 0 0 0 2 2h14v-4H6a2 2 0 0 0-2 2Z" />
    </>
  )
}
function IconBarbell() {
  return svg(
    <>
      <path d="M2 12h2M20 12h2M6 12h12" />
      <rect x="4" y="8" width="2.5" height="8" rx="0.8" />
      <rect x="17.5" y="8" width="2.5" height="8" rx="0.8" />
    </>
  )
}
function IconCalendar() {
  return svg(
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  )
}
function IconBriefcase() {
  return svg(
    <>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 13h18" />
    </>
  )
}
function IconGear() {
  return svg(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
    </>
  )
}
