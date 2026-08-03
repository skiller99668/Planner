// Custom listbox. A native <select> renders its popup with OS chrome, which
// can't be styled and looks square/foreign next to the rest of the UI.
//
// The popup is positioned `fixed` from the trigger's measured rect so it can
// escape overflow containers (the career kanban scrolls horizontally), and it
// closes on outside click, Escape, scroll, or resize.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

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
  /** Monospace the trigger label — for literal strings like model ids. */
  mono?: boolean
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)

  const openMenu = () => {
    if (disabled) return
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    setRect(triggerRef.current?.getBoundingClientRect() ?? null)
    setOpen(true)
  }

  // Keep the popup glued to the trigger; simplest correct behaviour is to
  // close it if the page moves underneath.
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onDocPointer = (e: PointerEvent) => {
      const t = e.target as Node
      if (!popupRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointer)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', onDocPointer)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  // Flip above the trigger when there isn't room below.
  const [flip, setFlip] = useState(false)
  useLayoutEffect(() => {
    if (!open || !rect) return
    const h = popupRef.current?.offsetHeight ?? 0
    setFlip(rect.bottom + h + 8 > window.innerHeight && rect.top > h)
  }, [open, rect])

  const commit = (v: T) => {
    onChange(v)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        openMenu()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
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
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={`bg-bg tactile flex items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-left text-[13.5px] disabled:opacity-40 ${
          open ? 'ring-clay/60 ring-1' : ''
        } ${className}`}
      >
        <span className={`truncate ${mono ? 'font-mono text-[12px]' : ''}`}>
          {selected?.label ?? ''}
        </span>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && rect && (
        <div
          ref={popupRef}
          role="listbox"
          aria-label={ariaLabel}
          className="bg-raised animate-pop fixed z-50 max-h-64 overflow-y-auto rounded-[14px] p-1.5 shadow-[var(--shadow-lift)]"
          style={{
            top: flip ? undefined : rect.bottom + 6,
            bottom: flip ? window.innerHeight - rect.top + 6 : undefined,
            left: align === 'left' ? rect.left : undefined,
            right: align === 'right' ? window.innerWidth - rect.right : undefined,
            minWidth: rect.width
          }}
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
                } ${isSelected ? 'text-clay font-semibold' : ''}`}
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
