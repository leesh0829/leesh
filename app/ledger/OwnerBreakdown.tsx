export type OwnerSegment = {
  ownerId: string
  label: string
  color: string
  isSelf: boolean
  value: number // 절댓값으로 stack bar 비율 계산
  displayValue: string // 표시용 문자열 (예: "+₩100,000")
}

// 가로 색 stack — 각 owner의 비율을 색으로 표시. value의 절댓값 기준 비율.
export function OwnerStackBar({
  segments,
  height = 6,
}: {
  segments: OwnerSegment[]
  height?: number
}) {
  const total = segments.reduce((s, x) => s + Math.abs(x.value), 0)
  if (total === 0 || segments.length < 2) return null
  return (
    <div
      className="mt-1 flex overflow-hidden rounded-full"
      style={{
        height,
        background: 'color-mix(in srgb, var(--border) 60%, transparent)',
      }}
      title={segments
        .map((s) => `${s.label}: ${s.displayValue}`)
        .join('\n')}
    >
      {segments.map((s) => {
        const pct = (Math.abs(s.value) / total) * 100
        if (pct <= 0) return null
        return (
          <div
            key={s.ownerId}
            className="h-full"
            style={{ width: `${pct}%`, background: s.color }}
            title={`${s.label}: ${s.displayValue}`}
          />
        )
      })}
    </div>
  )
}

// 분리 모드: owner별 세로 리스트 (라벨 + 색 점 + 값)
export function OwnerBreakdownList({
  segments,
  className,
}: {
  segments: OwnerSegment[]
  className?: string
}) {
  if (segments.length === 0) return null
  return (
    <div className={'grid gap-1 text-sm ' + (className ?? '')}>
      {segments.map((s) => (
        <div
          key={s.ownerId}
          className="flex items-center justify-between gap-2"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm border"
              style={{
                background: s.color,
                borderColor: 'color-mix(in srgb, var(--border) 70%, white)',
              }}
            />
            <span className="truncate">{s.label}</span>
            {s.isSelf ? <span className="badge">나</span> : null}
          </span>
          <span className="shrink-0 font-semibold">{s.displayValue}</span>
        </div>
      ))}
    </div>
  )
}

// 합산/분리 토글 버튼 (chip 형태)
export function ViewModeToggle({
  mode,
  onChange,
}: {
  mode: 'combined' | 'split'
  onChange: (m: 'combined' | 'split') => void
}) {
  return (
    <div className="inline-flex gap-1">
      <button
        type="button"
        className={
          'btn text-xs ' + (mode === 'combined' ? 'btn-primary' : 'btn-outline')
        }
        onClick={() => onChange('combined')}
        title="모든 계정 합산"
        aria-pressed={mode === 'combined'}
      >
        합산
      </button>
      <button
        type="button"
        className={
          'btn text-xs ' + (mode === 'split' ? 'btn-primary' : 'btn-outline')
        }
        onClick={() => onChange('split')}
        title="계정별 분리 표시"
        aria-pressed={mode === 'split'}
      >
        분리
      </button>
    </div>
  )
}
