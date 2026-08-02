// Chat surface shared by the app-wide Assistant page and per-lecture chats.
// Handles message list, receipts chips, quick actions, input, and the
// pending state while the main-process agent loop runs.

import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../../shared/types'

export default function ChatView({
  messages,
  pending,
  disabled,
  disabledHint,
  quickActions,
  onSend,
  placeholder
}: {
  messages: ChatMessage[]
  pending: boolean
  disabled: boolean
  disabledHint?: string
  quickActions?: { label: string; prompt: string }[]
  onSend: (text: string) => void
  placeholder: string
}) {
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length, pending])

  const send = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || pending || disabled) return
    setDraft('')
    onSend(trimmed)
  }

  return (
    <div className="border-line bg-panel flex min-h-0 flex-1 flex-col rounded-lg border">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && !pending && (
          <p className="text-muted mt-6 text-center text-[13px]">
            {disabled ? (disabledHint ?? 'Unavailable.') : 'No messages yet — ask away.'}
          </p>
        )}
        {messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}
        {pending && (
          <div className="flex items-center gap-2">
            <span className="led text-amber animate-pulse" aria-hidden />
            <span className="text-muted font-mono text-[11px]">thinking…</span>
          </div>
        )}
      </div>

      {quickActions && quickActions.length > 0 && (
        <div className="border-line flex flex-wrap gap-1.5 border-t px-3 pt-2.5 pb-0.5">
          {quickActions.map((qa) => (
            <button
              key={qa.label}
              onClick={() => send(qa.prompt)}
              disabled={pending || disabled}
              className="border-line bg-panel2 text-muted hover:text-ink hover:border-amber/50 rounded-full border px-2.5 py-1 font-mono text-[10.5px] transition-colors disabled:opacity-40"
            >
              {qa.label}
            </button>
          ))}
        </div>
      )}

      <div className="p-3">
        <div className="flex items-end gap-2">
          <textarea
            rows={draft.includes('\n') ? 3 : 1}
            className="bg-bench border-line placeholder:text-muted/60 focus:border-amber/60 max-h-40 flex-1 resize-none rounded-lg border px-3 py-2 text-[13px]"
            placeholder={disabled ? (disabledHint ?? placeholder) : placeholder}
            value={draft}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(draft)
              }
            }}
          />
          <button
            onClick={() => send(draft)}
            disabled={!draft.trim() || pending || disabled}
            className="bg-amber text-bench rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-opacity disabled:opacity-40"
          >
            Send
          </button>
        </div>
        <p className="text-muted/60 mt-1.5 font-mono text-[10px]">
          Enter to send · Shift+Enter for a new line
        </p>
      </div>
    </div>
  )
}

function MessageRow({ message }: { message: ChatMessage }) {
  const receipts = Array.isArray(message.meta?.receipts)
    ? (message.meta.receipts as string[])
    : []

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-panel2 max-w-[85%] rounded-lg rounded-br-sm px-3.5 py-2 text-[13px] whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    )
  }
  return (
    <div className="max-w-[92%]">
      {receipts.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {receipts.map((r, i) => (
            <span
              key={i}
              className="border-amber/40 text-amber bg-amber/10 rounded-full border px-2.5 py-0.5 font-mono text-[10.5px]"
            >
              ✓ {r}
            </span>
          ))}
        </div>
      )}
      <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{message.content}</div>
    </div>
  )
}
