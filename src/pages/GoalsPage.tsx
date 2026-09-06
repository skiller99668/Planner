// Goals — what you want to be true by the end of this month, with a bar that
// says how close it is.
//
// Three kinds share one card because they share everything but four lines of
// arithmetic: a number climbing toward a target (and the personal best is the
// number, so one bad day can't erase a PR), a checklist of deliverables, and a
// tally that can either be tapped or read straight off another page. Steps sit
// under all three — on a checklist they *are* the bar, elsewhere they're the
// plan for reaching it.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Burst, CheckCircle, useCelebrate, useFlash, useThresholdCross } from '../components/Celebrate'
import { useConfirm } from '../components/ConfirmProvider'
import DateField from '../components/DateField'
import IconGrip from '../components/Grip'
import InlineEdit from '../components/InlineEdit'
import RowMenu from '../components/RowMenu'
import Select from '../components/Select'
import { ColorSwatch } from '../components/TagChip'
import type { Goal, GoalEntry, GoalSource, GoalStep, Tag } from '../../shared/types'
import { parseGoal } from '../../shared/parseGoal'
import { todayYMD } from '../lib/dates'
import { progressColor } from '../lib/progress'
import { useDragSort } from '../lib/useDragSort'
import {
  addMonths,
  deriveGoal,
  monthLabel,
  monthOf,
  useGoals,
  type GoalDerived,
  type GoalsStore
} from '../lib/useGoals'

const inputCls =
  'bg-bg border-line rounded-[10px] border px-2.5 py-1.5 text-[13px] placeholder:text-faint focus:border-azure/60 outline-none'

const KIND_LABEL = { number: 'number', checklist: 'list', counter: 'count' } as const

const SOURCE_LABEL: Record<GoalSource, string> = {
  applications: 'Applications',
  gym: 'Gym sessions',
  leetcode: 'LeetCode solves',
  tasks: 'Tasks with a tag'
}

export default function GoalsPage() {
  const store = useGoals()
  const [tags, setTags] = useState<Tag[]>([])

  useEffect(() => {
    window.planner?.tagsList().then(setTags).catch(() => {})
  }, [])

  return <GoalsMonth store={store} tags={tags} />
}

