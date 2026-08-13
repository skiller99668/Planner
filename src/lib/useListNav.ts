// Roving keyboard focus over a list, with single-key actions on the focused row.
//
// The palette got you to a page in one keystroke; this is what makes the page
// worth arriving at. j/k move, x completes, e edits, Enter opens — the
// vocabulary is Vim's where Vim has one and Gmail's otherwise, because those
// are the two every keyboard-driven app already borrows from.
//
// Bare keys, so the guard against stealing keystrokes from a focused field is
// not optional. isEditableTarget is the same check the global shortcuts use.

import { useCallback, useEffect, useRef, useState } from 'react'
import { isEditableTarget } from './keybinds'

export interface ListNavActions {
  /** Enter, or o. */
  onOpen?: (id: string) => void
  /** x — tick it off. */
  onComplete?: (id: string) => void
  /** e — open the inline editor. */
  onEdit?: (id: string) => void
  /** # or Delete. */
  onDelete?: (id: string) => void
  /** Alt+↑/↓ — the keyboard's version of dragging the row up or down. */
  onMove?: (id: string, delta: -1 | 1) => void
}

export interface ListNav {
  /** The row currently under the cursor, or null before any key is pressed. */
  activeId: string | null
  setActiveId: (id: string | null) => void
  /** Spread onto each row's container to keep mouse and keyboard in sync. */
  rowProps: (id: string) => { onMouseEnter: () => void; 'data-listnav': string }
}

/**
 * `ids` must be in the order the rows appear on screen — the hook doesn't know
 * about your buckets or sorting, only about which row comes next.
 *
 * `enabled` lets a page switch the bindings off while a modal or inline editor
 * owns the keyboard.
 */
export function useListNav(
  ids: string[],
  actions: ListNavActions,
  enabled = true
): ListNav {
  const [activeId, setActiveId] = useState<string | null>(null)

  // Read inside the handler rather than re-subscribing on every list change —
  // ids churn on each refetch and rebinding a window listener that often is
  // both wasteful and racy.
  const ref = useRef({ ids, actions, activeId })
  ref.current = { ids, actions, activeId }

  const move = useCallback((delta: number) => {
    const { ids: list, activeId: current } = ref.current
    if (list.length === 0) return
    const i = current ? list.indexOf(current) : -1
    // From nowhere, j enters at the top and k at the bottom.
    const next = i === -1 ? (delta > 0 ? 0 : list.length - 1) : i + delta
    setActiveId(list[Math.max(0, Math.min(list.length - 1, next))])
  }, [])

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return
      if (isEditableTarget(e.target)) return

      const { activeId: current, actions: act, ids: list } = ref.current

      // Alt+arrow reorders — checked before the modifier guard below, since
      // it's the one binding here that wants a modifier held.
      if (
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
        act.onMove &&
        current &&
        list.includes(current)
      ) {
        e.preventDefault()
        act.onMove(current, e.key === 'ArrowDown' ? 1 : -1)
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        move(1)
        return
      }
      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        move(-1)
        return
      }
      if (e.key === 'Escape' && current) {
        setActiveId(null)
        return
      }
      if (!current || !list.includes(current)) return

      if (e.key === 'x' && act.onComplete) {
        e.preventDefault()
        // Step to the next row first: the one being completed is about to
        // leave the list, and a cursor pointing at nothing feels broken.
        const i = list.indexOf(current)
        setActiveId(list[i + 1] ?? list[i - 1] ?? null)
        act.onComplete(current)
      } else if (e.key === 'e' && act.onEdit) {
        e.preventDefault()
        act.onEdit(current)
      } else if ((e.key === 'Enter' || e.key === 'o') && act.onOpen) {
        e.preventDefault()
        act.onOpen(current)
      } else if ((e.key === '#' || e.key === 'Delete') && act.onDelete) {
        e.preventDefault()
        act.onDelete(current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, move])

  // Drop the cursor when its row disappears (completed, filtered, refetched).
  useEffect(() => {
    if (activeId && !ids.includes(activeId)) setActiveId(null)
  }, [ids, activeId])

  // Keep the focused row on screen when it moved by keyboard.
  useEffect(() => {
    if (!activeId) return
    document
      .querySelector(`[data-listnav="${CSS.escape(activeId)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  const rowProps = useCallback(
    (id: string) => ({
      onMouseEnter: () => setActiveId(id),
      'data-listnav': id
    }),
    []
  )

  return { activeId, setActiveId, rowProps }
}
