const NAV = [
  { id: 'dashboard', label: 'Dashboard', glyph: '⌂' },
  { id: 'academics', label: 'Academics', glyph: '∫' },
  { id: 'fitness', label: 'Fitness', glyph: '⚡' },
  { id: 'badminton', label: 'Badminton', glyph: '◐' },
  { id: 'career', label: 'Career', glyph: '⟡' },
  { id: 'tasks', label: 'All Tasks', glyph: '☰' }
]

export default function Sidebar({ active, onNavigate }) {
  return (
    <nav className="hidden md:flex flex-col w-56 shrink-0 border-r border-line bg-panel/40 py-6 px-3 gap-1">
      <div className="px-3 mb-6">
        <div className="font-display font-semibold text-lg tracking-tight">EE Planner</div>
        <div className="text-xs font-mono text-muted mt-0.5">McGill · Year 2</div>
      </div>
      {NAV.map((item) => {
        const isActive = active === item.id
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors text-left ${
              isActive ? 'bg-accent/15 text-ink border border-accent/40' : 'text-muted hover:text-ink hover:bg-panel'
            }`}
          >
            <span className="font-mono w-4 text-center">{item.glyph}</span>
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}
