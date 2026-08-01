export default function ModuleStub({ title, description, comingNext }) {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold">{title}</h1>
      <div className="bg-panel border border-dashed border-line rounded-xl p-8 text-center">
        <p className="text-sm text-muted max-w-md mx-auto">{description}</p>
        <div className="mt-4 inline-flex flex-wrap justify-center gap-2">
          {comingNext.map((item) => (
            <span key={item} className="text-xs font-mono text-cyan border border-cyan/30 bg-cyan/10 rounded-full px-3 py-1">
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
