// Chat state for one scope (general assistant or a specific lecture).
// Thread selection, message history, and the send round-trip.

import { useCallback, useEffect, useState } from 'react'
import type { ChatMessage, ChatThread } from '../../shared/types'

export interface ChatStore {
  threads: ChatThread[]
  threadId: string | null
  messages: ChatMessage[]
  pending: boolean
  error: string | null
  selectThread: (id: string | null) => void
  send: (text: string) => Promise<void>
}

export function useChat(scope: 'general' | 'lecture', refId: string | null): ChatStore {
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load thread list; resume the most recent thread for this scope.
  useEffect(() => {
    let cancelled = false
    setThreads([])
    setThreadId(null)
    setMessages([])
    if (!window.planner) return
    window.planner.chatThreads(scope, refId).then((ts) => {
      if (cancelled) return
      setThreads(ts)
      if (ts.length > 0) setThreadId(ts[0].id)
    })
    return () => {
      cancelled = true
    }
  }, [scope, refId])

  useEffect(() => {
    if (!threadId || !window.planner) {
      setMessages([])
      return
    }
    let cancelled = false
    window.planner.chatMessages(threadId).then((ms) => {
      if (!cancelled) setMessages(ms)
    })
    return () => {
      cancelled = true
    }
  }, [threadId])

  const send = useCallback(
    async (text: string) => {
      if (!window.planner || pending) return
      setPending(true)
      setError(null)
      // Optimistic user bubble
      const tempId = `temp-${Date.now()}`
      setMessages((ms) => [
        ...ms,
        {
          id: tempId,
          threadId: threadId ?? '',
          role: 'user',
          content: text,
          meta: null,
          createdAt: new Date().toISOString()
        }
      ])
      try {
        const res = await window.planner.chatSend({ scope, refId, threadId, text })
        setThreadId(res.threadId)
        setMessages((ms) => [
          ...ms.filter((m) => m.id !== tempId),
          res.userMessage,
          res.assistantMessage
        ])
        if (!threadId) {
          // A new thread was created — refresh the list.
          setThreads(await window.planner.chatThreads(scope, refId))
        }
      } catch (err) {
        setMessages((ms) => ms.filter((m) => m.id !== tempId))
        setError((err as Error).message.replace(/^.*Error:\s*/, ''))
      } finally {
        setPending(false)
      }
    },
    [scope, refId, threadId, pending]
  )

  return { threads, threadId, messages, pending, error, selectThread: setThreadId, send }
}
