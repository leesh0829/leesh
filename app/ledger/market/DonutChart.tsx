'use client'

export type DonutSegment = {
  label: string
  value: number
  color?: string
}

const DEFAULT_PALETTE = [
  '#ef4444',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#a855f7',
  '#06b6d4',
  '#ec4899',
  '#22c55e',
  '#0ea5e9',
  '#f97316',
  '#8b5cf6',
  '#14b8a6',
]

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polar(cx, cy, r, endAngle)
  const end = polar(cx, cy, r, startAngle)
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0
  return `M${start.x},${start.y} A${r},${r} 0 ${largeArc} 0 ${end.x},${end.y}`
}
function polar(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
}

export default function DonutChart({
  segments,
  size = 180,
  thickness = 36,
  centerLabel,
  centerValue,
}: {
  segments: DonutSegment[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerValue?: string
}) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0)
  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm"
        style={{ height: size, color: 'var(--muted)' }}
      >
        데이터가 없습니다.
      </div>
    )
  }
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - thickness / 2
  // 누적 합으로 시작각/끝각 계산 (재할당 없이)
  const cumulative: number[] = []
  let running = 0
  for (const s of segments) {
    running += Math.max(0, s.value)
    cumulative.push(running)
  }
  const arcs = segments
    .map((s, i) => {
      const v = Math.max(0, s.value)
      if (v <= 0) return null
      const prev = i === 0 ? 0 : cumulative[i - 1]
      const startAngle = -Math.PI / 2 + (prev / total) * 2 * Math.PI
      const endAngle = -Math.PI / 2 + (cumulative[i] / total) * 2 * Math.PI
      const color = s.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]
      return {
        d: describeArc(cx, cy, r, startAngle, endAngle),
        color,
        label: s.label,
        value: v,
        pct: (v / total) * 100,
      }
    })
    .filter((a): a is NonNullable<typeof a> => a !== null)
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {arcs.map((a, i) => (
          <path
            key={i}
            d={a.d}
            fill="none"
            stroke={a.color}
            strokeWidth={thickness}
            strokeLinecap="butt"
          >
            <title>
              {a.label} · {a.pct.toFixed(1)}%
            </title>
          </path>
        ))}
        {(centerLabel || centerValue) && (
          <g>
            {centerLabel && (
              <text
                x={cx}
                y={cy - 4}
                fontSize={10}
                fill="currentColor"
                opacity={0.6}
                textAnchor="middle"
              >
                {centerLabel}
              </text>
            )}
            {centerValue && (
              <text
                x={cx}
                y={cy + 14}
                fontSize={15}
                fontWeight={800}
                fill="currentColor"
                textAnchor="middle"
              >
                {centerValue}
              </text>
            )}
          </g>
        )}
      </svg>
      <ul className="grid gap-1 text-xs sm:flex-1 min-w-0">
        {arcs
          .slice()
          .sort((a, b) => b.value - a.value)
          .map((a, i) => (
            <li key={i} className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-sm shrink-0"
                style={{ background: a.color }}
              />
              <span className="min-w-0 flex-1 truncate">{a.label}</span>
              <span className="shrink-0 font-mono">{a.pct.toFixed(1)}%</span>
            </li>
          ))}
      </ul>
    </div>
  )
}
