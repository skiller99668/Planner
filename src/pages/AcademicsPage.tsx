// Academics — term folders, the courses filed in them, and each course's
// lectures with their AI chat.
//
// A term is a folder you make, not a string you retype per course: it can be
// renamed, recoloured, rolled up, archived and dragged into order, and it
// exists before the first course goes in. Archive is the ordinary way a
// semester ends; delete is reserved for mistakes, and even then it only drops
// the folder — the courses fall back to No term with their notes intact.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConfirm } from '../components/ConfirmProvider'
import DateField from '../components/DateField'
import IconGrip from '../components/Grip'
import InlineEdit from '../components/InlineEdit'
import RowMenu from '../components/RowMenu'
import Select from '../components/Select'
import { ColorSwatch, tagFill } from '../components/TagChip'
import type { Course, Lecture, Term } from '../../shared/types'
import ChatView from '../components/ChatView'
import { todayYMD } from '../lib/dates'
import { useAcademics, type AcademicsStore } from '../lib/useAcademics'
import { useChat } from '../lib/useChat'
import { useDragSort } from '../lib/useDragSort'

const LECTURE_ACTIONS = [
  { label: 'explain deeper', prompt: 'Explain the key concepts from this lecture in more depth, building on my summary.' },
  { label: 'quiz me', prompt: 'Quiz me with 5 questions on this lecture, one at a time. Wait for my answer before revealing the solution and moving on.' },
  { label: 'likely exam questions', prompt: 'Based on this lecture and the recent ones, what exam questions are most likely? Sketch how to approach each.' },
  { label: 'make study tasks', prompt: 'Create 2-4 small study tasks for this lecture material with sensible due dates this week, tagged with the course code.' }
]

const inputCls =
  'bg-bg border-line rounded-[11px] border px-2.5 py-1.5 text-[13px] placeholder:text-faint focus:border-azure/60 outline-none'

/** The unfiled shelf's own colour — slate, the palette's quietest, because
 *  "No term" is a consequence of deleting a folder, not a folder you chose. */
const UNFILED_COLOR = '#93A4C8'

/** Fall/Winter/Summer around today, so the first term is one keystroke away. */
function guessTermName(d = new Date()): string {
  const m = d.getMonth() + 1
  if (m >= 8) return `Fall ${d.getFullYear()}` // Aug–Dec
  if (m >= 5) return `Summer ${d.getFullYear()}` // May–Jul
  return `Winter ${d.getFullYear()}` // Jan–Apr
}

export default function AcademicsPage() {
  const store = useAcademics()
  const [courseId, setCourseId] = useState<string | null>(null)
  const [lectures, setLectures] = useState<Lecture[]>([])
  const [lectureId, setLectureId] = useState<string | null>(null)

  const refreshLectures = useCallback(async () => {
    if (!window.planner || !courseId) {
      setLectures([])
      return
    }
    setLectures(await window.planner.lecturesList(courseId))
  }, [courseId])

  useEffect(() => {
    void refreshLectures()
  }, [refreshLectures])

  const course = store.courses.find((c) => c.id === courseId) ?? null
  const lecture = lectures.find((l) => l.id === lectureId) ?? null

  if (course && lecture) {
    return (
      <LectureDetail
        course={course}
        lecture={lecture}
        onBack={() => setLectureId(null)}
        onChanged={refreshLectures}
        onDeleted={() => {
          setLectureId(null)
          void refreshLectures()
        }}
      />
    )
  }

  if (course) {
    return (
      <CourseDetail
        course={course}
        lectures={lectures}
        store={store}
        onBack={() => {
          setCourseId(null)
          setLectureId(null)
        }}
        onOpenLecture={setLectureId}
        onChanged={refreshLectures}
        onGone={() => setCourseId(null)}
      />
    )
  }

  return <AcademicsHome store={store} onOpenCourse={setCourseId} />
}

// ---------- home: the shelves ----------

