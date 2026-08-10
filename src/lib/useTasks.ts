// Task + series data hook: fetches once, refetches after every mutation.
// At personal-planner scale a full refetch is simpler and plenty fast.

import { useCallback, useEffect, useState } from 'react'
import type {
  SeriesInput,
  SeriesPatch,
  Task,
  Tag,
  TaskInput,
  TaskPatch,
  TaskSeries
} from '../../shared/types'

export interface TasksStore {
  tasks: Task[]
  series: TaskSeries[]
  /** Full tag vocabulary — includes tags not currently on any task. */
  tags: Tag[]
  loaded: boolean
  refresh: () => Promise<void>
  createTask: (input: TaskInput) => Promise<void>
  updateTask: (id: string, patch: TaskPatch) => Promise<void>
  toggleTask: (task: Task) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  /** Change how one task repeats; null stops the repeat. See PlannerApi. */
  setRecurrence: (id: string, input: SeriesInput | null) => Promise<void>
  createSeries: (input: SeriesInput) => Promise<void>
  updateSeries: (id: string, patch: SeriesPatch) => Promise<void>
  deleteSeries: (id: string) => Promise<void>
  createTag: (name: string, color?: string) => Promise<void>
  deleteTag: (name: string) => Promise<void>
  setTagColor: (name: string, color: string) => Promise<void>
}

/** A repeating series shows only its earliest still-open occurrence — the next
 *  one surfaces once you finish the current one. Shared by the Tasks page and
 *  the homepage so the two can never disagree about what's outstanding.
 *
 *  Rows that aren't open (done, or mid-completion-animation) always pass
 *  through, so a just-ticked occurrence can fade out while its successor
 *  appears. */
export function collapseSeries(tasks: Task[]): Task[] {
  const earliest = new Map<string, Task>()
  for (const t of tasks) {
    if (!t.seriesId || t.status !== 'open') continue
    const cur = earliest.get(t.seriesId)
    if (!cur || (t.occurrenceDate ?? '') < (cur.occurrenceDate ?? '')) {
      earliest.set(t.seriesId, t)
    }
  }
  return tasks.filter(
    (t) => !t.seriesId || t.status !== 'open' || earliest.get(t.seriesId) === t
  )
}

export function useTasks(): TasksStore {
  const [tasks, setTasks] = useState<Task[]>([])
  const [series, setSeries] = useState<TaskSeries[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    if (!window.planner) return
    const [t, s, g] = await Promise.all([
      window.planner.tasksList(),
      window.planner.seriesList(),
      window.planner.tagsList()
    ])
    setTasks(t)
    setSeries(s)
    setTags(g)
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
    tags,
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
    setRecurrence: (id, input) => wrap(() => window.planner!.tasksSetRecurrence(id, input)),
    createSeries: (input) => wrap(() => window.planner!.seriesCreate(input)),
    updateSeries: (id, patch) => wrap(() => window.planner!.seriesUpdate(id, patch)),
    deleteSeries: (id) => wrap(() => window.planner!.seriesDelete(id)),
    createTag: (name, color) => wrap(() => window.planner!.tagsCreate(name, color)),
    deleteTag: (name) => wrap(() => window.planner!.tagsDelete(name)),
    setTagColor: (name, color) => wrap(() => window.planner!.tagsSetColor(name, color))
  }
}
