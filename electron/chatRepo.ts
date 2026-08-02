// Chat thread + message persistence, shared by the app-wide assistant
// (scope 'general') and per-lecture chats (scope 'lecture').

import type { ChatMessage, ChatRole, ChatScope, ChatThread } from '../shared/types'
import { getDb } from './db'

interface ThreadRow {
  id: string
  scope: string
  ref_id: string | null
  title: string
  created_at: string
  updated_at: string
}

interface MessageRow {
  id: string
  thread_id: string
  role: string
  content: string
  meta: string | null
  created_at: string
}

function rowToThread(r: ThreadRow): ChatThread {
  return {
    id: r.id,
    scope: r.scope as ChatScope,
    refId: r.ref_id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

function rowToMessage(r: MessageRow): ChatMessage {
  let meta: Record<string, unknown> | null = null
  if (r.meta) {
    try {
      meta = JSON.parse(r.meta) as Record<string, unknown>
    } catch {
      meta = null
    }
  }
  return {
    id: r.id,
    threadId: r.thread_id,
    role: r.role as ChatRole,
    content: r.content,
    meta,
    createdAt: r.created_at
  }
}

export function listThreads(scope: ChatScope, refId: string | null): ChatThread[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM chat_threads WHERE scope = ? AND (ref_id IS ? OR ref_id = ?)
       ORDER BY updated_at DESC LIMIT 20`
    )
    .all(scope, refId, refId) as unknown as ThreadRow[]
  return rows.map(rowToThread)
}

export function createThread(scope: ChatScope, refId: string | null, title: string): ChatThread {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  getDb()
    .prepare(
      `INSERT INTO chat_threads (id, scope, ref_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, scope, refId, title.slice(0, 80), now, now)
  return { id, scope, refId, title: title.slice(0, 80), createdAt: now, updatedAt: now }
}

export function getThread(id: string): ChatThread {
  const row = getDb().prepare('SELECT * FROM chat_threads WHERE id = ?').get(id) as
    | ThreadRow
    | undefined
  if (!row) throw new Error(`Thread not found: ${id}`)
  return rowToThread(row)
}

export function touchThread(id: string): void {
  getDb()
    .prepare('UPDATE chat_threads SET updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id)
}

export function listMessages(threadId: string, limit = 200): ChatMessage[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM (
         SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at DESC LIMIT ?
       ) ORDER BY created_at ASC`
    )
    .all(threadId, limit) as unknown as MessageRow[]
  return rows.map(rowToMessage)
}

export function appendMessage(
  threadId: string,
  role: ChatRole,
  content: string,
  meta: Record<string, unknown> | null = null
): ChatMessage {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  getDb()
    .prepare(
      `INSERT INTO chat_messages (id, thread_id, role, content, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, threadId, role, content, meta ? JSON.stringify(meta) : null, now)
  touchThread(threadId)
  return { id, threadId, role, content, meta, createdAt: now }
}

/** Remove all threads (and cascaded messages) attached to a deleted entity. */
export function deleteThreadsFor(scope: ChatScope, refId: string): void {
  const db = getDb()
  const rows = db
    .prepare('SELECT id FROM chat_threads WHERE scope = ? AND ref_id = ?')
    .all(scope, refId) as unknown as { id: string }[]
  for (const r of rows) {
    db.prepare('DELETE FROM chat_threads WHERE id = ?').run(r.id) // messages cascade
  }
}
