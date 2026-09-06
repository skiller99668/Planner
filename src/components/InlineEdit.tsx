// Click-to-edit text: a term's name, a course's code or name, a lecture's
// title. One component so all four commit identically — Enter or blur saves,
// Escape puts back what was there, an empty value is a cancel rather than a
// way to blank the row.
//
// Reading and editing carry the same typography on purpose. An inline editor
// that resizes its row when it opens reads as the text jumping out from under
// the pointer that just clicked it.

import { useEffect, useRef, useState } from 'react'

export default function InlineEdit({
  value,
  onCommit,
  ariaLabel,
  onActivate,
  editing,
  onEditingChange,
  className = '',
  placeholder = 'Untitled'
}: {
  value: string
  onCommit: (next: string) => void
  ariaLabel: string
  /** For rows whose click already means something (open the course, open the
   *  lecture): the click does that instead, and editing arrives through the
   *  controlled `editing` prop — the row's ··· menu flips it. */
  onActivate?: () => void
  editing?: boolean
  onEditingChange?: (editing: boolean) => void
  /** Typography, put on both states so entering edit doesn't reflow the row. */
  className?: string
  placeholder?: string
}) {
  const [selfEditing, setSelfEditing] = useState(false)
  const on = editing ?? selfEditing
  const setOn = (v: boolean) => (onEditingChange ? onEditingChange(v) : setSelfEditing(v))
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(value)
  // Escape leaves the field by blurring it, and that blur must not then commit
  // the very edit Escape just threw away.
  const reverting = useRef(false)

  // A value that changed elsewhere has to show through — but never while the
  // field is open under a cursor.
  useEffect(() => {
    if (!on) setDraft(value)
  }, [value, on])

  useEffect(() => {
    if (!on) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [on])

  if (!on) {
    return (
      <button
        type="button"
        title={onActivate ? undefined : 'Click to rename'}
        onClick={(e) => {
          e.stopPropagation() // the header behind this toggles on click
          if (onActivate) onActivate()
          else setOn(true)
        }}
        className={`-mx-1 min-w-0 truncate rounded-[7px] px-1 text-left ${className}`}
      >
        {value || <span className="text-faint">{placeholder}</span>}
      </button>
    )
  }

  const commit = () => {
    setOn(false)
    const next = draft.trim()
    if (!next || next === value) {
      setDraft(value)
      return
    }
    onCommit(next)
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (reverting.current) {
          reverting.current = false
          return
        }
        commit()
      }}
      onKeyDown={(e) => {
        // Both keys stop here: Enter must not reach a parent that would submit,
        // and Escape must not reach a bubble that would close the whole panel
        // out from under a rename.
        if (e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
          commit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          reverting.current = true
          setDraft(value)
          setOn(false)
        }
      }}
      className={`bg-bg focus:ring-azure/60 -mx-1 min-w-0 rounded-[7px] px-1 outline-none focus:ring-1 ${className}`}
    />
  )
}
