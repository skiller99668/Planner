import { useEffect, useState } from 'react'
import { useConfirm } from '../components/ConfirmProvider'
import DateField from '../components/DateField'
import type { LeetcodeDifficulty, LeetcodeProblem } from '../../shared/types'
import { Burst, useCelebrate, useFlash, useThresholdCross } from '../components/Celebrate'
import { addDaysYMD, todayYMD } from '../lib/dates'
import { progressColor, progressPct } from '../lib/progress'
import { deriveLeetcode, useDsaTarget, useLeetcode } from '../lib/useLeetcode'

const DIFFS: LeetcodeDifficulty[] = ['easy', 'medium', 'hard']

const DIFF_META: Record<
  LeetcodeDifficulty,
  { label: string; text: string; chip: string }
> = {
  easy: { label: 'Easy', text: 'text-mint', chip: 'bg-mint/15 text-mint' },
  medium: { label: 'Medium', text: 'text-gold', chip: 'bg-gold/15 text-gold' },
  hard: { label: 'Hard', text: 'text-coral', chip: 'bg-coral/15 text-coral' }
}

const inputCls =
  'bg-bg border-line rounded-[11px] border px-2.5 py-1.5 text-[13px] placeholder:text-faint focus:border-azure/60 outline-none'

export default function LeetcodePage() {
  const store = useLeetcode()
  const target = useDsaTarget()
  const d = deriveLeetcode(store.problems, target)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [logKey, fireLog] = useCelebrate()
  const [targetKey, fireTarget] = useCelebrate()
  useThresholdCross(d.weekCount, target, fireTarget)
  const sheenOn = useFlash(targetKey)
  const weekPct = progressPct(d.weekCount, target)

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold">LeetCode</h1>
          <p className="text-muted mt-0.5 text-[13.5px]">Data structures &amp; algorithms prep</p>
        </div>
        <div className="flex gap-2">
          <LaunchButton label="LeetCode" url="https://leetcode.com/problemset/" />
          <LaunchButton label="NeetCode" url="https://neetcode.io/practice" />
        </div>
      </div>

      {/* Weekly progress */}
      <section
        className={`bg-surface relative mt-6 max-w-2xl overflow-hidden rounded-[20px] p-6 shadow-[var(--shadow-soft)] ${
          sheenOn ? 'animate-sheen' : ''
        }`}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-muted text-[13px] font-medium">This week</p>
            <p className="mt-1 text-[30px] leading-tight font-bold">
              <span className={d.weekMet ? 'text-mint' : 'text-azure'}>{d.weekCount}</span>
              <span className="text-faint text-[18px] font-semibold"> / {target}</span>
            </p>
          </div>
          <div className="text-right text-[12.5px]">
            <p>
              <span className={`nums font-bold ${d.weekStreak > 0 ? 'text-gold' : 'text-ink'}`}>
                {d.weekStreak}
              </span>{' '}
              <span className="text-muted">week streak</span>
            </p>
            <p className="mt-1">
              <span className="nums text-ink font-bold">{d.totalSolved}</span>{' '}
              <span className="text-muted">solved</span>
            </p>
          </div>
        </div>

        <div
          role="progressbar"
          aria-valuenow={d.weekCount}
          aria-valuemin={0}
          aria-valuemax={target}
          aria-label={`${d.weekCount} of ${target} problems this week`}
          className="bg-bg mt-4 h-1.5 overflow-hidden rounded-full"
        >
          <div
            className="h-full rounded-full transition-[width,background-color] duration-500 ease-(--ease-spring)"
            style={{ width: `${weekPct}%`, background: progressColor(weekPct) }}
          />
        </div>

        <div className="mt-4 flex gap-2">
          {DIFFS.map((df) => (
            <span
              key={df}
              className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${DIFF_META[df].chip}`}
            >
              {DIFF_META[df].label} · {d.diffAll[df]}
            </span>
          ))}
        </div>
      </section>

      <LogForm
        onLog={async (input) => {
          fireLog()
          await store.log(input)
        }}
        logKey={logKey}
      />

      <SyncRow onSynced={() => void 0} sync={store.sync} />

      {/* History */}
      <section className="mt-6 max-w-2xl">
        <h2 className="text-[15px] font-bold">History</h2>
        {store.problems.length === 0 && store.loaded ? (
          <p className="text-muted mt-3 text-[13.5px]">
            No problems logged yet — log one above or sync from LeetCode.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {store.problems.slice(0, 200).map((p) =>
              editingId === p.id ? (
                <li key={p.id}>
                  <ProblemEditor
                    problem={p}
                    onSave={async (patch) => {
                      await store.update(p.id, patch)
                      setEditingId(null)
                    }}
                    onCancel={() => setEditingId(null)}
                    onDelete={async () => {
                      await store.remove(p.id)
                      setEditingId(null)
                    }}
                  />
                </li>
              ) : (
                <li key={p.id}>
                  <ProblemRow problem={p} onEdit={() => setEditingId(p.id)} />
                </li>
              )
            )}
          </ul>
        )}
      </section>
    </div>
  )
}

// ---------- log form ----------

function LogForm({
  onLog,
  logKey
}: {
  onLog: (input: {
    date: string
    title: string
    difficulty: LeetcodeDifficulty
    topic: string | null
    url: string | null
    notes: string | null
  }) => Promise<void>
  logKey: number
}) {
  const [title, setTitle] = useState('')
  const [difficulty, setDifficulty] = useState<LeetcodeDifficulty>('medium')
  const [topic, setTopic] = useState('')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(todayYMD())

  const add = async () => {
    if (!title.trim()) return
    await onLog({
      date,
      title: title.trim(),
      difficulty,
      topic: topic.trim() || null,
      url: url.trim() || null,
      notes: notes.trim() || null
    })
    setTitle('')
    setTopic('')
    setUrl('')
    setNotes('')
  }

  return (
    <section className="bg-surface mt-4 max-w-2xl rounded-[16px] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <label className="text-muted mb-1 block text-[12px] font-semibold" htmlFor="lc-title">
            Problem
          </label>
          <input
            id="lc-title"
            className={`${inputCls} w-full`}
            placeholder="Two Sum"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
          />
        </div>
        <div>
          <span className="text-muted mb-1 block text-[12px] font-semibold">Difficulty</span>
          <div className="flex gap-1.5">
            {DIFFS.map((df) => (
              <button
                key={df}
                onClick={() => setDifficulty(df)}
                className={`tactile rounded-[10px] px-2.5 py-1.5 text-[12.5px] font-semibold ${
                  difficulty === df
                    ? `${DIFF_META[df].chip} ring-1 ring-current`
                    : 'bg-raised text-muted hover:text-ink'
                }`}
              >
                {DIFF_META[df].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="text-muted mb-1 block text-[12px] font-semibold">Date</span>
          <DateField value={date} ariaLabel="Solve date" max={todayYMD()} clearable={false} onChange={setDate} />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="min-w-36 flex-1">
          <label className="text-muted mb-1 block text-[12px] font-semibold" htmlFor="lc-topic">
            Topic
          </label>
          <input
            id="lc-topic"
            className={`${inputCls} w-full`}
            placeholder="Hash Table"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
          />
        </div>
        <div className="min-w-36 flex-[2]">
          <label className="text-muted mb-1 block text-[12px] font-semibold" htmlFor="lc-url">
            URL
          </label>
          <input
            id="lc-url"
            className={`${inputCls} w-full`}
            placeholder="https://leetcode.com/problems/two-sum/"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
          />
        </div>
        <span className="relative">
          <button
            onClick={() => void add()}
            disabled={!title.trim()}
            className="tactile btn-primary rounded-[11px] px-4 py-2 text-[13px] font-bold disabled:opacity-35"
          >
            Log
          </button>
          <Burst fireKey={logKey} count={9} spread={40} />
        </span>
      </div>

      <input
        className={`${inputCls} mt-2 w-full`}
        placeholder="Notes (optional) — approach, pattern, what tripped you up…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void add()}
      />
    </section>
  )
}

// ---------- sync ----------

function SyncRow({
  sync,
  onSynced
}: {
  sync: (username: string) => Promise<{ added: number; warning?: string }>
  onSynced: () => void
}) {
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    window.planner
      ?.getSettings()
      .then((s) => setUsername(s.leetcodeUsername ?? ''))
      .catch(() => {})
  }, [])

  const run = async () => {
    const name = username.trim()
    if (!name || busy) return
    setBusy(true)
    setMsg(null)
    await window.planner?.patchSettings({ leetcodeUsername: name })
    const res = await sync(name)
    setBusy(false)
    if (res.warning) setMsg({ ok: false, text: res.warning })
    else
      setMsg({
        ok: true,
        text: res.added > 0 ? `Added ${res.added} problem${res.added === 1 ? '' : 's'}.` : 'Already up to date.'
      })
    onSynced()
  }

  return (
    <section className="mt-4 flex max-w-2xl flex-wrap items-center gap-2">
      <input
        className={`${inputCls} w-44`}
        placeholder="LeetCode username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void run()}
      />
      <button
        onClick={() => void run()}
        disabled={!username.trim() || busy}
        className="tactile bg-surface text-muted hover:text-ink rounded-[11px] px-3.5 py-1.5 text-[12.5px] font-medium shadow-[var(--shadow-soft)] disabled:opacity-40"
      >
        {busy ? 'Syncing…' : 'Sync from LeetCode'}
      </button>
      {msg && (
        <span className={`text-[12px] ${msg.ok ? 'text-mint' : 'text-coral'}`}>{msg.text}</span>
      )}
    </section>
  )
}

// ---------- history row + editor ----------

function ProblemRow({ problem: p, onEdit }: { problem: LeetcodeProblem; onEdit: () => void }) {
  return (
    <div className="group bg-surface hover:bg-raised flex items-center gap-3 rounded-[14px] px-3.5 py-2.5 shadow-[var(--shadow-soft)] transition-colors">
      <span
        className={`w-16 shrink-0 rounded-full py-1 text-center text-[11px] font-bold ${DIFF_META[p.difficulty].chip}`}
      >
        {DIFF_META[p.difficulty].label}
      </span>
      <button onClick={onEdit} className="min-w-0 flex-1 text-left" title="Edit problem">
        <span className="text-[13.5px] font-medium">{p.title}</span>
        {p.topic && <span className="text-muted ml-2 text-[12px]">{p.topic}</span>}
      </button>
      <span className="text-muted nums shrink-0 text-[12px]">{formatDay(p.date)}</span>
      {p.url && (
        <button
          onClick={() => void window.planner?.openExternal(p.url!)}
          className="text-violet hover:text-ink shrink-0 text-[12px] font-medium transition-colors"
          title="Open on LeetCode"
        >
          open ↗
        </button>
      )}
    </div>
  )
}

function ProblemEditor({
  problem: p,
  onSave,
  onCancel,
  onDelete
}: {
  problem: LeetcodeProblem
  onSave: (patch: {
    title: string
    difficulty: LeetcodeDifficulty
    topic: string | null
    url: string | null
    notes: string | null
    date: string
  }) => Promise<void>
  onCancel: () => void
  onDelete: () => Promise<void>
}) {
  const confirm = useConfirm()
  const [title, setTitle] = useState(p.title)
  const [difficulty, setDifficulty] = useState<LeetcodeDifficulty>(p.difficulty)
  const [topic, setTopic] = useState(p.topic ?? '')
  const [url, setUrl] = useState(p.url ?? '')
  const [notes, setNotes] = useState(p.notes ?? '')
  const [date, setDate] = useState(p.date)

  const save = () =>
    void onSave({
      title: title.trim() || p.title,
      difficulty,
      topic: topic.trim() || null,
      url: url.trim() || null,
      notes: notes.trim() || null,
      date
    })

  // Enter saves from any field; Escape backs out — same reflexes as the log form.
  const onKey = (e: { key: string; preventDefault: () => void }) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      save()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div className="bg-surface mt-1 mb-1 rounded-[16px] p-4 shadow-[var(--shadow-lift)]">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <label className="text-muted mb-1 block text-[12px] font-semibold" htmlFor="lc-e-title">
            Problem
          </label>
          <input
            id="lc-e-title"
            className={`${inputCls} w-full`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={onKey}
          />
        </div>
        <div>
          <span className="text-muted mb-1 block text-[12px] font-semibold">Difficulty</span>
          <div className="flex gap-1.5">
            {DIFFS.map((df) => (
              <button
                key={df}
                onClick={() => setDifficulty(df)}
                className={`tactile rounded-[10px] px-2.5 py-1.5 text-[12.5px] font-semibold ${
                  difficulty === df
                    ? `${DIFF_META[df].chip} ring-1 ring-current`
                    : 'bg-raised text-muted hover:text-ink'
                }`}
              >
                {DIFF_META[df].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="text-muted mb-1 block text-[12px] font-semibold">Date</span>
          <DateField value={date} ariaLabel="Solve date" max={todayYMD()} clearable={false} onChange={setDate} />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <input
          className={`${inputCls} min-w-36 flex-1`}
          placeholder="Topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={onKey}
        />
        <input
          className={`${inputCls} min-w-36 flex-[2]`}
          placeholder="URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={onKey}
        />
      </div>
      <input
        className={`${inputCls} mt-2 w-full`}
        placeholder="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onKeyDown={onKey}
      />

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          onClick={async () => {
            const ok = await confirm({
              title: `Delete “${p.title}”?`,
              body: 'It comes off your log for good.',
              confirmLabel: 'Delete',
              danger: true
            })
            if (ok) await onDelete()
          }}
          className="text-muted hover:text-coral mr-auto text-[12.5px] transition-colors"
        >
          Delete
        </button>
        <button onClick={onCancel} className="text-muted hover:text-ink px-3 py-2 text-[13px]">
          Cancel
        </button>
        <button
          onClick={save}
          className="tactile btn-primary rounded-[11px] px-4 py-2 text-[13px] font-bold"
        >
          Save
        </button>
      </div>
    </div>
  )
}

function LaunchButton({ label, url }: { label: string; url: string }) {
  return (
    <button
      onClick={() => void window.planner?.openExternal(url)}
      title={`Open ${label} in your browser`}
      className="tactile bg-surface hover:bg-raised border-line rounded-[11px] border px-3.5 py-2 text-[13px] font-semibold shadow-[var(--shadow-soft)] transition-colors"
    >
      {label} <span className="text-violet">↗</span>
    </button>
  )
}

function formatDay(ymd: string): string {
  const [y, m, day] = ymd.split('-').map(Number)
  const date = new Date(y, m - 1, day)
  const today = todayYMD()
  if (ymd === today) return 'Today'
  if (ymd === addDaysYMD(today, -1)) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
  })
}
