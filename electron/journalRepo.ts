// Journal persistence, and the lock that makes it a journal rather than a
// notes table.
//
// Entry bodies are encrypted with AES-256-GCM under a key scrypt-derived from
// the passcode. This is real encryption, not a screen in front of plaintext:
// planner.db is an unprotected file in %APPDATA% that any SQLite browser can
// open, so a gate that only hid the UI would be a promise the storage doesn't
// keep — and this is the one table where that distinction matters.
//
// Entries are encrypted under a random *data key*, not under the passcode
// itself. That data key is stored twice — wrapped under a passcode-derived key
// and wrapped under Electron safeStorage (Windows DPAPI) — so forgetting the
// passcode costs a reset rather than the journal. The exchange, stated plainly:
// anything running as this Windows account can reach the entries without the
// passcode. The lock still stops someone reading planner.db directly, or using
// an app someone left open; it is not a defence against the account itself.
//
// The unwrapped data key exists only as a module-level Buffer in the main
// process. It never crosses IPC and dies with the process, so every launch
// starts locked.

import { safeStorage } from 'electron'
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual
} from 'node:crypto'
import type { JournalEntry, JournalEntryMeta, JournalStatus, Mood } from '../shared/types'
import { getDb } from './db'

const LOCK_ROW = 'lock'
/** Encrypted under the derived key at setup; decrypting it back to this exact
 *  string is how a passcode is checked without touching a single entry. */
const VERIFIER_TOKEN = 'planner-journal-v1'

// scrypt cost. N=2^15 lands around 100ms on a normal laptop — slow enough that
// guessing a short passcode offline is unpleasant, fast enough that unlocking
// feels instant. maxmem has to be raised by hand or node refuses N this high.
const SCRYPT_N = 32768
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_MAXMEM = 64 * 1024 * 1024
const KEY_LEN = 32
const IV_LEN = 12
const TAG_LEN = 16

/** The unwrapped data key, for this run only. */
let sessionKey: Buffer | null = null

interface LockRow {
  id: string
  salt: string
  verifier: string
  created_at: string
  /** The data key wrapped under the passcode-derived key. NULL on a v12-era
   *  lock, whose entries are encrypted under the passcode key directly. */
  dek_pass: string | null
  /** The same data key wrapped by the OS. NULL when it could not be made. */
  dek_recovery: string | null
}

interface EntryRow {
  id: string
  date: string
  body: string
  mood: number | null
  created_at: string
  updated_at: string
}

// ---------- crypto ----------

function deriveKey(passcode: string, salt: Buffer): Buffer {
  return scryptSync(passcode.normalize('NFKC'), salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM
  })
}

/** base64(iv | tag | ciphertext) — one field, so there is nothing to get out
 *  of order when it is read back. */
function encrypt(key: Buffer, plain: string): string {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64')
}

/** Throws on a wrong key or a tampered row — GCM authenticates, so this can't
 *  quietly return garbage. */
function decrypt(key: Buffer, blob: string): string {
  const buf = Buffer.from(blob, 'base64')
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const ct = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

function readLock(): LockRow | null {
  return (getDb().prepare('SELECT * FROM journal_lock WHERE id = ?').get(LOCK_ROW) as
    | LockRow
    | undefined) ?? null
}

/** The key for a passcode, or null when it's wrong. Constant-time on the
 *  verifier so a timing difference can't leak how close a guess was. */
function keyFor(passcode: string, lock: LockRow): Buffer | null {
  const key = deriveKey(passcode, Buffer.from(lock.salt, 'base64'))
  try {
    const got = Buffer.from(decrypt(key, lock.verifier), 'utf8')
    const want = Buffer.from(VERIFIER_TOKEN, 'utf8')
    if (got.length === want.length && timingSafeEqual(got, want)) return key
  } catch {
    // Wrong key fails the GCM tag; that is the expected path for a bad guess.
  }
  return null
}

/** Wrap the data key for the OS, or null when safeStorage can't. A missing
 *  recovery wrapper is not fatal — it only means "forgot it" has nothing to
 *  fall back on, which the UI asks about before offering the option. */
function wrapForOs(dek: Buffer): string | null {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    return safeStorage.encryptString(dek.toString('base64')).toString('base64')
  } catch {
    return null
  }
}

function unwrapFromOs(blob: string | null): Buffer | null {
  if (!blob) return null
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    return Buffer.from(safeStorage.decryptString(Buffer.from(blob, 'base64')), 'base64')
  } catch {
    // A different Windows account, or a database restored from another
    // machine: the DPAPI blob simply won't open, and that is recoverable
    // information rather than an error.
    return null
  }
}

/** Store a data key under both wrappers, with a fresh salt and verifier for
 *  the passcode given. The single place the lock row is written. */
