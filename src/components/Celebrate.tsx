// Celebration primitives.
//
// "Balanced": completing anything gets a spring + a small particle burst;
// hitting a target or extending a streak gets a louder moment. Motion is
// opt-out via prefers-reduced-motion (handled in index.css).

import { useCallback, useEffect, useRef, useState } from 'react'

const PALETTE = ['var(--color-mint)', 'var(--color-gold)', 'var(--color-azure)']

/** Particles thrown outward from the centre of the nearest positioned parent. */
export function Burst({
  fireKey,
  count = 7,
  spread = 34,
  scale = 1,
  className = ''
}: {
  /** Changing this value replays the burst. 0 = never fired. */
  fireKey: number
  count?: number
  spread?: number
  /** Multiplier on each particle's size and glow. Throwing more confetti
   *  further doesn't read as louder on its own — the pieces have to grow too,
   *  or a big burst just looks like a fine spray. */
  scale?: number
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
                width: (i % 3 === 0 ? 8 : 5.5) * scale,
                height: (i % 3 === 0 ? 8 : 5.5) * scale,
                background: PALETTE[i % PALETTE.length],
                boxShadow: `0 0 ${8 * scale}px ${PALETTE[i % PALETTE.length]}`,
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

/** True for `ms` after each change of `fireKey`, then false again — for
 *  one-shot flourishes driven by a CSS class.
 *
 *  A raw counter can't drive one: once it is non-zero the class stays on for
 *  the life of the component, so whatever the class paints never leaves. And
 *  re-applying a class name that is already present does not restart a CSS
 *  animation, so every celebration after the first would pass in silence.
 *  Taking the class off is what makes the next one able to play. */
export function useFlash(fireKey: number, ms = 1200): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!fireKey) return
    setOn(true)
    const id = setTimeout(() => setOn(false), ms)
    return () => clearTimeout(id)
  }, [fireKey, ms])
  return on
}

/** Runs `onCross` when `value` rises to meet `target` — for target-met moments. */
export function useThresholdCross(value: number, target: number, onCross: () => void): void {
  const prev = useRef<number | null>(null)
  useEffect(() => {
    if (prev.current !== null && prev.current < target && value >= target) onCross()
    prev.current = value
  }, [value, target, onCross])
}

/** Finishing a whole task is the loud moment: roughly four times the confetti,
 *  three times as far, in bigger pieces. Subtasks keep the quieter default —
 *  a step is progress, a task is an achievement, and the burst says which. */
export const TASK_BURST = { count: 28, spread: 104, scale: 1.45 }

/** The app's checkbox: springs, draws its tick, and bursts when checked. */
export function CheckCircle({
  checked,
  onChange,
  label,
  size = 20,
  burst
}: {
  checked: boolean
  onChange: () => void
  label: string
  size?: number
  /** Scale of the celebration. Defaults to the quiet one; pass TASK_BURST for
   *  the moment that finishing a whole task deserves. */
  burst?: { count?: number; spread?: number; scale?: number }
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
            ? 'border-mint bg-mint text-bg'
            : 'border-line hover:border-mint/70 bg-transparent'
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
      <Burst
        fireKey={burstKey}
        count={burst?.count}
        spread={burst?.spread}
        scale={burst?.scale}
      />
    </span>
  )
}
