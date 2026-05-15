'use client'

import { useMemo, useState } from 'react'

export type Candle = {
  date: string // YYYYMMDD or YYYYMMDDHHMMSS
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
}

export type CandleChartProps = {
  bars: Candle[]
  decimals?: number
  showVolume?: boolean
  height?: number
  showIndicators?: boolean // MA/볼린저/RSI 등 표시 여부 (기본 true)
}

function formatTick(s: string): string {
  if (!s) return ''
  if (s.length >= 14) {
    // YYYYMMDDHHMMSS → MM/DD HH:MM
    return `${s.slice(4, 6)}/${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}`
  }
  if (s.length >= 12) return `${s.slice(8, 10)}:${s.slice(10, 12)}`
  if (s.length === 8) return `${s.slice(4, 6)}/${s.slice(6, 8)}`
  return s
}

function formatFullDate(s: string): string {
  if (!s) return ''
  if (s.length >= 14)
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}`
  if (s.length >= 12)
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}`
  if (s.length === 8)
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  return s
}

function formatPriceTick(v: number, decimals: number): string {
  return v.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtVolumeShort(n: number | null): string {
  if (n === null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e8) return `${(n / 1e8).toFixed(1)}억`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e4) return `${(n / 1e4).toFixed(1)}만`
  return n.toLocaleString('ko-KR')
}

// 단순 이동평균
function sma(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = []
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= window) sum -= values[i - window]
    out.push(i >= window - 1 ? sum / window : null)
  }
  return out
}

// 볼린저밴드 (window=20, mult=2) — [middle, upper, lower]
function bollinger(
  values: number[],
  window = 20,
  mult = 2
): { mid: (number | null)[]; upper: (number | null)[]; lower: (number | null)[] } {
  const mid = sma(values, window)
  const upper: (number | null)[] = []
  const lower: (number | null)[] = []
  for (let i = 0; i < values.length; i++) {
    if (i < window - 1) {
      upper.push(null)
      lower.push(null)
      continue
    }
    const slice = values.slice(i - window + 1, i + 1)
    const m = mid[i] as number
    const variance =
      slice.reduce((acc, v) => acc + (v - m) ** 2, 0) / window
    const std = Math.sqrt(variance)
    upper.push(m + std * mult)
    lower.push(m - std * mult)
  }
  return { mid, upper, lower }
}

// RSI (Relative Strength Index) — 표준 14일
function rsi(values: number[], window = 14): (number | null)[] {
  const out: (number | null)[] = []
  if (values.length < window + 1) return values.map(() => null)
  let gainSum = 0
  let lossSum = 0
  for (let i = 1; i <= window; i++) {
    const diff = values[i] - values[i - 1]
    if (diff > 0) gainSum += diff
    else lossSum += -diff
  }
  let avgGain = gainSum / window
  let avgLoss = lossSum / window
  for (let i = 0; i < values.length; i++) {
    if (i < window) {
      out.push(null)
      continue
    }
    if (i > window) {
      const diff = values[i] - values[i - 1]
      const gain = diff > 0 ? diff : 0
      const loss = diff < 0 ? -diff : 0
      avgGain = (avgGain * (window - 1) + gain) / window
      avgLoss = (avgLoss * (window - 1) + loss) / window
    }
    if (avgLoss === 0) {
      out.push(100)
    } else {
      const rs = avgGain / avgLoss
      out.push(100 - 100 / (1 + rs))
    }
  }
  return out
}

type IndicatorKey = 'MA' | 'BB' | 'RSI' | 'VOLMA'

