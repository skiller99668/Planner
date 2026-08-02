// The app-wide AI assistant: a Groq tool-use loop over the planner's data.
//
// Direct commands execute immediately (the user asked; that's the trigger) —
// but only additive/log/read tools are exposed. Nothing here can delete.
// Every executed tool produces a human-readable receipt stored on the
// assistant message (meta.receipts) and rendered in the chat.

import type { ChatMessage, GymType, Priority } from '../shared/types'
import { getLecture, getCourse, recentCourseLectures } from './academicsRepo'
import { appendMessage, createThread, getThread, listMessages } from './chatRepo'
import { getDb } from './db'
import { gymStatusSummary, logGymSession } from './gymRepo'
import {
  ASSISTANT_MODEL,
  chatRaw,
  getGroqStatus,
  type ToolDef,
  type WireMessage
} from './groq'
import { createSeries } from './recurrence'
import { getSettings } from './settings'
import { createTask, listTasks, updateTask } from './tasksRepo'

const MAX_TOOL_ROUNDS = 5
const HISTORY_MESSAGES = 24

export interface AssistantSendResult {
  threadId: string
  userMessage: ChatMessage
  assistantMessage: ChatMessage
}

export interface AssistantSendInput {
  scope: 'general' | 'lecture'
  refId: string | null // lectureId when scope='lecture'
  threadId: string | null // null starts a new thread
  text: string
}

export async function assistantSend(
  input: AssistantSendInput,
  notifyDataChanged: () => void
): Promise<AssistantSendResult> {
  if (!getGroqStatus().configured) {
    throw new Error('Groq API key missing — add one in Settings.')
  }

  const thread = input.threadId
    ? getThread(input.threadId)
    : createThread(input.scope, input.refId, input.text.slice(0, 60))

  const history = listMessages(thread.id, HISTORY_MESSAGES)
  const userMessage = appendMessage(thread.id, 'user', input.text)

  const wire: WireMessage[] = [
    { role: 'system', content: buildSystemPrompt(input.scope, input.refId) },
    ...history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: clip(m.content, 4000)
      })),
    { role: 'user', content: clip(input.text, 8000) }
  ]

  const receipts: string[] = []
  let finalText: string | null = null
  const model = getSettings().groqModel ?? ASSISTANT_MODEL

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await chatRaw({ messages: wire, model, tools: TOOLS, temperature: 0.3 })
    if (!res) {
      finalText = 'The request to Groq failed — check your connection (or the model in Settings) and try again.'
      break
    }
    if (res.toolCalls.length === 0) {
      finalText = res.content ?? '(no reply)'
      break
    }

    // Record the assistant turn, then execute each requested tool.
    wire.push({ role: 'assistant', content: res.content, tool_calls: res.toolCalls })
    let mutated = false
    for (const call of res.toolCalls) {
      const { result, receipt, didMutate } = executeTool(
        call.function.name,
        call.function.arguments
      )
      if (receipt) receipts.push(receipt)
      mutated ||= didMutate
      wire.push({ role: 'tool', tool_call_id: call.id, content: result })
    }
    if (mutated) notifyDataChanged()
  }

  if (finalText === null) {
    finalText = receipts.length
      ? 'Done — details above.'
      : 'I hit the tool-round limit without finishing. Try a more specific request.'
  }

  const assistantMessage = appendMessage(thread.id, 'assistant', finalText, {
    model,
    receipts
  })
  return { threadId: thread.id, userMessage, assistantMessage }
}

// ---------- system prompts ----------

