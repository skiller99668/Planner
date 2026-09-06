// The "···" overflow menu on a term folder or a course row.
//
// These rows already spend their click on opening something, and they carry
// four or five secondary actions apiece (rename, recolour, move, archive,
// delete). Spelling those out as icons would out-shout the course they belong
// to, so they live behind one dot-triplet that only appears on hover.

import { POPUP_CLASS, usePopoverAnchor } from './Popover'

export interface RowAction {
  label: string
  onSelect: () => void
  /** Destructive: coral, and pushed below a divider. */
  danger?: boolean
  /** Opens something of its own (a palette, a submenu of terms), so the menu
   *  stays put instead of closing under the click. */
  keepOpen?: boolean
}

export default function RowMenu({
  actions,
  ariaLabel,
  className = ''
}: {
  actions: RowAction[]
  ariaLabel: string
  className?: string
}) {
  const pop = usePopoverAnchor('right')
  const safe = actions.filter((a) => !a.danger)
  const danger = actions.filter((a) => a.danger)

  const row = (a: RowAction) => (
    <button
      key={a.label}
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        a.onSelect()
        if (!a.keepOpen) pop.close()
      }}
      className={`w-full rounded-[9px] px-2.5 py-1.5 text-left text-[13px] whitespace-nowrap transition-colors ${
        a.danger ? 'text-coral/80 hover:bg-coral/12 hover:text-coral' : 'text-muted hover:bg-surface hover:text-ink'
      }`}
    >
      {a.label}
    </button>
  )

  return (
    <>
      <button
        ref={pop.triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={pop.open}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation()
          pop.toggle()
        }}
        className={`text-faint hover:text-ink shrink-0 rounded-[8px] px-1.5 leading-none transition-colors ${
          pop.open ? 'text-ink' : ''
        } ${className}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="19" cy="12" r="1.9" />
        </svg>
      </button>

      {pop.open && (
        <div
          ref={pop.popupRef}
          role="menu"
          aria-label={ariaLabel}
          style={pop.popupStyle}
          className={`${POPUP_CLASS} min-w-40`}
          onClick={(e) => e.stopPropagation()}
        >
          {safe.map(row)}
          {danger.length > 0 && safe.length > 0 && (
            <div className="border-line/60 my-1 border-t" aria-hidden />
          )}
          {danger.map(row)}
        </div>
      )}
    </>
  )
}
