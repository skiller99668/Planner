// Groq client + API-key management.
//
// The key is encrypted with Electron safeStorage (Windows DPAPI) and stored in
// the settings table under a raw key that is NOT part of the Settings shape —
// it never crosses IPC and never reaches the renderer. Calls happen in the
// main process only.

import { safeStorage } from 'electron'
import { getDb } from './db'

const KEY_ROW = 'groqKeyEnc' // base64(DPAPI blob); deliberately outside Settings
const API_URL = 'https://api.groq.com/openai/v1/chat/completions'

// Fallback when settings.groqModel is unset. Cheap + fast is right for tagging;
// if Groq retires this id, set groqModel in Settings instead of rebuilding.
const DEFAULT_MODEL = 'llama-3.1-8b-instant'

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

export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Minimal chat completion. Returns null (never throws) when the key is
 *  missing, the network fails, or the API errors — callers degrade silently. */
export async function chatComplete(opts: {
  messages: ChatMessageInput[]
  model?: string
  temperature?: number
  maxTokens?: number
  jsonObject?: boolean
  timeoutMs?: number
}): Promise<string | null> {
  const key = readKey()
  if (!key) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000)
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: opts.model ?? DEFAULT_MODEL,
        messages: opts.messages,
        temperature: opts.temperature ?? 0,
        max_tokens: opts.maxTokens ?? 512,
        ...(opts.jsonObject ? { response_format: { type: 'json_object' } } : {})
      })
    })
    if (!res.ok) {
      console.error(`[groq] HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
      return null
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    return data.choices?.[0]?.message?.content ?? null
  } catch (err) {
    console.error('[groq] request failed:', err)
    return null
  } finally {
    clearTimeout(timer)
  }
}
