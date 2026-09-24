// IPC handler registration. Every channel in shared/ipc.ts is implemented here;
// the preload exposes the matching PlannerApi methods to the renderer.

import { app, ipcMain, Notification, shell } from 'electron'
import { IPC, type AppInfo, type ChatSendInput } from '../shared/ipc'
import type {
  ApplicationInput,
  ApplicationPatch,
  CareerLogKind,
  CourseInput,
  CoursePatch,
  EventInput,
  EventKind,
  EventPatch,
  EventScope,
  FeedEvent,
  GoalEntryInput,
  GoalInput,
  GoalPatch,
  GoalStepPatch,
  GymLogInput,
  GymPatch,
  LectureInput,
  LecturePatch,
  LeetcodeLogInput,
  LeetcodePatch,
  Mood,
  SeriesInput,
  SeriesPatch,
  Settings,
  SubtaskPatch,
  TaskInput,
  TaskPatch,
  TermInput,
  TermPatch
} from '../shared/types'
import {
  createCourse,
  createLecture,
  createTerm,
  deleteCourse,
  deleteLecture,
  deleteTerm,
  listCourses,
  listLectures,
  listTerms,
  reorderCourses,
  reorderTerms,
  updateCourse,
  updateLecture,
  updateTerm
} from './academicsRepo'
import {
  addGoalEntry,
  carryGoal,
  createGoal,
  createGoalStep,
  deleteGoal,
  deleteGoalEntry,
  deleteGoalStep,
  listGoalEntries,
  listGoalSteps,
  listGoals,
  reorderGoalSteps,
  reorderGoals,
  updateGoal,
  updateGoalStep
} from './goalsRepo'
import {
  changeJournalPasscode,
  deleteJournalEntry,
  getJournalEntry,
  journalStatus,
  listJournalEntries,
  lockJournal,
  resetJournal,
  resetJournalPasscode,
  saveJournalEntry,
  setJournalMood,
  setJournalPasscode,
  unlockJournal
} from './journalRepo'
import { assistantSend } from './assistant'
import {
  addCareerLog,
  careerWeekStats,
  createApplication,
  deleteApplication,
  listApplications,
  undoCareerLog,
  updateApplication
} from './careerRepo'
import { listMessages, listThreads } from './chatRepo'
import { getDbPath, getSchemaVersion } from './db'
import { fetchBadmintonQuebec } from './badmintonFeed'
import {
  createEvent,
  deleteEvent,
  importFeedEvents,
  importIcs,
  listEvents,
  updateEvent
} from './eventsRepo'
import { fetchJobs } from './jobsFeed'
import { createTag, deleteTag, listTags, setTagColor } from './tagsRepo'
import { getGroqStatus, listModels, setGroqKey } from './groq'
import {
  deleteGymSession,
  listGymSessions,
  logGymSession,
  updateGymSession
} from './gymRepo'
import {
  deleteLeetcode,
  listLeetcode,
  logLeetcode,
  syncLeetcode,
  updateLeetcode
} from './leetcodeRepo'
import {
  createSeries,
  deleteSeries,
  listSeries,
  setTaskRecurrence,
  updateSeries
} from './recurrence'
import { searchAll } from './searchRepo'
import { getSettings, patchSettings } from './settings'
import {
  createSubtask,
  deleteSubtask,
  listSubtasks,
  reorderSubtasks,
  updateSubtask
} from './subtasksRepo'
import { createTask, deleteTask, listTasks, reorderTasks, updateTask } from './tasksRepo'

export interface IpcDeps {
  applyAutostart: (enabled: boolean) => void
  /** Broadcast that task/series data changed outside a renderer request. */
  notifyDataChanged: () => void
  /** Hide the global capture bar. */
  dismissCapture: () => void
  /** Re-point the OS hotkey; false when the combination was refused. */
  applyCaptureShortcut: (accelerator: string | null) => boolean
}

