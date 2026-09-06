// Drag one row of a list into a new position, with the rows it passes sliding
// out of the way.
//
// Transforms are written straight to the DOM instead of through state: a
// pointermove that re-rendered every row would stutter under the very finger
// doing the dragging. React only hears about the drag twice — when it picks up
// and when it drops — so the rows keep their own state (an open editor, a
// mid-flight completion burst) right through the gesture.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from 'react'

/** How close to the scroller's edge the pointer must get before the list
 *  starts following it, and how fast it moves there. */
const EDGE = 56
const EDGE_SPEED = 14

export interface DragSort {
  /** Put on the element that wraps the rows. */
  listRef: RefObject<HTMLUListElement | null>
  /** The row currently under the finger, or null. */
  draggingId: string | null
  /** Spread onto each row element. */
  rowProps: (id: string) => { 'data-dragsort': string }
  /** Spread onto the grip that starts a drag. */
  handleProps: (id: string) => {
    onPointerDown: (e: ReactPointerEvent) => void
    style: CSSProperties
  }
}

interface Row {
  id: string
  el: HTMLElement
  /** Offset from the top of the list, so scrolling can't invalidate it. */
  top: number
  height: number
}

interface DragState {
  id: string
  from: number
  to: number
  rows: Row[]
  /** How far the other rows step aside: the dragged row's height plus the gap. */
  lift: number
  /** Where the pointer grabbed, relative to the top of the list. */
  startY: number
  /** Latest pointer position in client coordinates. */
  pointerY: number
  scroller: HTMLElement | null
}

/**
 * `ids` must be in the order the rows are rendered. `onCommit` receives the
 * full list in its new order, and is only called when something actually moved.
 */
export function useDragSort(ids: string[], onCommit: (ordered: string[]) => void): DragSort {
  const listRef = useRef<HTMLUListElement | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const drag = useRef<DragState | null>(null)
  // Read inside the gesture rather than re-subscribing mid-drag.
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit

  /** Put every row back the way we found it. Returns the finished drag. */
  const release = useCallback((): DragState | null => {
    const s = drag.current
    drag.current = null
    setDraggingId(null)
    document.body.style.userSelect = ''
    if (!s) return null
    for (const row of s.rows) {
      // Transitions off first: the rows are about to be re-rendered in their
      // new order, and animating them back to zero would read as a snap-back.
      row.el.style.transition = 'none'
      row.el.style.transform = ''
      row.el.style.position = ''
      row.el.style.zIndex = ''
    }
    requestAnimationFrame(() => {
      for (const row of s.rows) row.el.style.transition = ''
    })
    return s
  }, [])

  const start = useCallback(
    (id: string, e: ReactPointerEvent) => {
      if (e.button !== 0 || drag.current) return
      const list = listRef.current
      if (!list) return

      const listTop = list.getBoundingClientRect().top
      // `:scope >` and not a bare selector: a sortable list can contain
      // another one (a shelf of courses inside a shelf of terms), and an
      // unscoped query would pull the inner rows into the outer drag.
      const rows: Row[] = Array.from(
        list.querySelectorAll<HTMLElement>(':scope > [data-dragsort]')
      ).map((el) => {
        const r = el.getBoundingClientRect()
        return { id: el.dataset.dragsort ?? '', el, top: r.top - listTop, height: r.height }
      })
      const from = rows.findIndex((r) => r.id === id)
      if (from === -1 || rows.length < 2) return

      e.preventDefault()
      try {
        // Keeps the gesture with the grip even when the pointer outruns it.
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // Pointer already gone; the window listeners still carry the drag.
      }
      const gap = Math.max(0, rows[1].top - (rows[0].top + rows[0].height))
      drag.current = {
        id,
        from,
        to: from,
        rows,
        lift: rows[from].height + gap,
        startY: e.clientY - listTop,
        pointerY: e.clientY,
        scroller: scrollParent(list)
      }
      const lifted = rows[from].el
      lifted.style.transition = 'none' // it tracks the pointer, it doesn't chase it
      lifted.style.position = 'relative'
      lifted.style.zIndex = '20'
      document.body.style.userSelect = 'none'
      setDraggingId(id)
    },
    []
  )

  useEffect(() => {
    if (!draggingId) return

    const onMove = (e: PointerEvent) => {
      if (drag.current) drag.current.pointerY = e.clientY
    }
    const onUp = () => {
      const s = release()
      if (!s || s.to === s.from) return
      const ordered = s.rows.map((r) => r.id)
      const [moved] = ordered.splice(s.from, 1)
      ordered.splice(s.to, 0, moved)
      commitRef.current(ordered)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') release() // dropped where it started
    }

    // One loop drives everything: it follows the pointer, and near the edge of
    // the scroller it drags the list along too, which moves the pointer's
    // position relative to the rows without any pointermove firing.
    let raf = 0
    const frame = () => {
      const s = drag.current
      const list = listRef.current
      if (s && list) {
        autoScroll(s)
        place(s, s.pointerY - list.getBoundingClientRect().top - s.startY)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey)
      // Torn down mid-gesture (navigated away, list swapped out): drop the
      // drag rather than leave the whole app unselectable.
      release()
    }
  }, [draggingId, release])

  // The row went away underneath us (completed elsewhere, filtered, refetched).
  useEffect(() => {
    if (draggingId && !ids.includes(draggingId)) release()
  }, [ids, draggingId, release])

  const rowProps = useCallback((id: string) => ({ 'data-dragsort': id }), [])
  const handleProps = useCallback(
    (id: string) => ({
      onPointerDown: (e: ReactPointerEvent) => start(id, e),
      // Own the gesture: without this a drag scrolls the page on touch input.
      style: { touchAction: 'none' as const }
    }),
    [start]
  )

  return { listRef, draggingId, rowProps, handleProps }
}

/** Lay the rows out for a drag that has moved `dy` from where it started. */
function place(s: DragState, dy: number): void {
  const dragged = s.rows[s.from]
  const center = dragged.top + dragged.height / 2 + dy
  // Measured against where each row started, not where it currently sits —
  // otherwise a row that just stepped aside would immediately swap back.
  let to = s.from
  for (let i = s.from + 1; i < s.rows.length; i++) {
    if (center > s.rows[i].top + s.rows[i].height / 2) to = i
  }
  for (let i = s.from - 1; i >= 0; i--) {
    if (center < s.rows[i].top + s.rows[i].height / 2) to = i
  }
  s.to = to

  for (let i = 0; i < s.rows.length; i++) {
    let shift = 0
    if (i === s.from) shift = dy
    else if (to > s.from && i > s.from && i <= to) shift = -s.lift
    else if (to < s.from && i >= to && i < s.from) shift = s.lift
    const next = shift ? `translateY(${Math.round(shift)}px)` : ''
    if (s.rows[i].el.style.transform !== next) s.rows[i].el.style.transform = next
  }
}

/** Creep the list along when the drag reaches the top or bottom of the view. */
function autoScroll(s: DragState): void {
  if (!s.scroller) return
  const r = s.scroller.getBoundingClientRect()
  const above = s.pointerY - r.top
  const below = r.bottom - s.pointerY
  if (above < EDGE) {
    s.scroller.scrollTop -= EDGE_SPEED * (1 - Math.max(above, 0) / EDGE)
  } else if (below < EDGE) {
    s.scroller.scrollTop += EDGE_SPEED * (1 - Math.max(below, 0) / EDGE)
  }
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement
  while (p) {
    const overflow = getComputedStyle(p).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && p.scrollHeight > p.clientHeight) {
      return p
    }
    p = p.parentElement
  }
  return null
}
