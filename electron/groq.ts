// Groq client + API-key management.
//
// The key is encrypted with Electron safeStorage (Windows DPAPI) and stored in
// the settings table under a raw key that is NOT part of the Settings shape —
// it never crosses IPC and never reaches the renderer. Calls happen in the
// main process only.

import { safeStorage } from 'electron'
import { getDb } from './db'

const KEY_ROW = 'groqKeyEnc' // base64(DPAPI blob); deliberately outside Settings
const BASE_URL = 'https://api.groq.com/openai/v1'

// Fallbacks when settings.groqModel is unset. Cheap+fast for tagging, a
// tool-capable model for the assistant. If Groq retires an id, pick a model
// in Settings instead of rebuilding.
export const TAG_MODEL = 'llama-3.1-8b-instant'
export const ASSISTANT_MODEL = 'llama-3.3-70b-versatile'

export function getGroqStatus(): { configured: boolean } {
  return { configured: readKey() !== null }
}

export function setGroqKey(key: string): { configured: boolean } {
  const db = getDb()
  const trimmed = key.trim()
  if (!trimmed) {
    db.prepare('DELETE FROM settings WHERE key = ?').run(KEY_ROW)
    return { configured: false }
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption unavailable on this system')
  }
  const enc = safeStorage.encryptString(trimmed).toString('base64')
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(KEY_ROW, JSON.stringify(enc))
  return { configured: true }
}

function readKey(): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(KEY_ROW) as
    | { value: string }
    | undefined
  if (!row) return null
  try {
    const b64 = JSON.parse(row.value) as string
    return safeStorage.decryptString(Buffer.from(b64, 'base64'))
  } catch (err) {
    console.error('[groq] stored key unreadable, clearing:', err)
    getDb().prepare('DELETE FROM settings WHERE key = ?').run(KEY_ROW)
    return null
  }
}

// ---------- chat (OpenAI-compatible, with tool use) ----------

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** Message for the wire. Assistant messages may carry tool_calls; tool
 *  results reference them via tool_call_id. */
export type WireMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown> // JSON schema
  }
}

export type ChatResult =
  | { ok: true; content: string | null; toolCalls: ToolCall[] }
  | { ok: false; status: number | null; error: string; retryAfterSec: number | null }

/** Full chat call. Never throws — failures come back as { ok: false } with
 *  the real status + message so callers can explain what happened. */
export async function chatRaw(opts: {
  messages: WireMessage[]
  model: string
  tools?: ToolDef[]
  temperature?: number
  maxTokens?: number
  jsonObject?: boolean
  timeoutMs?: number
}): Promise<ChatResult> {
  const key = readKey()
  if (!key) return { ok: false, status: null, error: 'No API key stored', retryAfterSec: null }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45_000)
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 1024,
        ...(opts.tools?.length ? { tools: opts.tools, tool_choice: 'auto' } : {}),
        ...(opts.jsonObject ? { response_format: { type: 'json_object' } } : {})
      })
    })
    if (!res.ok) {
      const bodyText = await res.text()
      console.error(`[groq] HTTP ${res.status}: ${bodyText.slice(0, 300)}`)
      let message = bodyText.slice(0, 200)
      try {
        const parsed = JSON.parse(bodyText) as { error?: { message?: string } }
        if (parsed.error?.message) message = parsed.error.message
      } catch { /* keep raw slice */ }
      const ra = res.headers.get('retry-after')
      return {
        ok: false,
        status: res.status,
        error: message,
        retryAfterSec: ra ? Math.ceil(Number(ra)) : null
      }
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[]
    }
    const msg = data.choices?.[0]?.message
    if (!msg) return { ok: false, status: null, error: 'Empty response from Groq', retryAfterSec: null }
    return { ok: true, content: msg.content ?? null, toolCalls: msg.tool_calls ?? [] }
  } catch (err) {
    console.error('[groq] request failed:', err)
    const aborted = (err as Error).name === 'AbortError'
    return {
      ok: false,
      status: null,
      error: aborted ? 'Request timed out' : `Network error: ${(err as Error).message}`,
      retryAfterSec: null
    }
  } finally {
    clearTimeout(timer)
  }
}

/** Simple text completion (used by auto-tagging). Silent on failure. */
export async function chatComplete(opts: {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
  model?: string
  temperature?: number
  maxTokens?: number
  jsonObject?: boolean
  timeoutMs?: number
}): Promise<string | null> {
  const res = await chatRaw({
    messages: opts.messages as WireMessage[],
    model: opts.model ?? TAG_MODEL,
    temperature: opts.temperature ?? 0,
    maxTokens: opts.maxTokens,
    jsonObject: opts.jsonObject,
    timeoutMs: opts.timeoutMs ?? 20_000
  })
  return res.ok ? res.content : null
}

// ---------- model listing ----------

let modelsCache: { at: number; ids: string[] } | null = null

export async function listModels(): Promise<string[]> {
  const key = readKey()
  if (!key) return []
  if (modelsCache && Date.now() - modelsCache.at < 10 * 60_000) return modelsCache.ids
  try {
    const res = await fetch(`${BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${key}` }
    })
    if (!res.ok) return []
    const data = (await res.json()) as { data?: { id: string }[] }
    const ids = (data.data ?? []).map((m) => m.id).sort()
    modelsCache = { at: Date.now(), ids }
    return ids
  } catch {
    return []
  }
}
