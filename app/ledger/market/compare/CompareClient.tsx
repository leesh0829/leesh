'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import StockSearchBox from '../StockSearchBox'

type Series = {
  code: string
  name: string
  color: string
  bars: { date: string; close: number | null }[]
}

const COLORS = [
  '#ef4444',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#a855f7',
  '#06b6d4',
]

type Period = 'D' | 'W' | 'M' | 'Y'

function fmtRate(r: number) {
  return `${r >= 0 ? '+' : ''}${r.toFixed(2)}%`
}

function rateColor(r: number) {
  if (r === 0) return ''
  return r > 0 ? 'text-red-500' : 'text-blue-500'
}

export default function CompareClient() {
  const [series, setSeries] = useState<Series[]>([])
  const [period, setPeriod] = useState<Period>('D')
  const [loading, setLoading] = useState(false)

  async function addSymbol(code: string, name: string) {
    if (series.some((s) => s.code === code)) return
    if (series.length >= 6) return
    const color = COLORS[series.length % COLORS.length]
    setLoading(true)
    try {
      const r = await fetch(
        `/api/kis/stock/${code}/history?period=${period}`,
        { cache: 'no-store' }
      )
      if (r.ok) {
        const j = (await r.json()) as {
          items: { date: string; close: number | null }[]
        }
        setSeries((p) => [
          ...p,
          {
            code,
            name,
            color,
            bars: j.items
              .filter((b) => b.close !== null)
              .sort((a, b) => a.date.localeCompare(b.date)),
          },
        ])
      }
    } finally {
      setLoading(false)
    }
  }

  function removeSymbol(code: string) {
    setSeries((p) => p.filter((s) => s.code !== code))
  }

  // 기간 변경 시 기존 종목들 재조회
  useEffect(() => {
    if (series.length === 0) return
    let cancelled = false
    async function reload() {
      setLoading(true)
      try {
        const next = await Promise.all(
          series.map(async (s) => {
            const r = await fetch(
              `/api/kis/stock/${s.code}/history?period=${period}`,
              { cache: 'no-store' }
            )
            if (!r.ok) return s
            const j = (await r.json()) as {
              items: { date: string; close: number | null }[]
            }
            return {
              ...s,
              bars: j.items
                .filter((b) => b.close !== null)
                .sort((a, b) => a.date.localeCompare(b.date)),
            }
          })
        )
        if (!cancelled) setSeries(next)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void reload()
    return () => {
      cancelled = true
    }
    // 의도적으로 series는 deps에서 제외 — 자기 자신 재호출 방지
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  // 정규화 시리즈 (첫 값을 100으로)
  const normalized = useMemo(() => {
    return series.map((s) => {
      const base = s.bars[0]?.close ?? null
      if (!base) return { ...s, points: [] as { x: number; y: number }[] }
      return {
        ...s,
        base,
        points: s.bars.map((b, i) => ({
          x: i,
          y: ((b.close as number) / base) * 100,
        })),
      }
    })
  }, [series])

  // 차트 좌표계
  const maxLen = Math.max(0, ...normalized.map((s) => s.points.length))
  const allY = normalized.flatMap((s) => s.points.map((p) => p.y))
  const yMin = allY.length ? Math.min(...allY) : 95
  const yMax = allY.length ? Math.max(...allY) : 105
  const yRange = yMax - yMin || 1
  const W = 800
  const H = 360
  const padL = 30
  const padR = 8
  const padT = 12
  const padB = 28
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  function x(idx: number) {
    if (maxLen <= 1) return padL
    return padL + (idx / (maxLen - 1)) * innerW
  }
  function y(v: number) {
    return padT + (1 - (v - yMin) / yRange) * innerH
  }

  return (
    <main className="w-full px-3 py-6 sm:px-4 lg:px-6">
      <div className="grid gap-6">
        <div className="surface card-pad card-hover-border-only">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">종목 비교 차트</h1>
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                최대 6개 종목을 한 그래프에 — 시작가 100 기준 정규화 (상대 수익률)
              </p>
            </div>
            <Link href="/ledger/market" className="btn btn-outline text-xs">
              ← 시장 대시보드
            </Link>
          </div>

          {/* 종목 추가 */}
          <div className="mt-4">
            <StockSearchBox
              onSelectKr={(code, name) => addSymbol(code, name)}
              placeholder="비교할 종목 검색 (한국 6자리 종목만 — 해외 미지원)"
            />
          </div>

          {/* 종목 칩 */}
          {series.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {series.map((s) => (
                <div
                  key={s.code}
                  className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
                  style={{ borderColor: s.color, color: s.color }}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: s.color }}
                  />
                  <span className="font-semibold">{s.name}</span>
                  <span style={{ opacity: 0.6 }}>{s.code}</span>
                  <button
                    type="button"
                    onClick={() => removeSymbol(s.code)}
                    className="opacity-60 hover:opacity-100"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 기간 토글 */}
          <div
            className="mt-4 flex gap-1 border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            {(
              [
                ['D', '일봉 (~5개월)'],
                ['W', '주봉 (~2년)'],
                ['M', '월봉 (~9년)'],
                ['Y', '년봉 (~50년)'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setPeriod(k)}
                className={
                  'px-3 py-2 text-sm font-semibold border-b-2 ' +
                  (period === k
                    ? 'border-current'
                    : 'border-transparent opacity-60 hover:opacity-100')
                }
              >
                {label}
              </button>
            ))}
          </div>

          {/* 차트 */}
          <div className="mt-4 card p-3 card-hover-border-only">
            {series.length === 0 ? (
              <div
                className="flex items-center justify-center text-sm"
                style={{ height: H, color: 'var(--muted)' }}
              >
                위 검색에서 종목을 추가하세요. (예: 삼성전자, SK하이닉스)
              </div>
            ) : loading && allY.length === 0 ? (
              <div
                className="flex items-center justify-center text-sm"
                style={{ height: H, color: 'var(--muted)' }}
              >
                불러오는 중...
              </div>
            ) : (
              <svg
                viewBox={`0 0 ${W} ${H}`}
                width="100%"
                height={H}
                className="block"
                preserveAspectRatio="none"
              >
                {/* 기준선 100 */}
                <line
                  x1={padL}
                  x2={W - padR}
                  y1={y(100)}
                  y2={y(100)}
                  stroke="currentColor"
                  strokeOpacity={0.2}
                  strokeDasharray="3 3"
                />
                {/* y 그리드 + 라벨 (5단계) */}
                {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
                  const v = yMax - yRange * t
                  return (
                    <g key={`yg-${i}`}>
                      <line
                        x1={padL}
                        x2={W - padR}
                        y1={y(v)}
                        y2={y(v)}
                        stroke="currentColor"
                        strokeOpacity={0.06}
                      />
                      <text
                        x={padL - 4}
                        y={y(v) + 3}
                        fontSize={9}
                        fill="currentColor"
                        opacity={0.55}
                        textAnchor="end"
                      >
                        {v.toFixed(1)}
                      </text>
                    </g>
                  )
                })}

                {/* 라인 */}
                {normalized.map((s) => {
                  if (s.points.length === 0) return null
                  const d = s.points
                    .map((p, i) =>
                      i === 0
                        ? `M${x(p.x)},${y(p.y)}`
                        : `L${x(p.x)},${y(p.y)}`
                    )
                    .join(' ')
                  return (
                    <path
                      key={s.code}
                      d={d}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={1.6}
                    />
                  )
                })}
              </svg>
            )}
          </div>

          {/* 요약 */}
          {series.length > 0 && (
            <div className="mt-3 grid gap-1 text-sm">
              {normalized.map((s) => {
                if (s.points.length === 0) return null
                const last = s.points[s.points.length - 1].y
                const rate = last - 100
                return (
                  <div
                    key={s.code}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-3 rounded"
                        style={{ background: s.color }}
                      />
                      <span className="font-semibold">{s.name}</span>
                      <span
                        className="text-xs"
                        style={{ color: 'var(--muted)' }}
                      >
                        {s.code}
                      </span>
                    </div>
                    <div
                      className={'font-semibold ' + rateColor(rate)}
                    >
                      {fmtRate(rate)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
