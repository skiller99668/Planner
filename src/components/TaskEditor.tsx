// Shared form for: quick-add details (create), editing a task, editing a series.
// Dumb component — the page converts FormValues to TaskInput / SeriesInput.

import { useState } from 'react'
import type { Priority, Task, TaskSeries } from '../../shared/types'
import { hmOfIso, todayYMD, ymdOfIso } from '../lib/dates'

export type EditorMode = 'create' | 'task' | 'series'

export interface FormValues {
  title: string
  notes: string
  dueDate: string // '' = none
  dueTime: string // '' = none
  priority: Priority
  tags: string[]
  reminderOffset: string // '' = none; minutes as string otherwise
  freq: 'none' | 'daily' | 'weekly' | 'monthly'
  interval: number
  weekdays: number[] // 0=Mon..6=Sun
  endDate: string // '' = open-ended (series only)
}

export function emptyForm(title = ''): FormValues {
  return {
    title,
    notes: '',
    dueDate: '',
    dueTime: '',
    priority: 0,
    tags: [],
    reminderOffset: '',
    freq: 'none',
    interval: 1,
    weekdays: [],
    endDate: ''
  }
}

export function taskToForm(t: Task): FormValues {
  const offset =
    t.reminderAt && t.dueAt
      ? String(
          Math.round((new Date(t.dueAt).getTime() - new Date(t.reminderAt).getTime()) / 60_000)
        )
      : ''
  return {
    ...emptyForm(t.title),
    notes: t.notes ?? '',
    dueDate: t.dueAt ? ymdOfIso(t.dueAt) : '',
    dueTime: t.dueAt && !t.allDay ? hmOfIso(t.dueAt) : '',
    priority: t.priority,
    tags: t.tags,
    reminderOffset: offset
  }
}

export function seriesToForm(s: TaskSeries): FormValues {
  return {
    title: s.title,
    notes: s.notes ?? '',
    dueDate: s.startDate,
    dueTime: s.dueTime ?? '',
    priority: s.priority,
    tags: s.tags,
    reminderOffset: s.reminderOffsetMin != null ? String(s.reminderOffsetMin) : '',
    freq: s.rule.freq,
    interval: s.rule.interval,
    weekdays: s.rule.byWeekdays,
    endDate: s.endDate ?? ''
  }
}

