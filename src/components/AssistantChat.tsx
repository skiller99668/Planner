// The reusable assistant chat surface: thread controls, status notices, and the
// ChatView. Used full-height in the slide-in panel and `compact` in the
// always-on dashboard box. Reads the shared conversation from AssistantProvider.

import Select from './Select'
import ChatView from './ChatView'
import { useAssistant } from './AssistantProvider'

const QUICK_ACTIONS = [
  { label: "what's due today", prompt: 'What tasks are due or overdue today? Keep it short.' },
  { label: 'plan my week', prompt: 'Look at my open tasks and gym status, and suggest a plan for the rest of this week.' },
  { label: 'log a workout', prompt: 'Log today’s workout — ask me which type if you need to.' }
]

export default function AssistantChat({ compact = false }: { compact?: boolean }) {
  const { chat, configured } = useAssistant()
  const disabled = configured === false

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!compact && chat.threads.length > 0 && (
        <div className="mb-3 flex items-center justify-end gap-2">
          <Select
            value={chat.threadId ?? ''}
            ariaLabel="Conversation"
            align="right"
            className="max-w-52"
            onChange={(val) => chat.selectThread(val || null)}
            options={chat.threads.map((t) => ({ value: t.id, label: t.title }))}
          />
          <button
            onClick={() => chat.selectThread(null)}
            disabled={chat.threadId === null}
            className="bg-raised text-muted hover:text-ink rounded-[11px] px-3 py-1.5 text-[12.5px] transition-colors disabled:opacity-40"
          >
            New chat
          </button>
        </div>
      )}

      {disabled && (
        <div className="border-azure/40 bg-azure/10 mb-3 rounded-[14px] border px-3.5 py-2.5 text-[12.5px]">
          Add a Groq API key in Settings to turn the assistant on.
        </div>
      )}
      {chat.error && (
        <div className="border-coral/40 bg-coral/10 mb-3 rounded-[14px] border px-3.5 py-2.5 text-[12.5px]">
          {chat.error}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <ChatView
          messages={chat.messages}
          pending={chat.pending}
          disabled={disabled}
          disabledHint="Add a Groq key in Settings first."
          quickActions={compact ? undefined : QUICK_ACTIONS}
          onSend={(t) => void chat.send(t)}
          placeholder={compact ? 'Ask anything…' : 'Ask anything, or say what to add'}
        />
      </div>
    </div>
  )
}
