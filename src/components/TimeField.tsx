// Time combobox: type it or pick it. Replaces <input type="time">, whose
// popup is drawn by Chromium and can't be styled.
//
// Value is a 24h "HH:mm" string. The list runs 00:00 → 23:30 in half hours;
// typing accepts far more than that ("5pm", "1730", "5:45", "17.45").

import { useEffect, useRef, useState } from 'react'
import { POPUP_CLASS, usePopoverAnchor } from './Popover'

/** 00:00 → 23:30 on the half hour. */
const OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2)
  const m = i % 2 === 0 ? 0 : 30
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})

export function formatTimeLabel(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return ''
  const d = new Date()
  d.setHours(Number(m[1]), Number(m[2]), 0, 0)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** Parse loose input into "HH:mm", or null. Accepts 5pm, 5:30 pm, 1730, 17.30, 17. */
export function parseTimeInput(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '')
  if (!s) return null

  const ampm = /(am|a)$/.test(s) ? 'am' : /(pm|p)$/.test(s) ? 'pm' : null
  const body = s.replace(/(am|pm|a|p)$/, '')

  let h: number
  let m = 0
  let match: RegExpExecArray | null
  if ((match = /^(\d{1,2})[:.h](\d{1,2})$/.exec(body))) {
    h = Number(match[1])
    m = Number(match[2])
  } else if ((match = /^(\d{3,4})$/.exec(body))) {
    // 930 -> 9:30, 1730 -> 17:30
    h = Number(body.slice(0, body.length - 2))
    m = Number(body.slice(-2))
  } else if ((match = /^(\d{1,2})$/.exec(body))) {
    h = Number(match[1])
  } else {
    return null
  }

  if (ampm === 'pm' && h < 12) h += 12
  if (ampm === 'am' && h === 12) h = 0
  if (!Number.isInteger(h) || !Number.isInteger(m) || h > 23 || m > 59) return null
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export default function TimeField({
  value,
  onChange,
  placeholder = 'Set time',
  ariaLabel,
  disabled,
  title,
  className = ''
}: {
  value: string
  onChange: (hhmm: string) => void
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  title?: string
  className?: string
}) {
  const pop = usePopoverAnchor<HTMLDivElement>()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<string | null>(null) // null = not editing
  const [active, setActive] = useState(0)

  const typing = draft !== null
  const query = (draft ?? '').trim().toLowerCase().replace(/[^0-9a-z:.]/g, '')
  const parsed = typing ? parseTimeInput(draft!) : null

  // While typing, narrow the list — but never to nothing.
  const filtered = (() => {
    if (!typing || !query) return OPTIONS
    const hit = OPTIONS.filter(
      (o) =>
        o.replace(':', '').startsWith(query.replace(':', '')) ||
        formatTimeLabel(o).toLowerCase().replace(/[^0-9a-z]/g, '').startsWith(query.replace(/[:.]/g, ''))
    )
    return hit.length ? hit : OPTIONS
  })()

  // Keep the highlight on the current value (or the parse) and in view.
  useEffect(() => {
    if (!pop.open) return
    const target = parsed ?? value
    const i = filtered.indexOf(target)
    setActive(i >= 0 ? i : 0)
  }, [pop.open, parsed, value, filtered])

  useEffect(() => {
    if (!pop.open) return
    const el = listRef.current?.children[active] as HTMLElement | undefined
    const list = listRef.current
    if (!el || !list) return
    const top = el.offsetTop
    const bottom = top + el.clientHeight
    if (top < list.scrollTop) list.scrollTop = top - 4
    else if (bottom > list.scrollTop + list.clientHeight)
      list.scrollTop = bottom - list.clientHeight + 4
  }, [active, pop.open])

  const commit = (hhmm: string) => {
    onChange(hhmm)
    setDraft(null)
    pop.close()
  }

  const openFor = () => {
    setDraft(value ? formatTimeLabel(value) : '')
    pop.openPopup()
    requestAnimationFrame(() => inputRef.current?.select())
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!pop.open) return openFor()
      setActive((i) =>
        e.key === 'ArrowDown' ? Math.min(filtered.length - 1, i + 1) : Math.max(0, i - 1)
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation() // don't submit the surrounding form
      // What you typed wins; otherwise take the highlighted row.
      const next = parseTimeInput(draft ?? '') ?? filtered[active]
      if (next) commit(next)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setDraft(null)
      pop.close()
    } else if (e.key === 'Tab') {
      const next = parseTimeInput(draft ?? '')
      if (next) commit(next)
      else setDraft(null)
    }
  }

  return (
    <>
      <div
        ref={pop.triggerRef}
        className={`bg-bg flex items-center rounded-[10px] pr-1 ${
          pop.open ? 'ring-azure/60 ring-1' : ''
        } ${disabled ? 'opacity-40' : ''} ${className}`}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          role="combobox"
          aria-expanded={pop.open}
          aria-label={ariaLabel}
          title={title}
          disabled={disabled}
          placeholder={placeholder}
          value={typing ? draft! : value ? formatTimeLabel(value) : ''}
          onFocus={openFor}
          onClick={() => !pop.open && openFor()}
          onChange={(e) => {
            setDraft(e.target.value)
            if (!pop.open) pop.openPopup()
          }}
          onBlur={() => {
            // Commit a valid typed time; otherwise silently restore.
            const next = parseTimeInput(draft ?? '')
            if (next && next !== value) onChange(next)
            setDraft(null)
          }}
          onKeyDown={onKeyDown}
          className="placeholder:text-faint nums min-w-0 flex-1 bg-transparent px-3 py-2 text-[13.5px] outline-none"
        />
        {value && !disabled && (
          <button
            type="button"
            aria-label="Clear time"
            onMouseDown={(e) => e.preventDefault()} // keep focus so blur doesn't fight this
            onClick={() => {
              onChange('')
              setDraft(null)
              pop.close()
            }}
            className="text-faint hover:text-coral shrink-0 rounded-md px-1.5 py-1 text-[13px]"
          >
            ×
          </button>
        )}
      </div>

      {pop.open && (
        <div
          ref={pop.popupRef}
          className={`${POPUP_CLASS} p-1.5`}
          style={pop.popupStyle}
          role="listbox"
          aria-label={ariaLabel ?? 'Times'}
        >
          {typing && draft && (
            <p className="text-faint px-2 pt-0.5 pb-1.5 text-[11px]">
              {parsed ? `Enter sets ${formatTimeLabel(parsed)}` : 'Try 5pm, 17:30 or 1730'}
            </p>
          )}
          <div ref={listRef} className="max-h-56 overflow-y-auto">
            {filtered.map((o, i) => (
              <button
                key={o}
                type="button"
                role="option"
                aria-selected={o === value}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()} // don't blur before the click lands
                onClick={() => commit(o)}
                className={`nums flex w-full items-center justify-between rounded-[9px] px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                  i === active ? 'bg-surface text-ink' : 'text-muted'
                } ${o === value ? 'text-azure font-bold' : ''}`}
              >
                <span>{formatTimeLabel(o)}</span>
                <span className="text-faint text-[11.5px]">{o}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
