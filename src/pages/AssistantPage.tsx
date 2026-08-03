import { useEffect, useState } from 'react'
import Select from '../components/Select'
import ChatView from '../components/ChatView'
import { useChat } from '../lib/useChat'

const QUICK_ACTIONS = [
  { label: "what's due today", prompt: 'What tasks are due or overdue today? Keep it short.' },
  { label: 'plan my week', prompt: 'Look at my open tasks and gym status, and suggest a plan for the rest of this week.' },
  { label: 'log a workout', prompt: 'Log today’s workout — ask me which type if you need to.' }
]

export default function AssistantPage() {
  const chat = useChat('general', null)
  const [configured, setConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    window.planner?.groqStatus().then((s) => setConfigured(s.configured)).catch(() => setConfigured(false))
  }, [])

  const disabled = configured === false

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold">Assistant</h1>
          <p className="text-muted mt-0.5 text-[13.5px]">Ask, or tell it what to do</p>
        </div>
        <div className="flex items-center gap-2">
          {chat.threads.length > 0 && (
            <Select
              value={chat.threadId ?? ''}
              ariaLabel="Conversation"
              align="right"
              className="max-w-52"
              onChange={(val) => chat.selectThread(val || null)}
              options={chat.threads.map((t) => ({ value: t.id, label: t.title }))}
            />
          )}
          <button
            onClick={() => chat.selectThread(null)}
            disabled={chat.threadId === null}
            className="bg-surface text-muted hover:text-ink rounded-[11px] px-3 py-1.5 text-[12.5px] transition-colors disabled:opacity-40"
          >
            New chat
          </button>
        </div>
      </div>

      {disabled && (
        <div className="border-clay/40 bg-clay/10 mt-4 rounded-[16px] px-4 py-3 text-[13px]">
          Add a Groq API key in Settings to turn the assistant on.
        </div>
      )}
      {chat.error && (
        <div className="border-rose/40 bg-rose/10 mt-4 rounded-[16px] px-4 py-3 text-[13px]">
          {chat.error}
        </div>
      )}

      <div className="mt-4 flex h-[calc(100vh-13rem)] min-h-72 flex-col">
        <ChatView
          messages={chat.messages}
          pending={chat.pending}
          disabled={disabled}
          disabledHint="Add a Groq key in Settings first."
          quickActions={QUICK_ACTIONS}
          onSend={(t) => void chat.send(t)}
          placeholder="Ask anything, or say what to add"
        />
      </div>
    </div>
  )
}
