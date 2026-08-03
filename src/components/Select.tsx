// Custom listbox. A native <select> renders its popup with OS chrome, which
// can't be styled and looks square/foreign next to the rest of the UI.
// Positioning and dismissal come from usePopoverAnchor.

import { useState } from 'react'
import { Chevron, FIELD_CLASS, POPUP_CLASS, usePopoverAnchor } from './Popover'

export interface SelectOption<T extends string> {
  value: T
  label: string
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
        <span className={`truncate ${mono ? 'font-mono text-[12px]' : ''}`}>
          {selected?.label ?? ''}
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
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(o.value)}
                className={`flex w-full items-center gap-2 rounded-[9px] px-2.5 py-1.5 text-left text-[13.5px] whitespace-nowrap transition-colors ${
                  i === active ? 'bg-surface text-ink' : 'text-muted'
                } ${isSelected ? 'text-azure font-semibold' : ''}`}
              >
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
            )
          })}
        </div>
      )}
    </>
  )
}