function AcademicsHome({
  store,
  onOpenCourse
}: {
  store: AcademicsStore
  onOpenCourse: (id: string) => void
}) {
  const confirm = useConfirm()
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [composing, setComposing] = useState<string | null>(null) // term id, or 'none'
  const [renaming, setRenaming] = useState<string | null>(null)
  const [newTerm, setNewTerm] = useState<string | null>(null)

  // Which folders are rolled up outlives this page, which unmounts on every
  // navigation — a folder that springs back open is not a folder.
  useEffect(() => {
    window.planner
      ?.getSettings()
      .then((s) => setCollapsed(new Set(s.collapsedTerms ?? [])))
      .catch(() => {})
  }, [])

  const toggle = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      void window.planner?.patchSettings({ collapsedTerms: [...next] })
      return next
    })
  }

  const liveTerms = useMemo(() => store.terms.filter((t) => !t.archived), [store.terms])
  const archivedTerms = useMemo(() => store.terms.filter((t) => t.archived), [store.terms])
  const archivedCourses = useMemo(
    () => store.courses.filter((c) => c.archived),
    [store.courses]
  )
  const unfiled = store.coursesOf(null)

  const termIds = useMemo(() => liveTerms.map((t) => t.id), [liveTerms])
  const termDrag = useDragSort(termIds, (ordered) => void store.reorderTerms(ordered))

  const addTerm = async (name: string) => {
    const clean = name.trim()
    if (!clean) return
    await store.createTerm({ name: clean })
  }

  const removeTerm = async (term: Term) => {
    const n = store.courses.filter((c) => c.termId === term.id).length
    const ok = await confirm({
      title: `Delete ${term.name}?`,
      body: n
        ? `Its ${n} course${n === 1 ? '' : 's'} move to No term. Lectures and chats are kept.`
        : 'The folder is empty — nothing else goes.',
      confirmLabel: 'Delete',
      danger: true
    })
    if (!ok) return
    await store.deleteTerm(term.id)
  }

  const nothingYet = store.loaded && store.terms.length === 0 && unfiled.length === 0

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold">Academics</h1>
          <p className="text-muted mt-0.5 text-[13.5px]">Terms, courses, lectures and notes</p>
        </div>
        {!nothingYet && (
          <button
            onClick={() => setNewTerm(guessTermName())}
            className="btn-primary tactile mt-1 rounded-[11px] px-3.5 py-1.5 text-[12.5px] font-semibold"
          >
            New term
          </button>
        )}
      </div>

      {nothingYet ? (
        <div className="surface-recessed mt-6 max-w-2xl p-6">
          <p className="text-[15px] font-semibold">Nothing set up yet.</p>
          <p className="text-muted mt-1 text-[13.5px]">
            A term is a folder — Fall 2026, Winter 2027 — and your courses live inside one.
          </p>
          {newTerm === null && (
            <button
              onClick={() => setNewTerm(guessTermName())}
              className="btn-primary tactile mt-4 rounded-[11px] px-3.5 py-1.5 text-[12.5px] font-semibold"
            >
              New term
            </button>
          )}
        </div>
      ) : null}

      {newTerm !== null && (
        <NewTermField
          value={newTerm}
          onChange={setNewTerm}
          onCommit={async (name) => {
            await addTerm(name)
            setNewTerm(guessTermName()) // terms come in twos; stay open
          }}
          onClose={() => setNewTerm(null)}
        />
      )}

      <ul ref={termDrag.listRef} className="mt-4 max-w-3xl space-y-2">
        {liveTerms.map((term) => (
          <li
            key={term.id}
            {...termDrag.rowProps(term.id)}
            className={`drag-row ${termDrag.draggingId === term.id ? 'drag-row-lifted' : ''}`}
          >
            <TermShelf
              term={term}
              store={store}
              expanded={!collapsed.has(term.id)}
              onToggle={() => toggle(term.id)}
              grip={
                <button
                  type="button"
                  {...termDrag.handleProps(term.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Reorder: ${term.name}`}
                  title="Drag to reorder"
                  className="text-faint/0 group-hover/shelf:text-faint shrink-0 cursor-grab px-1 transition-colors active:cursor-grabbing"
                >
                  <IconGrip />
                </button>
              }
              composing={composing === term.id}
              onCompose={(open) => setComposing(open ? term.id : null)}
              renaming={renaming === term.id}
              onRenaming={(v) => setRenaming(v ? term.id : null)}
              onOpenCourse={onOpenCourse}
              onDelete={() => void removeTerm(term)}
            />
          </li>
        ))}
      </ul>

      {unfiled.length > 0 && (
        <div className="mt-2 max-w-3xl">
          <TermShelf
            term={null}
            store={store}
            expanded={!collapsed.has('none')}
            onToggle={() => toggle('none')}
            composing={composing === 'none'}
            onCompose={(open) => setComposing(open ? 'none' : null)}
            renaming={false}
            onRenaming={() => {}}
            onOpenCourse={onOpenCourse}
          />
        </div>
      )}

      {(archivedTerms.length > 0 || archivedCourses.length > 0) && (
        <ArchivedShelf
          store={store}
          terms={archivedTerms}
          courses={archivedCourses}
          expanded={!collapsed.has('archived')}
          onToggle={() => toggle('archived')}
        />
      )}
    </div>
  )
}

/** The new-term field: Enter files it and stays open, because a semester's
 *  worth of terms gets entered in one sitting. */
function NewTermField({
  value,
  onChange,
  onCommit,
  onClose
}: {
  value: string
  onChange: (v: string) => void
  onCommit: (name: string) => Promise<void>
  onClose: () => void
}) {
  return (
    <div className="surface-recessed mt-4 flex max-w-3xl items-center gap-2 p-3">
      <input
        autoFocus
        className={`${inputCls} w-52`}
        placeholder="Fall 2026"
        aria-label="New term name"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void onCommit(value)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
        onFocus={(e) => e.currentTarget.select()}
      />
      <button
        onClick={() => void onCommit(value)}
        disabled={!value.trim()}
        className="btn-primary tactile rounded-[11px] px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-40"
      >
        Add term
      </button>
      <button
        onClick={onClose}
        className="text-muted hover:text-ink ml-auto text-[12.5px] font-medium transition-colors"
      >
        Done
      </button>
    </div>
  )
}

// ---------- one shelf ----------

function TermShelf({
  term,
  store,
  expanded,
  onToggle,
  grip,
  composing,
  onCompose,
  renaming,
  onRenaming,
  onOpenCourse,
  onDelete
}: {
  /** null is the unfiled shelf: no colour to pick, no name to rename, no menu. */
  term: Term | null
  store: AcademicsStore
  expanded: boolean
  onToggle: () => void
  grip?: React.ReactNode
  composing: boolean
  onCompose: (open: boolean) => void
  renaming: boolean
  onRenaming: (v: boolean) => void
  onOpenCourse: (id: string) => void
  onDelete?: () => void
}) {
  const termId = term?.id ?? null
  const courses = store.coursesOf(termId)
  const ids = useMemo(() => courses.map((c) => c.id), [courses])
  const drag = useDragSort(ids, (ordered) => void store.reorderCourses(termId, ordered))
  const archivedHere = store.coursesOf(termId, { archived: true }).length
  const name = term?.name ?? 'No term'

  const openComposer = () => {
    if (!expanded) onToggle() // adding into an invisible list is a dead end
    onCompose(true)
  }

  return (
    <div className="surface-recessed group/shelf overflow-hidden">
      <div
        onClick={onToggle}
        className="flex cursor-pointer items-center gap-2 px-1.5 py-2.5 pr-2.5"
      >
        {grip ?? <span className="w-4 shrink-0" aria-hidden />}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`}
          className="text-muted hover:text-ink shrink-0 transition-colors"
        >
          <IconCaret open={expanded} />
        </button>

        {term ? (
          <span onClick={(e) => e.stopPropagation()} className="flex shrink-0">
            <ColorSwatch
              color={term.color}
              size={11}
              ariaLabel={`Colour for ${term.name}`}
              onPick={(c) => void store.updateTerm(term.id, { color: c })}
            />
          </span>
        ) : (
          <span
            className="size-[11px] shrink-0 rounded-full"
            style={{ background: tagFill(UNFILED_COLOR, 0.6) }}
            aria-hidden
          />
        )}

        {term ? (
          <InlineEdit
            value={term.name}
            ariaLabel="Term name"
            editing={renaming}
            onEditingChange={onRenaming}
            onCommit={(next) => void store.updateTerm(term.id, { name: next })}
            className="text-[15px] font-bold tracking-[-0.02em]"
          />
        ) : (
          <span className="text-muted text-[15px] font-bold tracking-[-0.02em]">No term</span>
        )}

        <span className="text-faint nums ml-1 text-[12.5px]">
          {courses.length === 0 ? 'empty' : `${courses.length} course${courses.length === 1 ? '' : 's'}`}
        </span>

        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              openComposer()
            }}
            aria-label={`Add a course to ${name}`}
            title="Add a course"
            className="text-faint hover:text-ink shrink-0 rounded-[8px] px-1.5 text-[16px] leading-none transition-colors"
          >
            +
          </button>
          {term && (
            <RowMenu
              ariaLabel={`Actions for ${term.name}`}
              actions={[
                { label: 'Add course', onSelect: openComposer },
                { label: 'Rename', onSelect: () => onRenaming(true) },
                { label: 'Archive term', onSelect: () => void store.updateTerm(term.id, { archived: true }) },
                { label: 'Delete term', danger: true, onSelect: () => onDelete?.() }
              ]}
            />
          )}
        </div>
      </div>

      {expanded && (
        <>
          <ul ref={drag.listRef} className="space-y-0.5 px-1.5 pb-1.5">
            {courses.map((c) => (
              <li
                key={c.id}
                {...drag.rowProps(c.id)}
                className={`drag-row ${drag.draggingId === c.id ? 'drag-row-lifted' : ''}`}
              >
                <CourseRow
                  course={c}
                  store={store}
                  onOpen={() => onOpenCourse(c.id)}
                  grip={
                    <button
                      type="button"
                      {...drag.handleProps(c.id)}
                      aria-label={`Reorder: ${c.code}`}
                      title="Drag to reorder"
                      className={`shrink-0 cursor-grab px-1 transition-colors active:cursor-grabbing ${
                        drag.draggingId === c.id ? 'text-faint' : 'text-faint/0 group-hover/row:text-faint'
                      }`}
                    >
                      <IconGrip />
                    </button>
                  }
                />
              </li>
            ))}
          </ul>

          {composing ? (
            <CourseComposer
              termId={termId}
              onClose={() => onCompose(false)}
              onCreate={(input) => store.createCourse(input)}
            />
          ) : (
            courses.length === 0 && (
              <p className="text-muted px-4 pb-3.5 text-[13px]">
                {/* A term whose every course is archived isn't empty, and
                    saying so stops the Archived shelf reading as a leak. */}
                {archivedHere > 0
                  ? `Nothing in ${name} — ${archivedHere} archived.`
                  : `Nothing in ${name} yet.`}{' '}
                <button
                  onClick={openComposer}
                  className="text-azure/85 hover:text-azure font-medium transition-colors"
                >
                  Add a course
                </button>
              </p>
            )
          )}
        </>
      )}
    </div>
  )
}

function CourseRow({
  course,
  store,
  onOpen,
  grip
}: {
  course: Course
  store: AcademicsStore
  onOpen: () => void
  grip: React.ReactNode
}) {
  const [renaming, setRenaming] = useState(false)
  const otherTerms = store.terms.filter((t) => !t.archived && t.id !== course.termId)

  return (
    <div className="group/row surface-row flex items-center gap-2 rounded-[10px] border border-transparent py-2 pr-1.5 pl-1">
      {grip}
      <ColorSwatch
        color={course.color}
        size={11}
        ariaLabel={`Colour for ${course.code}`}
        onPick={(c) => void store.updateCourse(course.id, { color: c })}
      />
      <InlineEdit
        value={course.code}
        ariaLabel="Course code"
        onActivate={onOpen}
        editing={renaming}
        onEditingChange={setRenaming}
        onCommit={(next) => void store.updateCourse(course.id, { code: next })}
        className="nums w-24 shrink-0 text-[12.5px] font-semibold tracking-wide"
      />
      <button
        onClick={onOpen}
        className="text-muted hover:text-ink min-w-0 flex-1 truncate text-left text-[13px] transition-colors"
      >
        {course.name}
      </button>
      <RowMenu
        ariaLabel={`Actions for ${course.code}`}
        actions={[
          { label: 'Open', onSelect: onOpen },
          { label: 'Rename code', onSelect: () => setRenaming(true) },
          ...otherTerms.map((t) => ({
            label: `Move to ${t.name}`,
            onSelect: () => void store.updateCourse(course.id, { termId: t.id })
          })),
          { label: 'Archive', onSelect: () => void store.updateCourse(course.id, { archived: true }) }
        ]}
      />
    </div>
  )
}

/** Code then name, side by side. Enter on the code jumps to the name when it's
 *  still empty rather than firing a create that can't happen — an Enter that
 *  silently does nothing reads as a broken key. */
function CourseComposer({
  termId,
  onClose,
  onCreate
}: {
  termId: string | null
  onClose: () => void
  onCreate: (input: { code: string; name: string; termId: string | null }) => Promise<Course | null>
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const ready = code.trim() !== '' && name.trim() !== ''

  const submit = async () => {
    if (!ready) return
    await onCreate({ code, name, termId })
    setCode('')
    setName('')
  }

  return (
    <div className="flex items-center gap-2 px-4 pb-3.5">
      <input
        autoFocus
        className={`${inputCls} w-28`}
        placeholder="ECSE 200"
        aria-label="Course code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            // The one Enter on this page that doesn't submit: a course needs
            // both fields, and an Enter that silently no-ops on the first of
            // them reads as a broken key.
            if (!name.trim()) nameRef.current?.focus()
            else void submit()
          } else if (e.key === 'Escape') onClose()
        }}
      />
      <input
        ref={nameRef}
        className={`${inputCls} min-w-0 flex-1`}
        placeholder="Electric Circuits 1"
        aria-label="Course name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void submit()
          } else if (e.key === 'Escape') onClose()
        }}
      />
      <button
        onClick={() => void submit()}
        disabled={!ready}
        className="btn-primary tactile shrink-0 rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-40"
      >
        Add
      </button>
      <button
        onClick={onClose}
        className="text-muted hover:text-ink shrink-0 text-[12.5px] font-medium transition-colors"
      >
        Done
      </button>
    </div>
  )
}

