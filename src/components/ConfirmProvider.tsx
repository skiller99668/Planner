// In-app confirmation, replacing window.confirm.
//
// The native dialog blocks the renderer thread and is drawn by the OS — it
// looks foreign next to the rest of the app, and firing several in a row
// (deleting tags one after another) can leave the window not accepting input.
// This is a promise-based replacement: `await confirm({...})`.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export interface ConfirmOptions {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Styles the confirm button as destructive. */
  danger?: boolean
}

type Resolver = (ok: boolean) => void

const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false)

export function useConfirm() {
  return useContext(ConfirmContext)
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<Resolver | null>(null)
  const confirmBtn = useRef<HTMLButtonElement>(null)

  const confirm = useCallback((o: ConfirmOptions) => {
    setOptions(o)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setOptions(null)
  }, [])

  useEffect(() => {
    if (!options) return
    confirmBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settle(false)
      else if (e.key === 'Enter') settle(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [options, settle])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-6"
          onClick={() => settle(false)}
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={options.title}
            onClick={(e) => e.stopPropagation()}
            className="bg-surface animate-pop w-full max-w-sm rounded-[18px] p-5 shadow-[var(--shadow-lift)]"
          >
            <p className="text-[15px] font-bold">{options.title}</p>
            {options.body && (
              <p className="text-muted mt-1.5 text-[13px] leading-relaxed">{options.body}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => settle(false)}
                className="tactile text-muted hover:text-ink rounded-[11px] px-3.5 py-2 text-[13px] font-medium"
              >
                {options.cancelLabel ?? 'Cancel'}
              </button>
              <button
                ref={confirmBtn}
                onClick={() => settle(true)}
                className={`tactile rounded-[11px] px-4 py-2 text-[13px] font-bold ${
                  options.danger ? 'bg-coral text-bg' : 'btn-primary'
                }`}
              >
                {options.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
