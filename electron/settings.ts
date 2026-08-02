// Settings repository: one JSON value per key in the settings table,
// merged over DEFAULT_SETTINGS so new defaults appear automatically.

import { DEFAULT_SETTINGS, type Settings } from '../shared/types'
import { getDb } from './db'

export function getSettings(): Settings {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as {
    key: string
    value: string
  }[]
  const stored: Record<string, unknown> = {}
  for (const r of rows) {
    try {
      stored[r.key] = JSON.parse(r.value)
    } catch {
      // ignore corrupt row; default wins
    }
  }
  return deepMerge(DEFAULT_SETTINGS, stored) as Settings
}

export function patchSettings(patch: Partial<Settings>): Settings {
  const db = getDb()
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    stmt.run(key, JSON.stringify(value))
  }
  return getSettings()
}

function deepMerge(base: unknown, over: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(over)) {
    return over === undefined ? base : over
  }
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(over)) {
    out[k] = k in base ? deepMerge(base[k], v) : v
  }
  return out
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
