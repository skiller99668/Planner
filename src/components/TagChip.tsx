// Tag chip, its colour swatch, and the shared palette popover.
//
// Tag colours are arbitrary hex from TAG_COLORS, so they can't be Tailwind
// classes — they're applied inline, tinted for the fill and full-strength for
// the text so every swatch stays legible on the midnight field.

import { TAG_COLORS, type Tag } from '../../shared/types'
import { POPUP_CLASS, usePopoverAnchor } from './Popover'

/** Translucent fill derived from the tag colour. */
export function tagFill(color: string, alpha = 0.16): string {
  return `${color}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`
}

/** The least-used swatch, so a new tag defaults to something distinct. */
export function nextTagColor(tags: Tag[]): string {
  const counts = new Map<string, number>(TAG_COLORS.map((c) => [c, 0]))
  for (const t of tags) if (counts.has(t.color)) counts.set(t.color, counts.get(t.color)! + 1)
  let best: string = TAG_COLORS[0]
  for (const c of TAG_COLORS) if (counts.get(c)! < counts.get(best)!) best = c
  return best
}

/** Read-only pill, used on task rows. */
export function TagPill({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color, background: tagFill(color) }}
    >
      {name}
    </span>
  )
}

/** A colour dot that opens the palette. Shared by existing chips and the
 *  new-tag bubble so both pick colour the same way. */
export function ColorSwatch({
  color,
  onPick,
  ariaLabel,
  size = 14
}: {
  color: string
  onPick: (color: string) => void
  ariaLabel: string
  size?: number
}) {
  const pop = usePopoverAnchor()

  return (
    <>
      <button
        ref={pop.triggerRef}
        type="button"
        onClick={pop.toggle}
        onMouseDown={(e) => e.preventDefault()} // don't blur a sibling input
        aria-label={ariaLabel}
        title="Change colour"
        className="tactile shrink-0 rounded-full"
        style={{ background: color, width: size, height: size }}
      />

      {pop.open && (
        <div
          ref={pop.popupRef}
          className={`${POPUP_CLASS} w-[188px]`}
          style={pop.popupStyle}
          role="dialog"
          aria-label={ariaLabel}
        >
          <div className="grid grid-cols-5 gap-1.5">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(c)
                  pop.close()
                }}
                aria-label={c}
                className="tactile flex h-7 w-7 items-center justify-center rounded-full"
                style={{ background: tagFill(c, 0.24) }}
              >
                <span
                  className="block rounded-full transition-all"
                  style={{
                    background: c,
                    width: c === color ? 18 : 13,
                    height: c === color ? 18 : 13
                  }}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

/** Filter chip with a colour swatch that opens the palette, and a delete x. */
export default function TagChip({
  tag,
  active,
  onFilter,
  onSetColor,
  onDelete
}: {
  tag: Tag
  active: boolean
  onFilter: () => void
  onSetColor: (color: string) => void
  onDelete: () => void
}) {
  return (
    <span
      className="group flex items-center gap-1.5 rounded-full py-1 pr-1 pl-1.5 text-[12px] font-medium transition-colors"
      style={{
        background: active ? tagFill(tag.color, 0.3) : 'var(--color-surface)',
        color: active ? tag.color : 'var(--color-muted)'
      }}
    >
      <ColorSwatch
        color={tag.color}
        onPick={onSetColor}
        ariaLabel={`Colour for ${tag.name}`}
      />
      <button onClick={onFilter} className={active ? 'font-semibold' : 'hover:text-ink'}>
        {tag.name}
      </button>
      <button
        onClick={onDelete}
        aria-label={`Delete tag ${tag.name}`}
        title={`Delete “${tag.name}”`}
        className="hover:text-coral flex h-4.5 w-4.5 items-center justify-center rounded-full text-[13px] leading-none opacity-45 transition-opacity group-hover:opacity-100"
      >
        ×
      </button>
    </span>
  )
}
