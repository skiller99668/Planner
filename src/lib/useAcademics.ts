// Terms + courses, fetched once and mutated through main.
//
// Two pages read this: Academics draws the shelves, and Events needs the same
// list to offer courses in its category dropdown and to colour a course-tagged
// event. Both get the archived rows too — each decides what to show with them.

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Course, CourseInput, CoursePatch, Term, TermInput, TermPatch } from '../../shared/types'

export interface AcademicsStore {
  terms: Term[]
  courses: Course[]
  /** False until the first fetch lands, so an empty state can't flash. */
  loaded: boolean
  /** Course id → course, for the events page's colour/label lookups. */
  courseById: Map<string, Course>
  termById: Map<string, Term>
  /** Courses of one term in hand-placed order. `null` is the unfiled shelf. */
  coursesOf: (termId: string | null, opts?: { archived?: boolean }) => Course[]
  refresh: () => Promise<void>
  createTerm: (input: TermInput) => Promise<Term | null>
  updateTerm: (id: string, patch: TermPatch) => Promise<void>
  deleteTerm: (id: string) => Promise<void>
  reorderTerms: (ids: string[]) => Promise<void>
  createCourse: (input: CourseInput) => Promise<Course | null>
  updateCourse: (id: string, patch: CoursePatch) => Promise<void>
  deleteCourse: (id: string) => Promise<void>
  reorderCourses: (termId: string | null, ids: string[]) => Promise<void>
}

export function useAcademics(): AcademicsStore {
  const [terms, setTerms] = useState<Term[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    if (!window.planner) return
    const [t, c] = await Promise.all([window.planner.termsList(), window.planner.coursesList()])
    setTerms(t)
    setCourses(c)
    setLoaded(true)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses])
  const termById = useMemo(() => new Map(terms.map((t) => [t.id, t])), [terms])

  const coursesOf = useCallback(
    (termId: string | null, opts?: { archived?: boolean }) =>
      courses.filter((c) => c.termId === termId && c.archived === (opts?.archived ?? false)),
    [courses]
  )

  // Every mutation refetches rather than patching local state: the repo owns
  // the rules (a moved course lands at the end of its new shelf, an empty
  // rename is ignored), and re-reading is the only way the page sees them.
  const after = useCallback(
    async <T,>(work: Promise<T>): Promise<T> => {
      const out = await work
      await refresh()
      return out
    },
    [refresh]
  )

  return {
    terms,
    courses,
    loaded,
    courseById,
    termById,
    coursesOf,
    refresh,
    createTerm: (input) => (window.planner ? after(window.planner.termsCreate(input)) : Promise.resolve(null)),
    updateTerm: async (id, patch) => {
      if (window.planner) await after(window.planner.termsUpdate(id, patch))
    },
    deleteTerm: async (id) => {
      if (window.planner) await after(window.planner.termsDelete(id))
    },
    reorderTerms: async (ids) => {
      // Placed locally before the round trip: the drag hook drops its
      // transforms the instant the pointer lifts, so a re-render still holding
      // the old order makes the row bounce back before it settles.
      const at = new Map(ids.map((id, i) => [id, i + 1]))
      setTerms((prev) =>
        [...prev]
          .map((t) => (at.has(t.id) ? { ...t, sortOrder: at.get(t.id)! } : t))
          .sort((a, b) => a.sortOrder - b.sortOrder)
      )
      if (window.planner) await after(window.planner.termsReorder(ids))
    },
    createCourse: (input) =>
      window.planner ? after(window.planner.coursesCreate(input)) : Promise.resolve(null),
    updateCourse: async (id, patch) => {
      if (window.planner) await after(window.planner.coursesUpdate(id, patch))
    },
    deleteCourse: async (id) => {
      if (window.planner) await after(window.planner.coursesDelete(id))
    },
    reorderCourses: async (termId, ids) => {
      const at = new Map(ids.map((id, i) => [id, i + 1]))
      setCourses((prev) =>
        [...prev]
          .map((c) => (at.has(c.id) ? { ...c, sortOrder: at.get(c.id)! } : c))
          .sort((a, b) => a.sortOrder - b.sortOrder)
      )
      if (window.planner) await after(window.planner.coursesReorder(termId, ids))
    }
  }
}
