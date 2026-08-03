// Time field. Replaces <input type="time"> (Chromium's picker is unstyleable).
// Value is a 24h "HH:mm" string; the UI shows local 12/24h formatting.
// Two scrolling columns — hour, then minute — plus common presets.

import { useEffect, useRef } from 'react'
import { Chevron, FIELD_CLASS, POPUP_CLASS, usePopoverAnchor } from './Popover'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
const PRESETS = ['08:00', '09:00', '12:00', '14:00', '17:00', '20:00']

export function formatTimeLabel(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return ''
  const d = new Date()
  d.setHours(Number(m[1]), Number(m[2]), 0, 0)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function hourLabel(h: number): string {
  const d = new Date()
  d.setHours(h, 0, 0, 0)
  return d.toLocaleTimeString(undefined, { hour: 'numeric' })
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
  const pop = usePopoverAnchor()
  const hourCol = useRef<HTMLDivElement>(null)
  const minCol = useRef<HTMLDivElement>(null)

  const [h, mm] = value ? value.split(':').map(Number) : [null, null]

  // Bring the current selection into view when the panel opens.
  useEffect(() => {
    if (!pop.open) return
    for (const col of [hourCol.current, minCol.current]) {
      const sel = col?.querySelector('[data-selected="true"]') as HTMLElement | null
      if (sel && col) col.scrollTop = sel.offsetTop - col.clientHeight / 2 + sel.clientHeight / 2
    }
  }, [pop.open])

  const set = (hour: number, minute: number) =>
    onChange(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)

  return (
    <>
      <button
        ref={pop.triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={pop.open}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        onClick={pop.toggle}
        onKeyDown={(e) => {
          if (!pop.open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
            e.preventDefault()
            pop.openPopup()
          }
        }}
        className={`${FIELD_CLASS} ${pop.open ? 'ring-clay/60 ring-1' : ''} ${className}`}
      >
        <span className={value ? 'nums' : 'text-faint'}>
          {value ? formatTimeLabel(value) : placeholder}
        </span>
        <Chevron open={pop.open} />
      </button>

      {pop.open && (
        <div
          ref={pop.popupRef}
          role="dialog"
          aria-label={ariaLabel ?? 'Choose a time'}
          className={`${POPUP_CLASS} w-[212px]`}
          style={pop.popupStyle}
        >
          <div className="flex gap-1.5">
            <div ref={hourCol} className="max-h-52 flex-1 overflow-y-auto pr-0.5">
              {HOURS.map((hour) => (
                <button
                  key={hour}
                  type="button"
                  data-selected={h === hour}
                  onClick={() => set(hour, mm ?? 0)}
                  className={`nums w-full rounded-[9px] py-1.5 text-center text-[12.5px] transition-colors ${
                    h === hour ? 'bg-clay text-bg font-bold' : 'text-muted hover:bg-surface'
                  }`}
                >
                  {hourLabel(hour)}
                </button>
              ))}
            </div>
            <div ref={minCol} className="max-h-52 flex-1 overflow-y-auto pr-0.5">
              {MINUTES.map((minute) => (
                <button
                  key={minute}
                  type="button"
                  data-selected={mm === minute}
                  onClick={() => set(h ?? 9, minute)}
                  className={`nums w-full rounded-[9px] py-1.5 text-center text-[12.5px] transition-colors ${
                    mm === minute ? 'bg-clay text-bg font-bold' : 'text-muted hover:bg-surface'
                  }`}
                >
                  :{String(minute).padStart(2, '0')}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-1.5 flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  onChange(p)
                  pop.close()
                }}
                className="tactile bg-surface text-muted hover:text-ink nums rounded-full px-2 py-1 text-[11.5px]"
              >
                {formatTimeLabel(p)}
              </button>
            ))}
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  pop.close()
                }}
                className="tactile text-muted hover:text-rose ml-auto rounded-full px-2 py-1 text-[11.5px]"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
