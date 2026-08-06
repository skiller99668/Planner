// The app-wide assistant drawer: slides in from the right over any page. Stays
// mounted (just translated off-screen) so the conversation is never torn down.

import { useEffect } from 'react'
import AssistantChat from './AssistantChat'
import { useAssistant } from './AssistantProvider'

export default function AssistantPanel() {
  const { open, setOpen } = useAssistant()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  return (
    <>
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        role="dialog"
        aria-label="Assistant"
        aria-hidden={!open}
        className={`bg-surface fixed top-0 right-0 z-50 flex h-full w-[380px] max-w-[88vw] flex-col shadow-[var(--shadow-lift)] transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="border-line flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-[15px] font-bold">Assistant</h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close assistant"
            className="text-muted hover:text-ink tactile border-line rounded-[8px] border px-2 py-0.5 text-[11.5px] font-semibold"
          >
            Esc
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <AssistantChat />
        </div>
      </aside>
    </>
  )
}
