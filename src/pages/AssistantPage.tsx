import { useEffect, useState } from 'react'
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
          <p className="text-muted font-mono text-[11px] tracking-[0.16em] uppercase">
            Groq-powered · can create tasks, plan projects, log workouts
          </p>
          <h1 className="font-display mt-1 text-xl font-semibold">Assistant</h1>
        </div>
        <div className="flex items-center gap-2">
          {chat.threads.length > 0 && (
            <select
              aria-label="Conversation"
              className="bg-panel border-line text-muted max-w-44 rounded-md border px-2 py-1.5 font-mono text-[11px]"
              value={chat.threadId ?? ''}
              onChange={(e) => chat.selectThread(e.target.value || null)}
            >
              {chat.threads.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => chat.selectThread(null)}
            disabled={chat.threadId === null}
            className="border-line bg-panel text-muted hover:text-ink rounded-md border px-3 py-1.5 text-[12.5px] transition-colors disabled:opacity-40"
          >
            New chat
          </button>
        </div>
      </div>

      {disabled && (
        <div className="border-amber/40 bg-amber/10 mt-4 rounded-lg border px-4 py-3 text-[13px]">
          Add your Groq API key in <span className="font-semibold">Settings</span> to turn the
          assistant on — free at console.groq.com.
        </div>
      )}
      {chat.error && (
        <div className="border-danger/40 bg-danger/10 mt-4 rounded-lg border px-4 py-3 text-[13px]">
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
          placeholder='Try: "break my ECSE project into small tasks due before Aug 20"'
        />
      </div>
    </div>
  )
}