export default function CandleChart({
  bars,
  decimals = 0,
  showVolume = true,
  height = 320,
  showIndicators = true,
}: CandleChartProps) {
  // 오래된 → 최신 정렬
  const sorted = useMemo(
    () =>
      bars
        .filter((b) => b.close !== null)
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date)),
    [bars]
  )

  // 어떤 지표 보일지 (기본: MA + BB ON, RSI/VOLMA OFF)
  const [enabled, setEnabled] = useState<Record<IndicatorKey, boolean>>({
    MA: true,
    BB: true,
    RSI: false,
    VOLMA: true,
  })

  // 호버 상태
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  // 지표 계산
  const closes = useMemo(() => sorted.map((b) => b.close as number), [sorted])
  const ma5 = useMemo(() => sma(closes, 5), [closes])
  const ma20 = useMemo(() => sma(closes, 20), [closes])
  const ma60 = useMemo(() => sma(closes, 60), [closes])
  const bb = useMemo(() => bollinger(closes, 20, 2), [closes])
  const rsiVals = useMemo(() => rsi(closes, 14), [closes])
  const volumes = useMemo(() => sorted.map((b) => b.volume ?? 0), [sorted])
  const volMa5 = useMemo(() => sma(volumes, 5), [volumes])

  if (sorted.length === 0) {
    return (
      <div
        className="text-sm flex items-center justify-center"
        style={{ height, color: 'var(--muted)' }}
      >
        차트 데이터가 없습니다.
      </div>
    )
  }

  // 레이아웃 — RSI 켜진 경우 영역 분할
  const showRsi = showIndicators && enabled.RSI
  const W = 720
  const padL = 6
  const padR = 50
  const padT = 8
  const rsiH = showRsi ? height * 0.18 : 0
  const rsiGap = showRsi ? 6 : 0
  const priceAreaH = showVolume
    ? (height - rsiH - rsiGap) * 0.7
    : (height - rsiH - rsiGap) * 0.92
  const volAreaH = showVolume ? (height - rsiH - rsiGap) * 0.22 : 0

  const innerW = W - padL - padR
  const gap = Math.max(1, Math.min(3, innerW / sorted.length / 4))
  const candleW = Math.max(1, (innerW - gap * (sorted.length - 1)) / sorted.length)

  // 가격 범위 (BB/MA 포함)
  const priceCandidates: number[] = []
  for (const b of sorted) {
    if (b.high !== null) priceCandidates.push(b.high)
    if (b.low !== null) priceCandidates.push(b.low)
    if (b.close !== null) priceCandidates.push(b.close)
  }
  if (showIndicators && enabled.BB) {
    for (const v of bb.upper) if (v !== null) priceCandidates.push(v)
    for (const v of bb.lower) if (v !== null) priceCandidates.push(v)
  }
  if (showIndicators && enabled.MA) {
    for (const arr of [ma5, ma20, ma60])
      for (const v of arr) if (v !== null) priceCandidates.push(v)
  }
  const priceMax = priceCandidates.length > 0 ? Math.max(...priceCandidates) : 1
  const priceMin =
    priceCandidates.length > 0
      ? Math.min(...priceCandidates.filter((v) => v > 0))
      : 0
  const priceRange = priceMax - priceMin || 1
  const padRatio = 0.05
  const pMax = priceMax + priceRange * padRatio
  const pMin = priceMin - priceRange * padRatio
  const pRange = pMax - pMin || 1

  function yPrice(v: number) {
    return padT + (1 - (v - pMin) / pRange) * priceAreaH
  }

  // 거래량 영역
  const vMax = Math.max(1, ...volumes)
  const volTop = padT + priceAreaH + 4
  function yVol(v: number) {
    return volTop + (1 - v / vMax) * volAreaH
  }

  // RSI 영역
  const rsiTop = padT + priceAreaH + volAreaH + rsiGap
  function yRsi(v: number) {
    // 0-100 범위
    return rsiTop + (1 - v / 100) * rsiH
  }

  // 가격 그리드
  const gridSteps = 4
  const gridLines: { y: number; label: string }[] = []
  for (let i = 0; i <= gridSteps; i++) {
    const v = pMax - (pRange * i) / gridSteps
    gridLines.push({ y: yPrice(v), label: formatPriceTick(v, decimals) })
  }

  // X축 라벨 ~5개
  const xLabelCount = Math.min(6, sorted.length)
  const xLabels: { x: number; text: string }[] = []
  for (let i = 0; i < xLabelCount; i++) {
    const idx = Math.round(((sorted.length - 1) * i) / (xLabelCount - 1 || 1))
    const x = padL + idx * (candleW + gap) + candleW / 2
    xLabels.push({ x, text: formatTick(sorted[idx].date) })
  }

  // 지표 path 생성기
  function makeLinePath(values: (number | null)[], yFn: (v: number) => number) {
    let d = ''
    let started = false
    values.forEach((v, i) => {
      if (v === null) {
        started = false
        return
      }
      const x = padL + i * (candleW + gap) + candleW / 2
      const y = yFn(v)
      d += `${!started ? 'M' : 'L'}${x},${y} `
      started = true
    })
    return d.trim()
  }

  // 호버용 좌표→인덱스 변환
  function svgPointToIdx(svgX: number): number {
    const x = svgX - padL
    const idx = Math.round(x / (candleW + gap))
    return Math.min(sorted.length - 1, Math.max(0, idx))
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    // viewBox 좌표로 변환
    const scaleX = W / rect.width
    const svgX = (e.clientX - rect.left) * scaleX
    setHoverIdx(svgPointToIdx(svgX))
  }

  const hover = hoverIdx !== null ? sorted[hoverIdx] : null
  const hoverX =
    hoverIdx !== null
      ? padL + hoverIdx * (candleW + gap) + candleW / 2
      : 0

  return (
    <div>
      {/* 지표 토글 */}
      {showIndicators && (
        <div className="mb-2 flex flex-wrap gap-1.5 text-[10px]">
          {(
            [
              ['MA', 'MA'],
              ['BB', '볼린저'],
              ['VOLMA', '거래량MA'],
              ['RSI', 'RSI'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() =>
                setEnabled((p) => ({ ...p, [k]: !p[k] }))
              }
              className={
                'rounded-full px-2 py-0.5 font-semibold border ' +
                (enabled[k]
                  ? 'bg-current/10 border-current'
                  : 'opacity-50 border-transparent hover:opacity-100')
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${height}`}
        width="100%"
        height={height}
        className="block"
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* 가격 그리드 */}
        {gridLines.map((g, i) => (
          <g key={`g-${i}`}>
            <line
              x1={padL}
              x2={W - padR}
              y1={g.y}
              y2={g.y}
              stroke="currentColor"
              strokeOpacity={0.08}
            />
            <text
              x={W - padR + 4}
              y={g.y + 3}
              fontSize={9}
              fill="currentColor"
              opacity={0.55}
            >
              {g.label}
            </text>
          </g>
        ))}

        {/* 볼린저 밴드 */}
        {showIndicators && enabled.BB && (
          <>
            <path
              d={makeLinePath(bb.upper, yPrice)}
              fill="none"
              stroke="#a855f7"
              strokeOpacity={0.55}
              strokeWidth={1}
              strokeDasharray="3 2"
            />
            <path
              d={makeLinePath(bb.lower, yPrice)}
              fill="none"
              stroke="#a855f7"
              strokeOpacity={0.55}
              strokeWidth={1}
              strokeDasharray="3 2"
            />
            <path
              d={makeLinePath(bb.mid, yPrice)}
              fill="none"
              stroke="#a855f7"
              strokeOpacity={0.7}
              strokeWidth={1}
            />
          </>
        )}

        {/* 이동평균 */}
        {showIndicators && enabled.MA && (
          <>
            <path
              d={makeLinePath(ma5, yPrice)}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={1.2}
            />
            <path
              d={makeLinePath(ma20, yPrice)}
              fill="none"
              stroke="#22c55e"
              strokeWidth={1.2}
            />
            <path
              d={makeLinePath(ma60, yPrice)}
              fill="none"
              stroke="#06b6d4"
              strokeWidth={1.2}
            />
          </>
        )}

        {/* 캔들 */}
        {sorted.map((b, i) => {
          const x = padL + i * (candleW + gap)
          const xMid = x + candleW / 2
          const o = b.open
          const c = b.close
          const h = b.high
          const l = b.low
          if (o === null || c === null) return null
          const up = c >= o
          const color = up ? '#ef4444' : '#3b82f6'
          const bodyTop = yPrice(Math.max(o, c))
          const bodyBot = yPrice(Math.min(o, c))
          const bodyH = Math.max(1, bodyBot - bodyTop)
          return (
            <g key={`c-${i}`}>
              {h !== null && l !== null && (
                <line
                  x1={xMid}
                  x2={xMid}
                  y1={yPrice(h)}
                  y2={yPrice(l)}
                  stroke={color}
                  strokeWidth={1}
                />
              )}
              <rect
                x={x}
                y={bodyTop}
                width={Math.max(1, candleW)}
                height={bodyH}
                fill={color}
                stroke={color}
              />
            </g>
          )
        })}

        {/* 거래량 */}
        {showVolume &&
          sorted.map((b, i) => {
            const v = b.volume ?? 0
            if (v <= 0) return null
            const x = padL + i * (candleW + gap)
            const o = b.open
            const c = b.close
            const up = c !== null && o !== null && c >= o
            const color = up ? '#ef4444' : '#3b82f6'
            const y = yVol(v)
            const barH = volTop + volAreaH - y
            return (
              <rect
                key={`v-${i}`}
                x={x}
                y={y}
                width={Math.max(1, candleW)}
                height={Math.max(0.5, barH)}
                fill={color}
                fillOpacity={0.55}
              />
            )
          })}

        {/* 거래량 이동평균 */}
        {showVolume && showIndicators && enabled.VOLMA && (
          <path
            d={makeLinePath(volMa5, yVol)}
            fill="none"
            stroke="#f59e0b"
            strokeOpacity={0.85}
            strokeWidth={1.2}
          />
        )}

        {/* RSI 보조 차트 */}
        {showRsi && (
          <>
            {/* 30/70 기준선 */}
            <line
              x1={padL}
              x2={W - padR}
              y1={yRsi(70)}
              y2={yRsi(70)}
              stroke="#ef4444"
              strokeOpacity={0.3}
              strokeDasharray="2 2"
            />
            <line
              x1={padL}
              x2={W - padR}
              y1={yRsi(30)}
              y2={yRsi(30)}
              stroke="#3b82f6"
              strokeOpacity={0.3}
              strokeDasharray="2 2"
            />
            <path
              d={makeLinePath(rsiVals, yRsi)}
              fill="none"
              stroke="#8b5cf6"
              strokeWidth={1.4}
            />
            <text
              x={W - padR + 4}
              y={yRsi(70) + 3}
              fontSize={8}
              fill="currentColor"
              opacity={0.5}
            >
              70
            </text>
            <text
              x={W - padR + 4}
              y={yRsi(30) + 3}
              fontSize={8}
              fill="currentColor"
              opacity={0.5}
            >
              30
            </text>
            <text
              x={padL}
              y={rsiTop - 2}
              fontSize={9}
              fill="currentColor"
              opacity={0.5}
            >
              RSI(14)
            </text>
          </>
        )}

        {/* X축 라벨 */}
        {xLabels.map((l, i) => (
          <text
            key={`x-${i}`}
            x={l.x}
            y={height - 2}
            fontSize={9}
            fill="currentColor"
            opacity={0.55}
            textAnchor="middle"
          >
            {l.text}
          </text>
        ))}

        {/* 호버 십자선 */}
        {hover && (
          <>
            <line
              x1={hoverX}
              x2={hoverX}
              y1={padT}
              y2={padT + priceAreaH + volAreaH + (showRsi ? rsiGap + rsiH : 0)}
              stroke="currentColor"
              strokeOpacity={0.3}
              strokeDasharray="2 2"
            />
            {hover.close !== null && (
              <circle
                cx={hoverX}
                cy={yPrice(hover.close)}
                r={3}
                fill="currentColor"
                opacity={0.6}
              />
            )}
          </>
        )}
      </svg>

      {/* 범례 + 호버 정보 */}
      <div
        className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[10px]"
        style={{ color: 'var(--muted)' }}
      >
        <div className="flex flex-wrap gap-3">
          {showIndicators && enabled.MA && (
            <>
              <span className="flex items-center gap-1">
                <span className="inline-block h-1 w-3 rounded bg-amber-500" />
                MA5
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-1 w-3 rounded bg-green-500" />
                MA20
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-1 w-3 rounded bg-cyan-500" />
                MA60
              </span>
            </>
          )}
          {showIndicators && enabled.BB && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-1 w-3 rounded bg-purple-500" />
              볼린저(20,2σ)
            </span>
          )}
        </div>
        {hover && (
          <div
            className="font-mono"
            style={{ color: 'var(--foreground)' }}
          >
            <span style={{ color: 'var(--muted)' }}>
              {formatFullDate(hover.date)}
            </span>{' '}
            O {formatPriceTick(hover.open ?? 0, decimals)} H{' '}
            <span className="text-red-500">
              {formatPriceTick(hover.high ?? 0, decimals)}
            </span>{' '}
            L{' '}
            <span className="text-blue-500">
              {formatPriceTick(hover.low ?? 0, decimals)}
            </span>{' '}
            C {formatPriceTick(hover.close ?? 0, decimals)}
            {hover.volume !== null && (
              <>
                {' '}
                · Vol {fmtVolumeShort(hover.volume)}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