function buildSystemPrompt(scope: 'general' | 'lecture', refId: string | null): string {
  const now = new Date()
  const today = `${now.toLocaleDateString('en-CA')} (${now.toLocaleDateString(undefined, { weekday: 'long' })})`
  const settings = getSettings()
  const gym = gymStatusSummary(settings.targets.gymPerWeek)
  const vocab = tagVocabulary().join(', ') || '(none yet)'

  const base = [
    `You are the built-in assistant of Planner, the personal desktop planner of Skyler, an electrical-engineering student at McGill (2nd year).`,
    `Today is ${today}. Weeks run Sunday–Saturday. Times are local.`,
    ``,
    `You have tools that WRITE to the real planner. When the user asks you to add tasks, plan out project steps, set up a recurring task, log a workout, or complete a task — call the tools and actually do it. Don't describe what you would do; do it, then confirm in one or two short sentences.`,
    `Guidelines:`,
    `- Breaking a project into steps: create 3–8 small, concrete tasks; if a deadline is given, spread due dates sensibly before it.`,
    `- Reuse the user's existing tags where they fit: ${vocab}. Never invent a second course-code tag for one task.`,
    `- Reminders need a due time. Recurring tasks use weekday names.`,
    `- Use list_tasks before complete_task to find the right id.`,
    `- Gym context: today ${gym.today.length ? `already logged: ${gym.today.join('+')}` : 'not logged yet'}; next in push→pull→legs cycle: ${gym.nextType}; week ${gym.weekCount}/${gym.target}.`,
    `- If a request is ambiguous (which task? which day?), ask instead of guessing.`,
    `- Never fabricate planner data; read it with tools.`,
    `Keep answers tight. Plain text, no markdown headers.`
  ].join('\n')

  if (scope === 'lecture' && refId) {
    try {
      const lecture = getLecture(refId)
      const course = getCourse(lecture.courseId)
      const prev = recentCourseLectures(course.id, lecture.id)
      return [
        base,
        ``,
        `CONTEXT — this chat is attached to a lecture.`,
        `Course: ${course.code} — ${course.name} (${course.term})`,
        `Lecture: "${lecture.title}" on ${lecture.lectureDate}`,
        `Skyler's summary of this lecture: ${lecture.summary || '(not written yet)'}`,
        prev.length
          ? `Recent lectures in this course:\n${prev
              .map((l) => `- ${l.lectureDate} "${l.title}": ${clip(l.summary, 300) || '(no summary)'}`)
              .join('\n')}`
          : `(No earlier lectures recorded in this course.)`,
        ``,
        `Help Skyler actually understand this material: explain deeper, connect to earlier lectures, quiz, or draft likely exam questions. Ground explanations in the summaries above; where the summary is thin, teach the standard treatment of the topic and say you're going beyond the notes.`
      ].join('\n')
    } catch {
      return base // lecture deleted mid-flight; degrade to general
    }
  }
  return base
}

function tagVocabulary(): string[] {
  const rows = getDb()
    .prepare(
      `SELECT tags FROM tasks WHERE status != 'skipped'
       UNION ALL SELECT tags FROM task_series WHERE active = 1`
    )
    .all() as unknown as { tags: string }[]
  const set = new Set<string>()
  for (const r of rows) {
    try {
      const parsed = JSON.parse(r.tags)
      if (Array.isArray(parsed)) for (const t of parsed) if (typeof t === 'string') set.add(t)
    } catch { /* skip */ }
  }
  return [...set].sort().slice(0, 40)
}

// ---------- tools ----------

const WEEKDAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

const TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'create_tasks',
      description:
        'Create one or more tasks. Use for single tasks AND for breaking projects into steps.',
      parameters: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            minItems: 1,
            maxItems: 15,
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                notes: { type: 'string' },
                due_date: { type: 'string', description: 'YYYY-MM-DD, omit if none' },
                due_time: { type: 'string', description: 'HH:mm 24h, omit for all-day' },
                priority: { type: 'integer', enum: [0, 1, 2, 3], description: '0 none, 3 high' },
                tags: { type: 'array', items: { type: 'string' } },
                reminder_offset_min: {
                  type: 'integer',
                  description: 'Minutes before due time to remind; requires due_time'
                }
              },
              required: ['title']
            }
          }
        },
        required: ['tasks']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_recurring_task',
      description: 'Create a repeating task series (e.g. weekly lab, daily review).',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          notes: { type: 'string' },
          freq: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
          interval: { type: 'integer', minimum: 1, maximum: 30, description: 'every N units' },
          weekdays: {
            type: 'array',
            items: { type: 'string', enum: WEEKDAY_NAMES },
            description: 'weekly only'
          },
          start_date: { type: 'string', description: 'YYYY-MM-DD, default today' },
          end_date: { type: 'string', description: 'YYYY-MM-DD, omit for open-ended' },
          due_time: { type: 'string', description: 'HH:mm 24h' },
          reminder_offset_min: { type: 'integer' },
          tags: { type: 'array', items: { type: 'string' } },
          priority: { type: 'integer', enum: [0, 1, 2, 3] }
        },
        required: ['title', 'freq']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'log_gym_session',
      description: 'Log a gym workout. Idempotent per day+type.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['push', 'pull', 'legs', 'other'] },
          date: { type: 'string', description: 'YYYY-MM-DD, default today' }
        },
        required: ['type']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'List open tasks (id, title, due, tags). Use before completing a task.',
      parameters: {
        type: 'object',
        properties: {
          due_within_days: { type: 'integer', description: 'only tasks due in the next N days' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'complete_task',
      description: 'Mark an open task done by its id (get ids from list_tasks).',
      parameters: {
        type: 'object',
        properties: { task_id: { type: 'string' } },
        required: ['task_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_gym_status',
      description: 'Current training status: this week count/target, streak, next PPL type.',
      parameters: { type: 'object', properties: {} }
    }
  }
]

function executeTool(
  name: string,
  argsJson: string
): { result: string; receipt: string | null; didMutate: boolean } {
  let args: Record<string, unknown>
  try {
    args = JSON.parse(argsJson || '{}') as Record<string, unknown>
  } catch {
    return { result: 'ERROR: arguments were not valid JSON', receipt: null, didMutate: false }
  }

  try {
    switch (name) {
      case 'create_tasks': {
        const list = args.tasks as {
          title: string
          notes?: string
          due_date?: string
          due_time?: string
          priority?: number
          tags?: string[]
          reminder_offset_min?: number
        }[]
        if (!Array.isArray(list) || list.length === 0) {
          return { result: 'ERROR: tasks array required', receipt: null, didMutate: false }
        }
        const titles: string[] = []
        for (const t of list.slice(0, 15)) {
          const task = createTask({
            title: String(t.title),
            notes: t.notes ?? null,
            tags: (t.tags ?? []).map(String).slice(0, 5),
            dueDate: t.due_date ?? null,
            dueTime: t.due_time ?? null,
            priority: (typeof t.priority === 'number' ? Math.max(0, Math.min(3, t.priority)) : 0) as Priority,
            reminderOffsetMin: t.reminder_offset_min ?? null
          })
          titles.push(task.title)
        }
        return {
          result: `Created ${titles.length} task(s): ${titles.join(' | ')}`,
          receipt: titles.length === 1 ? `Added task: ${titles[0]}` : `Added ${titles.length} tasks`,
          didMutate: true
        }
      }

      case 'create_recurring_task': {
        const weekdayIdx = (args.weekdays as string[] | undefined)
          ?.map((w) => WEEKDAY_NAMES.indexOf(String(w).toLowerCase()))
          .filter((i) => i >= 0)
        const series = createSeries({
          title: String(args.title),
          notes: (args.notes as string) ?? null,
          tags: ((args.tags as string[]) ?? []).map(String).slice(0, 5),
          priority: (typeof args.priority === 'number'
            ? Math.max(0, Math.min(3, args.priority))
            : 0) as Priority,
          rule: {
            freq: args.freq as 'daily' | 'weekly' | 'monthly',
            interval: typeof args.interval === 'number' ? args.interval : 1,
            byWeekdays: weekdayIdx ?? [],
            byMonthDay: null
          },
          startDate: (args.start_date as string) ?? new Date().toLocaleDateString('en-CA'),
          endDate: (args.end_date as string) ?? null,
          dueTime: (args.due_time as string) ?? null,
          reminderOffsetMin: (args.reminder_offset_min as number) ?? null
        })
        return {
          result: `Created recurring series "${series.title}" (${series.rule.freq}), occurrences generated.`,
          receipt: `Added repeating task: ${series.title}`,
          didMutate: true
        }
      }

      case 'log_gym_session': {
        const type = String(args.type) as GymType
        const date = (args.date as string) ?? new Date().toLocaleDateString('en-CA')
        logGymSession({ date, type })
        return {
          result: `Logged ${type} for ${date}.`,
          receipt: `Logged ${type} · ${date}`,
          didMutate: true
        }
      }

      case 'list_tasks': {
        const days = typeof args.due_within_days === 'number' ? args.due_within_days : null
        let tasks = listTasks().filter((t) => t.status === 'open')
        if (days !== null) {
          const cutoff = new Date()
          cutoff.setDate(cutoff.getDate() + days)
          tasks = tasks.filter((t) => t.dueAt && new Date(t.dueAt) <= cutoff)
        }
        const compact = tasks
          .slice(0, 50)
          .map((t) => ({ id: t.id, title: t.title, due: t.dueAt, tags: t.tags }))
        return { result: JSON.stringify(compact), receipt: null, didMutate: false }
      }

      case 'complete_task': {
        const task = updateTask(String(args.task_id), { status: 'done' })
        return {
          result: `Marked done: ${task.title}`,
          receipt: `Completed: ${task.title}`,
          didMutate: true
        }
      }

      case 'get_gym_status': {
        const status = gymStatusSummary(getSettings().targets.gymPerWeek)
        return { result: JSON.stringify(status), receipt: null, didMutate: false }
      }

      default:
        return { result: `ERROR: unknown tool ${name}`, receipt: null, didMutate: false }
    }
  } catch (err) {
    return {
      result: `ERROR: ${(err as Error).message}`,
      receipt: null,
      didMutate: false
    }
  }
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s
}
