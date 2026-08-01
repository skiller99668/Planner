import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'ee-planner-data-v1'

// This shape is deliberately flat and serializable so it maps 1:1 onto
// future Postgres/Supabase tables (tasks, gym_sessions, badminton_sessions,
// applications, projects, courses) without restructuring the UI layer.
const DEFAULT_DATA = {
  tasks: [],
  gymSessions: [],       // { id, date, type: 'push'|'pull'|'legs', notes }
  badmintonSessions: [], // { id, date, kind: 'practice'|'casual'|'tournament', notes }
  applications: [],      // { id, company, role, stage, deadline, notes }
  courses: [],           // { id, name, credits }
  projects: [],          // { id, name, status, skills, link }
  goalTargets: {
    gpa: { current: 4.0, target: 3.8 },
    gymPerWeek: { target: 6, floor: 4 },
    badmintonPerWeek: { target: 3 }
  }
}

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_DATA
    return { ...DEFAULT_DATA, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_DATA
  }
}

export function usePlannerData() {
  const [data, setData] = useState(loadInitial)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [data])

  const addTask = useCallback((task) => {
    setData((d) => ({
      ...d,
      tasks: [
        ...d.tasks,
        {
          id: crypto.randomUUID(),
          title: task.title,
          category: task.category || 'general',
          dueDate: task.dueDate || null,
          done: false,
          createdAt: new Date().toISOString()
        }
      ]
    }))
  }, [])

  const toggleTask = useCallback((id) => {
    setData((d) => ({
      ...d,
      tasks: d.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    }))
  }, [])

  const deleteTask = useCallback((id) => {
    setData((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== id) }))
  }, [])

  const logGymSession = useCallback((type) => {
    setData((d) => ({
      ...d,
      gymSessions: [
        ...d.gymSessions,
        { id: crypto.randomUUID(), date: new Date().toISOString(), type }
      ]
    }))
  }, [])

  const logBadmintonSession = useCallback((kind) => {
    setData((d) => ({
      ...d,
      badmintonSessions: [
        ...d.badmintonSessions,
        { id: crypto.randomUUID(), date: new Date().toISOString(), kind }
      ]
    }))
  }, [])

  return {
    data,
    addTask,
    toggleTask,
    deleteTask,
    logGymSession,
    logBadmintonSession
  }
}

// Helper: sessions within the current week (Mon-Sun)
export function thisWeekCount(sessions) {
  const now = new Date()
  const day = (now.getDay() + 6) % 7 // 0 = Monday
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(now.getDate() - day)
  return sessions.filter((s) => new Date(s.date) >= monday).length
}
