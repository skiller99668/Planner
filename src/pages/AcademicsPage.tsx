import { useCallback, useEffect, useState } from 'react'
import type { Course, Lecture } from '../../shared/types'
import ChatView from '../components/ChatView'
import { todayYMD } from '../lib/dates'
import { useChat } from '../lib/useChat'

const LECTURE_ACTIONS = [
  { label: 'explain deeper', prompt: 'Explain the key concepts from this lecture in more depth, building on my summary.' },
  { label: 'quiz me', prompt: 'Quiz me with 5 questions on this lecture, one at a time. Wait for my answer before revealing the solution and moving on.' },
  { label: 'likely exam questions', prompt: 'Based on this lecture and the recent ones, what exam questions are most likely? Sketch how to approach each.' },
  { label: 'make study tasks', prompt: 'Create 2-4 small study tasks for this lecture material with sensible due dates this week, tagged with the course code.' }
]

const inputCls =
  'bg-bench border-line rounded-md border px-2.5 py-1.5 text-[13px] placeholder:text-muted/60 focus:border-amber/60'

export default function AcademicsPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loaded, setLoaded] = useState(false)
  const [courseId, setCourseId] = useState<string | null>(null)
  const [lectures, setLectures] = useState<Lecture[]>([])
  const [lectureId, setLectureId] = useState<string | null>(null)

  const refreshCourses = useCallback(async () => {
    if (!window.planner) return
    setCourses(await window.planner.coursesList())
    setLoaded(true)
  }, [])

  const refreshLectures = useCallback(async () => {
    if (!window.planner || !courseId) {
      setLectures([])
      return
    }
    setLectures(await window.planner.lecturesList(courseId))
  }, [courseId])

  useEffect(() => {
    void refreshCourses()
  }, [refreshCourses])
  useEffect(() => {
    void refreshLectures()
  }, [refreshLectures])

  const course = courses.find((c) => c.id === courseId) ?? null
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
        onBack={() => {
          setCourseId(null)
          setLectureId(null)
        }}
        onOpenLecture={setLectureId}
        onChanged={refreshLectures}
        onDeleteCourse={async () => {
          if (!window.confirm(`Delete ${course.code} and all its lectures + chats?`)) return
          await window.planner!.coursesDelete(course.id)
          setCourseId(null)
          void refreshCourses()
        }}
      />
    )
  }

  return (
    <CourseList courses={courses} loaded={loaded} onOpen={setCourseId} onChanged={refreshCourses} />
  )
}

// ---------- course list ----------

