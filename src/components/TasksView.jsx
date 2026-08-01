import { useState } from 'react'

const CATEGORIES = ['general', 'academics', 'fitness', 'badminton', 'career']

export default function TasksView({ plannerData, onAddTask, onToggleTask, onDeleteTask }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('general')
  const [dueDate, setDueDate] = useState('')
  const { data } = plannerData

  const submit = (e) => {
    e.preventDefault()
    if (!title.trim()) return
    onAddTask({ title: title.trim(), category, dueDate: dueDate || null })
    setTitle('')
    setDueDate('')
  }

  const sorted = [...data.tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
  })

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold">All Tasks</h1>

      <form onSubmit={submit} className="bg-panel border border-line rounded-xl p-4 flex flex-col sm:flex-row gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task..."
          className="flex-1 bg-bg border border-line rounded-md px-3 py-2 text-sm focus:border-cyan outline-none"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-bg border border-line rounded-md px-3 py-2 text-sm capitalize"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="bg-bg border border-line rounded-md px-3 py-2 text-sm font-mono"
        />
        <button type="submit" className="bg-accent text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-accent/90">
          Add
        </button>
      </form>

      <div className="bg-panel border border-line rounded-xl divide-y divide-line">
        {sorted.length === 0 && <p className="text-sm text-muted p-4">No tasks yet.</p>}
        {sorted.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={() => onToggleTask(t.id)}
              className={`w-4 h-4 rounded-full border shrink-0 ${t.done ? 'bg-cyan border-cyan' : 'border-muted hover:border-cyan'}`}
              aria-label="Toggle complete"
            />
            <span className={`text-sm flex-1 ${t.done ? 'line-through text-muted' : ''}`}>{t.title}</span>
            <span className="text-xs font-mono text-muted capitalize">{t.category}</span>
            {t.dueDate && <span className="text-xs font-mono text-amber">{t.dueDate}</span>}
            <button onClick={() => onDeleteTask(t.id)} className="text-muted hover:text-accent text-xs font-mono px-2">
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
