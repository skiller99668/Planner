// Shared anchoring for the app's custom popups (Select, DateField, TimeField).
//
// The popup is `fixed` and positioned from the trigger's measured rect so it
// escapes overflow containers, flips above the trigger when short on room,
// and closes on outside click, Escape, scroll or resize.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

// How many popups are open right now, anywhere in the app.
//
// Escape belongs to the innermost open thing. A form that closes on Escape has
// no other way to know a calendar is hanging off one of its fields — the popup
// is a sibling in the DOM, and the key lands on the trigger, not inside it. So
// the popups keep this count, and a form asks before acting on its own Escape.
let openPopovers = 0

/** True while any popup (Select, DateField, TimeField, day bubble) is open. */
export function popoverIsOpen(): boolean {
  return openPopovers > 0
}

/** Count this popup as open for as long as it is. */
function useOpenRegistration(open: boolean): void {
  useEffect(() => {
    if (!open) return
    openPopovers++
    return () => {
      openPopovers--
    }
  }, [open])
}

export interface PopoverAnchor<T extends HTMLElement> {
  open: boolean
  openPopup: () => void
  close: () => void
  toggle: () => void
  triggerRef: React.RefObject<T | null>
  popupRef: React.RefObject<HTMLDivElement | null>
  /** Style for the popup element; spread onto its `style`. */
  popupStyle: React.CSSProperties
}

/** `T` is the element the popup measures from — a button, or a field wrapper. */
export function usePopoverAnchor<T extends HTMLElement = HTMLButtonElement>(
  align: 'left' | 'right' = 'left'
): PopoverAnchor<T> {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [flip, setFlip] = useState(false)
  const triggerRef = useRef<T>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  useOpenRegistration(open)

  const openPopup = useCallback(() => {
    setRect(triggerRef.current?.getBoundingClientRect() ?? null)
    setOpen(true)
  }, [])
  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => (open ? close() : openPopup()), [open, close, openPopup])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node
      if (!popupRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    // The popup detaches from its trigger when the page scrolls, so close it —
    // but NOT when the scroll happens inside the popup's own scrollable list.
    const onScroll = (e: Event) => {
      const t = e.target as Node | null
      if (t && popupRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, close])

  useLayoutEffect(() => {
    if (!open || !rect) return
    const h = popupRef.current?.offsetHeight ?? 0
    setFlip(rect.bottom + h + 8 > window.innerHeight && rect.top > h)
  }, [open, rect])

  const popupStyle: React.CSSProperties = rect
    ? {
        top: flip ? undefined : rect.bottom + 6,
        bottom: flip ? window.innerHeight - rect.top + 6 : undefined,
        left: align === 'left' ? rect.left : undefined,
        right: align === 'right' ? window.innerWidth - rect.right : undefined,
        minWidth: rect.width
      }
    : {}

  return { open, openPopup, close, toggle, triggerRef, popupRef, popupStyle }
}

/** The dismissal rules above, for a popup anchored to a measured rect rather
 *  than a ref'd trigger — a bubble opened on whichever calendar day was
 *  clicked, where the trigger is one of many and known only at click time. */
export function useDismiss(
  open: boolean,
  close: () => void,
  popupRef: React.RefObject<HTMLElement | null>
): void {
  useOpenRegistration(open)
  useEffect(() => {
    if (!open) return
    const outside = (t: Node | null) => !t || !popupRef.current?.contains(t)
    const onPointer = (e: PointerEvent) => {
      if (outside(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const onScroll = (e: Event) => {
      if (outside(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, close, popupRef])
}

/** Close an open panel when the pointer goes down outside it, and let that same
 *  press carry on to whatever it landed on.
 *
 *  The click is deliberately not swallowed: clicking another task should both
 *  back out of this editor and open that one, in a single motion. Closing
 *  happens on `pointerdown` so the panel is already gone by the time the click
 *  resolves — otherwise both editors would sit open at once.
 *
 *  A press inside a calendar or dropdown hanging off the panel is not outside
 *  it — those render as descendants, and `popoverIsOpen()` covers the moment
 *  one is closing under the same press. */
export function useDismissOnOutsidePress(
  ref: React.RefObject<HTMLElement | null>,
  close: () => void,
  active = true
): void {
  useEffect(() => {
    if (!active) return
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      const target = e.target as Node | null
      if (!target || ref.current?.contains(target)) return
      if (popoverIsOpen()) return
      close()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [ref, close, active])
}

/** Fixed placement beside an arbitrary rect: below it when there's room, above
 *  when there isn't, always clamped inside the viewport. The popup is measured
 *  after each render, so it stays right when its own content grows. */
export function useAnchoredStyle(
  rect: DOMRect | null,
  popupRef: React.RefObject<HTMLElement | null>,
  width: number
): React.CSSProperties {
  const [height, setHeight] = useState(0)
  useLayoutEffect(() => {
    const h = popupRef.current?.offsetHeight
    if (h && h !== height) setHeight(h)
  })

  if (!rect) return {}
  const gap = 6
  const flip = rect.bottom + height + gap > window.innerHeight && rect.top > height
  return {
    width,
    left: Math.min(Math.max(8, rect.left - 6), Math.max(8, window.innerWidth - width - 8)),
    top: flip
      ? Math.max(8, rect.top - height - gap)
      : Math.min(rect.bottom + gap, Math.max(8, window.innerHeight - height - 8))
  }
}

/** Shared chrome for a popup panel. */
export const POPUP_CLASS =
  'bg-raised animate-pop fixed z-50 rounded-[16px] p-2 shadow-[var(--shadow-lift)]'

/** Shared chrome for a field trigger button. */
export const FIELD_CLASS =
  'bg-bg tactile flex items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-left text-[13.5px] disabled:opacity-40'

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
