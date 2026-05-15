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

// 거래 마커 — 매수/매도 시점 표시
export type TradeMarker = {
  date: string // YYYYMMDD (캔들 date prefix와 매칭)
  type: 'BUY' | 'SELL'
  price?: number | null
  quantity?: number | null
  label?: string // 툴팁용
}

export type CandleChartProps = {
  bars: Candle[]
  decimals?: number
  showVolume?: boolean
  height?: number
  showIndicators?: boolean // MA/볼린저/RSI 등 표시 여부 (기본 true)
  trades?: TradeMarker[] // 매수/매도 마커
  showVolumeProfile?: boolean // 우측 거래량 프로파일 (기본 false — 토글로 켤 수 있음)
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

// EMA (지수 이동평균) — MACD에 사용
function ema(values: number[], window: number): (number | null)[] {
  const out: (number | null)[] = []
  const k = 2 / (window + 1)
  let prev: number | null = null
  for (let i = 0; i < values.length; i++) {
    if (i < window - 1) {
      out.push(null)
      continue
    }
    if (i === window - 1) {
      // SMA로 초기 시드
      let sum = 0
      for (let j = 0; j < window; j++) sum += values[j]
      prev = sum / window
      out.push(prev)
      continue
    }
    const nextVal: number = values[i] * k + (prev as number) * (1 - k)
    out.push(nextVal)
    prev = nextVal
  }
  return out
}

// MACD — (EMA12 - EMA26) + signal EMA9
function macd(
  values: number[]
): {
  line: (number | null)[]
  signal: (number | null)[]
  hist: (number | null)[]
} {
  const e12 = ema(values, 12)
  const e26 = ema(values, 26)
  const line: (number | null)[] = values.map((_, i) => {
    if (e12[i] === null || e26[i] === null) return null
    return (e12[i] as number) - (e26[i] as number)
  })
  const lineForSignal: number[] = []
  const startIdx: number[] = []
  line.forEach((v, i) => {
    if (v !== null) {
      lineForSignal.push(v)
      startIdx.push(i)
    }
  })
  const sigSub = ema(lineForSignal, 9)
  const signal: (number | null)[] = values.map(() => null)
  sigSub.forEach((v, i) => {
    if (v !== null) signal[startIdx[i]] = v
  })
  const hist: (number | null)[] = line.map((v, i) =>
    v !== null && signal[i] !== null ? v - (signal[i] as number) : null
  )
  return { line, signal, hist }
}

// Stochastic %K (14) + %D (3-period SMA of %K)
function stochastic(
  bars: Candle[],
  kPeriod = 14,
  dPeriod = 3
): { k: (number | null)[]; d: (number | null)[] } {
  const k: (number | null)[] = []
  for (let i = 0; i < bars.length; i++) {
    if (i < kPeriod - 1) {
      k.push(null)
      continue
    }
    let hh = -Infinity
    let ll = Infinity
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (bars[j].high !== null) hh = Math.max(hh, bars[j].high as number)
      if (bars[j].low !== null) ll = Math.min(ll, bars[j].low as number)
    }
    const c = bars[i].close
    if (c === null || hh === ll) {
      k.push(null)
      continue
    }
    k.push(((c - ll) / (hh - ll)) * 100)
  }
  // %D = SMA(K, dPeriod)
  const d: (number | null)[] = []
  let sum = 0
  let count = 0
  const recent: (number | null)[] = []
  for (let i = 0; i < k.length; i++) {
    const v = k[i]
    if (v === null) {
      recent.push(null)
      d.push(null)
      continue
    }
    recent.push(v)
    sum += v
    count++
    if (recent.length > dPeriod) {
      const popped = recent.shift()
      if (popped !== null && popped !== undefined) {
        sum -= popped
        count--
      }
    }
    d.push(count >= dPeriod ? sum / dPeriod : null)
  }
  return { k, d }
}

// 거래량 프로파일 — 가격대(20 bins)별 누적 거래량
function volumeProfile(
  bars: Candle[],
  bins = 20
): { bins: { price: number; volume: number }[]; max: number } {
  const closes = bars.map((b) => b.close).filter((v): v is number => v !== null)
  if (closes.length === 0) return { bins: [], max: 0 }
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const range = max - min || 1
  const step = range / bins
  const acc = new Array(bins).fill(0) as number[]
  for (const b of bars) {
    if (b.close === null) continue
    const idx = Math.min(bins - 1, Math.floor((b.close - min) / step))
    acc[idx] += b.volume ?? 0
  }
  const result = acc.map((vol, i) => ({
    price: min + (i + 0.5) * step,
    volume: vol,
  }))
  const maxVol = Math.max(0, ...acc)
  return { bins: result, max: maxVol }
}

type IndicatorKey = 'MA' | 'BB' | 'RSI' | 'VOLMA' | 'MACD' | 'STOCH' | 'VP'

