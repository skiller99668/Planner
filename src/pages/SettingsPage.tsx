import { useEffect, useState } from 'react'
import Select from '../components/Select'
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
      <h1 className="text-[26px] font-bold">Settings</h1>

      {!settings ? (
        <p className="text-muted mt-4 text-[13px]">Settings unavailable — bridge offline.</p>
      ) : (
        <div className="bg-surface mt-6 max-w-xl divide-y divide-(--color-line) rounded-[16px]">
          <Toggle
            label="Start with Windows"
            hint="Launches hidden in the tray so reminders still fire."
            checked={settings.autostart}
            disabled={saving}
            onChange={(v) => patch({ autostart: v })}
          />
          <Toggle
            label="Close to tray"
            hint="Closing the window keeps Planner in the tray."
            checked={settings.closeToTray}
            disabled={saving}
            onChange={(v) => patch({ closeToTray: v })}
          />
          <div className="px-5 py-4">
            <div className="flex items-center gap-2">
              <p className="text-[13.5px] font-medium">Groq API key</p>
              {groqConfigured !== null && (
                <span
                  className={`led ${groqConfigured ? 'text-mint' : 'text-line'}`}
                  title={groqConfigured ? 'Key stored' : 'No key'}
                  aria-hidden
                />
              )}
              <span className="text-muted text-[12px] font-medium">
                {groqConfigured ? 'configured' : 'not set'}
              </span>
            </div>
            <p className="text-muted mt-1 text-[12.5px] leading-relaxed">
              Powers the Assistant and lecture chats. Stored encrypted on this machine.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                type="password"
                className="bg-bg placeholder:text-faint focus:ring-azure/60 flex-1 rounded-[10px] px-3 py-2 text-[13.5px] outline-none focus:ring-1"
                placeholder={groqConfigured ? 'Paste a new key to replace' : 'gsk_…'}
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && keyDraft.trim() && void saveKey()}
              />
              <button
                onClick={() => void saveKey()}
                disabled={!keyDraft.trim()}
                className="tactile btn-primary rounded-[10px] px-4 py-2 text-[13px] font-bold disabled:opacity-35"
              >
                {keySaved ? 'Saved' : 'Save'}
              </button>
              {groqConfigured && (
                <button
                  onClick={() => { setKeyDraft(''); void window.planner?.groqSetKey('').then((r) => setGroqConfigured(r.configured)) }}
                  className="text-muted hover:text-coral rounded-[11px] px-2 py-1.5 text-[12.5px] transition-colors"
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
                Used by the Assistant and lecture chats.
              </p>
            </div>
            {models.length > 0 ? (
              <Select
                value={settings.groqModel ?? ''}
                ariaLabel="Assistant model"
                align="right"
                mono
                disabled={saving}
                className="mt-0.5 max-w-52"
                onChange={(val) => void patch({ groqModel: val || null })}
                options={[
                  { value: '', label: 'default (llama-3.3-70b)' },
                  ...models.map((m) => ({ value: m, label: m }))
                ]}
              />
            ) : (
              <span className="text-muted mt-1 text-[12px] font-medium">
                {groqConfigured ? 'loading…' : 'needs key'}
              </span>
            )}
          </div>
          <div className="flex items-start justify-between gap-6 px-5 py-4">
            <div>
              <p className="text-[13.5px] font-medium">Gym target</p>
              <p className="text-muted mt-1 text-[12.5px] leading-relaxed">
                Sessions per week to hit your goal.
              </p>
            </div>
            <input
              type="number"
              min={1}
              max={7}
              aria-label="Gym sessions per week"
              className="bg-bg focus:ring-azure/60 nums mt-0.5 w-16 rounded-[10px] px-2.5 py-2 text-center text-[13.5px] outline-none focus:ring-1"
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
              Measured Sunday to Saturday.
            </p>
            <div className="mt-3 flex gap-5">
              {(
                [
                  ['applicationsPerWeek', 'applications'],
                  ['dsaPerWeek', 'dsa problems'],
                  ['networkingPerWeek', 'networking']
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="text-muted flex flex-col gap-1.5 text-[12px] font-medium">
                  {label}
                  <input
                    type="number"
                    min={0}
                    max={50}
                    className="bg-bg focus:ring-azure/60 nums w-16 rounded-[10px] px-2.5 py-2 text-center text-[13.5px] outline-none focus:ring-1"
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
          checked ? 'bg-azure' : 'bg-line'
        } ${disabled ? 'opacity-60' : ''}`}
      >
        <span
          aria-hidden
          className={`bg-bg absolute top-0.5 h-4.5 w-4.5 rounded-full transition-all ${
            checked ? 'left-5' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  )
}
