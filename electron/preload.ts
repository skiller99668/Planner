// Preload: the only bridge between renderer and main. Exposes the typed
// PlannerApi as window.planner via contextBridge; the renderer never sees
// Node or Electron APIs directly.

import { contextBridge, ipcRenderer } from 'electron'
import {
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
  GymLogInput,
  GymPatch,
  LectureInput,
  LecturePatch,
  SeriesInput,
  SeriesPatch,
  Settings,
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

  seriesList: () => ipcRenderer.invoke(IPC.seriesList),
  seriesCreate: (input: SeriesInput) => ipcRenderer.invoke(IPC.seriesCreate, input),
  seriesUpdate: (id: string, patch: SeriesPatch) =>
    ipcRenderer.invoke(IPC.seriesUpdate, id, patch),
  seriesDelete: (id: string) => ipcRenderer.invoke(IPC.seriesDelete, id),

  gymList: () => ipcRenderer.invoke(IPC.gymList),
  gymLog: (input: GymLogInput) => ipcRenderer.invoke(IPC.gymLog, input),
  gymUpdate: (id: string, patch: GymPatch) => ipcRenderer.invoke(IPC.gymUpdate, id, patch),
  gymDelete: (id: string) => ipcRenderer.invoke(IPC.gymDelete, id),

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

  appsList: () => ipcRenderer.invoke(IPC.appsList),
  appsCreate: (input: ApplicationInput) => ipcRenderer.invoke(IPC.appsCreate, input),
  appsUpdate: (id: string, patch: ApplicationPatch) => ipcRenderer.invoke(IPC.appsUpdate, id, patch),
  appsDelete: (id: string) => ipcRenderer.invoke(IPC.appsDelete, id),
  careerLogAdd: (kind: CareerLogKind) => ipcRenderer.invoke(IPC.careerLogAdd, kind),
  careerLogUndo: (kind: CareerLogKind) => ipcRenderer.invoke(IPC.careerLogUndo, kind),
  careerWeekStats: () => ipcRenderer.invoke(IPC.careerWeekStats),
  jobsFetch: (force?: boolean) => ipcRenderer.invoke(IPC.jobsFetch, force),
  tagsList: () => ipcRenderer.invoke(IPC.tagsList),
  tagsCreate: (name: string, color?: string) => ipcRenderer.invoke(IPC.tagsCreate, name, color),
  tagsDelete: (name: string) => ipcRenderer.invoke(IPC.tagsDelete, name),
  tagsSetColor: (name: string, color: string) => ipcRenderer.invoke(IPC.tagsSetColor, name, color),

  onTasksChanged: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on(TASKS_CHANGED_EVENT, listener)
    return () => ipcRenderer.removeListener(TASKS_CHANGED_EVENT, listener)
  }
}

contextBridge.exposeInMainWorld('planner', api)
