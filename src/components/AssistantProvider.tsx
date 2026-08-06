// One shared general-assistant chat for the whole app. The dashboard box and
// the slide-in panel both consume this, so they're always the same
// conversation. Panel open/close lives here too, toggled from the sidebar
// button, the dashboard "expand", or the keyboard shortcut (via a window event).

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useChat, type ChatStore } from '../lib/useChat'

interface AssistantCtx {
  chat: ChatStore
  configured: boolean | null
  open: boolean
  setOpen: (v: boolean) => void
  toggle: () => void
}

const Ctx = createContext<AssistantCtx | null>(null)

export function AssistantProvider({ children }: { children: ReactNode }) {
  const chat = useChat('general', null)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const check = () =>
      window.planner
        ?.groqStatus()
        .then((s) => setConfigured(s.configured))
        .catch(() => setConfigured(false))
    check()
    // The keyboard shortcut lives in App (outside this provider), so it asks to
    // toggle via a window event; re-check the key after Settings changes.
    const onToggle = () => setOpen((o) => !o)
    window.addEventListener('planner:toggle-assistant', onToggle)
    window.addEventListener('planner:settings-changed', check)
    return () => {
      window.removeEventListener('planner:toggle-assistant', onToggle)
      window.removeEventListener('planner:settings-changed', check)
    }
  }, [])

  return (
    <Ctx.Provider value={{ chat, configured, open, setOpen, toggle: () => setOpen((o) => !o) }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAssistant(): AssistantCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAssistant must be used within AssistantProvider')
  return v
}