export default function CandleChart({
  bars,
  decimals = 0,
  showVolume = true,
  height = 320,
  showIndicators = true,
  trades = [],
  showVolumeProfile: showVolumeProfileProp = false,
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

  // 어떤 지표 보일지 (기본: MA + BB + VOLMA ON, 나머지 OFF)
  const [enabled, setEnabled] = useState<Record<IndicatorKey, boolean>>({
    MA: true,
    BB: true,
    RSI: false,
    VOLMA: true,
    MACD: false,
    STOCH: false,
    VP: showVolumeProfileProp,
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
  const macdData = useMemo(() => macd(closes), [closes])
  const stochData = useMemo(() => stochastic(sorted), [sorted])
  const vp = useMemo(() => volumeProfile(sorted), [sorted])

  // 거래 마커를 캔들 인덱스에 매핑 (date prefix 매칭)
  const tradeMarkers = useMemo(() => {
    if (trades.length === 0 || sorted.length === 0) return []
    const dateToIdx = new Map<string, number>()
    sorted.forEach((b, i) => {
      const key = b.date.slice(0, 8) // YYYYMMDD
      // 같은 날짜의 첫 캔들만 (분봉이면 첫 분봉)
      if (!dateToIdx.has(key)) dateToIdx.set(key, i)
    })
    return trades
      .map((t) => {
        const idx = dateToIdx.get(t.date.slice(0, 8))
        if (idx === undefined) return null
        return { ...t, idx }
      })
      .filter((t): t is TradeMarker & { idx: number } => t !== null)
  }, [trades, sorted])

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

  // 레이아웃 — RSI/MACD/Stoch 켜진 경우 영역 분할
  const showRsi = showIndicators && enabled.RSI
  const showMacd = showIndicators && enabled.MACD
  const showStoch = showIndicators && enabled.STOCH
  const showVp = showIndicators && enabled.VP && vp.bins.length > 0
  const subPanelCount = (showRsi ? 1 : 0) + (showMacd ? 1 : 0) + (showStoch ? 1 : 0)
  const W = 720
  const padL = 6
  const padR = showVp ? 90 : 50 // VP 켜진 경우 우측 더 확보
  const padT = 8
  const subPanelH = 70 // 각 보조 차트 높이
  const subGap = 6
  const totalSubH = subPanelCount * subPanelH + Math.max(0, subPanelCount - 1) * subGap
  const subAreaGap = subPanelCount > 0 ? 6 : 0
  const mainAreaH = height - totalSubH - subAreaGap - padT - 14 // 14 = x축 라벨
  const priceAreaH = showVolume ? mainAreaH * 0.78 : mainAreaH * 0.95
  const volAreaH = showVolume ? mainAreaH * 0.18 : 0

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

  // 보조 패널 영역 (RSI/MACD/Stoch 순서대로 적층)
  const subAreaTop = padT + priceAreaH + volAreaH + subAreaGap
  let panelCursor = 0
  const rsiTop = showRsi
    ? subAreaTop + panelCursor++ * (subPanelH + subGap)
    : 0
  const macdTop = showMacd
    ? subAreaTop + panelCursor++ * (subPanelH + subGap)
    : 0
  const stochTop = showStoch
    ? subAreaTop + panelCursor++ * (subPanelH + subGap)
    : 0
  function yRsi(v: number) {
    return rsiTop + (1 - v / 100) * subPanelH
  }
  // MACD 범위 — line+signal 모두 포함
  const macdAll: number[] = []
  for (const v of macdData.line) if (v !== null) macdAll.push(v)
  for (const v of macdData.signal) if (v !== null) macdAll.push(v)
  for (const v of macdData.hist) if (v !== null) macdAll.push(v)
  const macdMax = macdAll.length ? Math.max(...macdAll) : 1
  const macdMin = macdAll.length ? Math.min(...macdAll) : -1
  const macdAbs = Math.max(Math.abs(macdMax), Math.abs(macdMin), 1)
  function yMacd(v: number) {
    // 중앙 0 기준 대칭
    return macdTop + (1 - (v + macdAbs) / (2 * macdAbs)) * subPanelH
  }
  function yStoch(v: number) {
    return stochTop + (1 - v / 100) * subPanelH
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
    const scaleX = W / rect.width
    const svgX = (e.clientX - rect.left) * scaleX
    setHoverIdx(svgPointToIdx(svgX))
  }

  function handleTouchMove(e: React.TouchEvent<SVGSVGElement>) {
    const t = e.touches[0]
    if (!t) return
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const scaleX = W / rect.width
    const svgX = (t.clientX - rect.left) * scaleX
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
              ['MACD', 'MACD'],
              ['STOCH', 'Stoch'],
              ['VP', '거래량 프로파일'],
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
        onTouchStart={handleTouchMove}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => setHoverIdx(null)}
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
              fontSize={11}
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
              fontSize={10}
              fill="currentColor"
              opacity={0.5}
            >
              70
            </text>
            <text
              x={W - padR + 4}
              y={yRsi(30) + 3}
              fontSize={10}
              fill="currentColor"
              opacity={0.5}
            >
              30
            </text>
            <text
              x={padL}
              y={rsiTop - 2}
              fontSize={11}
              fill="currentColor"
              opacity={0.5}
            >
              RSI(14)
            </text>
          </>
        )}

        {/* MACD 보조 차트 */}
        {showMacd && (
          <>
            {/* 0 기준선 */}
            <line
              x1={padL}
              x2={W - padR}
              y1={macdTop + subPanelH / 2}
              y2={macdTop + subPanelH / 2}
              stroke="currentColor"
              strokeOpacity={0.2}
            />
            {/* 히스토그램 */}
            {macdData.hist.map((v, i) => {
              if (v === null) return null
              const x = padL + i * (candleW + gap)
              const y0 = macdTop + subPanelH / 2
              const y1 = yMacd(v)
              const color = v >= 0 ? '#ef4444' : '#3b82f6'
              return (
                <rect
                  key={`mh-${i}`}
                  x={x}
                  y={Math.min(y0, y1)}
                  width={Math.max(1, candleW)}
                  height={Math.abs(y1 - y0)}
                  fill={color}
                  fillOpacity={0.5}
                />
              )
            })}
            {/* MACD line / signal */}
            <path
              d={makeLinePath(macdData.line, yMacd)}
              fill="none"
              stroke="#0ea5e9"
              strokeWidth={1.3}
            />
            <path
              d={makeLinePath(macdData.signal, yMacd)}
              fill="none"
              stroke="#f97316"
              strokeWidth={1.3}
            />
            <text
              x={padL}
              y={macdTop - 2}
              fontSize={11}
              fill="currentColor"
              opacity={0.5}
            >
              MACD(12,26,9)
            </text>
          </>
        )}

        {/* Stochastic 보조 차트 */}
        {showStoch && (
          <>
            {/* 20/80 기준선 */}
            <line
              x1={padL}
              x2={W - padR}
              y1={yStoch(80)}
              y2={yStoch(80)}
              stroke="#ef4444"
              strokeOpacity={0.3}
              strokeDasharray="2 2"
            />
            <line
              x1={padL}
              x2={W - padR}
              y1={yStoch(20)}
              y2={yStoch(20)}
              stroke="#3b82f6"
              strokeOpacity={0.3}
              strokeDasharray="2 2"
            />
            <path
              d={makeLinePath(stochData.k, yStoch)}
              fill="none"
              stroke="#8b5cf6"
              strokeWidth={1.3}
            />
            <path
              d={makeLinePath(stochData.d, yStoch)}
              fill="none"
              stroke="#f97316"
              strokeWidth={1.1}
              strokeDasharray="2 1"
            />
            <text
              x={padL}
              y={stochTop - 2}
              fontSize={11}
              fill="currentColor"
              opacity={0.5}
            >
              Stoch(14,3)
            </text>
          </>
        )}

        {/* 거래량 프로파일 (우측 가로 막대) */}
        {showVp && (
          <>
            {vp.bins.map((b, i) => {
              if (b.volume === 0) return null
              const y = yPrice(b.price)
              const w = (b.volume / vp.max) * (padR - 6)
              const barH = priceAreaH / vp.bins.length
              return (
                <rect
                  key={`vp-${i}`}
                  x={W - padR + 2}
                  y={y - barH / 2}
                  width={w}
                  height={Math.max(1, barH - 1)}
                  fill="#a855f7"
                  fillOpacity={0.4}
                />
              )
            })}
          </>
        )}

        {/* 거래 마커 (매수=▲, 매도=▼) */}
        {tradeMarkers.map((t, i) => {
          const xMid = padL + t.idx * (candleW + gap) + candleW / 2
          const isBuy = t.type === 'BUY'
          const bar = sorted[t.idx]
          // 매수는 저가 아래, 매도는 고가 위에
          const anchorY = isBuy
            ? bar.low !== null
              ? yPrice(bar.low) + 8
              : padT + priceAreaH - 6
            : bar.high !== null
              ? yPrice(bar.high) - 4
              : padT + 6
          const color = isBuy ? '#ef4444' : '#3b82f6'
          // 삼각형
          const size = 5
          const path = isBuy
            ? `M${xMid - size},${anchorY + size} L${xMid + size},${anchorY + size} L${xMid},${anchorY} Z`
            : `M${xMid - size},${anchorY - size} L${xMid + size},${anchorY - size} L${xMid},${anchorY} Z`
          return (
            <g key={`tm-${i}`}>
              <path d={path} fill={color} stroke="white" strokeWidth={0.8}>
                <title>
                  {isBuy ? '매수' : '매도'} {t.date.slice(0, 8)}
                  {t.price !== null && t.price !== undefined
                    ? ` · ${t.price.toLocaleString('ko-KR')}`
                    : ''}
                  {t.quantity ? ` × ${t.quantity}주` : ''}
                  {t.label ? ` · ${t.label}` : ''}
                </title>
              </path>
            </g>
          )
        })}

        {/* X축 라벨 */}
        {xLabels.map((l, i) => (
          <text
            key={`x-${i}`}
            x={l.x}
            y={height - 2}
            fontSize={11}
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
              y2={padT + priceAreaH + volAreaH + (subPanelCount > 0 ? subAreaGap + totalSubH : 0)}
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
