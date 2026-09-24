// Ctrl+K — go anywhere, run anything, find anything, or just type a task.
//
// The app had eleven navigation shortcuts and no way to *do* anything from the
// keyboard. This replaces the whole nav model with one keystroke, and folds in
// the two things that were missing entirely: search, and capture that doesn't
// require walking to the right page first.
//
// One input, three modes, chosen by what you've typed:
//   empty      → the action list (jump somewhere, run something)
//   a phrase   → matching actions, then search hits, then "create task …"
//   > prefix   → actions only, when a word collides with your data
//
// Creating is always the last option rather than the first: picking a wrong
// destination costs a keystroke, but creating a stray task costs a cleanup.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GymType, SearchHit, SearchModule } from '../../shared/types'
import { parseTask, reconcileTags } from '../../shared/parseTask'
import type { ModuleId } from './Sidebar'
import { formatBinding } from '../lib/keybinds'

export interface PaletteAction {
  id: string
  label: string
  /** Where it goes or what it does, shown on the right. */
  hint?: string
  group: 'Go to' | 'Create' | 'Log'
  keywords?: string
  run: () => void | Promise<void>
}

/** Which page a search hit opens. */
const MODULE_PAGE: Record<SearchModule, ModuleId> = {
  task: 'tasks',
  event: 'events',
  application: 'career',
  lecture: 'academics',
  leetcode: 'leetcode',
  goal: 'goals'
}

const MODULE_LABEL: Record<SearchModule, string> = {
  task: 'Task',
  event: 'Event',
  application: 'Application',
  lecture: 'Lecture',
  leetcode: 'LeetCode',
  goal: 'Goal'
}

type Row =
  | { kind: 'action'; action: PaletteAction }
  | { kind: 'hit'; hit: SearchHit }
  | { kind: 'create'; text: string }

