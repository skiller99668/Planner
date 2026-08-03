import { useMemo, useState } from 'react'
import type { Task, TaskSeries } from '../../shared/types'
import TaskEditor, {
  emptyForm,
  seriesToForm,
  taskToForm,
  type FormValues
} from '../components/TaskEditor'
import { CheckCircle } from '../components/Celebrate'
import { addDaysYMD, dueLabel, todayYMD, ymdOfIso } from '../lib/dates'
import { useTasks, type TasksStore } from '../lib/useTasks'

type BucketId = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'someday'

const BUCKETS: { id: BucketId; label: string; tone: string }[] = [
  { id: 'overdue', label: 'Overdue', tone: 'text-rose' },
  { id: 'today', label: 'Today', tone: 'text-clay' },
  { id: 'tomorrow', label: 'Tomorrow', tone: 'text-ink' },
  { id: 'week', label: 'Next 7 days', tone: 'text-ink' },
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
  // A task ticked off stays in its bucket for a beat, otherwise it re-buckets
  // instantly and the completion animation unmounts before you see it.
  const [lingering, setLingering] = useState<ReadonlySet<string>>(new Set())

  const linger = (id: string) => {
    setLingering((prev) => new Set(prev).add(id))
    setTimeout(
      () =>
        setLingering((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        }),
      1000
    )
  }

  const open = useMemo(
    () =>
      store.tasks.filter(
        (t) =>
          (t.status === 'open' || lingering.has(t.id)) &&
          (!tagFilter || t.tags.includes(tagFilter))
      ),
    [store.tasks, tagFilter, lingering]
  )
  const done = useMemo(
    () =>
      store.tasks
        .filter(
          (t) =>
            t.status === 'done' &&
            !lingering.has(t.id) &&
            (!tagFilter || t.tags.includes(tagFilter))
        )
        .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
        .slice(0, 50),
    [store.tasks, tagFilter, lingering]
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
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold">Tasks</h1>
          <p className="text-muted mt-0.5 text-[13.5px]">
            {open.length === 0
              ? 'Nothing on the list'
              : `${open.length} to go${done.length ? ` · ${done.length} done` : ''}`}
          </p>
        </div>
        <button
          onClick={() => { setSeriesOpen((o) => !o); setEditingSeriesId(null) }}
          className={`tactile rounded-[12px] px-3.5 py-2 text-[13px] font-medium ${
            seriesOpen ? 'bg-raised text-ink' : 'text-muted hover:bg-raised/60 hover:text-ink'
          }`}
        >
          Repeating · {store.series.length}
        </button>
      </div>

      {/* Quick add */}
      <div className="mt-5">
        {!detailsOpen ? (
          <div className="flex gap-2">
            <input
              className="bg-surface placeholder:text-faint focus:bg-raised flex-1 rounded-[14px] px-4 py-3 text-[14px] shadow-[var(--shadow-soft)] transition-colors outline-none"
              placeholder="What needs doing?"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
            />
            <button
              onClick={() => setDetailsOpen(true)}
              className="tactile bg-surface text-muted hover:text-ink rounded-[14px] px-4 py-3 text-[13px] font-medium shadow-[var(--shadow-soft)]"
            >
              Details
            </button>
            <button
              onClick={quickAdd}
              disabled={!quickTitle.trim()}
              className="tactile bg-clay text-bg rounded-[14px] px-5 py-3 text-[13.5px] font-bold shadow-[var(--shadow-soft)] disabled:opacity-35"
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
              ? `Nothing tagged “${tagFilter}” right now.`
              : 'All clear. Add something above when it comes up.'}
          </p>
        )}
        {BUCKETS.map(({ id, label, tone }) =>
          buckets[id].length === 0 ? null : (
            <section key={id} className="mt-5">
              <h2 className={`text-[13px] font-bold ${tone}`}>
                {label}
                <span className="text-faint ml-1.5 font-medium">{buckets[id].length}</span>
              </h2>
              <ul className="mt-2 space-y-1">
                {buckets[id].map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    store={store}
                    knownTags={allTags}
                    onLinger={linger}
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
            className="text-muted hover:text-ink text-[13px] font-semibold transition-colors"
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
                  onLinger={linger}
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
      className={`tactile rounded-full px-3 py-1.5 text-[12px] font-medium ${
        active ? 'bg-clay text-bg font-semibold' : 'bg-surface text-muted hover:text-ink'
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
  onLinger,
  editing,
  onEdit,
  onClose
}: {
  task: Task
  store: TasksStore
  knownTags: string[]
  onLinger: (id: string) => void
  editing: boolean
  onEdit: () => void
  onClose: () => void
}) {
  const isDone = task.status === 'done'
  const overdue = !isDone && task.dueAt !== null && ymdOfIso(task.dueAt) < todayYMD()
  // Toggling a class (rather than remounting via key) replays the swell
  // without destroying the checkbox's burst, which lives in child state.
  const [swelling, setSwelling] = useState(false)
  const swell = () => {
    setSwelling(true)
    setTimeout(() => setSwelling(false), 640)
  }

  return (
    <li>
      <div
        className={`group bg-surface hover:bg-raised relative flex items-center gap-3 rounded-[14px] border border-transparent px-3.5 py-2.5 shadow-[var(--shadow-soft)] transition-colors ${
          isDone ? 'opacity-60' : ''
        } ${swelling ? 'animate-complete' : ''}`}
      >
        <CheckCircle
          checked={isDone}
          label={`${isDone ? 'Reopen' : 'Complete'}: ${task.title}`}
          onChange={() => {
            if (!isDone) {
              swell()
              onLinger(task.id)
            }
            void store.toggleTask(task)
          }}
        />

        <button onClick={onEdit} className="min-w-0 flex-1 text-left">
          <span className={`text-[14px] ${isDone ? 'text-muted line-through' : ''}`}>
            {task.title}
          </span>
          <span className="ml-2 inline-flex flex-wrap items-center gap-1.5 align-middle">
            {task.priority > 0 && (
              <span
                aria-label={['', 'low', 'medium', 'high'][task.priority] + ' priority'}
                className={`inline-block h-[7px] w-[7px] rounded-full ${
                  ['', 'bg-lilac', 'bg-butter', 'bg-rose'][task.priority]
                }`}
              />
            )}
            {task.dueAt && (
              <span className={`nums text-[12px] ${overdue ? 'text-rose' : 'text-muted'}`}>
                {dueLabel(task.dueAt, task.allDay)}
              </span>
            )}
            {task.seriesId && <IconRepeat />}
            {task.reminderAt && !isDone && <IconBell />}
            {task.tags.map((tag) => (
              <span
                key={tag}
                className="bg-raised text-muted rounded-full px-2 py-0.5 text-[11px] font-medium"
              >
                {tag}
              </span>
            ))}
          </span>
        </button>

        <button
          onClick={() => void store.deleteTask(task.id)}
          aria-label={`Delete: ${task.title}`}
          className="text-faint hover:text-rose tactile shrink-0 rounded-lg p-1.5"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.9" strokeLinecap="round" aria-hidden>
            <path d="M5 7.5h14M10 11v5.5M14 11v5.5M6.5 7.5 7.5 19h9l1-11.5M9.5 7.5V5h5v2.5" />
          </svg>
        </button>
      </div>

      {editing && (
        <div className="mt-1.5 mb-2">
          {task.seriesId && (
            <p className="text-faint mb-1.5 px-1 text-[12px]">
              Edits apply to this occurrence only.
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
    <div className="bg-surface mt-4 rounded-[16px] p-4 shadow-[var(--shadow-soft)]">
      <p className="text-[13px] font-bold">Repeating</p>
      {store.series.length === 0 ? (
        <p className="text-muted mt-2 text-[13px]">
          Nothing repeats yet — your weekly lab belongs here.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {store.series.map((s) => (
            <li key={s.id}>
              <div className="group hover:bg-raised flex items-center gap-3 rounded-[11px] px-2.5 py-2 transition-colors">
                <span className="text-clay"><IconRepeat /></span>
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setEditingId(editingId === s.id ? null : s.id)}
                  title="Edit series"
                >
                  <span className="text-[13.5px]">{s.title}</span>
                  <span className="text-muted nums ml-2 text-[12px]">{humanRule(s)}</span>
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Stop repeating “${s.title}”?`))
                      void store.deleteSeries(s.id)
                  }}
                  className="text-faint hover:text-rose px-1 text-[12px] transition-colors"
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

function IconRepeat() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label="Repeats">
      <path d="M4 9.5A6 6 0 0 1 10 4h7M20 14.5A6 6 0 0 1 14 20H7" />
      <path d="m14.5 1.5 3 2.5-3 2.5M9.5 17.5 6.5 20l3 2.5" />
    </svg>
  )
}

function IconBell() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Reminder set">
      <path d="M6 9a6 6 0 1 1 12 0c0 4.5 1.5 6 1.5 6h-15S6 13.5 6 9Z" />
      <path d="M10.5 19a2 2 0 0 0 3 0" />
    </svg>
  )
}
