// How a weekly target reads as a bar: how full it is, and what colour that
// fullness is. Shared by the Today trackers and the Gym and LeetCode pages so
// the three bars can't drift apart.

/** Share of the target met, as 0–100. Overshoot clamps to full — the numerals
 *  beside the bar carry it, and a bar past its own track stops answering "how
 *  close am I". A target of zero is nothing to do rather than a division by
 *  zero, so it reads empty. */
export function progressPct(count: number, target: number): number {
  if (target <= 0) return 0
  return Math.min(100, (count / target) * 100)
}

/** Distance from the target as colour: coral when you've barely started, gold
 *  across the middle, mint as it closes.
 *
 *  Mixed from the palette's own tokens rather than fixed hexes, so retuning a
 *  hue in `index.css` retunes the ramp with it — and mixed in oklab, which
 *  carries warm→cool through the hues between them instead of the grey that
 *  sRGB interpolation passes through at the midpoint. */
export function progressColor(pct: number): string {
  return pct <= 50
    ? `color-mix(in oklab, var(--color-coral), var(--color-gold) ${pct * 2}%)`
    : `color-mix(in oklab, var(--color-gold), var(--color-mint) ${(pct - 50) * 2}%)`
}
