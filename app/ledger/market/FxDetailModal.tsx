'use client'

import { useEffect, useMemo, useState } from 'react'
import CandleChart, { type Candle } from './CandleChart'

export type FxDetailTarget = {
  base: string // USD, JPY 등
  target: string // KRW 고정
  name: string // "USD/KRW" 등
  price: number | null
}

type RangeKey = '1M' | '3M' | '6M' | '1Y' | '2Y'

const RANGE_DAYS: Record<RangeKey, number> = {
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
  '2Y': 730,
}

function fmtRate(r: number | null) {
  if (r === null) return '—'
  return `${r >= 0 ? '+' : ''}${r.toFixed(2)}%`
}

function rateColor(r: number | null) {
  if (r === null || r === 0) return ''
  return r > 0 ? 'text-red-500' : 'text-blue-500'
}

export default function FxDetailModal({
  target,
  onClose,
}: {
  target: FxDetailTarget
  onClose: () => void
}) {
  const [range, setRange] = useState<RangeKey>('6M')
  const [bars, setBars] = useState<Candle[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const r = await fetch(
          `/api/fx-history?base=${target.base}&target=${target.target}&days=${RANGE_DAYS[range]}`,
          { cache: 'no-store' }
        )
        if (cancelled) return
        if (r.ok) {
          const j = (await r.json()) as { bars: Candle[] }
          setBars(j.bars)
        } else {
          setBars([])
        }
      } catch {
        setBars([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [target.base, target.target, range])

  // 시작 대비 변동률
  const summary = useMemo(() => {
    if (bars.length < 2) return null
    const first = bars[0].close ?? bars[0].open ?? null
    const last = bars[bars.length - 1].close ?? null
    if (first === null || last === null || first === 0) return null
    const change = last - first
    const rate = (change / first) * 100
    return { first, last, change, rate }
  }, [bars])

  const decimals = target.base === 'USD' ? 2 : 4

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-55 bg-black/40 flex items-end sm:items-center justify-center p-2 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="surface modal-frame w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl max-h-[92dvh] flex flex-col"
      >
      <div className="p-3 sm:p-5 overflow-y-auto" style={{ minHeight: 0 }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold leading-snug truncate">
              {target.name}
            </h3>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              {target.base} → {target.target} · Frankfurter
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-outline text-xs shrink-0"
          >
            닫기
          </button>
        </div>

        {/* 현재가 */}
        <div className="mt-4 card p-3 card-hover-border-only">
          <div className="text-xs" style={{ color: 'var(--muted)' }}>
            현재 환율
          </div>
          <div className="mt-1 text-2xl font-extrabold">
            {target.price !== null
              ? `₩${target.price.toLocaleString('ko-KR', { maximumFractionDigits: decimals })}`
              : '—'}
          </div>
          {summary && (
            <div
              className={'text-sm font-semibold ' + rateColor(summary.rate)}
            >
              {range} 변동{' '}
              {summary.change >= 0 ? '+' : ''}
              {summary.change.toFixed(decimals)} ({fmtRate(summary.rate)})
            </div>
          )}
        </div>

        {/* 기간 탭 */}
        <div
          className="mt-4 flex gap-1 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          {(['1M', '3M', '6M', '1Y', '2Y'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setRange(key)}
              className={
                'px-3 py-2 text-sm font-semibold border-b-2 ' +
                (range === key
                  ? 'border-current'
                  : 'border-transparent opacity-60 hover:opacity-100')
              }
            >
              {key}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="mt-4 h-64 rounded-md skeleton" />
        ) : bars.length === 0 ? (
          <div className="mt-4 text-sm" style={{ color: 'var(--muted)' }}>
            환율 데이터가 없습니다.
          </div>
        ) : (
          <div className="mt-4 card p-3 card-hover-border-only">
            <CandleChart
              bars={bars}
              decimals={decimals}
              showVolume={false}
              height={260}
            />
          </div>
        )}

        <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
          출처: Frankfurter (ECB 일별 환율) · 캔들은 전일 종가↔당일 종가로 합성.
        </p>
      </div>
      </div>
    </div>
  )
}
