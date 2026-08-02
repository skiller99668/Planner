export default function PlaceholderPage({
  title,
  phase,
  blurb,
  items
}: {
  title: string
  phase: string
  blurb: string
  items: string[]
}) {
  return (
    <div>
      <p className="text-muted font-mono text-[11px] tracking-[0.16em] uppercase">{phase}</p>
      <h1 className="font-display mt-1 text-xl font-semibold">{title}</h1>
      <p className="text-muted mt-3 max-w-xl leading-relaxed">{blurb}</p>

      <div className="border-line bg-panel mt-6 max-w-xl rounded-lg border p-5">
        <p className="text-muted font-mono text-[11px] tracking-[0.16em] uppercase">Will include</p>
        <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[13.5px]">
          {items.map((it) => (
            <li key={it} className="flex items-center gap-2.5">
              <span className="bg-line inline-block h-1 w-3 rounded-full" aria-hidden />
              {it}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