function writeLock(passcode: string, dek: Buffer, existing: boolean): void {
  const salt = randomBytes(16)
  const passKey = deriveKey(passcode, salt)
  const row = [
    salt.toString('base64'),
    encrypt(passKey, VERIFIER_TOKEN),
    encrypt(passKey, dek.toString('base64')),
    wrapForOs(dek)
  ]
  const db = getDb()
  if (existing) {
    db.prepare(
      'UPDATE journal_lock SET salt = ?, verifier = ?, dek_pass = ?, dek_recovery = ? WHERE id = ?'
    ).run(...row, LOCK_ROW)
  } else {
    db.prepare(
      `INSERT INTO journal_lock (id, salt, verifier, dek_pass, dek_recovery, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(LOCK_ROW, ...row, new Date().toISOString())
  }
}

/** Bring a v12-era lock forward: its entries are encrypted under the passcode
 *  key, so re-encrypt them under a fresh data key that both wrappers hold.
 *  Runs inside the one moment the passcode is known — a successful unlock. */
function upgradeLegacyLock(passcode: string, passKey: Buffer): Buffer {
  const db = getDb()
  const dek = randomBytes(KEY_LEN)
  const rows = db.prepare('SELECT id, body FROM journal_entries').all() as unknown as {
    id: string
    body: string
  }[]
  // Decrypt everything before writing anything, exactly as a passcode change
  // does: a row that won't open has to stop the upgrade while the old shape is
  // still the stored one.
  const moved = rows.map((r) => ({ id: r.id, body: encrypt(dek, decrypt(passKey, r.body)) }))

  db.exec('BEGIN')
  try {
    const put = db.prepare('UPDATE journal_entries SET body = ? WHERE id = ?')
    for (const r of moved) put.run(r.body, r.id)
    writeLock(passcode, dek, true)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  return dek
}

/** Every read and write below goes through this, so "locked" is enforced in
 *  main rather than by the renderer choosing not to ask. */
function requireKey(): Buffer {
  if (!sessionKey) throw new Error('Journal is locked')
  return sessionKey
}

// ---------- lock lifecycle ----------

export function journalStatus(): JournalStatus {
  const lock = readLock()
  return {
    configured: lock !== null,
    unlocked: sessionKey !== null,
    // A legacy lock has no recovery wrapper yet — it gets one the first time
    // it is unlocked, so until then "forgot it" genuinely cannot help.
    recoverable: lock !== null && unwrapFromOs(lock.dek_recovery) !== null
  }
}

export function setJournalPasscode(passcode: string): JournalStatus {
  if (readLock()) throw new Error('Journal passcode already set')
  const clean = passcode.trim()
  if (clean.length < 4) throw new Error('Passcode must be at least 4 characters')

  // The entries ride on this, not on the passcode — which is what lets the
  // passcode be replaced later without touching a single entry.
  const dek = randomBytes(KEY_LEN)
  writeLock(clean, dek, false)
  sessionKey = dek // setting it up is proof enough; don't make them type it twice
  return journalStatus()
}

/** Change the passcode you already know. Only the wrappers move — the data
 *  key underneath is untouched, so no entry is rewritten and there is no
 *  half-converted state to worry about. */
export function changeJournalPasscode(current: string, next: string): { ok: boolean } {
  const lock = readLock()
  if (!lock) throw new Error('Journal has no passcode yet')
  const passKey = keyFor(current, lock)
  if (!passKey) return { ok: false }

  const clean = next.trim()
  if (clean.length < 4) throw new Error('Passcode must be at least 4 characters')

  const dek = lock.dek_pass
    ? Buffer.from(decrypt(passKey, lock.dek_pass), 'base64')
    : upgradeLegacyLock(current, passKey)
  writeLock(clean, dek, true)
  sessionKey = dek
  return { ok: true }
}

/** Set a new passcode without knowing the old one, by opening the data key
 *  through the OS wrapper instead. This is the forgotten-passcode path, and it
 *  keeps every entry.
 *
 *  Fails only when there is no usable OS wrapper — a v12-era lock that has
 *  never been unlocked since, a database carried over from another Windows
 *  account, or a machine where safeStorage isn't available. In those cases the
 *  data key really is unreachable and erasing is the only way on. */
export function resetJournalPasscode(next: string): { ok: boolean } {
  const lock = readLock()
  if (!lock) throw new Error('Journal has no passcode yet')
  const clean = next.trim()
  if (clean.length < 4) throw new Error('Passcode must be at least 4 characters')

  const dek = unwrapFromOs(lock.dek_recovery)
  if (!dek) return { ok: false }

  writeLock(clean, dek, true)
  sessionKey = dek
  return { ok: true }
}

export function unlockJournal(passcode: string): { ok: boolean } {
  const lock = readLock()
  if (!lock) return { ok: false }
  const passKey = keyFor(passcode, lock)
  if (!passKey) return { ok: false }

  // A v12-era lock is brought forward here, which is the only moment the
  // passcode is in hand — and the moment it gains a recovery wrapper.
  sessionKey = lock.dek_pass
    ? Buffer.from(decrypt(passKey, lock.dek_pass), 'base64')
    : upgradeLegacyLock(passcode, passKey)
  return { ok: true }
}

export function lockJournal(): JournalStatus {
  sessionKey = null
  return journalStatus()
}

/** Called on quit so the key doesn't outlive the window in a tray-resident
 *  process. */
export function forgetJournalKey(): void {
  sessionKey = null
}

/** The forgotten-passcode escape, and the only one there is. */
export function resetJournal(): JournalStatus {
  const db = getDb()
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM journal_entries').run()
    db.prepare('DELETE FROM journal_lock').run()
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  sessionKey = null
  return journalStatus()
}

// ---------- entries ----------

/** Words, counted the way a person would: runs of non-space separated by
 *  space. Good enough for a journal, and it costs one split. */
function wordsIn(body: string): number {
  const t = body.trim()
  return t ? t.split(/\s+/).length : 0
}

/** First line of the body, trimmed to something a list row can hold. */
function excerptOf(body: string): string {
  const line = body.split('\n').find((l) => l.trim() !== '') ?? ''
  const clean = line.trim()
  return clean.length > 90 ? `${clean.slice(0, 90)}…` : clean
}

const moodOf = (n: number | null): Mood | null =>
  n !== null && n >= 1 && n <= 5 ? (n as Mood) : null

export function listJournalEntries(): JournalEntryMeta[] {
  const key = requireKey()
  const rows = getDb()
    .prepare('SELECT * FROM journal_entries ORDER BY date DESC')
    .all() as unknown as EntryRow[]
  return rows.map((r) => {
    const body = decrypt(key, r.body)
    return {
      id: r.id,
      date: r.date,
      mood: moodOf(r.mood),
      excerpt: excerptOf(body),
      words: wordsIn(body),
      updatedAt: r.updated_at
    }
  })
}

export function getJournalEntry(date: string): JournalEntry | null {
  const key = requireKey()
  const row = getDb().prepare('SELECT * FROM journal_entries WHERE date = ?').get(date) as
    | EntryRow
    | undefined
  if (!row) return null
  return {
    id: row.id,
    date: row.date,
    body: decrypt(key, row.body),
    mood: moodOf(row.mood),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** Write the day's text. Emptying an entry deletes it rather than leaving a
 *  blank row: a day you wrote nothing on should look like a day you wrote
 *  nothing on, both in the list and in the mood strip.
 *
 *  A mood already set on that day survives being written to, which is why this
 *  updates the body column alone rather than replacing the row. */
export function saveJournalEntry(date: string, body: string): JournalEntryMeta | null {
  const key = requireKey()
  const db = getDb()
  const now = new Date().toISOString()
  const existing = db.prepare('SELECT * FROM journal_entries WHERE date = ?').get(date) as
    | EntryRow
    | undefined

  if (!body.trim()) {
    // Nothing written. Keep the row only if a mood is riding on it.
    if (existing && existing.mood === null) {
      db.prepare('DELETE FROM journal_entries WHERE date = ?').run(date)
      return null
    }
    if (!existing) return null
  }

  if (existing) {
    db.prepare('UPDATE journal_entries SET body = ?, updated_at = ? WHERE date = ?').run(
      encrypt(key, body),
      now,
      date
    )
  } else {
    db.prepare(
      `INSERT INTO journal_entries (id, date, body, mood, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?)`
    ).run(crypto.randomUUID(), date, encrypt(key, body), now, now)
  }

  const row = db.prepare('SELECT * FROM journal_entries WHERE date = ?').get(date) as
    | EntryRow
    | undefined
  if (!row) return null
  return {
    id: row.id,
    date: row.date,
    mood: moodOf(row.mood),
    excerpt: excerptOf(body),
    words: wordsIn(body),
    updatedAt: row.updated_at
  }
}

/** Rate the day. Works before anything is written — some days you know how
 *  they went before you can say why — so it creates an empty encrypted body
 *  rather than requiring text first. */
export function setJournalMood(date: string, mood: Mood | null): void {
  const key = requireKey()
  const db = getDb()
  const now = new Date().toISOString()
  const existing = db.prepare('SELECT id, body FROM journal_entries WHERE date = ?').get(date) as
    | { id: string; body: string }
    | undefined

  if (existing) {
    db.prepare('UPDATE journal_entries SET mood = ?, updated_at = ? WHERE date = ?').run(
      mood,
      now,
      date
    )
    return
  }
  if (mood === null) return // nothing to clear
  db.prepare(
    `INSERT INTO journal_entries (id, date, body, mood, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(crypto.randomUUID(), date, encrypt(key, ''), mood, now, now)
}

export function deleteJournalEntry(date: string): void {
  requireKey()
  getDb().prepare('DELETE FROM journal_entries WHERE date = ?').run(date)
}
