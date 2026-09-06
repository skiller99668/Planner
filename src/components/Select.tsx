// Custom listbox. A native <select> renders its popup with OS chrome, which
// can't be styled and looks square/foreign next to the rest of the UI.
// Positioning and dismissal come from usePopoverAnchor.

import { useState } from 'react'
import { Chevron, FIELD_CLASS, POPUP_CLASS, usePopoverAnchor } from './Popover'

export interface SelectOption<T extends string> {
  value: T
  label: string
  /** Heading this option sits under. Consecutive options sharing one are drawn
   *  as a run with the heading above the first; options without one lead the
   *  list. Purely visual — grouping never reorders the options given. */
  group?: string
  /** Colour chip drawn before the label, for options that carry a hue of their
   *  own (an event kind, a course). */
  dot?: string
}

export default function Select<T extends string>({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
  title,
  className = '',
  mono = false,
  align = 'left'
}: {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  ariaLabel?: string
  title?: string
  className?: string
  /** Monospace the labels — for literal strings like model ids. */
  mono?: boolean
  align?: 'left' | 'right'
}) {
  const pop = usePopoverAnchor(align)
  const [active, setActive] = useState(0)
  const selected = options.find((o) => o.value === value)

  const openMenu = () => {
    if (disabled) return
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    pop.openPopup()
  }

  const commit = (v: T) => {
    onChange(v)
    pop.close()
    pop.triggerRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!pop.open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        openMenu()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(options.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(options.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation() // don't let a parent form submit on the same Enter
      const opt = options[active]
      if (opt) commit(opt.value)
    }
  }

  return (
    <>
      <button
        ref={pop.triggerRef}
        type="button"
        role="combobox"
        aria-expanded={pop.open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        onClick={() => (pop.open ? pop.close() : openMenu())}
        onKeyDown={onKeyDown}
        className={`${FIELD_CLASS} ${pop.open ? 'ring-azure/60 ring-1' : ''} ${className}`}
      >
        {/* One unit: FIELD_CLASS spaces its children with justify-between, so
            a dot left as a bare sibling drifts to the far side of the label. */}
        <span className="flex min-w-0 items-center gap-1.5">
          {selected?.dot && (
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: selected.dot }}
              aria-hidden
            />
          )}
          <span className={`truncate ${mono ? 'font-mono text-[12px]' : ''}`}>
            {selected?.label ?? ''}
          </span>
        </span>
        <Chevron open={pop.open} />
      </button>

      {pop.open && (
        <div
          ref={pop.popupRef}
          role="listbox"
          aria-label={ariaLabel}
          className={`${POPUP_CLASS} max-h-64 overflow-y-auto`}
          style={pop.popupStyle}
        >
          {options.map((o, i) => {
            const isSelected = o.value === value
            const heading = o.group && o.group !== options[i - 1]?.group ? o.group : null
            return (
              <div key={o.value}>
                {heading && (
                  <div className="section-label px-2.5 pt-2 pb-1 text-[10.5px]">{heading}</div>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => commit(o.value)}
                  className={`flex w-full items-center gap-2 rounded-[9px] px-2.5 py-1.5 text-left text-[13.5px] whitespace-nowrap transition-colors ${
                    i === active ? 'bg-surface text-ink' : 'text-muted'
                  } ${isSelected ? 'text-azure font-semibold' : ''}`}
                >
                  {o.dot && (
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: o.dot }}
                      aria-hidden
                    />
                  )}
                  <span className={`flex-1 ${mono ? 'font-mono text-[12px]' : ''}`}>{o.label}</span>
                  {isSelected && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M5 12.5l4.5 4.5L19 7"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
