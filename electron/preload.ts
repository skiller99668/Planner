// Preload: the only bridge between renderer and main. Exposes the typed
// PlannerApi as window.planner via contextBridge; the renderer never sees
// Node or Electron APIs directly.

import { contextBridge, ipcRenderer } from 'electron'
import {
  CAPTURE_RESET_EVENT,
  IPC,
  TASKS_CHANGED_EVENT,
  type ChatSendInput,
  type PlannerApi
} from '../shared/ipc'
import type {
  ApplicationInput,
  ApplicationPatch,
  CareerLogKind,
  CourseInput,
  EventInput,
  EventKind,
  EventPatch,
  FeedEvent,
  GymLogInput,
  GymPatch,
  LectureInput,
  LecturePatch,
  LeetcodeLogInput,
  LeetcodePatch,
  SeriesInput,
  SeriesPatch,
  Settings,
  SubtaskPatch,
  TaskInput,
  TaskPatch
} from '../shared/types'

const api: PlannerApi = {
  ping: () => ipcRenderer.invoke(IPC.appPing),
  getSettings: () => ipcRenderer.invoke(IPC.settingsGetAll),
  patchSettings: (patch: Partial<Settings>) => ipcRenderer.invoke(IPC.settingsPatch, patch),
  testNotification: () => ipcRenderer.invoke(IPC.notifyTest),
  openExternal: (url: string) => ipcRenderer.invoke(IPC.openExternal, url),

  tasksList: () => ipcRenderer.invoke(IPC.tasksList),
  tasksCreate: (input: TaskInput) => ipcRenderer.invoke(IPC.tasksCreate, input),
  tasksUpdate: (id: string, patch: TaskPatch) => ipcRenderer.invoke(IPC.tasksUpdate, id, patch),
  tasksDelete: (id: string) => ipcRenderer.invoke(IPC.tasksDelete, id),
  tasksReorder: (ids: string[]) => ipcRenderer.invoke(IPC.tasksReorder, ids),
  tasksSetRecurrence: (id: string, input: SeriesInput | null) =>
    ipcRenderer.invoke(IPC.tasksSetRecurrence, id, input),

  subtasksList: () => ipcRenderer.invoke(IPC.subtasksList),
  subtasksCreate: (taskId: string, title: string) =>
    ipcRenderer.invoke(IPC.subtasksCreate, taskId, title),
  subtasksUpdate: (id: string, patch: SubtaskPatch) =>
    ipcRenderer.invoke(IPC.subtasksUpdate, id, patch),
  subtasksDelete: (id: string) => ipcRenderer.invoke(IPC.subtasksDelete, id),
  subtasksReorder: (taskId: string, ids: string[]) =>
    ipcRenderer.invoke(IPC.subtasksReorder, taskId, ids),

  seriesList: () => ipcRenderer.invoke(IPC.seriesList),
  seriesCreate: (input: SeriesInput) => ipcRenderer.invoke(IPC.seriesCreate, input),
  seriesUpdate: (id: string, patch: SeriesPatch) =>
    ipcRenderer.invoke(IPC.seriesUpdate, id, patch),
  seriesDelete: (id: string) => ipcRenderer.invoke(IPC.seriesDelete, id),

  gymList: () => ipcRenderer.invoke(IPC.gymList),
  gymLog: (input: GymLogInput) => ipcRenderer.invoke(IPC.gymLog, input),
  gymUpdate: (id: string, patch: GymPatch) => ipcRenderer.invoke(IPC.gymUpdate, id, patch),
  gymDelete: (id: string) => ipcRenderer.invoke(IPC.gymDelete, id),

  leetcodeList: () => ipcRenderer.invoke(IPC.leetcodeList),
  leetcodeLog: (input: LeetcodeLogInput) => ipcRenderer.invoke(IPC.leetcodeLog, input),
  leetcodeUpdate: (id: string, patch: LeetcodePatch) =>
    ipcRenderer.invoke(IPC.leetcodeUpdate, id, patch),
  leetcodeDelete: (id: string) => ipcRenderer.invoke(IPC.leetcodeDelete, id),
  leetcodeSync: (username: string) => ipcRenderer.invoke(IPC.leetcodeSync, username),

  groqStatus: () => ipcRenderer.invoke(IPC.groqStatus),
  groqSetKey: (key: string) => ipcRenderer.invoke(IPC.groqSetKey, key),
  groqListModels: () => ipcRenderer.invoke(IPC.groqListModels),

  coursesList: () => ipcRenderer.invoke(IPC.coursesList),
  coursesCreate: (input: CourseInput) => ipcRenderer.invoke(IPC.coursesCreate, input),
  coursesDelete: (id: string) => ipcRenderer.invoke(IPC.coursesDelete, id),
  lecturesList: (courseId: string) => ipcRenderer.invoke(IPC.lecturesList, courseId),
  lecturesCreate: (input: LectureInput) => ipcRenderer.invoke(IPC.lecturesCreate, input),
  lecturesUpdate: (id: string, patch: LecturePatch) =>
    ipcRenderer.invoke(IPC.lecturesUpdate, id, patch),
  lecturesDelete: (id: string) => ipcRenderer.invoke(IPC.lecturesDelete, id),

  chatThreads: (scope: 'general' | 'lecture', refId: string | null) =>
    ipcRenderer.invoke(IPC.chatThreads, scope, refId),
  chatMessages: (threadId: string) => ipcRenderer.invoke(IPC.chatMessages, threadId),
  chatSend: (input: ChatSendInput) => ipcRenderer.invoke(IPC.chatSend, input),

  eventsList: () => ipcRenderer.invoke(IPC.eventsList),
  eventsCreate: (input: EventInput) => ipcRenderer.invoke(IPC.eventsCreate, input),
  eventsUpdate: (id: string, patch: EventPatch) => ipcRenderer.invoke(IPC.eventsUpdate, id, patch),
  eventsDelete: (id: string) => ipcRenderer.invoke(IPC.eventsDelete, id),
  eventsImportIcs: (kind: EventKind) => ipcRenderer.invoke(IPC.eventsImportIcs, kind),
  eventsFetchBadminton: (force?: boolean) => ipcRenderer.invoke(IPC.eventsFetchBadminton, force),
  eventsImportFeed: (events: FeedEvent[]) => ipcRenderer.invoke(IPC.eventsImportFeed, events),

  appsList: () => ipcRenderer.invoke(IPC.appsList),
  appsCreate: (input: ApplicationInput) => ipcRenderer.invoke(IPC.appsCreate, input),
  appsUpdate: (id: string, patch: ApplicationPatch) => ipcRenderer.invoke(IPC.appsUpdate, id, patch),
  appsDelete: (id: string) => ipcRenderer.invoke(IPC.appsDelete, id),
  careerLogAdd: (kind: CareerLogKind) => ipcRenderer.invoke(IPC.careerLogAdd, kind),
  careerLogUndo: (kind: CareerLogKind) => ipcRenderer.invoke(IPC.careerLogUndo, kind),
  careerWeekStats: () => ipcRenderer.invoke(IPC.careerWeekStats),
  jobsFetch: (force?: boolean) => ipcRenderer.invoke(IPC.jobsFetch, force),
  searchAll: (query: string) => ipcRenderer.invoke(IPC.searchAll, query),
  tagsList: () => ipcRenderer.invoke(IPC.tagsList),
  tagsCreate: (name: string, color?: string) => ipcRenderer.invoke(IPC.tagsCreate, name, color),
  tagsDelete: (name: string) => ipcRenderer.invoke(IPC.tagsDelete, name),
  tagsSetColor: (name: string, color: string) => ipcRenderer.invoke(IPC.tagsSetColor, name, color),

  onTasksChanged: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on(TASKS_CHANGED_EVENT, listener)
    return () => ipcRenderer.removeListener(TASKS_CHANGED_EVENT, listener)
  },

  captureDismiss: () => ipcRenderer.invoke(IPC.captureDismiss),
  onCaptureReset: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on(CAPTURE_RESET_EVENT, listener)
    return () => ipcRenderer.removeListener(CAPTURE_RESET_EVENT, listener)
  }
}

contextBridge.exposeInMainWorld('planner', api)
