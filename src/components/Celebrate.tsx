// Celebration primitives.
//
// "Balanced": completing anything gets a spring + a small particle burst;
// hitting a target or extending a streak gets a louder moment. Motion is
// opt-out via prefers-reduced-motion (handled in index.css).

import { useCallback, useEffect, useRef, useState } from 'react'

const PALETTE = ['var(--color-sage)', 'var(--color-butter)', 'var(--color-clay)']

/** Particles thrown outward from the centre of the nearest positioned parent. */
export function Burst({
  fireKey,
  count = 7,
  spread = 34,
  className = ''
}: {
  /** Changing this value replays the burst. 0 = never fired. */
  fireKey: number
  count?: number
  spread?: number
  className?: string
}) {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- fireKey===0 is a
  // stable "never fired" state for the lifetime of the parent.
  if (!fireKey) return null
  return (
    <span
      key={fireKey}
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-visible ${className}`}
    >
      {Array.from({ length: count }, (_, i) => {
        // Fan the particles over the upper half so they read as "lifting off".
        const angle = (-160 + (140 / Math.max(1, count - 1)) * i) * (Math.PI / 180)
        const dist = spread * (0.65 + ((i * 37) % 10) / 22)
        return (
          <span
            key={i}
            className="particle absolute top-1/2 left-1/2 block rounded-full"
            style={
              {
                width: i % 3 === 0 ? 8 : 5.5,
                height: i % 3 === 0 ? 8 : 5.5,
                background: PALETTE[i % PALETTE.length],
                boxShadow: `0 0 8px ${PALETTE[i % PALETTE.length]}`,
                animationDelay: `${i * 16}ms`,
                '--dx': `${Math.cos(angle) * dist}px`,
                '--dy': `${Math.sin(angle) * dist}px`
              } as React.CSSProperties
            }
          />
        )
      })}
    </span>
  )
}

/** Fire-and-forget trigger: `const [key, fire] = useCelebrate()`. */
export function useCelebrate(): [number, () => void] {
  const [key, setKey] = useState(0)
  const fire = useCallback(() => setKey((k) => k + 1), [])
  return [key, fire]
}

/** Runs `onCross` when `value` rises to meet `target` — for target-met moments. */
export function useThresholdCross(value: number, target: number, onCross: () => void): void {
  const prev = useRef<number | null>(null)
  useEffect(() => {
    if (prev.current !== null && prev.current < target && value >= target) onCross()
    prev.current = value
  }, [value, target, onCross])
}

/** The app's checkbox: springs, draws its tick, and bursts when checked. */
export function CheckCircle({
  checked,
  onChange,
  label,
  size = 20
}: {
  checked: boolean
  onChange: () => void
  label: string
  size?: number
}) {
  const [burstKey, fire] = useCelebrate()

  return (
    <span className="relative inline-flex shrink-0">
      <button
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        onClick={() => {
          if (!checked) fire()
          onChange()
        }}
        style={{ width: size, height: size }}
        className={`tactile flex items-center justify-center rounded-full border-2 ${
          checked
            ? 'border-sage bg-sage text-bg'
            : 'border-line hover:border-sage/70 bg-transparent'
        }`}
      >
        {checked && (
          <svg
            width={size * 0.58}
            height={size * 0.58}
            viewBox="0 0 24 24"
            fill="none"
            className="draw-check"
            aria-hidden
          >
            <path
              d="M5 12.5l4.5 4.5L19 7"
              stroke="currentColor"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      <Burst fireKey={burstKey} />
    </span>
  )
}
