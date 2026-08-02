// Reminder scheduler: polls the reminders table and fires OS notifications.
// Runs in the main process so reminders work while the window is closed
// (the app lives in the tray). Feature phases only need to insert rows into
// the reminders table; this loop does the rest.

import { Notification } from 'electron'
import { getDb } from './db'

const POLL_MS = 30_000
let timer: ReturnType<typeof setInterval> | null = null

export function startScheduler(onActivate: (refId: string | null, kind: string) => void): void {
  if (timer) return
  const tick = () => {
    try {
      fireDueReminders(onActivate)
    } catch (err) {
      console.error('[scheduler] tick failed:', err)
    }
  }
  timer = setInterval(tick, POLL_MS)
  tick() // catch up immediately on launch (e.g. reminders missed while off)
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}

function fireDueReminders(onActivate: (refId: string | null, kind: string) => void): void {
  if (!Notification.isSupported()) return
  const now = new Date().toISOString()
  const due = getDb()
    .prepare(
      `SELECT id, kind, ref_id, title, body FROM reminders
       WHERE fired_at IS NULL AND fire_at <= ?
       ORDER BY fire_at LIMIT 10`
    )
    .all(now) as { id: string; kind: string; ref_id: string | null; title: string; body: string | null }[]

  const mark = getDb().prepare('UPDATE reminders SET fired_at = ? WHERE id = ?')
  for (const r of due) {
    const n = new Notification({
      title: r.title,
      body: r.body ?? '',
      silent: false
    })
    n.on('click', () => onActivate(r.ref_id, r.kind))
    n.show()
    mark.run(now, r.id)
  }
}