export function registerIpcHandlers(deps: IpcDeps): void {
  ipcMain.handle(IPC.appPing, (): AppInfo => {
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      dbPath: getDbPath(),
      schemaVersion: getSchemaVersion(),
      packaged: app.isPackaged
    }
  })

  ipcMain.handle(IPC.settingsGetAll, (): Settings => getSettings())

  ipcMain.handle(IPC.settingsPatch, (_e, patch: Partial<Settings>): Settings => {
    const next = patchSettings(patch)
    if ('autostart' in patch) deps.applyAutostart(next.autostart)
    if ('captureShortcut' in patch) deps.applyCaptureShortcut(next.captureShortcut)
    return next
  })

  ipcMain.handle(IPC.notifyTest, (): boolean => {
    if (!Notification.isSupported()) return false
    new Notification({
      title: 'Planner',
      body: 'Notifications are working. Reminders will look like this.'
    }).show()
    return true
  })

  ipcMain.handle(IPC.openExternal, async (_e, url: string): Promise<void> => {
    // Only allow http(s) links out of the app.
    if (/^https?:\/\//i.test(url)) await shell.openExternal(url)
  })

  // ---------- tasks ----------
  ipcMain.handle(IPC.tasksList, () => listTasks())
  ipcMain.handle(IPC.tasksCreate, (_e, input: TaskInput) => createTask(input))
  ipcMain.handle(IPC.tasksUpdate, (_e, id: string, patch: TaskPatch) => updateTask(id, patch))
  ipcMain.handle(IPC.tasksDelete, (_e, id: string) => deleteTask(id))
  ipcMain.handle(IPC.tasksReorder, (_e, ids: string[]) => reorderTasks(ids))
  ipcMain.handle(IPC.tasksSetRecurrence, (_e, id: string, input: SeriesInput | null) =>
    setTaskRecurrence(id, input)
  )

  // ---------- subtasks ----------
  ipcMain.handle(IPC.subtasksList, () => listSubtasks())
  ipcMain.handle(IPC.subtasksCreate, (_e, taskId: string, title: string) =>
    createSubtask(taskId, title)
  )
  ipcMain.handle(IPC.subtasksUpdate, (_e, id: string, patch: SubtaskPatch) =>
    updateSubtask(id, patch)
  )
  ipcMain.handle(IPC.subtasksDelete, (_e, id: string) => deleteSubtask(id))
  ipcMain.handle(IPC.subtasksReorder, (_e, taskId: string, ids: string[]) =>
    reorderSubtasks(taskId, ids)
  )

  // ---------- recurring series ----------
  ipcMain.handle(IPC.seriesList, () => listSeries())
  ipcMain.handle(IPC.seriesCreate, (_e, input: SeriesInput) => createSeries(input))
  ipcMain.handle(IPC.seriesUpdate, (_e, id: string, patch: SeriesPatch) =>
    updateSeries(id, patch)
  )
  ipcMain.handle(IPC.seriesDelete, (_e, id: string) => deleteSeries(id))

  // ---------- gym ----------
  ipcMain.handle(IPC.gymList, () => listGymSessions())
  ipcMain.handle(IPC.gymLog, (_e, input: GymLogInput) => logGymSession(input))
  ipcMain.handle(IPC.gymUpdate, (_e, id: string, patch: GymPatch) => updateGymSession(id, patch))
  ipcMain.handle(IPC.gymDelete, (_e, id: string) => deleteGymSession(id))

  // ---------- leetcode ----------
  ipcMain.handle(IPC.leetcodeList, () => listLeetcode())
  ipcMain.handle(IPC.leetcodeLog, (_e, input: LeetcodeLogInput) => logLeetcode(input))
  ipcMain.handle(IPC.leetcodeUpdate, (_e, id: string, patch: LeetcodePatch) =>
    updateLeetcode(id, patch)
  )
  ipcMain.handle(IPC.leetcodeDelete, (_e, id: string) => deleteLeetcode(id))
  ipcMain.handle(IPC.leetcodeSync, (_e, username: string) => syncLeetcode(username))

  // ---------- groq ----------
  ipcMain.handle(IPC.groqStatus, () => getGroqStatus())
  ipcMain.handle(IPC.groqSetKey, (_e, key: string) => setGroqKey(key))
  ipcMain.handle(IPC.groqListModels, () => listModels())

  // ---------- journal ----------
  ipcMain.handle(IPC.journalStatus, () => journalStatus())
  ipcMain.handle(IPC.journalSetPasscode, (_e, passcode: string) => setJournalPasscode(passcode))
  ipcMain.handle(IPC.journalChangePasscode, (_e, current: string, next: string) =>
    changeJournalPasscode(current, next)
  )
  ipcMain.handle(IPC.journalUnlock, (_e, passcode: string) => unlockJournal(passcode))
  ipcMain.handle(IPC.journalLock, () => lockJournal())
  ipcMain.handle(IPC.journalList, () => listJournalEntries())
  ipcMain.handle(IPC.journalGet, (_e, date: string) => getJournalEntry(date))
  ipcMain.handle(IPC.journalSave, (_e, date: string, body: string) => saveJournalEntry(date, body))
  ipcMain.handle(IPC.journalSetMood, (_e, date: string, mood: Mood | null) =>
    setJournalMood(date, mood)
  )
  ipcMain.handle(IPC.journalDelete, (_e, date: string) => deleteJournalEntry(date))
  ipcMain.handle(IPC.journalResetPasscode, (_e, next: string) => resetJournalPasscode(next))
  ipcMain.handle(IPC.journalReset, () => resetJournal())

  // ---------- goals ----------
  ipcMain.handle(IPC.goalsList, (_e, month: string) => listGoals(month))
  ipcMain.handle(IPC.goalsCreate, (_e, input: GoalInput) => createGoal(input))
  ipcMain.handle(IPC.goalsUpdate, (_e, id: string, patch: GoalPatch) => updateGoal(id, patch))
  ipcMain.handle(IPC.goalsDelete, (_e, id: string) => deleteGoal(id))
  ipcMain.handle(IPC.goalsReorder, (_e, month: string, ids: string[]) => reorderGoals(month, ids))
  ipcMain.handle(IPC.goalsCarry, (_e, id: string, month: string) => carryGoal(id, month))
  ipcMain.handle(IPC.goalStepsList, () => listGoalSteps())
  ipcMain.handle(IPC.goalStepsCreate, (_e, goalId: string, title: string) =>
    createGoalStep(goalId, title)
  )
  ipcMain.handle(IPC.goalStepsUpdate, (_e, id: string, patch: GoalStepPatch) =>
    updateGoalStep(id, patch)
  )
  ipcMain.handle(IPC.goalStepsDelete, (_e, id: string) => deleteGoalStep(id))
  ipcMain.handle(IPC.goalStepsReorder, (_e, goalId: string, ids: string[]) =>
    reorderGoalSteps(goalId, ids)
  )
  ipcMain.handle(IPC.goalEntriesList, () => listGoalEntries())
  ipcMain.handle(IPC.goalEntryAdd, (_e, input: GoalEntryInput) => addGoalEntry(input))
  ipcMain.handle(IPC.goalEntryDelete, (_e, id: string) => deleteGoalEntry(id))

  ipcMain.handle(IPC.termsList, () => listTerms())
  ipcMain.handle(IPC.termsCreate, (_e, input: TermInput) => createTerm(input))
  ipcMain.handle(IPC.termsUpdate, (_e, id: string, patch: TermPatch) => updateTerm(id, patch))
  ipcMain.handle(IPC.termsDelete, (_e, id: string) => deleteTerm(id))
  ipcMain.handle(IPC.termsReorder, (_e, ids: string[]) => reorderTerms(ids))
  ipcMain.handle(IPC.coursesList, () => listCourses())
  ipcMain.handle(IPC.coursesCreate, (_e, input: CourseInput) => createCourse(input))
  ipcMain.handle(IPC.coursesUpdate, (_e, id: string, patch: CoursePatch) => updateCourse(id, patch))
  ipcMain.handle(IPC.coursesDelete, (_e, id: string) => deleteCourse(id))
  ipcMain.handle(IPC.coursesReorder, (_e, termId: string | null, ids: string[]) =>
    reorderCourses(termId, ids)
  )
  ipcMain.handle(IPC.lecturesList, (_e, courseId: string) => listLectures(courseId))
  ipcMain.handle(IPC.lecturesCreate, (_e, input: LectureInput) => createLecture(input))
  ipcMain.handle(IPC.lecturesUpdate, (_e, id: string, patch: LecturePatch) =>
    updateLecture(id, patch)
  )
  ipcMain.handle(IPC.lecturesDelete, (_e, id: string) => deleteLecture(id))

  // ---------- chat / assistant ----------
  ipcMain.handle(IPC.chatThreads, (_e, scope: 'general' | 'lecture', refId: string | null) =>
    listThreads(scope, refId)
  )
  ipcMain.handle(IPC.chatMessages, (_e, threadId: string) => listMessages(threadId))
  ipcMain.handle(IPC.chatSend, (_e, input: ChatSendInput) =>
    assistantSend(input, deps.notifyDataChanged)
  )

  // ---------- events ----------
  ipcMain.handle(IPC.eventsList, () => listEvents())
  ipcMain.handle(IPC.eventsCreate, (_e, input: EventInput) => createEvent(input))
  ipcMain.handle(IPC.eventsUpdate, (_e, id: string, patch: EventPatch, scope?: EventScope) =>
    updateEvent(id, patch, scope ?? 'one')
  )
  ipcMain.handle(IPC.eventsDelete, (_e, id: string, scope?: EventScope) =>
    deleteEvent(id, scope ?? 'one')
  )
  ipcMain.handle(IPC.eventsImportIcs, (_e, kind: EventKind, courseId: string | null) =>
    importIcs(kind, courseId)
  )
  ipcMain.handle(IPC.eventsFetchBadminton, (_e, force?: boolean) =>
    fetchBadmintonQuebec(force === true)
  )
  ipcMain.handle(IPC.eventsImportFeed, (_e, events: FeedEvent[]) => importFeedEvents(events))

  // ---------- career ----------
  ipcMain.handle(IPC.appsList, () => listApplications())
  ipcMain.handle(IPC.appsCreate, (_e, input: ApplicationInput) => createApplication(input))
  ipcMain.handle(IPC.appsUpdate, (_e, id: string, patch: ApplicationPatch) =>
    updateApplication(id, patch)
  )
  ipcMain.handle(IPC.appsDelete, (_e, id: string) => deleteApplication(id))
  ipcMain.handle(IPC.careerLogAdd, (_e, kind: CareerLogKind) => addCareerLog(kind))
  ipcMain.handle(IPC.careerLogUndo, (_e, kind: CareerLogKind) => undoCareerLog(kind))
  ipcMain.handle(IPC.careerWeekStats, () => careerWeekStats())
  ipcMain.handle(IPC.jobsFetch, (_e, force?: boolean) => fetchJobs(force === true))

  ipcMain.handle(IPC.searchAll, (_e, query: string) => searchAll(query))

  ipcMain.handle(IPC.captureDismiss, () => deps.dismissCapture())

  // ---------- tags ----------
  ipcMain.handle(IPC.tagsList, () => listTags())
  ipcMain.handle(IPC.tagsCreate, (_e, name: string, color?: string) => createTag(name, color))
  ipcMain.handle(IPC.tagsDelete, (_e, name: string) => deleteTag(name))
  ipcMain.handle(IPC.tagsSetColor, (_e, name: string, color: string) => setTagColor(name, color))
}
