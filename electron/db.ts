// SQLite persistence via Electron's built-in node:sqlite (no native deps).
// One DatabaseSync handle owned by the main process; the renderer only ever
// touches data through IPC.

import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import fs from 'node:fs'
import { MIGRATIONS } from './migrations'

let db: DatabaseSync | null = null
let dbFilePath = ''

export function openDb(userDataDir: string): DatabaseSync {
  if (db) return db
  fs.mkdirSync(userDataDir, { recursive: true })
  dbFilePath = path.join(userDataDir, 'planner.db')
  db = new DatabaseSync(dbFilePath)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA foreign_keys = ON;')
  db.exec('PRAGMA busy_timeout = 3000;')
  migrate(db)
  return db
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('DB not opened yet')
  return db
}

export function getDbPath(): string {
  return dbFilePath
}

export function getSchemaVersion(): number {
  const row = getDb().prepare('PRAGMA user_version').get() as { user_version: number }
  return row.user_version
}

export function closeDb(): void {
  db?.close()
  db = null
}

function migrate(d: DatabaseSync): void {
  const { user_version: current } = d.prepare('PRAGMA user_version').get() as {
    user_version: number
  }
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue
    d.exec('BEGIN')
    try {
      d.exec(m.sql)
      d.exec(`PRAGMA user_version = ${m.version}`)
      d.exec('COMMIT')
    } catch (err) {
      d.exec('ROLLBACK')
      throw new Error(`Migration v${m.version} failed: ${(err as Error).message}`)
    }
  }
}
