import { useEffect, useState } from 'react'
import type { Settings } from '../../shared/types'

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.planner?.getSettings().then(setSettings).catch(() => setSettings(null))
  }, [])

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
            <p className="text-[13.5px] font-medium">Groq API key</p>
            <p className="text-muted mt-1 text-[12.5px] leading-relaxed">
              Added in Phase 4 with the Academics module — stored encrypted with Windows
              credentials, never in the database as plain text.
            </p>
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