// ---------- archived ----------

function ArchivedShelf({
  store,
  terms,
  courses,
  expanded,
  onToggle
}: {
  store: AcademicsStore
  terms: Term[]
  courses: Course[]
  expanded: boolean
  onToggle: () => void
}) {
  const confirm = useConfirm()
  const summary = [
    terms.length ? `${terms.length} term${terms.length === 1 ? '' : 's'}` : null,
    courses.length ? `${courses.length} course${courses.length === 1 ? '' : 's'}` : null
  ]
    .filter(Boolean)
    .join(' · ')

  /** Restoring a course whose term is still archived brings the term back too:
   *  otherwise the row leaves this shelf and shows up nowhere, which reads as
   *  the app having eaten it. */
  const restoreCourse = async (course: Course) => {
    const term = course.termId ? store.termById.get(course.termId) : null
    if (term?.archived) await store.updateTerm(term.id, { archived: false })
    await store.updateCourse(course.id, { archived: false })
  }

  return (
    <div className="border-line/40 mt-8 max-w-3xl border-t pt-4">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="text-muted hover:text-ink flex w-full items-center gap-2 text-left transition-colors"
      >
        <IconCaret open={expanded} />
        <span className="section-label">Archived</span>
        <span className="text-faint nums ml-auto text-[12px]">{summary}</span>
      </button>

      {expanded && (
        <ul className="mt-2 space-y-0.5 opacity-70">
          {terms.map((t) => (
            <li
              key={t.id}
              className="surface-row flex items-center gap-2.5 rounded-[10px] px-3 py-2"
            >
              <span
                className="size-[11px] shrink-0 rounded-full"
                style={{ background: tagFill(t.color, 0.55) }}
                aria-hidden
              />
              <span className="text-[13.5px] font-semibold">{t.name}</span>
              <span className="text-faint nums text-[12px]">
                {store.courses.filter((c) => c.termId === t.id).length} courses
              </span>
              <button
                onClick={() => void store.updateTerm(t.id, { archived: false })}
                className="text-azure/85 hover:text-azure ml-auto text-[12.5px] font-medium transition-colors"
              >
                Restore
              </button>
            </li>
          ))}

          {courses.map((c) => {
            const term = c.termId ? store.termById.get(c.termId) : null
            return (
              <li
                key={c.id}
                className="group/arch surface-row flex items-center gap-2.5 rounded-[10px] px-3 py-2"
              >
                <span
                  className="size-[11px] shrink-0 rounded-full"
                  style={{ background: tagFill(c.color, 0.55) }}
                  aria-hidden
                />
                <span className="nums w-24 shrink-0 text-[12.5px] font-semibold tracking-wide">
                  {c.code}
                </span>
                <span className="text-muted min-w-0 flex-1 truncate text-[13px]">{c.name}</span>
                <span className="text-faint nums shrink-0 text-[12px]">
                  {term?.name ?? 'No term'}
                </span>
                <button
                  onClick={() => void restoreCourse(c)}
                  className="text-azure/85 hover:text-azure shrink-0 text-[12.5px] font-medium transition-colors"
                >
                  Restore
                </button>
                <button
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Delete ${c.code}?`,
                      body: 'Its lectures and chats go too.',
                      confirmLabel: 'Delete',
                      danger: true
                    })
                    if (ok) await store.deleteCourse(c.id)
                  }}
                  aria-label={`Delete ${c.code}`}
                  className="hover:text-coral shrink-0 text-[15px] leading-none opacity-0 transition-opacity group-hover/arch:opacity-100"
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ---------- course detail ----------

function CourseDetail({
  course,
  lectures,
  store,
  onBack,
  onOpenLecture,
  onChanged,
  onGone
}: {
  course: Course
  lectures: Lecture[]
  store: AcademicsStore
  onBack: () => void
  onOpenLecture: (id: string) => void
  onChanged: () => Promise<void>
  onGone: () => void
}) {
  const confirm = useConfirm()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayYMD())
  const term = course.termId ? store.termById.get(course.termId) ?? null : null

  const add = async () => {
    if (!title.trim() || !window.planner) return
    const created = await window.planner.lecturesCreate({
      courseId: course.id,
      title,
      lectureDate: date
    })
    setTitle('')
    await onChanged()
    onOpenLecture(created.id) // jump straight into summary writing
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="text-muted hover:text-azure text-[12.5px] font-medium transition-colors"
      >
        ← {term?.name ?? 'Academics'}
      </button>

      <div className="mt-1.5 flex max-w-3xl flex-wrap items-center gap-x-2.5 gap-y-2">
        <ColorSwatch
          color={course.color}
          size={13}
          ariaLabel={`Colour for ${course.code}`}
          onPick={(c) => void store.updateCourse(course.id, { color: c })}
        />
        <InlineEdit
          value={course.code}
          ariaLabel="Course code"
          onCommit={(next) => void store.updateCourse(course.id, { code: next })}
          className="nums text-[19px] font-bold tracking-[-0.02em]"
        />
        <span className="text-faint" aria-hidden>
          ·
        </span>
        <InlineEdit
          value={course.name}
          ariaLabel="Course name"
          onCommit={(next) => void store.updateCourse(course.id, { name: next })}
          className="text-muted min-w-0 flex-1 text-[15px]"
        />

        <Select
          value={course.termId ?? 'none'}
          ariaLabel="Term"
          className="shrink-0 py-1.5 text-[12.5px]"
          options={[
            { value: 'none', label: 'No term', dot: UNFILED_COLOR },
            ...store.terms.map((t) => ({
              value: t.id,
              label: t.name + (t.archived ? ' (archived)' : ''),
              dot: t.color
            }))
          ]}
          onChange={(v) => void store.updateCourse(course.id, { termId: v === 'none' ? null : v })}
        />
        <RowMenu
          ariaLabel={`Actions for ${course.code}`}
          className="py-1.5"
          actions={[
            {
              label: course.archived ? 'Unarchive' : 'Archive',
              onSelect: () => void store.updateCourse(course.id, { archived: !course.archived })
            },
            {
              label: 'Delete course',
              danger: true,
              onSelect: async () => {
                const ok = await confirm({
                  title: `Delete ${course.code}?`,
                  body: 'Its lectures and chats go too.',
                  confirmLabel: 'Delete',
                  danger: true
                })
                if (!ok) return
                await store.deleteCourse(course.id)
                onGone()
              }
            }
          ]}
        />
      </div>

      <div className="surface-recessed mt-5 flex max-w-2xl flex-wrap items-end gap-2 p-4">
        <div className="min-w-48 flex-1">
          <label className="text-muted mb-1 block text-[12px] font-semibold" htmlFor="l-title">
            New lecture
          </label>
          <input
            id="l-title"
            className={`${inputCls} w-full`}
            placeholder="Lecture 7 — Thévenin & Norton equivalents"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void add()
              } else if (e.key === 'Escape') setTitle('')
            }}
          />
        </div>
        <div>
          <span className="text-muted mb-1 block text-[12px] font-semibold">Date</span>
          <DateField value={date} ariaLabel="Lecture date" onChange={setDate} clearable={false} />
        </div>
        <button
          onClick={() => void add()}
          disabled={!title.trim()}
          className="btn-primary tactile rounded-[11px] px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {lectures.length === 0 ? (
        <p className="text-muted mt-5 max-w-2xl text-[13px]">
          No lectures yet. A title and a date is enough — the summary comes after class.
        </p>
      ) : (
        <ul className="mt-4 max-w-2xl space-y-1">
          {lectures.map((l) => (
            <li key={l.id}>
              <button
                onClick={() => onOpenLecture(l.id)}
                className="surface-row flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left"
              >
                <span className="text-muted nums w-20 shrink-0 text-[12px]">{l.lectureDate}</span>
                <span className="min-w-0 flex-1">
                  <span className="text-[13.5px]">{l.title}</span>
                  {l.summary ? (
                    <span className="text-muted ml-2 text-[12px]">
                      {l.summary.length > 70 ? `${l.summary.slice(0, 70)}…` : l.summary}
                    </span>
                  ) : (
                    <span className="text-azure/70 nums ml-2 text-[12px]">no summary</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------- lecture detail ----------

function LectureDetail({
  course,
  lecture,
  onBack,
  onChanged,
  onDeleted
}: {
  course: Course
  lecture: Lecture
  onBack: () => void
  onChanged: () => Promise<void>
  onDeleted: () => void
}) {
  const confirm = useConfirm()
  const [summary, setSummary] = useState(lecture.summary)
  const [savedFlash, setSavedFlash] = useState(false)
  const chat = useChat('lecture', lecture.id)
  const [configured, setConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    window.planner?.groqStatus().then((s) => setConfigured(s.configured)).catch(() => setConfigured(false))
  }, [])

  const dirty = summary !== lecture.summary
  const saveSummary = async () => {
    if (!window.planner || !dirty) return
    await window.planner.lecturesUpdate(lecture.id, { summary })
    await onChanged()
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 2000)
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="text-muted hover:text-azure text-[12.5px] font-medium transition-colors"
      >
        ← {course.code}
      </button>
      <div className="mt-1 flex items-baseline gap-3">
        <InlineEdit
          value={lecture.title}
          ariaLabel="Lecture title"
          onCommit={(next) => void window.planner?.lecturesUpdate(lecture.id, { title: next }).then(onChanged)}
          className="text-[18px] font-semibold tracking-[-0.02em]"
        />
        <span className="text-muted nums shrink-0 text-[12px]">{lecture.lectureDate}</span>
        <button
          onClick={async () => {
            const ok = await confirm({
              title: 'Delete this lecture?',
              body: 'Its chat goes too.',
              confirmLabel: 'Delete',
              danger: true
            })
            if (!ok) return
            await window.planner!.lecturesDelete(lecture.id)
            onDeleted()
          }}
          className="text-muted/60 hover:text-coral nums ml-auto shrink-0 text-[12px] transition-colors"
        >
          delete
        </button>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <label className="text-muted text-[13px] font-bold" htmlFor="lec-summary">
            Your summary
          </label>
          <button
            onClick={() => void saveSummary()}
            disabled={!dirty}
            className={`nums text-[12px] transition-colors ${
              savedFlash ? 'text-mint' : dirty ? 'text-azure hover:text-ink' : 'text-muted/50'
            }`}
          >
            {savedFlash ? 'saved ✓' : 'save'}
          </button>
        </div>
        <textarea
          id="lec-summary"
          rows={3}
          className="bg-surface border-line placeholder:text-faint focus:border-azure/60 mt-1.5 w-full resize-y rounded-[16px] px-3 py-2 text-[13px] leading-relaxed outline-none"
          placeholder="A few sentences on what this lecture covered… Enter saves, Shift+Enter for a new line."
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onKeyDown={(e) => {
            // A summary is two or three sentences you finish, not a document
            // you compose — so Enter means "done", the way it does in the chat
            // box below, and Shift+Enter is the newline. preventDefault first:
            // the textarea would otherwise insert the break into the value
            // that's about to be saved.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void saveSummary()
            } else if (e.key === 'Escape') {
              e.stopPropagation()
              setSummary(lecture.summary)
              e.currentTarget.blur()
            }
          }}
          onBlur={() => void saveSummary()}
        />
      </div>

      {chat.error && (
        <div className="border-coral/40 bg-coral/10 mt-3 rounded-[16px] border px-4 py-2.5 text-[13px]">
          {chat.error}
        </div>
      )}

      <div className="mt-3 flex h-[calc(100vh-24rem)] min-h-64 flex-col">
        <ChatView
          messages={chat.messages}
          pending={chat.pending}
          disabled={configured === false}
          disabledHint="Add a Groq key in Settings to chat about this lecture."
          quickActions={LECTURE_ACTIONS}
          onSend={(t) => void chat.send(t)}
          placeholder="Ask about this lecture…"
        />
      </div>
    </div>
  )
}

/** A disclosure caret: right when closed, down when open. Distinct from
 *  Popover's Chevron, which means "a popup is open" and flips 180°. */
function IconCaret({ open }: { open: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
      aria-hidden
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}
