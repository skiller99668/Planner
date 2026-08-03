// Time field. Replaces <input type="time"> (Chromium's picker is unstyleable).
// Value is a 24h "HH:mm" string; the UI shows local 12/24h formatting.
//
// Every hour is visible at once in a grid — scrolling lists inside a popup are
// fiddly and made the picker feel broken. Pick an hour, then a minute; the
// minute completes the choice and closes.

import { Chevron, FIELD_CLASS, POPUP_CLASS, usePopoverAnchor } from './Popover'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

export function formatTimeLabel(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return ''
  const d = new Date()
  d.setHours(Number(m[1]), Number(m[2]), 0, 0)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** Compact hour label: "12a", "9a", "5p" — keeps the grid narrow. */
function hourLabel(h: number): string {
  const suffix = h < 12 ? 'a' : 'p'
  const twelve = h % 12 === 0 ? 12 : h % 12
  return `${twelve}${suffix}`
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
  const [h, mm] = value ? value.split(':').map(Number) : [null, null]

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
          className={`${POPUP_CLASS} w-[252px]`}
          style={pop.popupStyle}
        >
          <p className="text-faint px-1 pb-1 text-[11px] font-semibold">Hour</p>
          <div className="grid grid-cols-6 gap-1">
            {HOURS.map((hour) => (
              <button
                key={hour}
                type="button"
                // Keep the popup open so the minute can still be adjusted.
                onClick={() => set(hour, mm ?? 0)}
                className={`nums rounded-[8px] py-1.5 text-center text-[12px] transition-colors ${
                  h === hour ? 'bg-clay text-bg font-bold' : 'text-muted hover:bg-surface'
                }`}
              >
                {hourLabel(hour)}
              </button>
            ))}
          </div>

          <p className="text-faint px-1 pt-2.5 pb-1 text-[11px] font-semibold">Minute</p>
          <div className="grid grid-cols-6 gap-1">
            {MINUTES.map((minute) => (
              <button
                key={minute}
                type="button"
                onClick={() => {
                  set(h ?? 9, minute)
                  pop.close() // minute completes the choice
                }}
                className={`nums rounded-[8px] py-1.5 text-center text-[12px] transition-colors ${
                  mm === minute ? 'bg-clay text-bg font-bold' : 'text-muted hover:bg-surface'
                }`}
              >
                {String(minute).padStart(2, '0')}
              </button>
            ))}
          </div>

          <div className="mt-2.5 flex items-center gap-1 border-t border-(--color-line) pt-2">
            <span className="nums text-ink flex-1 px-1 text-[13px] font-semibold">
              {value ? formatTimeLabel(value) : '—'}
            </span>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  pop.close()
                }}
                className="tactile text-muted hover:text-rose rounded-[8px] px-2 py-1 text-[12px]"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={pop.close}
              className="tactile bg-clay text-bg rounded-[8px] px-3 py-1 text-[12px] font-bold"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  )
}
