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
    <div className="bg-surface flex min-h-0 flex-1 flex-col rounded-[18px] shadow-[var(--shadow-soft)]">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && !pending && (
          <p className="text-muted mt-6 text-center text-[13px]">
            {disabled ? (disabledHint ?? 'Unavailable') : 'Ask anything'}
          </p>
        )}
        {messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}
        {pending && (
          <div className="flex items-center gap-2">
            <span className="bg-clay h-2 w-2 animate-pulse rounded-full" aria-hidden />
            <span className="text-muted text-[12.5px]">Thinking…</span>
          </div>
        )}
      </div>

      {quickActions && quickActions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-2.5 pb-0.5">
          {quickActions.map((qa) => (
            <button
              key={qa.label}
              onClick={() => send(qa.prompt)}
              disabled={pending || disabled}
              className="tactile bg-raised text-muted hover:text-ink rounded-full px-3 py-1.5 text-[12px] font-medium disabled:opacity-40"
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
            className="bg-bg placeholder:text-faint focus:ring-clay/50 max-h-40 flex-1 resize-none rounded-[14px] px-4 py-2.5 text-[13.5px] outline-none focus:ring-1"
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
            className="tactile bg-clay text-bg rounded-[14px] px-4 py-2.5 text-[13.5px] font-bold disabled:opacity-35"
          >
            Send
          </button>
        </div>
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
        <div className="bg-raised max-w-[85%] rounded-[16px] rounded-br-sm px-3.5 py-2 text-[13px] whitespace-pre-wrap">
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
              className="bg-sage/15 text-sage rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
            >
              {r}
            </span>
          ))}
        </div>
      )}
      <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{message.content}</div>
    </div>
  )
}
