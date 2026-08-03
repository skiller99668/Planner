import { useMemo, useState } from 'react'
import type { Task, TaskSeries } from '../../shared/types'
import TaskEditor, {
  emptyForm,
  seriesToForm,
  taskToForm,
  type FormValues
} from '../components/TaskEditor'
import { addDaysYMD, dueLabel, todayYMD, ymdOfIso } from '../lib/dates'
import { useTasks, type TasksStore } from '../lib/useTasks'

type BucketId = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'someday'

const BUCKETS: { id: BucketId; label: string; tone: string }[] = [
  { id: 'overdue', label: 'Overdue', tone: 'text-danger' },
  { id: 'today', label: 'Today', tone: 'text-amber' },
  { id: 'tomorrow', label: 'Tomorrow', tone: 'text-ink/80' },
  { id: 'week', label: 'Next 7 days', tone: 'text-ink/80' },
  { id: 'later', label: 'Later', tone: 'text-muted' },
  { id: 'someday', label: 'No date', tone: 'text-muted' }
]

export default function TasksPage() {
  const store = useTasks()
  const [quickTitle, setQuickTitle] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [seriesOpen, setSeriesOpen] = useState(false)
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null)

  const open = useMemo(
    () =>
      store.tasks.filter(
        (t) => t.status === 'open' && (!tagFilter || t.tags.includes(tagFilter))
      ),
    [store.tasks, tagFilter]
  )
  const done = useMemo(
    () =>
      store.tasks
        .filter((t) => t.status === 'done' && (!tagFilter || t.tags.includes(tagFilter)))
        .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
        .slice(0, 50),
    [store.tasks, tagFilter]
  )
  // Vocabulary for the tag picker + filter row: everything already in use,
  // including tags that live only on a recurring series.
  const allTags = useMemo(
    () =>
      [
        ...new Set([
          ...store.tasks.flatMap((t) => t.tags),
          ...store.series.flatMap((s) => s.tags)
        ])
      ].sort(),
    [store.tasks, store.series]
  )

  const buckets = useMemo(() => {
    const today = todayYMD()
    const tomorrow = addDaysYMD(today, 1)
    const weekEnd = addDaysYMD(today, 7)
    const by: Record<BucketId, Task[]> = {
      overdue: [], today: [], tomorrow: [], week: [], later: [], someday: []
    }
    for (const t of open) {
      if (!t.dueAt) by.someday.push(t)
      else {
        const day = ymdOfIso(t.dueAt)
        if (day < today) by.overdue.push(t)
        else if (day === today) by.today.push(t)
        else if (day === tomorrow) by.tomorrow.push(t)
        else if (day <= weekEnd) by.week.push(t)
        else by.later.push(t)
      }
    }
    const rank = (t: Task) => `${t.dueAt ?? '9999'}~${9 - t.priority}~${t.createdAt}`
    for (const id of Object.keys(by) as BucketId[]) {
      by[id].sort((a, b) => rank(a).localeCompare(rank(b)))
    }
    return by
  }, [open])

  const quickAdd = async () => {
    const title = quickTitle.trim()
    if (!title) return
    await store.createTask({ title })
    setQuickTitle('')
  }

  const saveNew = async (v: FormValues) => {
    if (v.freq === 'none') {
      await store.createTask(formToTaskInput(v))
    } else {
      await store.createSeries(formToSeriesInput(v))
    }
    setDetailsOpen(false)
    setQuickTitle('')
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="text-muted font-mono text-[11px] tracking-[0.16em] uppercase">
            {open.length} open{done.length ? ` · ${done.length} done` : ''}
          </p>
          <h1 className="font-display mt-1 text-xl font-semibold">Tasks</h1>
        </div>
        <button
          onClick={() => { setSeriesOpen((o) => !o); setEditingSeriesId(null) }}
          className={`rounded-md border px-3 py-1.5 text-[12.5px] transition-colors ${
            seriesOpen
              ? 'border-amber/60 text-ink bg-panel2'
              : 'border-line text-muted hover:text-ink bg-panel'
          }`}
        >
          ↻ Repeating ({store.series.length})
        </button>
      </div>

      {/* Quick add */}
      <div className="mt-5">
        {!detailsOpen ? (
          <div className="flex gap-2">
            <input
              className="bg-panel border-line placeholder:text-muted/60 focus:border-amber/60 flex-1 rounded-lg border px-3.5 py-2.5 text-[13.5px]"
              placeholder="Add a task — Enter to save, Details for dates and repeats"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
            />
            <button
              onClick={() => setDetailsOpen(true)}
              className="border-line bg-panel text-muted hover:text-ink rounded-lg border px-3 py-2 text-[12.5px] transition-colors"
            >
              Details
            </button>
            <button
              onClick={quickAdd}
              disabled={!quickTitle.trim()}
              className="bg-amber text-bench rounded-lg px-4 py-2 text-[13px] font-semibold transition-opacity disabled:opacity-40"
            >
              Add
            </button>
          </div>
        ) : (
          <TaskEditor
            mode="create"
            initial={emptyForm(quickTitle)}
            submitLabel="Add"
            knownTags={allTags}
            onSave={(v) => void saveNew(v)}
            onCancel={() => setDetailsOpen(false)}
          />
        )}
      </div>

      {/* Series manager */}
      {seriesOpen && (
        <SeriesPanel
          store={store}
          knownTags={allTags}
          editingId={editingSeriesId}
          setEditingId={setEditingSeriesId}
        />
      )}

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <Chip label="All" active={!tagFilter} onClick={() => setTagFilter(null)} />
          {allTags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              active={tagFilter === tag}
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
            />
          ))}
        </div>
      )}

      {/* Buckets */}
      <div className="mt-2">
        {open.length === 0 && store.loaded && (
          <p className="text-muted mt-8 text-[13.5px]">
            {tagFilter
              ? `No open tasks tagged “${tagFilter}”.`
              : 'No tasks yet. Add one above — start with this week’s lab.'}
          </p>
        )}
        {BUCKETS.map(({ id, label, tone }) =>
          buckets[id].length === 0 ? null : (
            <section key={id} className="mt-5">
              <h2 className={`font-mono text-[11px] tracking-[0.16em] uppercase ${tone}`}>
                {label} <span className="opacity-60">· {buckets[id].length}</span>
              </h2>
              <ul className="mt-2 space-y-1">
                {buckets[id].map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    store={store}
                    knownTags={allTags}
                    editing={editingId === t.id}
                    onEdit={() => setEditingId(editingId === t.id ? null : t.id)}
                    onClose={() => setEditingId(null)}
                  />
                ))}
              </ul>
            </section>
          )
        )}
      </div>

      {/* Completed */}
      {done.length > 0 && (
        <section className="mt-8">
          <button
            onClick={() => setShowDone((s) => !s)}
            className="text-muted hover:text-ink font-mono text-[11px] tracking-[0.16em] uppercase transition-colors"
          >
            {showDone ? '▾' : '▸'} Completed · {done.length}
          </button>
          {showDone && (
            <ul className="mt-2 space-y-1">
              {done.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  store={store}
                  knownTags={allTags}
                  editing={false}
                  onEdit={() => {}}
                  onClose={() => {}}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

// ---------- pieces ----------

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 font-mono text-[11px] transition-colors ${
        active ? 'bg-amber text-bench font-semibold' : 'bg-panel text-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  )
}

function TaskRow({
  task,
  store,
  knownTags,
  editing,
  onEdit,
  onClose
}: {
  task: Task
  store: TasksStore
  knownTags: string[]
  editing: boolean
  onEdit: () => void
  onClose: () => void
}) {
  const isDone = task.status === 'done'
  const overdue = !isDone && task.dueAt !== null && ymdOfIso(task.dueAt) < todayYMD()

  return (
    <li>
      <div
        className={`group border-line/60 bg-panel/60 hover:bg-panel flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
          isDone ? 'opacity-55' : ''
        }`}
      >
        <button
          role="checkbox"
          aria-checked={isDone}
          aria-label={`${isDone ? 'Reopen' : 'Complete'}: ${task.title}`}
          onClick={() => void store.toggleTask(task)}
          className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
            isDone
              ? 'bg-amber border-amber text-bench'
              : 'border-line hover:border-amber/70 bg-bench'
          }`}
        >
          {isDone && (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="m2.5 6.5 2.5 2.5 4.5-6" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        <button onClick={onEdit} className="min-w-0 flex-1 text-left" title="Edit task">
          <span className={`text-[13.5px] ${isDone ? 'line-through' : ''}`}>{task.title}</span>
          <span className="ml-2 inline-flex flex-wrap items-center gap-1.5 align-middle">
            {task.priority > 0 && (
              <span
                aria-label={['', 'low', 'medium', 'high'][task.priority] + ' priority'}
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  ['', 'bg-cyan', 'bg-amber', 'bg-danger'][task.priority]
                }`}
              />
            )}
            {task.dueAt && (
              <span
                className={`font-mono text-[10.5px] ${overdue ? 'text-danger' : 'text-muted'}`}
              >
                {dueLabel(task.dueAt, task.allDay)}
              </span>
            )}
            {task.seriesId && (
              <span className="text-muted font-mono text-[10.5px]" title="Repeats">
                ↻
              </span>
            )}
            {task.reminderAt && !isDone && (
              <span className="text-muted font-mono text-[10.5px]" title="Reminder set">
                ⏰
              </span>
            )}
            {task.tags.map((tag) => (
              <span key={tag} className="bg-panel2 text-muted rounded px-1.5 py-0.5 font-mono text-[10px]">
                {tag}
              </span>
            ))}
          </span>
        </button>

        <button
          onClick={() => void store.deleteTask(task.id)}
          aria-label={`Delete: ${task.title}`}
          title={task.seriesId ? 'Skip this occurrence' : 'Delete'}
          className="text-muted hover:text-danger px-1 opacity-45 transition-all group-hover:opacity-100"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.75" strokeLinecap="round" aria-hidden>
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
          </svg>
        </button>
      </div>

      {editing && (
        <div className="mt-1 mb-2">
          {task.seriesId && (
            <p className="text-muted mb-1 px-1 font-mono text-[10.5px]">
              ↻ part of a repeating series — this edits only this occurrence
            </p>
          )}
          <TaskEditor
            mode="task"
            initial={taskToForm(task)}
            submitLabel="Save"
            knownTags={knownTags}
            onSave={(v) => {
              void store
                .updateTask(task.id, {
                  title: v.title,
                  notes: v.notes || null,
                  tags: v.tags,
                  dueDate: v.dueDate || null,
                  dueTime: v.dueTime || null,
                  priority: v.priority,
                  reminderOffsetMin: v.reminderOffset === '' ? null : Number(v.reminderOffset)
                })
                .then(onClose)
            }}
            onCancel={onClose}
            onDelete={() => void store.deleteTask(task.id).then(onClose)}
          />
        </div>
      )}
    </li>
  )
}

function SeriesPanel({
  store,
  knownTags,
  editingId,
  setEditingId
}: {
  store: TasksStore
  knownTags: string[]
  editingId: string | null
  setEditingId: (id: string | null) => void
}) {
  return (
    <div className="border-line bg-panel/60 mt-4 rounded-lg border p-4">
      <p className="text-muted font-mono text-[11px] tracking-[0.16em] uppercase">
        Repeating tasks
      </p>
      {store.series.length === 0 ? (
        <p className="text-muted mt-2 text-[13px]">
          Nothing repeats yet. Use Details → Repeat when adding a task — your weekly lab
          belongs here.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {store.series.map((s) => (
            <li key={s.id}>
              <div className="group hover:bg-panel flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors">
                <span className="text-amber font-mono text-[11px]">↻</span>
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setEditingId(editingId === s.id ? null : s.id)}
                  title="Edit series"
                >
                  <span className="text-[13px]">{s.title}</span>
                  <span className="text-muted ml-2 font-mono text-[10.5px]">{humanRule(s)}</span>
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Stop repeating “${s.title}”? Past completions are kept.`))
                      void store.deleteSeries(s.id)
                  }}
                  className="text-muted hover:text-danger px-1 text-[11px] opacity-45 transition-all group-hover:opacity-100"
                >
                  Remove
                </button>
              </div>
              {editingId === s.id && (
                <div className="mt-1 mb-2">
                  <TaskEditor
                    mode="series"
                    initial={seriesToForm(s)}
                    submitLabel="Save series"
                    knownTags={knownTags}
                    onSave={(v) => {
                      void store
                        .updateSeries(s.id, {
                          title: v.title,
                          notes: v.notes || null,
                          tags: v.tags,
                          priority: v.priority,
                          rule: {
                            freq: v.freq as 'daily' | 'weekly' | 'monthly',
                            interval: v.interval,
                            byWeekdays: v.weekdays,
                            byMonthDay: null
                          },
                          startDate: v.dueDate || s.startDate,
                          endDate: v.endDate || null,
                          dueTime: v.dueTime || null,
                          reminderOffsetMin:
                            v.reminderOffset === '' ? null : Number(v.reminderOffset)
                        })
                        .then(() => setEditingId(null))
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function humanRule(s: TaskSeries): string {
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const every = (unit: string) =>
    s.rule.interval === 1 ? `Every ${unit}` : `Every ${s.rule.interval} ${unit}s`
  let base: string
  if (s.rule.freq === 'daily') base = every('day')
  else if (s.rule.freq === 'weekly')
    base = `${every('week')} on ${s.rule.byWeekdays.map((d) => names[d]).join(', ')}`
  else base = `${every('month')} on day ${s.rule.byMonthDay}`
  if (s.dueTime) base += ` · ${s.dueTime}`
  if (s.endDate) base += ` · until ${s.endDate}`
  return base
}

// ---------- form conversions ----------

function formToTaskInput(v: FormValues) {
  return {
    title: v.title,
    notes: v.notes || null,
    tags: v.tags,
    dueDate: v.dueDate || null,
    dueTime: v.dueTime || null,
    priority: v.priority,
    reminderOffsetMin: v.reminderOffset === '' ? null : Number(v.reminderOffset)
  }
}

function formToSeriesInput(v: FormValues) {
  return {
    title: v.title,
    notes: v.notes || null,
    tags: v.tags,
    priority: v.priority,
    rule: {
      freq: v.freq as 'daily' | 'weekly' | 'monthly',
      interval: v.interval,
      byWeekdays: v.weekdays,
      byMonthDay: null
    },
    startDate: v.dueDate || todayYMD(),
    endDate: v.endDate || null,
    dueTime: v.dueTime || null,
    reminderOffsetMin: v.reminderOffset === '' ? null : Number(v.reminderOffset)
  }
}
