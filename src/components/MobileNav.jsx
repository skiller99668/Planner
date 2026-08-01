const NAV = [
  { id: 'dashboard', label: 'Home', glyph: '⌂' },
  { id: 'academics', label: 'Class', glyph: '∫' },
  { id: 'fitness', label: 'Lift', glyph: '⚡' },
  { id: 'badminton', label: 'Bdmt', glyph: '◐' },
  { id: 'career', label: 'Career', glyph: '⟡' }
]

export default function MobileNav({ active, onNavigate }) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-line bg-panel/95 backdrop-blur flex justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] z-20">
      {NAV.map((item) => {
        const isActive = active === item.id
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[11px] font-medium ${
              isActive ? 'text-accent' : 'text-muted'
            }`}
          >
            <span className="font-mono text-base">{item.glyph}</span>
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}
