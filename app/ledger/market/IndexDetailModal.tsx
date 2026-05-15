'use client'

import { useEffect, useState } from 'react'
import CandleChart, { type Candle } from './CandleChart'

export type IndexDetailTarget = {
  code: string
  name: string
  price: number | null
  change: number | null
  changeRate: number | null
}

type Period = 'D' | 'W' | 'M' | 'Y'

function fmtIndex(n: number | null) {
  if (n === null) return '—'
  return n.toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fmtRate(r: number | null) {
  if (r === null) return '—'
  return `${r >= 0 ? '+' : ''}${r.toFixed(2)}%`
}

function rateColor(r: number | null) {
  if (r === null || r === 0) return ''
  return r > 0 ? 'text-red-500' : 'text-blue-500'
}

export default function IndexDetailModal({
  target,
  onClose,
}: {
  target: IndexDetailTarget
  onClose: () => void
}) {
  const [period, setPeriod] = useState<Period>('D')
  const [bars, setBars] = useState<Candle[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const r = await fetch(
          `/api/kis/index-history?code=${target.code}&period=${period}`,
          { cache: 'no-store' }
        )
        if (cancelled) return
        if (r.ok) {
          const j = (await r.json()) as { items: Candle[] }
          setBars(j.items)
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
  }, [target.code, period])

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-55 bg-black/40 flex items-end sm:items-center justify-center p-2 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="surface w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl p-3 sm:p-5 max-h-[92dvh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold leading-snug truncate">
              {target.name}
            </h3>
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              {target.code} · 국내 지수
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
            현재 지수
          </div>
          <div className="mt-1 text-2xl font-extrabold">
            {fmtIndex(target.price)}
          </div>
          <div
            className={'text-sm font-semibold ' + rateColor(target.changeRate)}
          >
            {target.change !== null
              ? `${target.change >= 0 ? '+' : ''}${target.change.toFixed(2)}`
              : '—'}
            {target.changeRate !== null ? ` (${fmtRate(target.changeRate)})` : ''}
          </div>
        </div>

        {/* 기간 탭 */}
        <div
          className="mt-4 flex gap-1 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          {(
            [
              ['D', '일봉'],
              ['W', '주봉'],
              ['M', '월봉'],
              ['Y', '년봉'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriod(key)}
              className={
                'px-3 py-2 text-sm font-semibold border-b-2 ' +
                (period === key
                  ? 'border-current'
                  : 'border-transparent opacity-60 hover:opacity-100')
              }
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="mt-4 h-64 rounded-md skeleton" />
        ) : bars.length === 0 ? (
          <div className="mt-4 text-sm" style={{ color: 'var(--muted)' }}>
            데이터가 없습니다.
          </div>
        ) : (
          <div className="mt-4 card p-3 card-hover-border-only">
            <CandleChart bars={bars} decimals={2} height={280} />
          </div>
        )}

        <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
          KIS Open API · 빨강 = 양봉 / 파랑 = 음봉 (국내 표시 관습)
        </p>
      </div>
    </div>
  )
}
