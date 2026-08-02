// Task + series data hook: fetches once, refetches after every mutation.
// At personal-planner scale a full refetch is simpler and plenty fast.

import { useCallback, useEffect, useState } from 'react'
import type {
  SeriesInput,
  SeriesPatch,
  Task,
  TaskInput,
  TaskPatch,
  TaskSeries
} from '../../shared/types'

export interface TasksStore {
  tasks: Task[]
  series: TaskSeries[]
  loaded: boolean
  refresh: () => Promise<void>
  createTask: (input: TaskInput) => Promise<void>
  updateTask: (id: string, patch: TaskPatch) => Promise<void>
  toggleTask: (task: Task) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  createSeries: (input: SeriesInput) => Promise<void>
  updateSeries: (id: string, patch: SeriesPatch) => Promise<void>
  deleteSeries: (id: string) => Promise<void>
}

export function useTasks(): TasksStore {
  const [tasks, setTasks] = useState<Task[]>([])
  const [series, setSeries] = useState<TaskSeries[]>([])
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    if (!window.planner) return
    const [t, s] = await Promise.all([window.planner.tasksList(), window.planner.seriesList()])
    setTasks(t)
    setSeries(s)
    setLoaded(true)
  }, [])

  useEffect(() => {
    void refresh()
    // Main pushes when data changes outside our own calls (auto-tagging,
    // daily occurrence generation).
    return window.planner?.onTasksChanged(() => void refresh())
  }, [refresh])

  const wrap = useCallback(
    async (op: () => Promise<unknown>) => {
      await op()
      await refresh()
    },
    [refresh]
  )

  return {
    tasks,
    series,
    loaded,
    refresh,
    createTask: (input) => wrap(() => window.planner!.tasksCreate(input)),
    updateTask: (id, patch) => wrap(() => window.planner!.tasksUpdate(id, patch)),
    toggleTask: (task) =>
      wrap(() =>
        window.planner!.tasksUpdate(task.id, {
          status: task.status === 'done' ? 'open' : 'done'
        })
      ),
    deleteTask: (id) => wrap(() => window.planner!.tasksDelete(id)),
    createSeries: (input) => wrap(() => window.planner!.seriesCreate(input)),
    updateSeries: (id, patch) => wrap(() => window.planner!.seriesUpdate(id, patch)),
    deleteSeries: (id) => wrap(() => window.planner!.seriesDelete(id))
  }
}
