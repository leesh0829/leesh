'use client'

import { useEffect, useMemo, useState } from 'react'
import CandleChart from './CandleChart'

export type OverseasDetailTarget = {
  exchange: string
  symbol: string
  name: string
}

type OverseasQuote = {
  symbol: string
  exchange: string
  price: number | null
  prevClose: number | null
  change: number | null
  changeRate: number | null
  volume: number | null
  tradeValue: number | null
  decimals: number
}

type OverseasDailyBar = {
  date: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
  changeRate: number | null
}

type OverseasDaily = {
  decimals: number
  bars: OverseasDailyBar[]
}

function fmtDecimal(n: number | null, decimals: number) {
  if (n === null) return '—'
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
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

function fmtVolume(n: number | null): string {
  if (n === null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toLocaleString('en-US')
}

function fmtDate(yyyymmdd: string) {
  if (!yyyymmdd || yyyymmdd.length < 8) return yyyymmdd
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
}

type Tab = 'MIN' | 'D' | 'W' | 'M'

type OverseasMinuteBar = {
  time: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
}

type OverseasMinute = {
  decimals: number
  bars: OverseasMinuteBar[]
}

export default function OverseasDetailModal({
  target,
  onClose,
  variant = 'modal',
}: {
  target: OverseasDetailTarget
  onClose: () => void
  variant?: 'modal' | 'page'
}) {
  const isPage = variant === 'page'
  const [quote, setQuote] = useState<OverseasQuote | null>(null)
  const [daily, setDaily] = useState<OverseasDaily | null>(null)
  const [minute, setMinute] = useState<OverseasMinute | null>(null)
  const [period, setPeriod] = useState<Tab>('D')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const exURL = encodeURIComponent(target.exchange)
        const syURL = encodeURIComponent(target.symbol)
        const pairs = `${target.exchange}:${target.symbol}`
        const requests: Promise<Response>[] = [
          fetch(`/api/kis/overseas?pairs=${encodeURIComponent(pairs)}`, {
            cache: 'no-store',
          }),
        ]
        if (period === 'MIN') {
          requests.push(
            fetch(`/api/kis/overseas/${exURL}/${syURL}/minutes?gap=1`, {
              cache: 'no-store',
            })
          )
        } else {
          requests.push(
            fetch(
              `/api/kis/overseas/${exURL}/${syURL}/daily?period=${period}`,
              { cache: 'no-store' }
            )
          )
        }
        const [qRes, chartRes] = await Promise.all(requests)
        if (cancelled) return
        if (qRes.ok) {
          const j = (await qRes.json()) as { items: OverseasQuote[] }
          setQuote(j.items[0] ?? null)
        }
        if (chartRes.ok) {
          if (period === 'MIN') {
            const j = (await chartRes.json()) as { data: OverseasMinute | null }
            setMinute(j.data)
            setDaily(null)
          } else {
            const j = (await chartRes.json()) as { data: OverseasDaily | null }
            setDaily(j.data)
            setMinute(null)
          }
        }
      } catch (e) {
        if (!cancelled) setError(String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [target.exchange, target.symbol, period])

  const decimals = useMemo(
    () => quote?.decimals ?? daily?.decimals ?? 2,
    [quote, daily]
  )

  const body = (
    <div
      className={isPage ? 'p-3 sm:p-5' : 'p-3 sm:p-5 overflow-y-auto'}
      style={isPage ? undefined : { minHeight: 0 }}
    >
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-extrabold leading-snug truncate">
            {target.name}
          </h3>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>
            {target.exchange} · {target.symbol}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isPage && (
            <a
              href={`/ledger/market/overseas/${encodeURIComponent(target.exchange)}/${encodeURIComponent(target.symbol)}?name=${encodeURIComponent(target.name)}`}
              className="btn btn-outline text-xs"
              title="페이지로 확대 보기"
            >
              ↗ 확대
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="btn btn-outline text-xs"
          >
            {isPage ? '← 시장' : '닫기'}
          </button>
        </div>
      </div>

        {/* 현재가 요약 */}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="card p-3 card-hover-border-only">
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              현재가
            </div>
            <div className="mt-1 text-2xl font-extrabold">
              {fmtDecimal(quote?.price ?? null, decimals)}
            </div>
            <div
              className={'text-sm font-semibold ' + rateColor(quote?.changeRate ?? null)}
            >
              {quote?.change !== null && quote?.change !== undefined
                ? `${quote.change >= 0 ? '+' : ''}${quote.change.toFixed(decimals)}`
                : '—'}
              {quote?.changeRate !== null && quote?.changeRate !== undefined
                ? ` (${fmtRate(quote.changeRate)})`
                : ''}
            </div>
          </div>
          <div className="card p-3 card-hover-border-only grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                전일종가
              </div>
              <div className="font-semibold">
                {fmtDecimal(quote?.prevClose ?? null, decimals)}
              </div>
            </div>
            <div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                거래량
              </div>
              <div className="font-semibold">{fmtVolume(quote?.volume ?? null)}</div>
            </div>
            <div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                거래대금
              </div>
              <div className="font-semibold">{fmtVolume(quote?.tradeValue ?? null)}</div>
            </div>
            <div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                거래소
              </div>
              <div className="font-semibold">{target.exchange}</div>
            </div>
          </div>
        </div>

        {/* 기간 탭 */}
        <div
          className="mt-4 flex gap-1 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          {(
            [
              ['MIN', '분봉'],
              ['D', '일봉'],
              ['W', '주봉'],
              ['M', '월봉'],
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

        {loading && (
          <div className="mt-4 grid gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 rounded-md skeleton" />
            ))}
          </div>
        )}
        {error && <div className="mt-4 text-sm text-red-500">{error}</div>}

        {/* 일/주/월봉 — 차트 + 표 */}
        {!loading && period !== 'MIN' && daily && daily.bars.length > 0 && (
          <div className="mt-4">
            <div className="card p-3 card-hover-border-only">
              <CandleChart
                bars={daily.bars.map((b) => ({
                  date: b.date,
                  open: b.open,
                  high: b.high,
                  low: b.low,
                  close: b.close,
                  volume: b.volume,
                }))}
                decimals={decimals}
                height={260}
              />
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs" style={{ color: 'var(--muted)' }}>
                    <th className="text-left py-1 pr-2">일자</th>
                    <th className="text-right py-1 px-2">시가</th>
                    <th className="text-right py-1 px-2">고가</th>
                    <th className="text-right py-1 px-2">저가</th>
                    <th className="text-right py-1 px-2">종가</th>
                    <th className="text-right py-1 px-2">등락률</th>
                    <th className="text-right py-1 pl-2">거래량</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.bars.slice(0, 20).map((b) => (
                    <tr key={b.date}>
                      <td className="py-1 pr-2 font-mono text-xs">
                        {fmtDate(b.date)}
                      </td>
                      <td className="text-right py-1 px-2">
                        {fmtDecimal(b.open, decimals)}
                      </td>
                      <td className="text-right py-1 px-2 text-red-500">
                        {fmtDecimal(b.high, decimals)}
                      </td>
                      <td className="text-right py-1 px-2 text-blue-500">
                        {fmtDecimal(b.low, decimals)}
                      </td>
                      <td className="text-right py-1 px-2 font-semibold">
                        {fmtDecimal(b.close, decimals)}
                      </td>
                      <td
                        className={
                          'text-right py-1 px-2 ' + rateColor(b.changeRate)
                        }
                      >
                        {fmtRate(b.changeRate)}
                      </td>
                      <td
                        className="text-right py-1 pl-2 text-xs"
                        style={{ color: 'var(--muted)' }}
                      >
                        {fmtVolume(b.volume)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 분봉 — 인트라데이 */}
        {!loading && period === 'MIN' && minute && minute.bars.length > 0 && (
          <div className="mt-4">
            <div className="card p-3 card-hover-border-only">
              <CandleChart
                bars={minute.bars.map((b) => ({
                  date: b.time,
                  open: b.open,
                  high: b.high,
                  low: b.low,
                  close: b.close,
                  volume: b.volume,
                }))}
                decimals={decimals}
                height={220}
              />
            </div>
            <div
              className="mt-2 text-xs"
              style={{ color: 'var(--muted)' }}
            >
              최근 {minute.bars.length}개 1분봉
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs" style={{ color: 'var(--muted)' }}>
                    <th className="text-left py-1 pr-2">시각</th>
                    <th className="text-right py-1 px-2">시가</th>
                    <th className="text-right py-1 px-2">고가</th>
                    <th className="text-right py-1 px-2">저가</th>
                    <th className="text-right py-1 px-2">종가</th>
                    <th className="text-right py-1 pl-2">거래량</th>
                  </tr>
                </thead>
                <tbody>
                  {[...minute.bars].reverse().slice(0, 15).map((b) => (
                    <tr key={`min-${b.time}`}>
                      <td className="py-1 pr-2 font-mono text-xs">
                        {b.time.length >= 12
                          ? `${b.time.slice(8, 10)}:${b.time.slice(10, 12)}`
                          : b.time}
                      </td>
                      <td className="text-right py-1 px-2">
                        {fmtDecimal(b.open, decimals)}
                      </td>
                      <td className="text-right py-1 px-2 text-red-500">
                        {fmtDecimal(b.high, decimals)}
                      </td>
                      <td className="text-right py-1 px-2 text-blue-500">
                        {fmtDecimal(b.low, decimals)}
                      </td>
                      <td className="text-right py-1 px-2 font-semibold">
                        {fmtDecimal(b.close, decimals)}
                      </td>
                      <td
                        className="text-right py-1 pl-2 text-xs"
                        style={{ color: 'var(--muted)' }}
                      >
                        {fmtVolume(b.volume)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading &&
          ((period === 'MIN' && (!minute || minute.bars.length === 0)) ||
            (period !== 'MIN' && (!daily || daily.bars.length === 0))) && (
            <div
              className="mt-4 text-sm"
              style={{ color: 'var(--muted)' }}
            >
              차트 데이터가 없습니다.
            </div>
          )}

        <p className="mt-4 text-xs" style={{ color: 'var(--muted)' }}>
          KIS Open API · 미국 무료 실시간 시세(지연 0~15분). 호가/투자자 등 일부 데이터는
          해외 종목에 제공되지 않습니다.
        </p>
      </div>
  )

  if (isPage) {
    return (
      <div className="surface card-pad card-hover-border-only">{body}</div>
    )
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-55 bg-black/40 flex items-end sm:items-center justify-center p-2 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="surface modal-frame w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl max-h-[92dvh] flex flex-col"
      >
        {body}
      </div>
    </div>
  )
}
