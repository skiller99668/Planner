import { useEffect, useState } from 'react'
import type { Settings } from '../../shared/types'

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [groqConfigured, setGroqConfigured] = useState<boolean | null>(null)
  const [keyDraft, setKeyDraft] = useState('')
  const [keySaved, setKeySaved] = useState(false)
  const [models, setModels] = useState<string[]>([])

  useEffect(() => {
    window.planner?.getSettings().then(setSettings).catch(() => setSettings(null))
    window.planner?.groqStatus().then((s) => {
      setGroqConfigured(s.configured)
      if (s.configured) window.planner?.groqListModels().then(setModels).catch(() => {})
    }).catch(() => {})
  }, [])

  const saveKey = async () => {
    if (!window.planner) return
    const res = await window.planner.groqSetKey(keyDraft)
    setGroqConfigured(res.configured)
    setKeyDraft('')
    setKeySaved(true)
    setTimeout(() => setKeySaved(false), 3000)
    if (res.configured) window.planner.groqListModels().then(setModels).catch(() => {})
  }

  const patch = async (p: Partial<Settings>) => {
    if (!window.planner) return
    setSaving(true)
    try {
      setSettings(await window.planner.patchSettings(p))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <p className="text-muted font-mono text-[11px] tracking-[0.16em] uppercase">
        Configuration
      </p>
      <h1 className="font-display mt-1 text-xl font-semibold">Settings</h1>

      {!settings ? (
        <p className="text-muted mt-4 text-[13px]">Settings unavailable — bridge offline.</p>
      ) : (
        <div className="border-line bg-panel mt-6 max-w-xl divide-y divide-(--color-line) rounded-lg border">
          <Toggle
            label="Start with Windows"
            hint="Launches hidden in the tray at login so reminders always fire. Applies to the installed app, not dev mode."
            checked={settings.autostart}
            disabled={saving}
            onChange={(v) => patch({ autostart: v })}
          />
          <Toggle
            label="Close to tray"
            hint="Closing the window keeps Planner running in the tray. Quit from the tray menu."
            checked={settings.closeToTray}
            disabled={saving}
            onChange={(v) => patch({ closeToTray: v })}
          />
          <div className="px-5 py-4">
            <div className="flex items-center gap-2">
              <p className="text-[13.5px] font-medium">Groq API key</p>
              {groqConfigured !== null && (
                <span
                  className={`led ${groqConfigured ? 'text-ok' : 'text-line'}`}
                  title={groqConfigured ? 'Key stored' : 'No key'}
                  aria-hidden
                />
              )}
              <span className="text-muted font-mono text-[10.5px]">
                {groqConfigured ? 'configured' : 'not set'}
              </span>
            </div>
            <p className="text-muted mt-1 text-[12.5px] leading-relaxed">
              Powers the Assistant and lecture chats. Stored encrypted with Windows
              credentials — never as plain text, never shown again. Get a free key at
              console.groq.com.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                type="password"
                className="bg-bench border-line placeholder:text-muted/60 focus:border-amber/60 flex-1 rounded-md border px-2.5 py-1.5 text-[13px]"
                placeholder={groqConfigured ? 'Paste a new key to replace' : 'gsk_…'}
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && keyDraft.trim() && void saveKey()}
              />
              <button
                onClick={() => void saveKey()}
                disabled={!keyDraft.trim()}
                className="bg-amber text-bench rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-opacity disabled:opacity-40"
              >
                {keySaved ? 'Saved' : 'Save'}
              </button>
              {groqConfigured && (
                <button
                  onClick={() => { setKeyDraft(''); void window.planner?.groqSetKey('').then((r) => setGroqConfigured(r.configured)) }}
                  className="text-muted hover:text-danger rounded-md px-2 py-1.5 text-[12.5px] transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          <div className="flex items-start justify-between gap-6 px-5 py-4">
            <div>
              <p className="text-[13.5px] font-medium">Assistant model</p>
              <p className="text-muted mt-1 text-[12.5px] leading-relaxed">
                Used by the Assistant and lecture chats. Default picks a tool-capable Groq
                model; change it here if Groq retires it.
              </p>
            </div>
            {models.length > 0 ? (
              <select
                aria-label="Assistant model"
                className="bg-bench border-line focus:border-amber/60 mt-0.5 max-w-52 rounded-md border px-2 py-1.5 font-mono text-[11.5px]"
                value={settings.groqModel ?? ''}
                disabled={saving}
                onChange={(e) => void patch({ groqModel: e.target.value || null })}
              >
                <option value="">default (llama-3.3-70b)</option>
                {models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            ) : (
              <span className="text-muted mt-1 font-mono text-[10.5px]">
                {groqConfigured ? 'loading…' : 'needs key'}
              </span>
            )}
          </div>
          <div className="flex items-start justify-between gap-6 px-5 py-4">
            <div>
              <p className="text-[13.5px] font-medium">Gym target</p>
              <p className="text-muted mt-1 text-[12.5px] leading-relaxed">
                Sessions per week that count as hitting the goal — drives the weekly bar and
                the streak counter.
              </p>
            </div>
            <input
              type="number"
              min={1}
              max={7}
              aria-label="Gym sessions per week"
              className="bg-bench border-line focus:border-amber/60 mt-0.5 w-16 rounded-md border px-2.5 py-1.5 text-center font-mono text-[13px]"
              value={settings.targets.gymPerWeek}
              disabled={saving}
              onChange={(e) => {
                const n = Math.max(1, Math.min(7, Number(e.target.value) || 1))
                void patch({ targets: { ...settings.targets, gymPerWeek: n } })
              }}
            />
          </div>
          <div className="px-5 py-4">
            <p className="text-[13.5px] font-medium">Career weekly targets</p>
            <p className="text-muted mt-1 text-[12.5px] leading-relaxed">
              The Career scoreboard measures each week (Sun–Sat) against these.
            </p>
            <div className="mt-3 flex gap-5">
              {(
                [
                  ['applicationsPerWeek', 'applications'],
                  ['dsaPerWeek', 'dsa problems'],
                  ['networkingPerWeek', 'networking']
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="text-muted flex flex-col gap-1 font-mono text-[10px] uppercase">
                  {label}
                  <input
                    type="number"
                    min={0}
                    max={50}
                    className="bg-bench border-line focus:border-amber/60 w-16 rounded-md border px-2.5 py-1.5 text-center font-mono text-[13px] normal-case"
                    value={settings.targets[key]}
                    disabled={saving}
                    onChange={(e) => {
                      const n = Math.max(0, Math.min(50, Number(e.target.value) || 0))
                      void patch({ targets: { ...settings.targets, [key]: n } })
                    }}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange
}: {
  label: string
  hint: string
  checked: boolean
  disabled: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-6 px-5 py-4">
      <div>
        <p className="text-[13.5px] font-medium">{label}</p>
        <p className="text-muted mt-1 text-[12.5px] leading-relaxed">{hint}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5.5 w-10 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-amber' : 'bg-line'
        } ${disabled ? 'opacity-60' : ''}`}
      >
        <span
          aria-hidden
          className={`bg-bench absolute top-0.5 h-4.5 w-4.5 rounded-full transition-all ${
            checked ? 'left-5' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  )
}