/** Tags are lowercase-kebab so "ECSE 200" and "ecse-200" never split in two. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-+#.]/g, '')
    .slice(0, 24)
}

const MAX_TAGS = 6

const inputCls =
  'bg-bg rounded-[10px] px-3 py-2 text-[13.5px] placeholder:text-faint outline-none focus:ring-1 focus:ring-clay/60'
const labelCls = 'text-muted mb-1.5 block text-[12px] font-semibold'
// Display order Sun..Sat (Skyler's week convention); values stay 0=Mon..6=Sun.
const WEEKDAY_ORDER = [6, 0, 1, 2, 3, 4, 5]
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export default function TaskEditor({
  mode,
  initial,
  submitLabel,
  knownTags = [],
  onSave,
  onCancel,
  onDelete
}: {
  mode: EditorMode
  initial: FormValues
  submitLabel: string
  /** Every tag already used in the app — offered as one-click chips. */
  knownTags?: string[]
  onSave: (v: FormValues) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const [v, setV] = useState<FormValues>(initial)
  const set = <K extends keyof FormValues>(k: K, val: FormValues[K]) =>
    setV((prev) => ({ ...prev, [k]: val }))

  const showRepeat = mode !== 'task'
  const repeating = v.freq !== 'none'
  const canSave = v.title.trim().length > 0

  const submit = () => {
    if (!canSave) return
    // A repeating item needs an anchor date; default to today quietly.
    if (repeating && !v.dueDate) {
      onSave({ ...v, dueDate: todayYMD() })
    } else {
      onSave(v)
    }
  }

  return (
    <div
      className="bg-surface rounded-[16px] p-4 shadow-[var(--shadow-lift)]"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel()
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
      }}
    >
      <div className="grid gap-3">
        <div>
          <label className={labelCls} htmlFor="te-title">
            Title
          </label>
          <input
            id="te-title"
            className={`${inputCls} w-full`}
            value={v.title}
            autoFocus
            onChange={(e) => set('title', e.target.value)}
            placeholder="Task name"
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="te-notes">
            Notes
          </label>
          <textarea
            id="te-notes"
            rows={2}
            className={`${inputCls} w-full resize-y`}
            value={v.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Notes"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className={labelCls} htmlFor="te-date">
              {repeating ? 'Starts' : 'Due date'}
            </label>
            <input
              id="te-date"
              type="date"
              className={`${inputCls} w-full`}
              value={v.dueDate}
              onChange={(e) => set('dueDate', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="te-time">
              Time
            </label>
            <input
              id="te-time"
              type="time"
              className={`${inputCls} w-full`}
              value={v.dueTime}
              disabled={!v.dueDate && !repeating}
              onChange={(e) => set('dueTime', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="te-reminder">
              Remind
            </label>
            <select
              id="te-reminder"
              className={`${inputCls} w-full`}
              value={v.reminderOffset}
              disabled={!v.dueTime}
              title={v.dueTime ? undefined : 'Needs a due time'}
              onChange={(e) => set('reminderOffset', e.target.value)}
            >
              <option value="">None</option>
              <option value="0">At due time</option>
              <option value="10">10 min before</option>
              <option value="30">30 min before</option>
              <option value="60">1 hour before</option>
              <option value="1440">1 day before</option>
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="te-priority">
              Priority
            </label>
            <select
              id="te-priority"
              className={`${inputCls} w-full`}
              value={v.priority}
              onChange={(e) => set('priority', Number(e.target.value) as Priority)}
            >
              <option value={0}>None</option>
              <option value={1}>Low</option>
              <option value={2}>Medium</option>
              <option value={3}>High</option>
            </select>
          </div>
        </div>

        <TagPicker
          tags={v.tags}
          knownTags={knownTags}
          onChange={(tags) => set('tags', tags)}
        />

        {showRepeat && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={labelCls} htmlFor="te-freq">
                Repeat
              </label>
              <select
                id="te-freq"
                className={`${inputCls} w-full`}
                value={v.freq}
                onChange={(e) => set('freq', e.target.value as FormValues['freq'])}
              >
                {mode !== 'series' && <option value="none">Doesn&apos;t repeat</option>}
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            {repeating && (
              <div>
                <label className={labelCls} htmlFor="te-interval">
                  Every
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="te-interval"
                    type="number"
                    min={1}
                    max={30}
                    className={`${inputCls} w-16`}
                    value={v.interval}
                    onChange={(e) =>
                      set('interval', Math.max(1, Number(e.target.value) || 1))
                    }
                  />
                  <span className="text-muted text-[12px]">
                    {v.freq === 'daily' ? 'day(s)' : v.freq === 'weekly' ? 'week(s)' : 'month(s)'}
                  </span>
                </div>
              </div>
            )}
            {repeating && v.freq === 'weekly' && (
              <div className="col-span-2">
                <span className={labelCls}>On days</span>
                <div className="flex gap-1" role="group" aria-label="Weekdays">
                  {WEEKDAY_ORDER.map((i, pos) => {
                    const label = WEEKDAY_LABELS[pos]
                    const on = v.weekdays.includes(i)
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-pressed={on}
                        aria-label={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}
                        onClick={() =>
                          set(
                            'weekdays',
                            on ? v.weekdays.filter((d) => d !== i) : [...v.weekdays, i].sort()
                          )
                        }
                        className={`tactile h-8 w-8 rounded-full text-[12px] font-semibold ${
                          on ? 'bg-clay text-bg' : 'bg-bg text-muted hover:text-ink'
                        }`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {repeating && (
              <div>
                <label className={labelCls} htmlFor="te-end">
                  Until
                </label>
                <input
                  id="te-end"
                  type="date"
                  className={`${inputCls} w-full`}
                  value={v.endDate}
                  onChange={(e) => set('endDate', e.target.value)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        {onDelete && (
          <button
            onClick={onDelete}
            className="text-muted hover:text-rose rounded-lg px-2 py-2 text-[13px] transition-colors"
          >
            Delete
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={onCancel}
          className="text-muted hover:text-ink rounded-lg px-3 py-2 text-[13px] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!canSave}
          className="tactile bg-clay text-bg rounded-[11px] px-4 py-2 text-[13px] font-bold disabled:opacity-35"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  )
}

/** Tag chips with × to remove, one-click chips for tags you already use,
 *  and a free-text field for new ones (Enter or comma commits). */
function TagPicker({
  tags,
  knownTags,
  onChange
}: {
  tags: string[]
  knownTags: string[]
  onChange: (tags: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const full = tags.length >= MAX_TAGS
  const suggestions = knownTags.filter((t) => !tags.includes(t))

  const add = (raw: string) => {
    const tag = normalizeTag(raw)
    if (!tag || tags.includes(tag) || full) return
    onChange([...tags, tag])
    setDraft('')
  }
  const remove = (tag: string) => onChange(tags.filter((t) => t !== tag))

  return (
    <div>
      <span className={labelCls}>Tags</span>

      {tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="bg-clay/15 text-clay flex items-center gap-1 rounded-full py-1 pr-1.5 pl-3 text-[12px] font-medium"
            >
              {tag}
              <button
                type="button"
                onClick={() => remove(tag)}
                aria-label={`Remove tag ${tag}`}
                title={`Remove ${tag}`}
                className="hover:bg-clay/30 flex h-4 w-4 items-center justify-center rounded-full leading-none transition-colors"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        className={`${inputCls} w-full`}
        value={draft}
        disabled={full}
        placeholder={full ? `Max ${MAX_TAGS} tags` : 'Add a tag'}
        aria-label="New tag"
        onChange={(e) => {
          // A typed comma commits the tag, matching the old paste-friendly habit.
          if (e.target.value.includes(',')) add(e.target.value.replace(',', ''))
          else setDraft(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.stopPropagation() // don't submit the whole form
            add(draft)
          } else if (e.key === 'Backspace' && !draft && tags.length) {
            remove(tags[tags.length - 1])
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
      />

      {!full &&
        (suggestions.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {suggestions.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => add(tag)}
                title={`Add ${tag}`}
                className="tactile bg-raised text-muted hover:text-ink rounded-full px-3 py-1 text-[12px] font-medium"
              >
                + {tag}
              </button>
            ))}
          </div>
        ) : (
          null
        ))}
    </div>
  )
}
