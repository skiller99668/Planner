// Renderer-side keyboard-shortcut registry + (de)serialization helpers.
//
// This module is the single source of truth for shortcut *defaults* and their
// display metadata. Settings only persists user overrides (see Settings.keybinds),
// so the effective binding for an action is `overrides[id] ?? registry default`.
// Adding a new shortcut is one entry in KEYBIND_ACTIONS.

export type KeybindAction =
  | 'commandPalette'
  | 'newTask'
  | 'focusTagFilter'
  | 'toggleAssistant'
  | 'toggleShortcutHelp'
  | 'goDashboard'
  | 'goTasks'
  | 'goAcademics'
  | 'goGym'
  | 'goEvents'
  | 'goCareer'
  | 'goLeetcode'
  | 'goSettings'

export interface KeybindDef {
  id: KeybindAction
  label: string
  hint: string
  /** Section heading used by the Settings rebinder and the cheat sheet. */
  group: string
  /** Default binding string in canonical form (see eventToBinding). */
  default: string
}

export const KEYBIND_ACTIONS: readonly KeybindDef[] = [
  {
    id: 'commandPalette',
    label: 'Command palette',
    hint: 'Go anywhere, run anything, or search — type to create a task.',
    group: 'General',
    default: 'ctrl+k'
  },
  {
    id: 'newTask',
    label: 'New task',
    hint: 'Jump to Tasks and open the new-task editor.',
    group: 'General',
    default: 'ctrl+t'
  },
  {
    id: 'focusTagFilter',
    label: 'Filter tasks by tag',
    hint: 'Jump to Tasks and focus the tag filter row.',
    group: 'General',
    default: '/'
  },
  {
    id: 'toggleAssistant',
    label: 'Assistant',
    hint: 'Open or close the assistant panel from anywhere.',
    group: 'General',
    default: 'ctrl+a'
  },
  {
    id: 'toggleShortcutHelp',
    label: 'Show shortcuts',
    hint: 'Open this keyboard-shortcut cheat sheet from anywhere.',
    group: 'General',
    default: 'shift+?'
  },
  { id: 'goDashboard', label: 'Go to Today', hint: '', group: 'Go to page', default: 'ctrl+1' },
  { id: 'goTasks', label: 'Go to Tasks', hint: '', group: 'Go to page', default: 'ctrl+2' },
  { id: 'goAcademics', label: 'Go to Academics', hint: '', group: 'Go to page', default: 'ctrl+3' },
  { id: 'goGym', label: 'Go to Gym', hint: '', group: 'Go to page', default: 'ctrl+4' },
  { id: 'goEvents', label: 'Go to Events', hint: '', group: 'Go to page', default: 'ctrl+5' },
  { id: 'goCareer', label: 'Go to Career', hint: '', group: 'Go to page', default: 'ctrl+6' },
  { id: 'goLeetcode', label: 'Go to LeetCode', hint: '', group: 'Go to page', default: 'ctrl+7' },
  { id: 'goSettings', label: 'Go to Settings', hint: '', group: 'Go to page', default: 'ctrl+8' }
]

/** Registry groups in display order (first appearance wins). */
export const KEYBIND_GROUPS: string[] = [...new Set(KEYBIND_ACTIONS.map((a) => a.group))]

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta'])
const MOD_LABELS: Record<string, string> = {
  ctrl: 'Ctrl',
  alt: 'Alt',
  meta: 'Meta',
  shift: 'Shift'
}

/**
 * Serialize a keydown into a canonical binding string: modifiers in a fixed
 * order followed by the key, all lowercase and joined by '+', e.g. "ctrl+n".
 * Returns null while only a modifier is held (so recorders keep listening).
 */
export function eventToBinding(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null
  const parts: string[] = []
  if (e.ctrlKey) parts.push('ctrl')
  if (e.altKey) parts.push('alt')
  if (e.metaKey) parts.push('meta')
  if (e.shiftKey) parts.push('shift')
  parts.push(normalizeKey(e.key))
  return parts.join('+')
}

function normalizeKey(k: string): string {
  return k === ' ' ? 'space' : k.toLowerCase()
}

/** True when a live keydown matches a stored binding string exactly. */
export function matchesBinding(e: KeyboardEvent, binding: string): boolean {
  return eventToBinding(e) === binding
}

/**
 * A binding is "global" — allowed to fire even while an input is focused — when
 * it carries a non-shift modifier. Bare keys (and shift+key) must never steal
 * keystrokes from a field the user is typing in.
 */
export function isGlobalBinding(binding: string): boolean {
  return /(?:^|\+)(?:ctrl|alt|meta)(?:\+|$)/.test(binding)
}

/** Human-readable binding, e.g. "Ctrl + N" or "N". */
export function formatBinding(binding: string): string {
  return binding
    .split('+')
    .map((p) => MOD_LABELS[p] ?? (p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)))
    .join(' + ')
}

/** Whether an event target is a field that should swallow bare-key shortcuts. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable === true
  )
}

/** Effective binding for an action: user override, else the registry default. */
export function bindingFor(id: KeybindAction, overrides: Record<string, string> | undefined): string {
  const def = KEYBIND_ACTIONS.find((a) => a.id === id)
  return overrides?.[id] ?? def?.default ?? ''
}
