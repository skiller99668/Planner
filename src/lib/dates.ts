// Renderer-side date helpers. Tasks store UTC ISO datetimes; all bucketing
// and display happen in local wall time.

export function localYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayYMD(): string {
  return localYMD(new Date())
}

export function addDaysYMD(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return localYMD(new Date(y, m - 1, d + days))
}

export function ymdOfIso(iso: string): string {
  return localYMD(new Date(iso))
}

export function timeOfIso(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** "HH:mm" for <input type="time"> */
export function hmOfIso(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Compact human due label: "Today 14:30", "Tomorrow", "Mon Aug 10", "Aug 10 2027". */
export function dueLabel(iso: string, allDay: boolean): string {
  const day = ymdOfIso(iso)
  const today = todayYMD()
  const time = allDay ? '' : ` ${timeOfIso(iso)}`
  if (day === today) return `Today${time}`
  if (day === addDaysYMD(today, 1)) return `Tomorrow${time}`
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  const label = d.toLocaleDateString(undefined, {
    weekday: sameYear ? 'short' : undefined,
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric'
  })
  return `${label}${time}`
}
