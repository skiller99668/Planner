// A voltmeter-style radial gauge. sweep is 0-1 (fraction of target reached).
// Reads as instrumentation rather than a generic progress bar - on theme for EE.
export default function GaugeDial({ value, target, label, unit = '', color = '#4FB6C4', size = 120 }) {
  const sweep = Math.min(value / target, 1)
  const startAngle = -210
  const endAngle = 30
  const angle = startAngle + (endAngle - startAngle) * sweep

  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 14

  const toXY = (deg) => {
    const rad = (deg * Math.PI) / 180
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
  }

  const arcPath = (a1, a2) => {
    const [x1, y1] = toXY(a1)
    const [x2, y2] = toXY(a2)
    const largeArc = a2 - a1 > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
  }

  const [needleX, needleY] = toXY(angle)
  const met = value >= target

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <path d={arcPath(startAngle, endAngle)} stroke="#223049" strokeWidth="8" fill="none" strokeLinecap="round" />
        <path d={arcPath(startAngle, angle)} stroke={met ? '#4FB6C4' : color} strokeWidth="8" fill="none" strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="#EAF0F6" strokeWidth="2" />
        <circle cx={cx} cy={cy} r="4" fill="#EAF0F6" />
        <text x={cx} y={cy + r / 2} textAnchor="middle" className="fill-ink font-mono" fontSize="16" fontWeight="600">
          {value}{unit}
        </text>
      </svg>
      <div className="text-xs font-mono text-muted -mt-2">/ {target}{unit} {label}</div>
    </div>
  )
}
