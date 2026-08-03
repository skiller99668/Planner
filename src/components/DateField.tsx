// Calendar field. Chromium's native date picker can't be styled, so this
// replaces <input type="date"> everywhere. Value is a YYYY-MM-DD string
// (empty = unset). Weeks run Sunday–Saturday.

import { useEffect, useState } from 'react'
import { addDaysYMD, localYMD, todayYMD } from '../lib/dates'
import { Chevron, FIELD_CLASS, POPUP_CLASS, usePopoverAnchor } from './Popover'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

function parse(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** "Today", "Tomorrow", "Wed, Aug 5" — year only when it isn't this one. */
export function formatDateLabel(ymd: string): string {
  const d = parse(ymd)
  if (!d) return ''
  const today = todayYMD()
  if (ymd === today) return 'Today'
  if (ymd === addDaysYMD(today, 1)) return 'Tomorrow'
  if (ymd === addDaysYMD(today, -1)) return 'Yesterday'
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric'
  })
}

export default function DateField({
  value,
  onChange,
  placeholder = 'Pick a date',
  ariaLabel,
  disabled,
  className = '',
  max,
  min,
  clearable = true,
  align = 'left'
}: {
  value: string
  onChange: (ymd: string) => void
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  className?: string
  /** Inclusive YYYY-MM-DD bounds. */
  max?: string
  min?: string
  clearable?: boolean
  align?: 'left' | 'right'
}) {
  const pop = usePopoverAnchor(align)
  const selected = parse(value)
  const [cursor, setCursor] = useState(() => selected ?? new Date())

  // Re-centre on the selected month each time the calendar opens.
  useEffect(() => {
    if (pop.open) setCursor(parse(value) ?? new Date())
  }, [pop.open, value])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const gridStart = addDaysYMD(localYMD(firstOfMonth), -firstOfMonth.getDay())
  const days = Array.from({ length: 42 }, (_, i) => addDaysYMD(gridStart, i))
  // A 6th row is often empty; drop it so the panel isn't needlessly tall.
  const visible = days.slice(0, days[35] && parse(days[35])!.getMonth() === month ? 42 : 35)

  const today = todayYMD()
  const shiftMonth = (delta: number) => setCursor(new Date(year, month + delta, 1))
  const pick = (ymd: string) => {
    onChange(ymd)
    pop.close()
    pop.triggerRef.current?.focus()
  }

  return (
    <>
      <button
        ref={pop.triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={pop.open}
        aria-label={ariaLabel}
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
        <span className={value ? '' : 'text-faint'}>
          {value ? formatDateLabel(value) : placeholder}
        </span>
        <Chevron open={pop.open} />
      </button>

      {pop.open && (
        <div
          ref={pop.popupRef}
          role="dialog"
          aria-label={ariaLabel ?? 'Choose a date'}
          className={`${POPUP_CLASS} w-[268px]`}
          style={pop.popupStyle}
        >
          <div className="mb-1 flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="text-muted hover:text-ink tactile rounded-lg px-2 py-1 text-[15px]"
            >
              ‹
            </button>
            <span className="text-[13.5px] font-semibold">
              {MONTHS[month]} {year}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="text-muted hover:text-ink tactile rounded-lg px-2 py-1 text-[15px]"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 px-0.5">
            {WEEKDAYS.map((d, i) => (
              <span key={i} className="text-faint py-1 text-center text-[11px] font-semibold">
                {d}
              </span>
            ))}
            {visible.map((ymd) => {
              const d = parse(ymd)!
              const outside = d.getMonth() !== month
              const isSelected = ymd === value
              const isToday = ymd === today
              const blocked = (max !== undefined && ymd > max) || (min !== undefined && ymd < min)
              return (
                <button
                  key={ymd}
                  type="button"
                  disabled={blocked}
                  onClick={() => pick(ymd)}
                  aria-current={isToday ? 'date' : undefined}
                  className={`nums h-8 rounded-[9px] text-[12.5px] transition-colors ${
                    isSelected
                      ? 'bg-clay text-bg font-bold'
                      : blocked
                        ? 'text-faint/35'
                        : outside
                          ? 'text-faint hover:bg-surface'
                          : 'text-ink hover:bg-surface'
                  } ${isToday && !isSelected ? 'ring-clay/50 ring-1' : ''}`}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>

          <div className="mt-1.5 flex gap-1 px-0.5">
            <button
              type="button"
              onClick={() => pick(today)}
              className="tactile bg-surface text-ink flex-1 rounded-[9px] py-1.5 text-[12.5px] font-medium"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => pick(addDaysYMD(today, 1))}
              className="tactile bg-surface text-ink flex-1 rounded-[9px] py-1.5 text-[12.5px] font-medium"
            >
              Tomorrow
            </button>
            {clearable && value && (
              <button
                type="button"
                onClick={() => pick('')}
                className="tactile text-muted hover:text-rose rounded-[9px] px-2.5 py-1.5 text-[12.5px]"
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