export default function CommandPalette({
  open,
  onClose,
  onNavigate,
  onNewTask,
  binding
}: {
  open: boolean
  onClose: () => void
  onNavigate: (m: ModuleId) => void
  /** Opens the full task editor, for when the parsed line isn't enough. */
  onNewTask: () => void
  /** The effective Ctrl+K binding, shown as a hint in the footer. */
  binding: string
}) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)

  // Reset each time it opens — a palette that remembers last time's query is
  // a palette you have to clear before you can use it.
  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
      setHits([])
      void window.planner?.tagsList().then((t) => setTags(t.map((x) => x.name)))
    }
  }, [open])

  const go = useCallback(
    (m: ModuleId) => {
      onNavigate(m)
      onClose()
    },
    [onNavigate, onClose]
  )

  const actions = useMemo<PaletteAction[]>(
    () => [
      { id: 'go-dashboard', label: 'Today', group: 'Go to', keywords: 'home dashboard', run: () => go('dashboard') },
      { id: 'go-tasks', label: 'Tasks', group: 'Go to', keywords: 'todo', run: () => go('tasks') },
      { id: 'go-academics', label: 'Academics', group: 'Go to', keywords: 'courses lectures school', run: () => go('academics') },
      { id: 'go-gym', label: 'Gym', group: 'Go to', keywords: 'workout ppl', run: () => go('gym') },
      { id: 'go-events', label: 'Events', group: 'Go to', keywords: 'calendar tournaments', run: () => go('events') },
      { id: 'go-career', label: 'Career', group: 'Go to', keywords: 'internships jobs applications', run: () => go('career') },
      { id: 'go-leetcode', label: 'LeetCode', group: 'Go to', keywords: 'dsa problems', run: () => go('leetcode') },
      { id: 'go-goals', label: 'Goals', group: 'Go to', keywords: 'targets month progress', run: () => go('goals') },
      { id: 'go-journal', label: 'Journal', group: 'Go to', keywords: 'diary write private', run: () => go('journal') },
      { id: 'go-settings', label: 'Settings', group: 'Go to', keywords: 'preferences', run: () => go('settings') },
      {
        id: 'new-task',
        label: 'New task',
        hint: 'full editor',
        group: 'Create',
        keywords: 'add todo',
        run: () => {
          onNewTask()
          onClose()
        }
      },
      { id: 'new-event', label: 'New event', hint: 'opens the calendar', group: 'Create', keywords: 'add calendar', run: () => go('events') },
      ...(['push', 'pull', 'legs'] as GymType[]).map((type) => ({
        id: `log-${type}`,
        label: `Log ${type[0].toUpperCase()}${type.slice(1)}`,
        hint: 'gym',
        group: 'Log' as const,
        keywords: `gym workout ${type}`,
        run: async () => {
          const d = new Date()
          const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          await window.planner?.gymLog({ date: ymd, type })
          onClose()
        }
      })),
      { id: 'log-solve', label: 'Log a LeetCode solve', hint: 'leetcode', group: 'Log', keywords: 'dsa problem', run: () => go('leetcode') },
      { id: 'toggle-assistant', label: 'Assistant', hint: 'chat', group: 'Go to', keywords: 'ai groq ask', run: () => { window.dispatchEvent(new Event('planner:toggle-assistant')); onClose() } }
    ],
    [go, onClose, onNewTask]
  )

  // "> …" forces action mode, for when what you want to type is also a word
  // that lives in your data.
  const forced = query.startsWith('>')
  const term = (forced ? query.slice(1) : query).trim()

  const preview = useMemo(
    () => (term.length >= 2 && !forced ? parseTask(term) : null),
    [term, forced]
  )

  // Search the parsed *title*, not the raw line. Typing "report fri 5pm" is
  // still you looking for the report — sending the whole string would match
  // nothing and the existing task would vanish exactly as you added detail.
  const searchTerm = preview?.title || term

  // Debounced so a fast typist doesn't queue a query per keystroke.
  useEffect(() => {
    if (forced || searchTerm.length < 2) {
      setHits([])
      return
    }
    setBusy(true)
    const id = setTimeout(() => {
      void window.planner
        ?.searchAll(searchTerm)
        .then((r) => setHits(r))
        .catch(() => setHits([]))
        .finally(() => setBusy(false))
    }, 130)
    return () => clearTimeout(id)
  }, [searchTerm, forced])

  const matchedActions = useMemo(() => {
    if (!term) return actions
    const q = term.toLowerCase()
    return actions.filter(
      (a) => a.label.toLowerCase().includes(q) || (a.keywords ?? '').includes(q)
    )
  }, [actions, term])

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = matchedActions.map((action) => ({ kind: 'action', action }))
    if (!forced) {
      for (const hit of hits) out.push({ kind: 'hit', hit })
      // Only offer creation once there's something worth creating, and never
      // as the pre-selected row.
      if (term.length >= 2) out.push({ kind: 'create', text: term })
    }
    return out
  }, [matchedActions, hits, term, forced])

  // Keep the cursor inside the list as it changes shape under you.
  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, rows.length - 1)))
  }, [rows.length])

  useEffect(() => {
    listRef.current?.children[cursor]?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const commit = async (row: Row | undefined) => {
    if (!row) return
    if (row.kind === 'action') return void row.action.run()
    if (row.kind === 'hit') return go(MODULE_PAGE[row.hit.module])
    const p = parseTask(row.text)
    if (!p.title) return
    await window.planner?.tasksCreate({
      title: p.title,
      dueDate: p.dueDate,
      dueTime: p.dueTime,
      priority: p.priority,
      tags: reconcileTags(p.tags ?? [], tags)
    })
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/45 px-4 pt-[12vh]"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="surface-raised animate-pop flex w-full max-w-[560px] flex-col overflow-hidden p-0"
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setCursor(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
              e.preventDefault()
              setCursor((c) => (rows.length ? (c + 1) % rows.length : 0))
            } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
              e.preventDefault()
              setCursor((c) => (rows.length ? (c - 1 + rows.length) % rows.length : 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              void commit(rows[cursor])
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
          placeholder="Search, jump, or type a task…"
          aria-label="Command palette"
          className="text-body placeholder:text-faint border-line w-full border-b bg-transparent px-4 py-3.5 outline-none"
        />

        {rows.length === 0 ? (
          <p className="text-muted text-body px-4 py-6 text-center">
            {busy ? 'Searching…' : term ? `Nothing matches “${term}”.` : 'Start typing.'}
          </p>
        ) : (
          <ul ref={listRef} className="max-h-[46vh] overflow-y-auto py-1.5">
            {rows.map((row, i) => (
              <li key={rowKey(row, i)}>
                <button
                  onMouseMove={() => setCursor(i)}
                  onClick={() => void commit(row)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                    i === cursor ? 'bg-surface' : ''
                  }`}
                >
                  {/* The preview is always passed, not just on the selected
                      row — a create row showing the raw line would advertise
                      "report fri 5pm !high" as the task's title. */}
                  <RowBody row={row} preview={preview} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="border-line text-micro text-faint flex items-center gap-4 border-t px-4 py-2">
          <span>
            <Key>↑</Key> <Key>↓</Key> move
          </span>
          <span>
            <Key>↵</Key> open
          </span>
          <span>
            <Key>&gt;</Key> actions only
          </span>
          <span className="ml-auto">{formatBinding(binding)}</span>
        </div>
      </div>
    </div>
  )
}

function rowKey(row: Row, i: number): string {
  if (row.kind === 'action') return row.action.id
  if (row.kind === 'hit') return `${row.hit.module}-${row.hit.id}`
  return `create-${i}`
}

function RowBody({ row, preview }: { row: Row; preview: ReturnType<typeof parseTask> | null }) {
  if (row.kind === 'action') {
    return (
      <>
        <span className="text-faint text-micro w-12 shrink-0 uppercase">{row.action.group}</span>
        <span className="text-body min-w-0 flex-1 truncate">{row.action.label}</span>
        {row.action.hint && <span className="text-faint text-meta shrink-0">{row.action.hint}</span>}
      </>
    )
  }

  if (row.kind === 'hit') {
    return (
      <>
        <span className="text-faint text-micro w-12 shrink-0 uppercase">
          {MODULE_LABEL[row.hit.module]}
        </span>
        <span className={`text-body min-w-0 flex-1 truncate ${row.hit.done ? 'text-muted line-through' : ''}`}>
          {row.hit.title}
        </span>
        {row.hit.subtitle && (
          <span className="text-faint text-meta shrink-0 truncate">{row.hit.subtitle}</span>
        )}
      </>
    )
  }

  // Creation: show what the parser understood, so you can trust it before
  // committing rather than checking afterwards.
  return (
    <>
      <span className="text-azure text-micro w-12 shrink-0 uppercase">New</span>
      <span className="text-body min-w-0 flex-1 truncate">
        {preview?.title || row.text}
      </span>
      {preview && preview.matched.length > 0 && (
        <span className="flex shrink-0 gap-1">
          {preview.matched.map((m) => (
            <span
              key={m.label}
              className="bg-azure/15 text-azure text-micro rounded-full px-1.5 py-0.5 font-medium"
            >
              {m.label}
            </span>
          ))}
        </span>
      )}
    </>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="bg-surface text-muted rounded-[5px] px-1.5 py-0.5 font-sans text-[10px]">
      {children}
    </kbd>
  )
}