function GoalsMonth({ store, tags }: { store: GoalsStore; tags: Tag[] }) {
  const confirm = useConfirm()
  const [carried, setCarried] = useState<Goal[]>([])
  const [openId, setOpenId] = useState<string | null>(null)

  const prevMonth = addMonths(store.month, -1)

  // The previous month's unfinished goals, offered rather than moved. Fetched
  // separately from the month being shown because they aren't in it yet.
  const loadCarried = useMemo(
    () => async () => {
      if (!window.planner) return
      const [prev, steps, entries] = await Promise.all([
        window.planner.goalsList(prevMonth),
        window.planner.goalStepsList(),
        window.planner.goalEntriesList()
      ])
      const stepsOf = (id: string): GoalStep[] => steps.filter((s) => s.goalId === id)
      const entriesOf = (id: string): GoalEntry[] => entries.filter((e) => e.goalId === id)
      setCarried(prev.filter((g) => !deriveGoal(g, stepsOf(g.id), entriesOf(g.id)).met))
    },
    [prevMonth]
  )

  useEffect(() => {
    void loadCarried()
  }, [loadCarried, store.goals])

  const ids = useMemo(() => store.goals.map((g) => g.id), [store.goals])
  const drag = useDragSort(ids, (ordered) => void store.reorder(ordered))

  const onTrack = store.goals.filter((g) =>
    deriveGoal(g, store.steps.get(g.id) ?? [], store.entries.get(g.id) ?? []).met
  ).length

  const isThisMonth = store.month === monthOf()

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold">Goals</h1>
          <p className="text-muted mt-0.5 text-[13.5px]">
            {store.goals.length > 0
              ? `${onTrack} of ${store.goals.length} met this month`
              : 'What you want to be true by the end of the month'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => store.setMonth(addMonths(store.month, -1))}
            aria-label="Previous month"
            className="tactile text-muted hover:text-ink hover:bg-surface rounded-[10px] px-2 py-1.5"
          >
            <Caret dir="left" />
          </button>
          <span className="nums w-40 text-center text-[14px] font-semibold">
            {monthLabel(store.month)}
          </span>
          <button
            onClick={() => store.setMonth(addMonths(store.month, 1))}
            aria-label="Next month"
            className="tactile text-muted hover:text-ink hover:bg-surface rounded-[10px] px-2 py-1.5"
          >
            <Caret dir="right" />
          </button>
          {!isThisMonth && (
            <button
              onClick={() => store.setMonth(monthOf())}
              className="tactile text-muted hover:text-ink hover:bg-surface ml-1 rounded-[10px] px-2.5 py-1.5 text-[12.5px] font-medium"
            >
              This month
            </button>
          )}
        </div>
      </div>

      {carried.length > 0 && (
        <div className="border-line/50 mt-6 max-w-3xl rounded-[16px] border border-dashed p-3">
          <p className="section-label mb-2">Carried over from {monthLabel(prevMonth)}</p>
          <ul className="space-y-0.5">
            {carried.map((g) => {
              const d = deriveGoal(g, store.steps.get(g.id) ?? [], store.entries.get(g.id) ?? [])
              return (
                <li
                  key={g.id}
                  className="surface-row flex items-center gap-2.5 rounded-[10px] px-3 py-2"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: g.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-[13.5px]">{g.title}</span>
                  <span className="text-faint nums shrink-0 text-[12px]">{d.label}</span>
                  <button
                    onClick={() => void store.carry(g.id, store.month)}
                    className="text-azure/85 hover:text-azure shrink-0 text-[12.5px] font-medium transition-colors"
                  >
                    Keep
                  </button>
                  <button
                    onClick={() => void store.update(g.id, { archived: true }).then(loadCarried)}
                    className="text-faint hover:text-coral shrink-0 text-[12.5px] font-medium transition-colors"
                  >
                    Drop
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <GoalComposer
        month={store.month}
        onCreate={async (input) => {
          const created = await store.create(input)
          // A checklist with no steps isn't a goal yet, so it opens with the
          // step field waiting. The other two arrive complete.
          if (created && created.kind === 'checklist') setOpenId(created.id)
          return created
        }}
      />

      {store.goals.length === 0 && store.loaded ? (
        <p className="text-muted mt-6 max-w-2xl text-[13.5px]">
          Nothing set for {monthLabel(store.month)} yet. A goal is a number you're chasing, a list
          you're working through, or a count you're building up — type one above.
        </p>
      ) : (
        <ul ref={drag.listRef} className="mt-4 max-w-3xl space-y-2">
          {store.goals.map((g) => (
            <li
              key={g.id}
              {...drag.rowProps(g.id)}
              className={`drag-row ${drag.draggingId === g.id ? 'drag-row-lifted' : ''}`}
            >
              <GoalCard
                goal={g}
                store={store}
                tags={tags}
                open={openId === g.id}
                onToggle={() => setOpenId((id) => (id === g.id ? null : g.id))}
                grip={
                  <button
                    type="button"
                    {...drag.handleProps(g.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Reorder: ${g.title}`}
                    title="Drag to reorder"
                    className={`shrink-0 cursor-grab px-1 transition-colors active:cursor-grabbing ${
                      drag.draggingId === g.id ? 'text-faint' : 'text-faint/0 group-hover/goal:text-faint'
                    }`}
                  >
                    <IconGrip />
                  </button>
                }
                onDelete={async () => {
                  const ok = await confirm({
                    title: `Delete "${g.title}"?`,
                    body: 'Its steps and everything you logged against it go too.',
                    confirmLabel: 'Delete',
                    danger: true
                  })
                  if (ok) await store.remove(g.id)
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------- composer ----------

/** One line in, one goal out. The parser decides the kind and the numbers; the
 *  three-way control beside it is there because a guess you can't override is
 *  worse than no guess at all. */
function GoalComposer({
  month,
  onCreate
}: {
  month: string
  onCreate: (input: {
    month: string
    title: string
    kind: 'number' | 'checklist' | 'counter'
    startValue: number | null
    targetValue: number
    unit: string | null
  }) => Promise<Goal | null>
}) {
  const [raw, setRaw] = useState('')
  const [kindOverride, setKindOverride] = useState<'number' | 'checklist' | 'counter' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const parsed = useMemo(() => parseGoal(raw), [raw])
  const kind = kindOverride ?? parsed.kind
  // A number goal whose target is its start is a bar that can never move.
  const stuck =
    kind === 'number' && parsed.startValue !== null && parsed.startValue === parsed.targetValue
  const ready = parsed.title.trim() !== '' && !stuck

  const submit = async () => {
    if (!ready) return
    setRaw('')
    setKindOverride(null)
    await onCreate({
      month,
      title: parsed.title,
      kind,
      startValue: kind === 'number' ? parsed.startValue : null,
      targetValue: kind === 'checklist' ? 0 : parsed.targetValue,
      unit: kind === 'checklist' ? null : parsed.unit
    })
    inputRef.current?.focus()
  }

  return (
    <div className="surface-recessed mt-6 max-w-3xl p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value)
            setKindOverride(null) // a re-typed line gets a fresh reading
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void submit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              if (raw) setRaw('')
              else e.currentTarget.blur()
            }
          }}
          placeholder="bench 190 lbs · apply to 20 jobs · grab rim"
          aria-label="New goal"
          className={`${inputCls} min-w-56 flex-1`}
        />
        <div className="flex shrink-0 gap-1" role="group" aria-label="Goal kind">
          {(['number', 'checklist', 'counter'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKindOverride(k)}
              className={`tactile rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                kind === k ? 'bg-azure/20 text-azure font-semibold' : 'bg-surface text-faint hover:text-muted'
              }`}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <button
          onClick={() => void submit()}
          disabled={!ready}
          className="btn-primary tactile shrink-0 rounded-[10px] px-3.5 py-1.5 text-[12.5px] font-bold disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {stuck ? (
        <p className="text-coral/90 mt-1.5 text-[12px]">A target and a start have to differ.</p>
      ) : (
        parsed.matched.length > 0 && (
          <p className="text-faint mt-1.5 text-[12px]">
            understood:{' '}
            {parsed.matched.map((m, i) => (
              <span key={i}>
                {i > 0 && ' · '}
                <span className="text-muted">{m.label}</span> {m.kind}
              </span>
            ))}
          </p>
        )
      )}
    </div>
  )
}

// ---------- one goal ----------

function GoalCard({
  goal,
  store,
  tags,
  open,
  onToggle,
  grip,
  onDelete
}: {
  goal: Goal
  store: GoalsStore
  tags: Tag[]
  open: boolean
  onToggle: () => void
  grip: React.ReactNode
  onDelete: () => Promise<void>
}) {
  const steps = store.steps.get(goal.id) ?? []
  const entries = store.entries.get(goal.id) ?? []
  const d = deriveGoal(goal, steps, entries)
  const [renaming, setRenaming] = useState(false)
  const [celebrateKey, celebrate] = useCelebrate()
  const swelling = useFlash(celebrateKey, 900)

  // Only the rising crossing fires, and prev starts null — opening the page on
  // an already-met goal is correctly silent.
  useThresholdCross(d.pct, 100, celebrate)

  return (
    <div
      className={`surface-recessed group/goal overflow-hidden ${swelling ? 'animate-sheen relative' : ''}`}
    >
      <div className="flex items-center gap-2 px-1.5 py-2.5 pr-2.5">
        {grip}
        <span onClick={(e) => e.stopPropagation()} className="flex shrink-0">
          <ColorSwatch
            color={goal.color}
            size={11}
            ariaLabel={`Colour for ${goal.title}`}
            onPick={(c) => void store.update(goal.id, { color: c })}
          />
        </span>
        <InlineEdit
          value={goal.title}
          ariaLabel="Goal title"
          editing={renaming}
          onEditingChange={setRenaming}
          onCommit={(next) => void store.update(goal.id, { title: next })}
          className="min-w-0 flex-1 text-[14.5px] font-semibold tracking-[-0.01em]"
        />
        <span className={`nums shrink-0 text-[12.5px] ${d.met ? 'text-mint font-bold' : 'text-muted'}`}>
          {d.label}
        </span>
        <RowMenu
          ariaLabel={`Actions for ${goal.title}`}
          actions={[
            { label: 'Rename', onSelect: () => setRenaming(true) },
            {
              label: `Carry to ${monthLabel(addMonths(goal.month, 1))}`,
              onSelect: () => void store.carry(goal.id, addMonths(goal.month, 1))
            },
            { label: 'Archive', onSelect: () => void store.update(goal.id, { archived: true }) },
            { label: 'Delete goal', danger: true, onSelect: () => void onDelete() }
          ]}
        />
      </div>

      <div className="flex items-center gap-3 px-4 pb-2.5">
        <span
          role="progressbar"
          aria-valuenow={Math.round(d.pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${goal.title}: ${d.label}`}
          className="bg-bg relative h-1.5 min-w-16 flex-1 overflow-hidden rounded-full"
        >
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-500 ease-(--ease-spring)"
            style={{ width: `${d.pct}%`, background: progressColor(d.pct) }}
          />
        </span>
        <span className="nums text-faint w-9 shrink-0 text-right text-[11.5px]">
          {Math.round(d.pct)}%
        </span>

        {goal.kind === 'counter' && !d.linked && (
          <span className="relative inline-block shrink-0">
            <button
              onClick={() => void store.addEntry({ goalId: goal.id, date: todayYMD(), value: 1 })}
              className="tactile btn-primary rounded-[9px] px-2.5 py-1 text-[12px] font-bold"
            >
              +1
            </button>
            <Burst fireKey={celebrateKey} count={9} spread={40} />
          </span>
        )}

        <button
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? 'Hide' : 'Show'} details: ${goal.title}`}
          className="text-faint hover:text-ink shrink-0 transition-colors"
        >
          <Caret dir={open ? 'up' : 'down'} />
        </button>
      </div>

      {open && (
        <div className="border-line/40 mx-4 border-t pt-3 pb-3.5">
          {goal.kind === 'number' && (
            <NumberBody goal={goal} derived={d} entries={entries} store={store} />
          )}
          {goal.kind === 'counter' && (
            <CounterBody goal={goal} entries={entries} store={store} tags={tags} />
          )}
          <StepList
            goalId={goal.id}
            steps={steps}
            store={store}
            heading={goal.kind === 'checklist' ? null : 'Steps'}
          />
        </div>
      )}
    </div>
  )
}

// ---------- number ----------

function NumberBody({
  goal,
  derived,
  entries,
  store
}: {
  goal: Goal
  derived: GoalDerived
  entries: GoalEntry[]
  store: GoalsStore
}) {
  const [value, setValue] = useState('')
  const [date, setDate] = useState(todayYMD())
  const valueRef = useRef<HTMLInputElement>(null)

  const log = async (): Promise<boolean> => {
    const n = Number(value.trim())
    // A non-numeric commit is a no-op rather than a stored NaN.
    if (!value.trim() || !Number.isFinite(n)) return false
    setValue('')
    await store.addEntry({ goalId: goal.id, date, value: n })
    return true
  }

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <NumField
          label="start"
          value={goal.startValue}
          onCommit={(n) => void store.update(goal.id, { startValue: n })}
        />
        <NumField
          label="target"
          value={goal.targetValue}
          onCommit={(n) => void store.update(goal.id, { targetValue: n ?? 0 })}
        />
        <div>
          <label className="text-faint mb-1 block text-[11px] font-semibold" htmlFor={`u-${goal.id}`}>
            unit
          </label>
          <input
            id={`u-${goal.id}`}
            defaultValue={goal.unit ?? ''}
            key={goal.unit ?? ''}
            placeholder="lbs"
            onBlur={(e) => {
              if ((e.target.value.trim() || null) !== goal.unit) {
                void store.update(goal.id, { unit: e.target.value.trim() || null })
              }
            }}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') e.currentTarget.blur()
              else if (e.key === 'Escape') {
                e.currentTarget.value = goal.unit ?? ''
                e.currentTarget.blur()
              }
            }}
            className={`${inputCls} w-16`}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-faint text-[11px] font-semibold">Log</span>
        <input
          ref={valueRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') {
              e.preventDefault()
              void log()
            } else if (e.key === 'Escape') {
              setValue('')
              e.currentTarget.blur()
            }
          }}
          inputMode="decimal"
          placeholder={goal.unit ? `185 ${goal.unit}` : '185'}
          aria-label={`Log a measurement for ${goal.title}`}
          className={`${inputCls} w-24`}
        />
        <DateField value={date} ariaLabel="Measurement date" onChange={setDate} clearable={false} />
        <button
          onClick={() => void log()}
          disabled={!value.trim() || !Number.isFinite(Number(value.trim()))}
          className="btn-primary tactile rounded-[9px] px-3 py-1.5 text-[12px] font-bold disabled:opacity-40"
        >
          Log
        </button>
      </div>

      {entries.length > 0 ? (
        <ul className="mt-2.5 space-y-0.5">
          {entries.map((e) => {
            const isBest = derived.best !== null && e.value === derived.best
            return (
              <li key={e.id} className="group/entry flex items-center gap-2.5 py-0.5 text-[12.5px]">
                <span className="text-faint nums w-16 shrink-0">{shortDay(e.date)}</span>
                <span className={`nums ${isBest ? 'text-mint font-semibold' : 'text-muted'}`}>
                  {e.value}
                  {goal.unit ? ` ${goal.unit}` : ''}
                </span>
                {/* The best is deliberately not the newest — that is the whole
                    point of keeping every reading. */}
                {isBest && <span className="text-mint/80 text-[11px]">★ best</span>}
                <button
                  onClick={() => void store.removeEntry(e.id)}
                  aria-label={`Delete measurement ${e.value}`}
                  className="text-faint/0 group-hover/entry:text-faint hover:!text-coral ml-auto shrink-0 px-1 transition-colors"
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-faint mt-2.5 text-[12px]">
          Nothing logged yet
          {goal.startValue === null && ' — the first measurement becomes your starting point.'}
        </p>
      )}
    </>
  )
}

/** A small numeric field that commits on Enter or blur and never stores NaN. */
function NumField({
  label,
  value,
  onCommit
}: {
  label: string
  value: number | null
  onCommit: (n: number | null) => void
}) {
  const stored = value === null ? '' : String(value)
  return (
    <div>
      <label className="text-faint mb-1 block text-[11px] font-semibold">{label}</label>
      <input
        key={stored}
        defaultValue={stored}
        inputMode="decimal"
        aria-label={label}
        onBlur={(e) => {
          const raw = e.target.value.trim()
          if (raw === stored) return
          if (!raw) return onCommit(null)
          const n = Number(raw)
          if (Number.isFinite(n)) onCommit(n)
          else e.target.value = stored
        }}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') {
            e.currentTarget.value = stored
            e.currentTarget.blur()
          }
        }}
        className={`${inputCls} w-20`}
      />
    </div>
  )
}

// ---------- counter ----------

function CounterBody({
  goal,
  entries,
  store,
  tags
}: {
  goal: Goal
  entries: GoalEntry[]
  store: GoalsStore
  tags: Tag[]
}) {
  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <NumField
          label="target"
          value={goal.targetValue}
          onCommit={(n) => void store.update(goal.id, { targetValue: n ?? 0 })}
        />
        <div>
          <label className="text-faint mb-1 block text-[11px] font-semibold">count from</label>
          <Select
            value={goal.source ?? 'manual'}
            ariaLabel="Count from"
            className="py-1.5 text-[12.5px]"
            options={[
              { value: 'manual', label: 'Manual (+1)' },
              ...(Object.keys(SOURCE_LABEL) as GoalSource[]).map((s) => ({
                value: s,
                label: SOURCE_LABEL[s]
              }))
            ]}
            onChange={(v) =>
              void store.update(goal.id, { source: v === 'manual' ? null : (v as GoalSource) })
            }
          />
        </div>
        {goal.source === 'tasks' && (
          <div>
            <label className="text-faint mb-1 block text-[11px] font-semibold">tagged</label>
            <Select
              value={goal.sourceTag ?? ''}
              ariaLabel="Tag to count"
              className="py-1.5 text-[12.5px]"
              options={[
                { value: '', label: 'Pick a tag' },
                ...tags.map((t) => ({ value: t.name, label: t.name, dot: t.color }))
              ]}
              onChange={(v) => void store.update(goal.id, { sourceTag: v || null })}
            />
          </div>
        )}
      </div>

      {goal.source ? (
        // The month is spelled out because a linked count is a reading of
        // another page scoped to this month — carrying the goal forward moves
        // that window, and a goal reading 0 in a new month has to explain why.
        <p className="text-faint mt-2.5 text-[12px]">
          ↻ auto · {SOURCE_LABEL[goal.source]}
          {goal.source === 'tasks' && goal.sourceTag ? ` #${goal.sourceTag}` : ''} ·{' '}
          {monthLabel(goal.month)}
        </p>
      ) : entries.length > 0 ? (
        <ul className="mt-2.5 space-y-0.5">
          {entries.slice(0, 8).map((e) => (
            <li key={e.id} className="group/entry flex items-center gap-2.5 py-0.5 text-[12.5px]">
              <span className="text-faint nums w-16 shrink-0">{shortDay(e.date)}</span>
              <span className="text-muted nums">+{e.value}</span>
              <button
                onClick={() => void store.removeEntry(e.id)}
                aria-label="Delete tally"
                className="text-faint/0 group-hover/entry:text-faint hover:!text-coral ml-auto shrink-0 px-1 transition-colors"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-faint mt-2.5 text-[12px]">Nothing counted yet — tap +1 as you go.</p>
      )}
    </>
  )
}

// ---------- steps ----------

/** The deliverables list. Modelled on the task checklist: rows are
 *  uncontrolled and keyed by id, so the refetch after every mutation can't
 *  fight whatever is being typed. */
function StepList({
  goalId,
  steps,
  store,
  heading
}: {
  goalId: string
  steps: GoalStep[]
  store: GoalsStore
  heading: string | null
}) {
  const [draft, setDraft] = useState('')
  const ids = useMemo(() => steps.map((s) => s.id), [steps])
  const drag = useDragSort(ids, (ordered) => void store.reorderSteps(goalId, ordered))

  const add = async () => {
    const title = draft.trim()
    if (!title) return
    setDraft('') // cleared before the await, so the field is ready for the next
    await store.addStep(goalId, title)
  }

  return (
    <div className={heading ? 'mt-3.5' : ''}>
      {heading && <p className="section-label mb-1.5">{heading}</p>}
      <ul ref={drag.listRef} className="space-y-0.5">
        {steps.map((s) => (
          <li
            key={s.id}
            {...drag.rowProps(s.id)}
            className={`drag-row ${drag.draggingId === s.id ? 'drag-row-lifted' : ''}`}
          >
            <div className="group/step flex items-center gap-2.5 rounded-[8px] py-0.5">
              <button
                type="button"
                {...drag.handleProps(s.id)}
                aria-label={`Reorder: ${s.title}`}
                className="text-faint/0 group-hover/step:text-faint shrink-0 cursor-grab px-0.5 transition-colors active:cursor-grabbing"
              >
                <IconGrip />
              </button>
              <CheckCircle
                size={15}
                checked={s.done}
                label={`${s.done ? 'Reopen' : 'Complete'} step: ${s.title}`}
                onChange={() => void store.updateStep(s.id, { done: !s.done })}
              />
              <input
                key={s.id}
                defaultValue={s.title}
                aria-label={`Step: ${s.title}`}
                onBlur={(e) => {
                  if (e.target.value.trim() !== s.title) {
                    void store.updateStep(s.id, { title: e.target.value })
                  }
                }}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') e.currentTarget.blur()
                  else if (e.key === 'Escape') {
                    e.currentTarget.value = s.title
                    e.currentTarget.blur()
                  }
                }}
                className={`focus:bg-bg min-w-0 flex-1 rounded-[7px] bg-transparent px-1.5 py-0.5 text-[13px] outline-none ${
                  s.done ? 'text-muted line-through' : ''
                }`}
              />
              <button
                onClick={() => void store.removeStep(s.id)}
                aria-label={`Delete step: ${s.title}`}
                className="text-faint/0 group-hover/step:text-faint hover:!text-coral shrink-0 px-1 transition-colors"
              >
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>
      <input
        autoFocus={steps.length === 0}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') {
            e.preventDefault()
            void add()
          } else if (e.key === 'Escape') {
            setDraft('')
            e.currentTarget.blur()
          }
        }}
        onBlur={() => void add()}
        placeholder="Add a step"
        aria-label="Add a step"
        className="placeholder:text-faint focus:bg-bg ml-[30px] rounded-[7px] bg-transparent px-1.5 py-1 text-[13px] outline-none"
      />
    </div>
  )
}

// ---------- bits ----------

/** "2026-09-14" → "Sep 14". */
function shortDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function Caret({ dir }: { dir: 'left' | 'right' | 'up' | 'down' }) {
  const path =
    dir === 'left' ? 'm15 6-6 6 6 6' : dir === 'right' ? 'm9 6 6 6-6 6' : dir === 'up' ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={path} />
    </svg>
  )
}
