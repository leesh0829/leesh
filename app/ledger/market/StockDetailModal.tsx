'use client'

import { useEffect, useMemo, useState } from 'react'
import CandleChart, { type Candle } from './CandleChart'

export type StockDetailTarget = {
  code: string
  name: string
}

type Orderbook = {
  acceptTime: string | null
  asks: { price: number | null; qty: number | null; qtyChange: number | null }[]
  bids: { price: number | null; qty: number | null; qtyChange: number | null }[]
  totalAskQty: number | null
  totalBidQty: number | null
  current: {
    price: number | null
    open: number | null
    high: number | null
    low: number | null
    prevClose: number | null
    expected: number | null
    expectedChange: number | null
    expectedChangeRate: number | null
  }
}

type InvestorRow = {
  date: string
  close: number | null
  changeRate: number | null
  individual: number | null
  foreign: number | null
  institution: number | null
}

type MemberSide = {
  rank: number
  name: string
  quantity: number | null
  share: number | null
  change: number | null
}

type Members = {
  asks: MemberSide[]
  bids: MemberSide[]
}

type FinancialRow = {
  period: string
  revenueGrowth: number | null
  operatingIncomeGrowth: number | null
  netIncomeGrowth: number | null
  roe: number | null
  eps: number | null
  sps: number | null
  bps: number | null
  reserveRatio: number | null
  debtRatio: number | null
}

type Opinion = {
  date: string
  opinion: string
  prevOpinion: string
  broker: string
  targetPrice: number | null
  prevClose: number | null
  gap: number | null
}

type StockMeta = {
  marketCap: number | null // 백만원
  listedShares: number | null
  per: number | null
  pbr: number | null
  eps: number | null
  bps: number | null
  foreignHoldRate: number | null
  yearHigh: number | null
  yearLow: number | null
  yearHighDate: string | null
  yearLowDate: string | null
  industry: string | null
  marketName: string | null
}

type StabilityRow = {
  period: string
  debtRatio: number | null
  borrowDependency: number | null
  currentRatio: number | null
  quickRatio: number | null
}

type ProfitRow = {
  period: string
  roa: number | null
  roe: number | null
  netMargin: number | null
  grossMargin: number | null
}

type ProgramTradeRow = {
  time: string
  price: number | null
  changeRate: number | null
  sellVolume: number | null
  buyVolume: number | null
  netVolume: number | null
  sellAmount: number | null
  buyAmount: number | null
  netAmount: number | null
}

// 시가총액 포맷 — KIS는 백만원 단위로 반환
function fmtMarketCap(millions: number | null): string {
  if (millions === null) return '—'
  const won = millions * 1_000_000
  if (won >= 1e12) return `${(won / 1e12).toFixed(2)}조원`
  if (won >= 1e8) return `${(won / 1e8).toFixed(0)}억원`
  return `${won.toLocaleString('ko-KR')}원`
}

type MinuteBar = {
  date: string
  time: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
}

type MinuteChart = {
  name: string | null
  current: number | null
  prevClose: number | null
  change: number | null
  changeRate: number | null
  totalVolume: number | null
  bars: MinuteBar[]
}

type Overtime = {
  price: number | null
  change: number | null
  changeRate: number | null
  open: number | null
  high: number | null
  low: number | null
  basePrice: number | null
  volume: number | null
  tradeValue: number | null
  expected: number | null
  expectedChange: number | null
  expectedChangeRate: number | null
  expectedVol: number | null
  upperLimit: number | null
  lowerLimit: number | null
  bidPrice: number | null
  askPrice: number | null
  flags: {
    creditAvailable: boolean
    isManaged: boolean
    isHalted: boolean
    isLiquidation: boolean
    warning: string | null
    viCode: string | null
  }
}

function fmtKRW(n: number | null) {
  if (n === null) return '—'
  return `₩${Math.round(Math.abs(n)).toLocaleString('ko-KR')}`
}

function fmtNum(n: number | null) {
  if (n === null) return '—'
  return Math.round(Math.abs(n)).toLocaleString('ko-KR')
}

function fmtRate(r: number | null) {
  if (r === null) return '—'
  return `${r >= 0 ? '+' : ''}${r.toFixed(2)}%`
}

function rateColor(r: number | null) {
  if (r === null || r === 0) return ''
  return r > 0 ? 'text-red-500' : 'text-blue-500'
}

function fmtDate(yyyymmdd: string): string {
  if (!yyyymmdd || yyyymmdd.length < 8) return yyyymmdd
  return `${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(6, 8)}`
}

function fmtHHMMSS(s: string | null): string {
  if (!s || s.length < 4) return '—'
  return `${s.slice(0, 2)}:${s.slice(2, 4)}${s.length >= 6 ? ':' + s.slice(4, 6) : ''}`
}

function fmtVolume(n: number | null): string {
  if (n === null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e8) return `${(n / 1e8).toFixed(1)}억`
  if (abs >= 1e4) return `${(n / 1e4).toFixed(1)}만`
  return n.toLocaleString('ko-KR')
}

type Tab =
  | 'orderbook'
  | 'minute'
  | 'chart'
  | 'investor'
  | 'overtime'
  | 'members'
  | 'fundamental'
  | 'program'

