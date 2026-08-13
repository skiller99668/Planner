// The keyboard-shortcut cheat sheet (toggled by the "Show shortcuts" keybind).
// Reads live bindings from settings so any customizations show through, and
// mirrors the confirm-dialog modal styling for a consistent overlay language.

import { useEffect, useState } from 'react'
import { KEYBIND_ACTIONS, KEYBIND_GROUPS, bindingFor, formatBinding } from '../lib/keybinds'

export default function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [binds, setBinds] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    window.planner
      ?.getSettings()
      .then((s) => setBinds(s.keybinds ?? {}))
      .catch(() => {})
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="bg-surface animate-pop w-full max-w-md rounded-[18px] p-5 shadow-[var(--shadow-lift)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold">Keyboard shortcuts</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-ink tactile border-line rounded-[8px] border px-2 py-0.5 text-[11.5px] font-semibold"
          >
            Esc
          </button>
        </div>

        {KEYBIND_GROUPS.map((group) => {
          const items = KEYBIND_ACTIONS.filter((a) => a.group === group)
          if (items.length === 0) return null
          return (
            <div key={group} className="mt-4">
              <p className="text-faint text-[11px] font-semibold tracking-wide uppercase">{group}</p>
              <div className="mt-1.5 space-y-1">
                {items.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-4">
                    <span className="text-[13px]">{a.label}</span>
                    <kbd className="bg-bg border-line nums rounded-[7px] border px-2 py-1 text-[11.5px] font-semibold">
                      {formatBinding(bindingFor(a.id, binds))}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {/* Fixed, not rebindable: these are bare keys that only apply while a
            list has focus, so they live outside the registry above. */}
        <div className="mt-4">
          <p className="text-faint text-[11px] font-semibold tracking-wide uppercase">
            In a list
          </p>
          <div className="mt-1.5 space-y-1">
            {[
              ['Move down / up', 'J / K'],
              ['Complete', 'X'],
              ['Edit', 'E'],
              ['Reorder within section', 'Alt + ↑ / ↓'],
              ['Clear selection', 'Esc']
            ].map(([label, key]) => (
              <div key={label} className="flex items-center justify-between gap-4">
                <span className="text-[13px]">{label}</span>
                <kbd className="bg-bg border-line nums rounded-[7px] border px-2 py-1 text-[11.5px] font-semibold">
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        </div>

        <p className="text-muted mt-4 text-[12px] leading-relaxed">
          Customize the shortcuts above in Settings → Keyboard shortcuts.
        </p>
      </div>
    </div>
  )
}
