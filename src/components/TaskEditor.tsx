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
  tagsText: string
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
    tagsText: '',
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
    tagsText: t.tags.join(', '),
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
    tagsText: s.tags.join(', '),
    reminderOffset: s.reminderOffsetMin != null ? String(s.reminderOffsetMin) : '',
    freq: s.rule.freq,
    interval: s.rule.interval,
    weekdays: s.rule.byWeekdays,
    endDate: s.endDate ?? ''
  }
}

export function parseTags(text: string): string[] {
  return [...new Set(text.split(',').map((t) => t.trim()).filter(Boolean))]
}

const inputCls =
  'bg-bench border-line rounded-md border px-2.5 py-1.5 text-[13px] placeholder:text-muted/60 focus:border-amber/60'
const labelCls = 'text-muted mb-1 block font-mono text-[10.5px] tracking-[0.14em] uppercase'
const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export default function TaskEditor({
  mode,
  initial,
  submitLabel,
  onSave,
  onCancel,
  onDelete
}: {
  mode: EditorMode
  initial: FormValues
  submitLabel: string
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
      className="border-line bg-panel rounded-lg border p-4"
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
            placeholder="What needs doing?"
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
            placeholder="Optional details"
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
              Reminder
            </label>
            <select
              id="te-reminder"
              className={`${inputCls} w-full`}
              value={v.reminderOffset}
              disabled={!v.dueTime}
              title={v.dueTime ? undefined : 'Reminders need a due time'}
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

        <div>
          <label className={labelCls} htmlFor="te-tags">
            Tags
          </label>
          <input
            id="te-tags"
            className={`${inputCls} w-full`}
            value={v.tagsText}
            onChange={(e) => set('tagsText', e.target.value)}
            placeholder="school, ecse-200 (comma separated)"
          />
        </div>

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
                  {WEEKDAY_LABELS.map((label, i) => {
                    const on = v.weekdays.includes(i)
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-pressed={on}
                        aria-label={`Weekday ${i}`}
                        onClick={() =>
                          set(
                            'weekdays',
                            on ? v.weekdays.filter((d) => d !== i) : [...v.weekdays, i].sort()
                          )
                        }
                        className={`h-7 w-7 rounded-md font-mono text-[11px] transition-colors ${
                          on
                            ? 'bg-amber text-bench font-semibold'
                            : 'bg-bench border-line text-muted hover:text-ink border'
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
            className="text-danger/80 hover:text-danger rounded-md px-2 py-1.5 text-[12.5px] transition-colors"
          >
            Delete
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={onCancel}
          className="text-muted hover:text-ink rounded-md px-3 py-1.5 text-[12.5px] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!canSave}
          className="bg-amber text-bench rounded-md px-3.5 py-1.5 text-[12.5px] font-semibold transition-opacity disabled:opacity-40"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  )
}