export default function StockDetailModal({
  target,
  onClose,
}: {
  target: StockDetailTarget
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>('orderbook')
  const [orderbook, setOrderbook] = useState<Orderbook | null>(null)
  const [investor, setInvestor] = useState<InvestorRow[]>([])
  const [overtime, setOvertime] = useState<Overtime | null>(null)
  const [minutes, setMinutes] = useState<MinuteChart | null>(null)
  const [members, setMembers] = useState<Members | null>(null)
  const [financial, setFinancial] = useState<FinancialRow[]>([])
  const [opinion, setOpinion] = useState<Opinion[]>([])
  const [meta, setMeta] = useState<StockMeta | null>(null)
  const [stability, setStability] = useState<StabilityRow[]>([])
  const [profit, setProfit] = useState<ProfitRow[]>([])
  const [program, setProgram] = useState<ProgramTradeRow[]>([])
  const [chartPeriod, setChartPeriod] = useState<'D' | 'W' | 'M' | 'Y'>('D')
  const [chartBars, setChartBars] = useState<Candle[]>([])
  const [chartLoading, setChartLoading] = useState(true)
  const [watched, setWatched] = useState(false)
  const [note, setNote] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [alarms, setAlarms] = useState<
    Array<{
      id: string
      target: number
      direction: 'ABOVE' | 'BELOW'
      enabled: boolean
    }>
  >([])
  const [alarmInput, setAlarmInput] = useState({ target: '', direction: 'ABOVE' as 'ABOVE' | 'BELOW' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [
          obRes,
          iRes,
          otRes,
          mRes,
          memRes,
          finRes,
          opRes,
          metaRes,
          stabRes,
          profRes,
          progRes,
        ] = await Promise.all([
          fetch(`/api/kis/stock/${target.code}/orderbook`, { cache: 'no-store' }),
          fetch(`/api/kis/stock/${target.code}/investor`, { cache: 'no-store' }),
          fetch(`/api/kis/stock/${target.code}/overtime`, { cache: 'no-store' }),
          fetch(`/api/kis/stock/${target.code}/minutes`, { cache: 'no-store' }),
          fetch(`/api/kis/stock/${target.code}/members`, { cache: 'no-store' }),
          fetch(`/api/kis/stock/${target.code}/financial`, { cache: 'no-store' }),
          fetch(`/api/kis/stock/${target.code}/opinion`, { cache: 'no-store' }),
          fetch(`/api/kis/stock/${target.code}/meta`, { cache: 'no-store' }),
          fetch(`/api/kis/stock/${target.code}/stability`, { cache: 'no-store' }),
          fetch(`/api/kis/stock/${target.code}/profit`, { cache: 'no-store' }),
          fetch(`/api/kis/stock/${target.code}/program`, { cache: 'no-store' }),
        ])
        if (cancelled) return
        if (obRes.ok) {
          const j = (await obRes.json()) as { data: Orderbook }
          setOrderbook(j.data)
        }
        if (iRes.ok) {
          const j = (await iRes.json()) as { items: InvestorRow[] }
          setInvestor(j.items)
        }
        if (otRes.ok) {
          const j = (await otRes.json()) as { data: Overtime | null }
          setOvertime(j.data)
        }
        if (mRes.ok) {
          const j = (await mRes.json()) as { data: MinuteChart | null }
          setMinutes(j.data)
        }
        if (memRes.ok) {
          const j = (await memRes.json()) as { data: Members | null }
          setMembers(j.data)
        }
        if (finRes.ok) {
          const j = (await finRes.json()) as { items: FinancialRow[] }
          setFinancial(j.items)
        }
        if (opRes.ok) {
          const j = (await opRes.json()) as { items: Opinion[] }
          setOpinion(j.items)
        }
        if (metaRes.ok) {
          const j = (await metaRes.json()) as { data: StockMeta | null }
          setMeta(j.data)
        }
        if (stabRes.ok) {
          const j = (await stabRes.json()) as { items: StabilityRow[] }
          setStability(j.items)
        }
        if (profRes.ok) {
          const j = (await profRes.json()) as { items: ProfitRow[] }
          setProfit(j.items)
        }
        if (progRes.ok) {
          const j = (await progRes.json()) as { items: ProgramTradeRow[] }
          setProgram(j.items)
        }

        // 관심종목 / 메모 / 알람 (사용자별 데이터)
        const [wRes, nRes, aRes] = await Promise.all([
          fetch('/api/watchlist', { cache: 'no-store' }),
          fetch(`/api/stock-note?market=KR&symbol=${target.code}`, {
            cache: 'no-store',
          }),
          fetch(`/api/stock-alarm?market=KR&symbol=${target.code}`, {
            cache: 'no-store',
          }),
        ])
        if (cancelled) return
        if (wRes.ok) {
          const j = (await wRes.json()) as {
            items: Array<{ market: string; symbol: string }>
          }
          setWatched(
            j.items.some(
              (x) => x.market === 'KR' && x.symbol === target.code
            )
          )
        }
        if (nRes.ok) {
          const j = (await nRes.json()) as { note: { note: string } | null }
          setNote(j.note?.note ?? '')
        }
        if (aRes.ok) {
          const j = (await aRes.json()) as {
            items: Array<{
              id: string
              target: number
              direction: 'ABOVE' | 'BELOW'
              enabled: boolean
            }>
          }
          setAlarms(j.items)
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
  }, [target.code])

  // 차트 기간 변경 시 별도 fetch
  useEffect(() => {
    let cancelled = false
    async function loadChart() {
      setChartLoading(true)
      try {
        const r = await fetch(
          `/api/kis/stock/${target.code}/history?period=${chartPeriod}`,
          { cache: 'no-store' }
        )
        if (cancelled) return
        if (r.ok) {
          const j = (await r.json()) as { items: Candle[] }
          setChartBars(j.items)
        } else {
          setChartBars([])
        }
      } catch {
        setChartBars([])
      } finally {
        if (!cancelled) setChartLoading(false)
      }
    }
    void loadChart()
    return () => {
      cancelled = true
    }
  }, [target.code, chartPeriod])

  const cur = orderbook?.current
  const change = useMemo(() => {
    if (!cur) return null
    if (cur.price === null || cur.prevClose === null) return null
    return cur.price - cur.prevClose
  }, [cur])
  const changeRate = useMemo(() => {
    if (!cur || !change || cur.prevClose === null || cur.prevClose === 0)
      return null
    return (change / cur.prevClose) * 100
  }, [cur, change])

  // 호가 잔량 최대값 — 잔량바 비율
  const maxQty = useMemo(() => {
    if (!orderbook) return 1
    const qs = [...orderbook.asks, ...orderbook.bids].map((l) => l.qty ?? 0)
    return Math.max(1, ...qs)
  }, [orderbook])

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-55 bg-black/40 flex items-end sm:items-center justify-center p-2 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="surface w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl p-5 max-h-[90dvh] overflow-y-auto"
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold leading-snug truncate">
              {target.name}
            </h3>
            <div
              className="text-xs"
              style={{ color: 'var(--muted)' }}
            >
              {target.code}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={async () => {
                try {
                  if (watched) {
                    await fetch(
                      `/api/watchlist?market=KR&symbol=${target.code}`,
                      { method: 'DELETE' }
                    )
                    setWatched(false)
                  } else {
                    await fetch('/api/watchlist', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        market: 'KR',
                        symbol: target.code,
                        name: target.name,
                      }),
                    })
                    setWatched(true)
                  }
                } catch {
                  // ignore
                }
              }}
              className={
                'btn text-xs ' +
                (watched ? 'btn-primary' : 'btn-outline')
              }
              title={watched ? '관심종목에서 제거' : '관심종목 추가'}
            >
              {watched ? '★ 관심' : '☆ 관심'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-outline text-xs"
            >
              닫기
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
              {fmtKRW(cur?.price ?? null)}
            </div>
            <div className={'text-sm font-semibold ' + rateColor(changeRate)}>
              {change !== null
                ? `${change >= 0 ? '+' : ''}${fmtKRW(change).replace('₩', '')} (${fmtRate(changeRate)})`
                : '—'}
            </div>
          </div>
          <div className="card p-3 card-hover-border-only grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                시가
              </div>
              <div className="font-semibold">{fmtKRW(cur?.open ?? null)}</div>
            </div>
            <div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                전일종가
              </div>
              <div className="font-semibold">{fmtKRW(cur?.prevClose ?? null)}</div>
            </div>
            <div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                고가
              </div>
              <div className="font-semibold text-red-500">
                {fmtKRW(cur?.high ?? null)}
              </div>
            </div>
            <div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                저가
              </div>
              <div className="font-semibold text-blue-500">
                {fmtKRW(cur?.low ?? null)}
              </div>
            </div>
          </div>
        </div>

        {/* 종목 메타 chip strip (시총 / PER / PBR / 외국인) */}
        {meta && (
          <div
            className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs"
            style={{ color: 'var(--muted)' }}
          >
            {meta.industry && (
              <span>
                <span className="font-semibold">업종</span>{' '}
                <span style={{ color: 'var(--foreground)' }}>{meta.industry}</span>
              </span>
            )}
            <span>
              <span className="font-semibold">시총</span>{' '}
              <span style={{ color: 'var(--foreground)' }}>
                {fmtMarketCap(meta.marketCap)}
              </span>
            </span>
            <span>
              <span className="font-semibold">PER</span>{' '}
              <span style={{ color: 'var(--foreground)' }}>
                {meta.per !== null ? meta.per.toFixed(2) : '—'}
              </span>
            </span>
            <span>
              <span className="font-semibold">PBR</span>{' '}
              <span style={{ color: 'var(--foreground)' }}>
                {meta.pbr !== null ? meta.pbr.toFixed(2) : '—'}
              </span>
            </span>
            <span>
              <span className="font-semibold">EPS</span>{' '}
              <span style={{ color: 'var(--foreground)' }}>
                {meta.eps !== null ? meta.eps.toLocaleString('ko-KR') : '—'}
              </span>
            </span>
            <span>
              <span className="font-semibold">외국인</span>{' '}
              <span style={{ color: 'var(--foreground)' }}>
                {meta.foreignHoldRate !== null
                  ? `${meta.foreignHoldRate.toFixed(2)}%`
                  : '—'}
              </span>
            </span>
            {meta.yearHigh !== null && meta.yearLow !== null && (
              <span>
                <span className="font-semibold">52주</span>{' '}
                <span className="text-red-500">{meta.yearHigh.toLocaleString('ko-KR')}</span>
                {' / '}
                <span className="text-blue-500">{meta.yearLow.toLocaleString('ko-KR')}</span>
              </span>
            )}
          </div>
        )}

        {/* 내 메모 + 가격 알람 */}
        <details className="mt-4 card p-3 card-hover-border-only" open={note.length > 0 || alarms.length > 0}>
          <summary className="cursor-pointer text-xs font-bold flex items-center justify-between" style={{ color: 'var(--muted)' }}>
            <span>📝 내 메모 · 🔔 가격 알람</span>
            <span>{alarms.filter((a) => a.enabled).length}건 활성</span>
          </summary>

          {/* 메모 */}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={async () => {
              setNoteSaving(true)
              try {
                await fetch('/api/stock-note', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    market: 'KR',
                    symbol: target.code,
                    note,
                  }),
                })
              } catch {
                // ignore
              } finally {
                setNoteSaving(false)
              }
            }}
            placeholder="이 종목에 대한 메모 (자동 저장)"
            rows={2}
            className="mt-2 w-full rounded-md border px-2 py-1 text-sm"
            style={{
              background: 'var(--surface, transparent)',
              borderColor: 'var(--border, rgba(0,0,0,0.15))',
            }}
          />
          <div className="text-[10px] mt-1" style={{ color: 'var(--muted)' }}>
            {noteSaving ? '저장 중...' : '포커스 해제 시 자동 저장'}
          </div>

          {/* 알람 입력 */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <select
              value={alarmInput.direction}
              onChange={(e) =>
                setAlarmInput((p) => ({
                  ...p,
                  direction: e.target.value as 'ABOVE' | 'BELOW',
                }))
              }
              className="rounded border px-2 py-1"
              style={{
                background: 'var(--surface, transparent)',
                borderColor: 'var(--border, rgba(0,0,0,0.15))',
              }}
            >
              <option value="ABOVE">≥</option>
              <option value="BELOW">≤</option>
            </select>
            <input
              type="number"
              value={alarmInput.target}
              onChange={(e) =>
                setAlarmInput((p) => ({ ...p, target: e.target.value }))
              }
              placeholder="목표가"
              className="w-28 rounded border px-2 py-1"
              style={{
                background: 'var(--surface, transparent)',
                borderColor: 'var(--border, rgba(0,0,0,0.15))',
              }}
            />
            <button
              type="button"
              className="btn btn-outline text-xs"
              onClick={async () => {
                const t = parseFloat(alarmInput.target)
                if (!Number.isFinite(t) || t <= 0) return
                try {
                  const r = await fetch('/api/stock-alarm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      market: 'KR',
                      symbol: target.code,
                      name: target.name,
                      target: t,
                      direction: alarmInput.direction,
                    }),
                  })
                  if (r.ok) {
                    const j = (await r.json()) as {
                      item: {
                        id: string
                        target: number
                        direction: 'ABOVE' | 'BELOW'
                        enabled: boolean
                      }
                    }
                    setAlarms((p) => [j.item, ...p])
                    setAlarmInput({ target: '', direction: alarmInput.direction })
                  }
                } catch {
                  // ignore
                }
              }}
            >
              알람 추가
            </button>
          </div>
          {alarms.length > 0 && (
            <ul className="mt-2 grid gap-1">
              {alarms.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between text-xs"
                >
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={a.enabled}
                      onChange={async () => {
                        await fetch(`/api/stock-alarm/${a.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ enabled: !a.enabled }),
                        })
                        setAlarms((p) =>
                          p.map((x) =>
                            x.id === a.id ? { ...x, enabled: !x.enabled } : x
                          )
                        )
                      }}
                    />
                    <span className={a.enabled ? '' : 'opacity-50'}>
                      {a.direction === 'ABOVE' ? '≥' : '≤'}{' '}
                      {a.target.toLocaleString('ko-KR')}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch(`/api/stock-alarm/${a.id}`, {
                        method: 'DELETE',
                      })
                      setAlarms((p) => p.filter((x) => x.id !== a.id))
                    }}
                    className="opacity-60 hover:opacity-100"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
        </details>

        {/* 탭 */}
        <div
          className="mt-4 flex gap-1 border-b overflow-x-auto"
          style={{ borderColor: 'var(--border)' }}
        >
          {(
            [
              ['orderbook', '호가'],
              ['minute', '분봉'],
              ['chart', '일별'],
              ['members', '거래원'],
              ['investor', '투자자'],
              ['program', '프로그램'],
              ['fundamental', '펀더멘털'],
              ['overtime', '시간외'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={
                'shrink-0 px-3 py-2 text-sm font-semibold border-b-2 ' +
                (tab === key
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
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 rounded-md skeleton" />
            ))}
          </div>
        )}
        {error && (
          <div className="mt-4 text-sm text-red-500">{error}</div>
        )}

        {/* 호가 탭 */}
        {!loading && tab === 'orderbook' && orderbook && (
          <div className="mt-4">
            <div
              className="mb-2 flex items-center justify-between text-xs"
              style={{ color: 'var(--muted)' }}
            >
              <span>호가 접수 {fmtHHMMSS(orderbook.acceptTime)}</span>
              <span>
                매도 잔량 {fmtVolume(orderbook.totalAskQty)} · 매수 잔량{' '}
                {fmtVolume(orderbook.totalBidQty)}
              </span>
            </div>
            <div className="grid gap-px">
              {/* 매도 — 역순 (10→1, 위쪽에 멀리, 아래쪽에 1호가) */}
              {[...orderbook.asks].reverse().map((lv, i) => {
                const idx = 10 - i
                const w = lv.qty ? (lv.qty / maxQty) * 100 : 0
                return (
                  <div
                    key={`a-${idx}`}
                    className="relative grid grid-cols-3 items-center gap-2 px-2 py-1 text-sm"
                    style={{ background: 'rgba(59, 130, 246, 0.04)' }}
                  >
                    <div className="text-blue-500 font-mono">
                      {fmtVolume(lv.qty)}
                    </div>
                    <div className="text-center font-bold">
                      {lv.price !== null ? lv.price.toLocaleString('ko-KR') : '—'}
                    </div>
                    <div className="relative h-3 rounded-sm overflow-hidden">
                      <div
                        className="absolute right-0 top-0 h-full bg-blue-500/30"
                        style={{ width: `${w}%` }}
                      />
                    </div>
                  </div>
                )
              })}
              {/* 매수 1→10 */}
              {orderbook.bids.map((lv, i) => {
                const idx = i + 1
                const w = lv.qty ? (lv.qty / maxQty) * 100 : 0
                return (
                  <div
                    key={`b-${idx}`}
                    className="relative grid grid-cols-3 items-center gap-2 px-2 py-1 text-sm"
                    style={{ background: 'rgba(239, 68, 68, 0.04)' }}
                  >
                    <div className="relative h-3 rounded-sm overflow-hidden">
                      <div
                        className="absolute left-0 top-0 h-full bg-red-500/30"
                        style={{ width: `${w}%` }}
                      />
                    </div>
                    <div className="text-center font-bold">
                      {lv.price !== null ? lv.price.toLocaleString('ko-KR') : '—'}
                    </div>
                    <div className="text-red-500 font-mono text-right">
                      {fmtVolume(lv.qty)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 분봉 탭 */}
        {!loading && tab === 'minute' && (
          <div className="mt-4">
            {!minutes || minutes.bars.length === 0 ? (
              <div className="text-sm" style={{ color: 'var(--muted)' }}>
                분봉 데이터가 없습니다.
              </div>
            ) : (
              <>
                <div className="card p-3 card-hover-border-only">
                  <CandleChart
                    bars={minutes.bars.map((b) => ({
                      date: `${b.date}${b.time}`,
                      open: b.open,
                      high: b.high,
                      low: b.low,
                      close: b.close,
                      volume: b.volume,
                    }))}
                    decimals={0}
                    height={220}
                  />
                </div>
                <div
                  className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  <span>최근 {minutes.bars.length}개 분봉 (당일)</span>
                  <span>
                    누적 거래량 {fmtVolume(minutes.totalVolume)}
                  </span>
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
                        <th className="text-right py-1 pl-2">체결량</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...minutes.bars].reverse().slice(0, 15).map((b) => (
                        <tr key={`${b.date}-${b.time}`}>
                          <td className="py-1 pr-2 font-mono text-xs">
                            {fmtHHMMSS(b.time).slice(0, 5)}
                          </td>
                          <td className="text-right py-1 px-2">{fmtNum(b.open)}</td>
                          <td className="text-right py-1 px-2 text-red-500">
                            {fmtNum(b.high)}
                          </td>
                          <td className="text-right py-1 px-2 text-blue-500">
                            {fmtNum(b.low)}
                          </td>
                          <td className="text-right py-1 px-2 font-semibold">
                            {fmtNum(b.close)}
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
              </>
            )}
          </div>
        )}

        {/* 차트 탭 — 일/주/월/년 캔들 */}
        {!loading && tab === 'chart' && (
          <div className="mt-4">
            <div className="mb-3 flex gap-1">
              {(
                [
                  ['D', '일'],
                  ['W', '주'],
                  ['M', '월'],
                  ['Y', '년'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setChartPeriod(k)}
                  className={
                    'rounded-md px-3 py-1 text-xs font-semibold ' +
                    (chartPeriod === k
                      ? 'bg-current/10 ring-1 ring-current'
                      : 'opacity-60 hover:opacity-100')
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            {chartLoading ? (
              <div className="h-64 rounded-md skeleton" />
            ) : chartBars.length === 0 ? (
              <div className="text-sm" style={{ color: 'var(--muted)' }}>
                차트 데이터가 없습니다.
              </div>
            ) : (
              <>
                <div className="card p-3 card-hover-border-only">
                  <CandleChart bars={chartBars} decimals={0} height={280} />
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr
                        className="text-xs"
                        style={{ color: 'var(--muted)' }}
                      >
                        <th className="text-left py-1 pr-2">일자</th>
                        <th className="text-right py-1 px-2">시가</th>
                        <th className="text-right py-1 px-2">고가</th>
                        <th className="text-right py-1 px-2">저가</th>
                        <th className="text-right py-1 px-2">종가</th>
                        <th className="text-right py-1 pl-2">거래량</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartBars.slice(0, 20).map((b) => (
                        <tr key={b.date}>
                          <td className="py-1 pr-2 font-mono text-xs">
                            {fmtDate(b.date)}
                          </td>
                          <td className="text-right py-1 px-2">{fmtNum(b.open)}</td>
                          <td className="text-right py-1 px-2 text-red-500">
                            {fmtNum(b.high)}
                          </td>
                          <td className="text-right py-1 px-2 text-blue-500">
                            {fmtNum(b.low)}
                          </td>
                          <td className="text-right py-1 px-2 font-semibold">
                            {fmtNum(b.close)}
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
              </>
            )}
          </div>
        )}

        {/* 투자자별 탭 */}
        {!loading && tab === 'investor' && (
          <div className="mt-4">
            {investor.length === 0 ? (
              <div className="text-sm" style={{ color: 'var(--muted)' }}>
                데이터가 없습니다. (당일 데이터는 장 종료 후 제공)
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs" style={{ color: 'var(--muted)' }}>
                      <th className="text-left py-1 pr-2">일자</th>
                      <th className="text-right py-1 px-2">종가</th>
                      <th className="text-right py-1 px-2">개인</th>
                      <th className="text-right py-1 px-2">외국인</th>
                      <th className="text-right py-1 pl-2">기관</th>
                    </tr>
                  </thead>
                  <tbody>
                    {investor.slice(0, 20).map((row) => (
                      <tr key={row.date}>
                        <td className="py-1 pr-2 font-mono text-xs">
                          {fmtDate(row.date)}
                        </td>
                        <td className="text-right py-1 px-2 font-semibold">
                          {fmtNum(row.close)}
                        </td>
                        <td
                          className={
                            'text-right py-1 px-2 ' +
                            ((row.individual ?? 0) > 0
                              ? 'text-red-500'
                              : (row.individual ?? 0) < 0
                                ? 'text-blue-500'
                                : '')
                          }
                        >
                          {row.individual !== null
                            ? (row.individual > 0 ? '+' : '') +
                              fmtVolume(row.individual)
                            : '—'}
                        </td>
                        <td
                          className={
                            'text-right py-1 px-2 ' +
                            ((row.foreign ?? 0) > 0
                              ? 'text-red-500'
                              : (row.foreign ?? 0) < 0
                                ? 'text-blue-500'
                                : '')
                          }
                        >
                          {row.foreign !== null
                            ? (row.foreign > 0 ? '+' : '') +
                              fmtVolume(row.foreign)
                            : '—'}
                        </td>
                        <td
                          className={
                            'text-right py-1 pl-2 ' +
                            ((row.institution ?? 0) > 0
                              ? 'text-red-500'
                              : (row.institution ?? 0) < 0
                                ? 'text-blue-500'
                                : '')
                          }
                        >
                          {row.institution !== null
                            ? (row.institution > 0 ? '+' : '') +
                              fmtVolume(row.institution)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p
              className="mt-3 text-xs"
              style={{ color: 'var(--muted)' }}
            >
              순매수 수량 — 음수는 순매도. 당일 데이터는 장 종료 후 반영.
            </p>
          </div>
        )}

        {/* 시간외 단일가 탭 */}
        {!loading && tab === 'overtime' && (
          <div className="mt-4">
            {!overtime || overtime.price === null ? (
              <div className="text-sm" style={{ color: 'var(--muted)' }}>
                시간외 데이터가 없습니다. (시간외 단일가는 장 마감 후 16:00~18:00 제공)
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="card p-3 card-hover-border-only">
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>
                      시간외 단일가
                    </div>
                    <div className="mt-1 text-2xl font-extrabold">
                      {fmtKRW(overtime.price)}
                    </div>
                    <div
                      className={'text-sm font-semibold ' + rateColor(overtime.changeRate)}
                    >
                      {overtime.change !== null
                        ? `${overtime.change >= 0 ? '+' : ''}${fmtKRW(overtime.change).replace('₩', '')} (${fmtRate(overtime.changeRate)})`
                        : '—'}
                    </div>
                  </div>
                  <div className="card p-3 card-hover-border-only grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>
                        시간외 시가
                      </div>
                      <div className="font-semibold">{fmtKRW(overtime.open)}</div>
                    </div>
                    <div>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>
                        기준가
                      </div>
                      <div className="font-semibold">{fmtKRW(overtime.basePrice)}</div>
                    </div>
                    <div>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>
                        시간외 고가
                      </div>
                      <div className="font-semibold text-red-500">
                        {fmtKRW(overtime.high)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>
                        시간외 저가
                      </div>
                      <div className="font-semibold text-blue-500">
                        {fmtKRW(overtime.low)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="card p-3 card-hover-border-only text-sm">
                    <div
                      className="text-xs font-semibold"
                      style={{ color: 'var(--muted)' }}
                    >
                      예상 체결
                    </div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <div className="text-lg font-extrabold">
                        {fmtKRW(overtime.expected)}
                      </div>
                      <div
                        className={
                          'text-sm font-semibold ' + rateColor(overtime.expectedChangeRate)
                        }
                      >
                        {fmtRate(overtime.expectedChangeRate)}
                      </div>
                    </div>
                    <div
                      className="mt-1 text-xs"
                      style={{ color: 'var(--muted)' }}
                    >
                      예상 체결량 {fmtVolume(overtime.expectedVol)}
                    </div>
                  </div>
                  <div className="card p-3 card-hover-border-only text-sm">
                    <div
                      className="text-xs font-semibold"
                      style={{ color: 'var(--muted)' }}
                    >
                      거래 정보
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs" style={{ color: 'var(--muted)' }}>
                          거래량
                        </div>
                        <div className="font-semibold">
                          {fmtVolume(overtime.volume)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs" style={{ color: 'var(--muted)' }}>
                          거래대금
                        </div>
                        <div className="font-semibold">
                          {fmtVolume(overtime.tradeValue)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs" style={{ color: 'var(--muted)' }}>
                          상한가
                        </div>
                        <div className="font-semibold text-red-500">
                          {fmtKRW(overtime.upperLimit)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs" style={{ color: 'var(--muted)' }}>
                          하한가
                        </div>
                        <div className="font-semibold text-blue-500">
                          {fmtKRW(overtime.lowerLimit)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 경고 / 상태 플래그 */}
                {(overtime.flags.isHalted ||
                  overtime.flags.isManaged ||
                  overtime.flags.isLiquidation ||
                  overtime.flags.warning ||
                  overtime.flags.viCode ||
                  !overtime.flags.creditAvailable) && (
                  <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                    {overtime.flags.isHalted && (
                      <span className="rounded-full bg-red-500/15 px-2 py-0.5 font-semibold text-red-500">
                        거래정지
                      </span>
                    )}
                    {overtime.flags.isManaged && (
                      <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 font-semibold text-yellow-600">
                        관리종목
                      </span>
                    )}
                    {overtime.flags.isLiquidation && (
                      <span className="rounded-full bg-red-500/15 px-2 py-0.5 font-semibold text-red-500">
                        정리매매
                      </span>
                    )}
                    {overtime.flags.warning && (
                      <span className="rounded-full bg-orange-500/15 px-2 py-0.5 font-semibold text-orange-500">
                        {overtime.flags.warning}
                      </span>
                    )}
                    {overtime.flags.viCode && (
                      <span className="rounded-full bg-purple-500/15 px-2 py-0.5 font-semibold text-purple-500">
                        VI 적용
                      </span>
                    )}
                    {!overtime.flags.creditAvailable && (
                      <span
                        className="rounded-full px-2 py-0.5 font-semibold"
                        style={{
                          background: 'var(--surface-muted, rgba(0,0,0,0.06))',
                          color: 'var(--muted)',
                        }}
                      >
                        신용 불가
                      </span>
                    )}
                  </div>
                )}

                <p
                  className="mt-3 text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  시간외 단일가는 정규장 마감 후 16:00~18:00 동안 10분 단위로 체결됩니다.
                </p>
              </>
            )}
          </div>
        )}

        {/* 거래원(회원사) 탭 */}
        {!loading && tab === 'members' && (
          <div className="mt-4">
            {!members ? (
              <div className="text-sm" style={{ color: 'var(--muted)' }}>
                거래원 데이터가 없습니다.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {/* 매도 거래원 */}
                <div>
                  <div
                    className="mb-2 text-xs font-bold text-blue-500"
                  >
                    매도 상위 회원사
                  </div>
                  <div className="grid gap-1">
                    {members.asks.map((m) => (
                      <div
                        key={`a-${m.rank}-${m.name}`}
                        className="card p-2 card-hover-border-only text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-5 shrink-0 text-center font-bold"
                            style={{ color: 'var(--muted)' }}
                          >
                            {m.rank}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-semibold">
                            {m.name || '—'}
                          </span>
                          <span className="shrink-0 text-xs text-blue-500 font-mono">
                            {fmtVolume(m.quantity)}
                          </span>
                        </div>
                        <div
                          className="mt-1 flex items-center justify-between text-xs"
                          style={{ color: 'var(--muted)' }}
                        >
                          <span>비중 {m.share !== null ? `${m.share.toFixed(2)}%` : '—'}</span>
                          <span>
                            {m.change !== null
                              ? `${m.change > 0 ? '+' : ''}${fmtVolume(m.change)}`
                              : '—'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* 매수 거래원 */}
                <div>
                  <div className="mb-2 text-xs font-bold text-red-500">
                    매수 상위 회원사
                  </div>
                  <div className="grid gap-1">
                    {members.bids.map((m) => (
                      <div
                        key={`b-${m.rank}-${m.name}`}
                        className="card p-2 card-hover-border-only text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-5 shrink-0 text-center font-bold"
                            style={{ color: 'var(--muted)' }}
                          >
                            {m.rank}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-semibold">
                            {m.name || '—'}
                          </span>
                          <span className="shrink-0 text-xs text-red-500 font-mono">
                            {fmtVolume(m.quantity)}
                          </span>
                        </div>
                        <div
                          className="mt-1 flex items-center justify-between text-xs"
                          style={{ color: 'var(--muted)' }}
                        >
                          <span>비중 {m.share !== null ? `${m.share.toFixed(2)}%` : '—'}</span>
                          <span>
                            {m.change !== null
                              ? `${m.change > 0 ? '+' : ''}${fmtVolume(m.change)}`
                              : '—'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 펀더멘털 탭 */}
        {!loading && tab === 'fundamental' && (
          <div className="mt-4">
            {/* 재무비율 */}
            <div className="mb-1 text-xs font-bold" style={{ color: 'var(--muted)' }}>
              재무비율 (분기/연간)
            </div>
            {financial.length === 0 ? (
              <div className="text-sm" style={{ color: 'var(--muted)' }}>
                재무 데이터가 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs" style={{ color: 'var(--muted)' }}>
                      <th className="text-left py-1 pr-2">결산</th>
                      <th className="text-right py-1 px-2">ROE</th>
                      <th className="text-right py-1 px-2">EPS</th>
                      <th className="text-right py-1 px-2">BPS</th>
                      <th className="text-right py-1 px-2">부채비율</th>
                      <th className="text-right py-1 px-2">매출 ↑</th>
                      <th className="text-right py-1 pl-2">순익 ↑</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financial.slice(0, 8).map((f) => (
                      <tr key={f.period}>
                        <td className="py-1 pr-2 font-mono text-xs">{f.period}</td>
                        <td
                          className={
                            'text-right py-1 px-2 font-semibold ' +
                            rateColor(f.roe)
                          }
                        >
                          {f.roe !== null ? `${f.roe.toFixed(2)}%` : '—'}
                        </td>
                        <td className="text-right py-1 px-2">
                          {f.eps !== null ? f.eps.toLocaleString('ko-KR') : '—'}
                        </td>
                        <td className="text-right py-1 px-2">
                          {f.bps !== null ? f.bps.toLocaleString('ko-KR') : '—'}
                        </td>
                        <td className="text-right py-1 px-2">
                          {f.debtRatio !== null ? `${f.debtRatio.toFixed(1)}%` : '—'}
                        </td>
                        <td
                          className={
                            'text-right py-1 px-2 ' +
                            rateColor(f.revenueGrowth)
                          }
                        >
                          {f.revenueGrowth !== null
                            ? `${f.revenueGrowth.toFixed(1)}%`
                            : '—'}
                        </td>
                        <td
                          className={
                            'text-right py-1 pl-2 ' +
                            rateColor(f.netIncomeGrowth)
                          }
                        >
                          {f.netIncomeGrowth !== null
                            ? `${f.netIncomeGrowth.toFixed(1)}%`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 수익성비율 */}
            {profit.length > 0 && (
              <>
                <div
                  className="mt-5 mb-1 text-xs font-bold"
                  style={{ color: 'var(--muted)' }}
                >
                  수익성비율
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs" style={{ color: 'var(--muted)' }}>
                        <th className="text-left py-1 pr-2">결산</th>
                        <th className="text-right py-1 px-2">ROA</th>
                        <th className="text-right py-1 px-2">ROE</th>
                        <th className="text-right py-1 px-2">순이익률</th>
                        <th className="text-right py-1 pl-2">매출총이익률</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profit.slice(0, 6).map((p) => (
                        <tr key={`prof-${p.period}`}>
                          <td className="py-1 pr-2 font-mono text-xs">
                            {p.period}
                          </td>
                          <td
                            className={'text-right py-1 px-2 ' + rateColor(p.roa)}
                          >
                            {p.roa !== null ? `${p.roa.toFixed(2)}%` : '—'}
                          </td>
                          <td
                            className={
                              'text-right py-1 px-2 font-semibold ' + rateColor(p.roe)
                            }
                          >
                            {p.roe !== null ? `${p.roe.toFixed(2)}%` : '—'}
                          </td>
                          <td
                            className={
                              'text-right py-1 px-2 ' + rateColor(p.netMargin)
                            }
                          >
                            {p.netMargin !== null
                              ? `${p.netMargin.toFixed(2)}%`
                              : '—'}
                          </td>
                          <td className="text-right py-1 pl-2">
                            {p.grossMargin !== null
                              ? `${p.grossMargin.toFixed(2)}%`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* 안정성비율 */}
            {stability.length > 0 && (
              <>
                <div
                  className="mt-5 mb-1 text-xs font-bold"
                  style={{ color: 'var(--muted)' }}
                >
                  안정성비율
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs" style={{ color: 'var(--muted)' }}>
                        <th className="text-left py-1 pr-2">결산</th>
                        <th className="text-right py-1 px-2">부채비율</th>
                        <th className="text-right py-1 px-2">차입금의존도</th>
                        <th className="text-right py-1 px-2">유동비율</th>
                        <th className="text-right py-1 pl-2">당좌비율</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stability.slice(0, 6).map((s) => (
                        <tr key={`stab-${s.period}`}>
                          <td className="py-1 pr-2 font-mono text-xs">
                            {s.period}
                          </td>
                          <td className="text-right py-1 px-2">
                            {s.debtRatio !== null
                              ? `${s.debtRatio.toFixed(1)}%`
                              : '—'}
                          </td>
                          <td className="text-right py-1 px-2">
                            {s.borrowDependency !== null
                              ? `${s.borrowDependency.toFixed(1)}%`
                              : '—'}
                          </td>
                          <td className="text-right py-1 px-2">
                            {s.currentRatio !== null
                              ? `${s.currentRatio.toFixed(1)}%`
                              : '—'}
                          </td>
                          <td className="text-right py-1 pl-2">
                            {s.quickRatio !== null
                              ? `${s.quickRatio.toFixed(1)}%`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* 투자의견 */}
            <div
              className="mt-5 mb-1 text-xs font-bold"
              style={{ color: 'var(--muted)' }}
            >
              증권사 투자의견 (최근 6개월)
            </div>
            {opinion.length === 0 ? (
              <div className="text-sm" style={{ color: 'var(--muted)' }}>
                투자의견 데이터가 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs" style={{ color: 'var(--muted)' }}>
                      <th className="text-left py-1 pr-2">일자</th>
                      <th className="text-left py-1 px-2">회원사</th>
                      <th className="text-left py-1 px-2">의견</th>
                      <th className="text-right py-1 px-2">목표가</th>
                      <th className="text-right py-1 pl-2">괴리율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opinion.slice(0, 15).map((op, idx) => (
                      <tr key={`${op.date}-${op.broker}-${idx}`}>
                        <td className="py-1 pr-2 font-mono text-xs">
                          {fmtDate(op.date)}
                        </td>
                        <td className="py-1 px-2 truncate max-w-[140px]">
                          {op.broker}
                        </td>
                        <td className="py-1 px-2">
                          <span
                            className={
                              'font-semibold ' +
                              (op.opinion.includes('매수') ||
                              op.opinion.includes('BUY') ||
                              op.opinion.includes('Strong')
                                ? 'text-red-500'
                                : op.opinion.includes('매도') ||
                                    op.opinion.includes('SELL')
                                  ? 'text-blue-500'
                                  : '')
                            }
                          >
                            {op.opinion || '—'}
                          </span>
                        </td>
                        <td className="text-right py-1 px-2 font-semibold">
                          {fmtNum(op.targetPrice)}
                        </td>
                        <td
                          className={'text-right py-1 pl-2 ' + rateColor(op.gap)}
                        >
                          {op.gap !== null ? `${op.gap >= 0 ? '+' : ''}${op.gap.toFixed(2)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p
                  className="mt-2 text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  괴리율 = (목표가 − 현재가) / 현재가 × 100. 양수면 상승여력.
                </p>
              </div>
            )}
          </div>
        )}

        {/* 프로그램매매 탭 */}
        {!loading && tab === 'program' && (
          <div className="mt-4">
            {program.length === 0 ? (
              <div className="text-sm" style={{ color: 'var(--muted)' }}>
                프로그램 매매 데이터가 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs" style={{ color: 'var(--muted)' }}>
                      <th className="text-left py-1 pr-2">시각</th>
                      <th className="text-right py-1 px-2">현재가</th>
                      <th className="text-right py-1 px-2">등락률</th>
                      <th className="text-right py-1 px-2">매수량</th>
                      <th className="text-right py-1 px-2">매도량</th>
                      <th className="text-right py-1 pl-2">순매수량</th>
                    </tr>
                  </thead>
                  <tbody>
                    {program.slice(0, 20).map((row, idx) => (
                      <tr key={`prog-${row.time}-${idx}`}>
                        <td className="py-1 pr-2 font-mono text-xs">
                          {fmtHHMMSS(row.time).slice(0, 5)}
                        </td>
                        <td className="text-right py-1 px-2 font-semibold">
                          {fmtNum(row.price)}
                        </td>
                        <td
                          className={
                            'text-right py-1 px-2 ' + rateColor(row.changeRate)
                          }
                        >
                          {fmtRate(row.changeRate)}
                        </td>
                        <td className="text-right py-1 px-2 text-red-500">
                          {fmtVolume(row.buyVolume)}
                        </td>
                        <td className="text-right py-1 px-2 text-blue-500">
                          {fmtVolume(row.sellVolume)}
                        </td>
                        <td
                          className={
                            'text-right py-1 pl-2 font-semibold ' +
                            ((row.netVolume ?? 0) > 0
                              ? 'text-red-500'
                              : (row.netVolume ?? 0) < 0
                                ? 'text-blue-500'
                                : '')
                          }
                        >
                          {row.netVolume !== null
                            ? (row.netVolume > 0 ? '+' : '') +
                              fmtVolume(row.netVolume)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p
                  className="mt-2 text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  알고리즘/프로그램 매매 추이 — 순매수량 양수면 매수 우위. 시간 역순.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
