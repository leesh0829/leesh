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
type Mode = 'DAILY' | 'MIN'

type FxMinuteRow = {
  date: string
  time: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
}

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
  const [mode, setMode] = useState<Mode>('DAILY')
  const [range, setRange] = useState<RangeKey>('6M')
  const [bars, setBars] = useState<Candle[]>([])
  const [loading, setLoading] = useState(true)
  const [kisError, setKisError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setKisError(null)
      try {
        if (mode === 'MIN') {
          const r = await fetch(
            `/api/kis/fx-minutes?base=${target.base}`,
            { cache: 'no-store' }
          )
          if (cancelled) return
          if (r.ok) {
            const j = (await r.json()) as { items: FxMinuteRow[] }
            setBars(
              j.items.map((b) => ({
                date: `${b.date}${b.time}`,
                open: b.open,
                high: b.high,
                low: b.low,
                close: b.close,
                volume: b.volume,
              }))
            )
          } else {
            setBars([])
            if (r.status === 412)
              setKisError('KIS 자격증명이 등록되어 있지 않습니다.')
            else if (r.status === 400)
              setKisError(`KIS 분봉이 지원되지 않는 통화입니다: ${target.base}`)
            else setKisError('KIS API 응답을 확인하세요.')
          }
        } else {
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
  }, [mode, target.base, target.target, range])

  // 시작 대비 변동률 (DAILY 모드)
  const summary = useMemo(() => {
    if (mode !== 'DAILY' || bars.length < 2) return null
    const first = bars[0].close ?? bars[0].open ?? null
    const last = bars[bars.length - 1].close ?? null
    if (first === null || last === null || first === 0) return null
    const change = last - first
    const rate = (change / first) * 100
    return { first, last, change, rate }
  }, [bars, mode])

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
              {target.base} → {target.target} ·{' '}
              {mode === 'MIN' ? 'KIS (분봉)' : 'Frankfurter (일별)'}
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

        {/* 모드 탭 (분봉/일봉) */}
        <div
          className="mt-4 flex gap-1 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          {(
            [
              ['MIN', '분봉'],
              ['DAILY', '일봉'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={
                'px-3 py-2 text-sm font-semibold border-b-2 ' +
                (mode === key
                  ? 'border-current'
                  : 'border-transparent opacity-60 hover:opacity-100')
              }
            >
              {label}
            </button>
          ))}
        </div>

        {/* 일봉 모드: 기간 선택 */}
        {mode === 'DAILY' && (
          <div className="mt-3 flex flex-wrap items-center gap-1 text-xs">
            <span style={{ color: 'var(--muted)' }} className="mr-1">
              기간
            </span>
            {(['1M', '3M', '6M', '1Y', '2Y'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setRange(key)}
                className={
                  'rounded-md px-2 py-1 font-semibold ' +
                  (range === key
                    ? 'bg-current/10 ring-1 ring-current'
                    : 'opacity-60 hover:opacity-100')
                }
              >
                {key}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="mt-4 h-64 rounded-md skeleton" />
        ) : bars.length === 0 ? (
          <div className="mt-4 text-sm" style={{ color: 'var(--muted)' }}>
            {kisError ?? '환율 데이터가 없습니다.'}
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
          {mode === 'MIN'
            ? '출처: KIS Open API (해외지수분봉조회, 원화환율). 시장 휴장 시 데이터가 없을 수 있습니다.'
            : '출처: Frankfurter (ECB 일별 환율) · 캔들은 전일 종가↔당일 종가로 합성.'}
        </p>
      </div>
      </div>
    </div>
  )
}
