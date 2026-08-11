// The global capture bar — its own tiny always-on-top window, summoned by an
// OS hotkey from inside whatever you were doing.
//
// One job: get a thought out of your head and into the DB without breaking
// what you were working on. So there is one field, no navigation, no list, and
// it dismisses itself the instant it's done. The parser does the structuring,
// and its chips show what was understood so you never have to open the app to
// check whether the date landed.

import { useEffect, useRef, useState } from 'react'
import { parseTask, reconcileTags } from '../../shared/parseTask'

export default function CaptureBar() {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void window.planner?.tagsList().then((t) => setTags(t.map((x) => x.name)))
    // Re-summoned: clear whatever was left and take the caret back. The window
    // is hidden rather than destroyed, so without this you'd return to stale text.
    return window.planner?.onCaptureReset(() => {
      setText('')
      setSaved(false)
      inputRef.current?.focus()
    })
  }, [])

  const parsed = text.trim().length > 0 ? parseTask(text) : null
  const canSave = (parsed?.title ?? '').length > 0

  const dismiss = () => void window.planner?.captureDismiss()

  const save = async () => {
    if (!canSave || !parsed) return
    await window.planner?.tasksCreate({
      title: parsed.title,
      dueDate: parsed.dueDate,
      dueTime: parsed.dueTime,
      priority: parsed.priority,
      tags: reconcileTags(parsed.tags ?? [], tags)
    })
    setText('')
    // A confirmation you'd have to read is a confirmation that costs you the
    // thing capture is for; flash it and get out of the way.
    setSaved(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => {
      setSaved(false)
      dismiss()
    }, 550)
  }

  return (
    // The window itself is transparent; this panel is the whole visible surface.
    <div className="flex h-screen w-screen items-start justify-center p-3">
      <div className="surface-raised w-full overflow-hidden p-0">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <span
            aria-hidden
            className={`h-2.5 w-2.5 shrink-0 rounded-full transition-colors ${
              saved ? 'bg-mint' : 'bg-azure'
            }`}
          />
          <input
            ref={inputRef}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void save()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                dismiss()
              }
            }}
            placeholder={saved ? 'Saved' : 'What needs doing?'}
            aria-label="Capture a task"
            className="text-title placeholder:text-faint min-w-0 flex-1 bg-transparent outline-none"
          />
        </div>

        {/* Only appears once the parser has actually found something, so the
            bar stays a single line for the common case. */}
        {parsed && parsed.matched.length > 0 && (
          <div className="border-line flex flex-wrap items-center gap-1.5 border-t px-4 py-2">
            <span className="text-faint text-micro mr-1">Understood</span>
            {parsed.matched.map((m) => (
              <span
                key={m.label}
                className="bg-azure/15 text-azure text-micro rounded-full px-2 py-0.5 font-medium"
              >
                {m.label}
              </span>
            ))}
            <span className="text-faint text-micro ml-auto">
              {parsed.title || '(no title yet)'}
            </span>
          </div>
        )}

        <div className="border-line text-micro text-faint flex items-center gap-4 border-t px-4 py-2">
          <span>
            <Key>↵</Key> save
          </span>
          <span>
            <Key>Esc</Key> dismiss
          </span>
          <span className="ml-auto">fri · 5pm · !high · #tag</span>
        </div>
      </div>
    </div>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="bg-surface text-muted rounded-[5px] px-1.5 py-0.5 font-sans text-[10px]">
      {children}
    </kbd>
  )
}