function CourseList({
  courses,
  loaded,
  onOpen,
  onChanged
}: {
  courses: Course[]
  loaded: boolean
  onOpen: (id: string) => void
  onChanged: () => Promise<void>
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [term, setTerm] = useState('Fall 2026')

  const add = async () => {
    if (!code.trim() || !name.trim() || !window.planner) return
    await window.planner.coursesCreate({ code, name, term })
    setCode('')
    setName('')
    await onChanged()
  }

  return (
    <div>
      <p className="text-muted font-mono text-[11px] tracking-[0.16em] uppercase">
        Courses · lectures · lecture chats
      </p>
      <h1 className="font-display mt-1 text-xl font-semibold">Academics</h1>
      <p className="text-muted mt-3 max-w-xl text-[13px] leading-relaxed">
        After each lecture: add it here, write a few sentences of summary, then ask the chat to
        go deeper, quiz you, or turn it into study tasks.
      </p>

      <div className="border-line bg-panel mt-6 flex max-w-2xl flex-wrap items-end gap-2 rounded-lg border p-4">
        <div>
          <label className="text-muted mb-1 block font-mono text-[10.5px] uppercase" htmlFor="c-code">
            Code
          </label>
          <input id="c-code" className={`${inputCls} w-28`} placeholder="ECSE 200"
            value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="min-w-40 flex-1">
          <label className="text-muted mb-1 block font-mono text-[10.5px] uppercase" htmlFor="c-name">
            Name
          </label>
          <input id="c-name" className={`${inputCls} w-full`} placeholder="Electric Circuits 1"
            value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()} />
        </div>
        <div>
          <label className="text-muted mb-1 block font-mono text-[10.5px] uppercase" htmlFor="c-term">
            Term
          </label>
          <input id="c-term" className={`${inputCls} w-28`} value={term}
            onChange={(e) => setTerm(e.target.value)} />
        </div>
        <button
          onClick={() => void add()}
          disabled={!code.trim() || !name.trim()}
          className="bg-amber text-bench rounded-md px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-40"
        >
          Add course
        </button>
      </div>

      {courses.length === 0 && loaded ? (
        <p className="text-muted mt-6 text-[13px]">
          No courses yet. Add your Fall 2026 lineup above.
        </p>
      ) : (
        <div className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-2">
          {courses.map((c) => (
            <button
              key={c.id}
              onClick={() => onOpen(c.id)}
              className="border-line bg-panel hover:border-amber/50 rounded-lg border p-4 text-left transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} aria-hidden />
                <span className="font-mono text-[12px] font-semibold tracking-wide">{c.code}</span>
                <span className="text-muted ml-auto font-mono text-[10.5px]">{c.term}</span>
              </div>
              <p className="mt-1.5 text-[13.5px]">{c.name}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- course detail ----------

function CourseDetail({
  course,
  lectures,
  onBack,
  onOpenLecture,
  onChanged,
  onDeleteCourse
}: {
  course: Course
  lectures: Lecture[]
  onBack: () => void
  onOpenLecture: (id: string) => void
  onChanged: () => Promise<void>
  onDeleteCourse: () => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayYMD())

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
      <button onClick={onBack} className="text-muted hover:text-amber font-mono text-[11px] transition-colors">
        ← courses
      </button>
      <div className="mt-1 flex items-baseline gap-3">
        <h1 className="font-display text-xl font-semibold">
          <span style={{ color: course.color }}>{course.code}</span> · {course.name}
        </h1>
        <span className="text-muted font-mono text-[10.5px]">{course.term}</span>
        <button
          onClick={() => void onDeleteCourse()}
          className="text-muted/60 hover:text-danger ml-auto font-mono text-[10.5px] transition-colors"
        >
          delete course
        </button>
      </div>

      <div className="border-line bg-panel mt-5 flex max-w-2xl flex-wrap items-end gap-2 rounded-lg border p-4">
        <div className="min-w-48 flex-1">
          <label className="text-muted mb-1 block font-mono text-[10.5px] uppercase" htmlFor="l-title">
            New lecture
          </label>
          <input id="l-title" className={`${inputCls} w-full`}
            placeholder="Lecture 7 — Thévenin & Norton equivalents"
            value={title} onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()} />
        </div>
        <div>
          <label className="text-muted mb-1 block font-mono text-[10.5px] uppercase" htmlFor="l-date">
            Date
          </label>
          <input id="l-date" type="date" className={inputCls} value={date}
            onChange={(e) => setDate(e.target.value)} />
        </div>
        <button
          onClick={() => void add()}
          disabled={!title.trim()}
          className="bg-amber text-bench rounded-md px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {lectures.length === 0 ? (
        <p className="text-muted mt-5 text-[13px]">
          No lectures yet. Add one right after class while it&apos;s fresh.
        </p>
      ) : (
        <ul className="mt-4 max-w-2xl space-y-1">
          {lectures.map((l) => (
            <li key={l.id}>
              <button
                onClick={() => onOpenLecture(l.id)}
                className="border-line/60 bg-panel/60 hover:bg-panel flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors"
              >
                <span className="text-muted w-20 shrink-0 font-mono text-[10.5px]">{l.lectureDate}</span>
                <span className="min-w-0 flex-1">
                  <span className="text-[13.5px]">{l.title}</span>
                  {l.summary ? (
                    <span className="text-muted ml-2 text-[12px]">
                      {l.summary.length > 70 ? `${l.summary.slice(0, 70)}…` : l.summary}
                    </span>
                  ) : (
                    <span className="text-amber/70 ml-2 font-mono text-[10.5px]">summary missing</span>
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
      <button onClick={onBack} className="text-muted hover:text-amber font-mono text-[11px] transition-colors">
        ← {course.code}
      </button>
      <div className="mt-1 flex items-baseline gap-3">
        <h1 className="font-display text-lg font-semibold">{lecture.title}</h1>
        <span className="text-muted font-mono text-[10.5px]">{lecture.lectureDate}</span>
        <button
          onClick={async () => {
            if (!window.confirm('Delete this lecture and its chat?')) return
            await window.planner!.lecturesDelete(lecture.id)
            onDeleted()
          }}
          className="text-muted/60 hover:text-danger ml-auto font-mono text-[10.5px] transition-colors"
        >
          delete
        </button>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <label className="text-muted font-mono text-[11px] tracking-[0.16em] uppercase" htmlFor="lec-summary">
            Your summary
          </label>
          <button
            onClick={() => void saveSummary()}
            disabled={!dirty}
            className={`font-mono text-[11px] transition-colors ${
              savedFlash ? 'text-ok' : dirty ? 'text-amber hover:text-ink' : 'text-muted/50'
            }`}
          >
            {savedFlash ? 'saved ✓' : 'save'}
          </button>
        </div>
        <textarea
          id="lec-summary"
          rows={3}
          className="bg-panel border-line placeholder:text-muted/60 focus:border-amber/60 mt-1.5 w-full resize-y rounded-lg border px-3 py-2 text-[13px] leading-relaxed"
          placeholder="A few sentences on what this lecture covered — the chat uses this as its ground truth."
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onBlur={() => void saveSummary()}
        />
      </div>

      {chat.error && (
        <div className="border-danger/40 bg-danger/10 mt-3 rounded-lg border px-4 py-2.5 text-[13px]">
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
