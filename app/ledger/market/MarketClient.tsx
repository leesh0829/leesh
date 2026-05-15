'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/app/components/ToastProvider'
import {
  LedgerNavBack,
  LedgerNavKisSettings,
  LedgerNavStocks,
} from '../LedgerNavIcons'
import StockDetailModal, { type StockDetailTarget } from './StockDetailModal'
import OverseasDetailModal, {
  type OverseasDetailTarget,
} from './OverseasDetailModal'
import IndexDetailModal, {
  type IndexDetailTarget,
} from './IndexDetailModal'
import FxDetailModal, { type FxDetailTarget } from './FxDetailModal'
import StockSearchBox from './StockSearchBox'
import MarketStatus from '../stocks/MarketStatus'

type IndexItem = {
  code: string
  name: string
  price: number | null
  change: number | null
  changeRate: number | null
}

type RankingItem = {
  rank: number
  code: string
  name: string
  price: number | null
  changeRate: number | null
}

type PowerItem = {
  rank: number
  code: string
  name: string
  price: number | null
  changeRate: number | null
  power: number | null
  volume: number | null
  buyVol: number | null
  sellVol: number | null
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

type EtfQuote = {
  code: string
  name: string
  price: number | null
  prevClose: number | null
  changeRate: number | null
}

// 원자재/금/은/원유/달러 ETF (KRX 상장) — 클릭 시 KIS 종목 상세 모달 오픈
const COMMODITY_ETFS: Array<{ code: string; name: string }> = [
  { code: '132030', name: '금 (KODEX 골드)' },
  { code: '144600', name: '은 (KODEX 은선물)' },
  { code: '261220', name: '원유 (KODEX WTI)' },
  { code: '138230', name: '달러 (KOSEF 달러선물)' },
]

// 해외 주요 지수 — KIS REST API는 지수 심볼(.DJI/SPX/COMP)을 인식 못함
// ETF 프록시 사용 (Toss·카카오페이증권 등도 동일 방식)
const OVERSEAS_INDICES: Array<{
  exchange: string
  symbol: string
  name: string
}> = [
  { exchange: 'NAS', symbol: 'QQQ', name: '나스닥 (QQQ)' },
  { exchange: 'AMS', symbol: 'DIA', name: '다우 (DIA)' },
  { exchange: 'AMS', symbol: 'SPY', name: 'S&P 500 (SPY)' },
]

type SectorItem = {
  code: string
  name: string
  price: number | null
  change: number | null
  changeRate: number | null
}

type ViItem = {
  code: string
  name: string
  date: string
  triggerTime: string
  releaseTime: string | null
  kind: string
  kindLabel: string
  status: string
  statusLabel: string
  price: number | null
  staticBase: number | null
  staticGap: number | null
  dynamicBase: number | null
  dynamicGap: number | null
  count: number | null
}

type MarketInvestorRow = {
  date: string
  indexPrice: number | null
  indexChange: number | null
  indexChangeRate: number | null
  individual: number | null
  foreign: number | null
  institution: number | null
}

type HoldingsSummary = {
  count: number
  invested: number
  realized: number
  unrealized: number | null
  marketValue: number | null
  totalPnl: number
  returnRate: number | null
}

type FxData = {
  usdKrw: number | null
  jpyKrw: number | null
}

type NewsItem = {
  title: string
  date: string | null
  time: string | null
  source: string | null
  key: string | null
  category: string | null
}

// "20260514" + "143205" → "05/14 14:32"
function fmtNewsTime(date: string | null, time: string | null): string {
  if (!date || date.length < 8) return '—'
  const mm = date.slice(4, 6)
  const dd = date.slice(6, 8)
  if (!time || time.length < 4) return `${mm}/${dd}`
  const hh = time.slice(0, 2)
  const mi = time.slice(2, 4)
  return `${mm}/${dd} ${hh}:${mi}`
}

function relativeTimeFromIso(iso: string | null): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const diffSec = Math.round((Date.now() - t) / 1000)
  if (diffSec < 60) return '방금 전'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`
  return `${Math.floor(diffSec / 86400)}일 전`
}

function fmtIndex(n: number | null) {
  if (n === null) return '—'
  return n.toLocaleString('ko-KR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fmtKRW(n: number) {
  return `₩${Math.round(Math.abs(n)).toLocaleString('ko-KR')}`
}

function fmtRate(r: number | null) {
  if (r === null) return '—'
  return `${r >= 0 ? '+' : ''}${r.toFixed(2)}%`
}

function rateColor(r: number | null) {
  if (r === null || r === 0) return ''
  return r > 0 ? 'text-red-500' : 'text-blue-500'
}

function fmtHHMM(s: string | null) {
  if (!s || s.length < 4) return '—'
  return `${s.slice(0, 2)}:${s.slice(2, 4)}`
}

function fmtShortDate(s: string | null) {
  if (!s || s.length < 8) return '—'
  return `${s.slice(4, 6)}/${s.slice(6, 8)}`
}

function fmtVolumeShort(n: number | null) {
  if (n === null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e8) return `${(n / 1e8).toFixed(1)}억`
  if (abs >= 1e4) return `${(n / 1e4).toFixed(1)}만`
  return n.toLocaleString('ko-KR')
}

export default function MarketClient() {
  const toast = useToast()
  const [kisEnabled, setKisEnabled] = useState<boolean | null>(null)
  const [indices, setIndices] = useState<IndexItem[]>([])
  const [fx, setFx] = useState<FxData>({ usdKrw: null, jpyKrw: null })
  const [valueRank, setValueRank] = useState<RankingItem[]>([])
  const [riseRank, setRiseRank] = useState<RankingItem[]>([])
  const [rankTab, setRankTab] = useState<
    'value' | 'rise' | 'fall' | 'power' | 'bulk' | 'foreign' | 'inst'
  >('value')
  const [fallRank, setFallRank] = useState<RankingItem[]>([])
  const [powerRank, setPowerRank] = useState<PowerItem[]>([])
  const [bulkRank, setBulkRank] = useState<RankingItem[]>([])
  const [foreignRank, setForeignRank] = useState<RankingItem[]>([])
  const [instRank, setInstRank] = useState<RankingItem[]>([])
  const [watchlist, setWatchlist] = useState<
    Array<{
      id: string
      market: string
      symbol: string
      name: string
      price?: number | null
      changeRate?: number | null
    }>
  >([])
  const [etfs, setEtfs] = useState<EtfQuote[]>([])
  const [overseas, setOverseas] = useState<OverseasQuote[]>([])
  const [expectedRiseRank, setExpectedRiseRank] = useState<
    Array<{
      rank: number
      code: string
      name: string
      expected: number | null
      changeRate: number | null
    }>
  >([])
  const [expectedFallRank, setExpectedFallRank] = useState<
    Array<{
      rank: number
      code: string
      name: string
      expected: number | null
      changeRate: number | null
    }>
  >([])
  const [expectedTab, setExpectedTab] = useState<'rise' | 'fall'>('rise')
  const [summary, setSummary] = useState<HoldingsSummary | null>(null)
  const [news, setNews] = useState<NewsItem[]>([])
  const [activeNews, setActiveNews] = useState<NewsItem | null>(null)
  const [activeStock, setActiveStock] = useState<StockDetailTarget | null>(null)
  const [activeOverseas, setActiveOverseas] =
    useState<OverseasDetailTarget | null>(null)
  const [activeIndex, setActiveIndex] = useState<IndexDetailTarget | null>(null)
  const [activeFx, setActiveFx] = useState<FxDetailTarget | null>(null)
  const [kospiSectors, setKospiSectors] = useState<SectorItem[]>([])
  const [kosdaqSectors, setKosdaqSectors] = useState<SectorItem[]>([])
  const [sectorMarket, setSectorMarket] = useState<'KOSPI' | 'KOSDAQ'>('KOSPI')
  const [viItems, setViItems] = useState<ViItem[]>([])
  const [kospiInvestors, setKospiInvestors] = useState<MarketInvestorRow[]>([])
  const [kosdaqInvestors, setKosdaqInvestors] = useState<MarketInvestorRow[]>([])
  const [investorMarket, setInvestorMarket] = useState<'KOSPI' | 'KOSDAQ'>('KOSPI')
  const [loading, setLoading] = useState(true)

  // 자동 새로고침 (15초, 페이지 visible일 때만)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [autoTick, setAutoTick] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // 모든 데이터를 fetch (loading 토글 없음 — caller가 결정)
  const fetchAllData = useCallback(async () => {
    // KIS 등록 여부 확인
    let kis = false
    try {
      const r = await fetch('/api/kis/credentials', { cache: 'no-store' })
      if (r.ok) {
        const data = (await r.json()) as { registered?: boolean }
        kis = !!data.registered
      }
    } catch {
      kis = false
    }
    setKisEnabled(kis)

    // 관심종목 (KIS 없어도 사용 가능)
    try {
      const r = await fetch('/api/watchlist', { cache: 'no-store' })
      if (r.ok) {
        const data = (await r.json()) as {
          items: Array<{
            id: string
            market: string
            symbol: string
            name: string
          }>
        }
        // 각 항목의 가격은 KIS quote(국내) / overseas(해외)에서 별도 fetch
        const enriched = await Promise.all(
          data.items.map(async (w) => {
            try {
              if (w.market === 'KR' && /^\d{6}$/.test(w.symbol)) {
                const qr = await fetch(
                  `/api/holdings/quote?symbol=${w.symbol}`,
                  { cache: 'no-store' }
                )
                if (qr.ok) {
                  const j = (await qr.json()) as {
                    price?: number | null
                    prevClose?: number | null
                  }
                  const p = j.price ?? null
                  const pc = j.prevClose ?? null
                  const rate =
                    p !== null && pc && pc !== 0 ? ((p - pc) / pc) * 100 : null
                  return { ...w, price: p, changeRate: rate }
                }
              }
              return { ...w, price: null, changeRate: null }
            } catch {
              return { ...w, price: null, changeRate: null }
            }
          })
        )
        setWatchlist(enriched)
      }
    } catch {
      // ignore
    }

    // 환율
    let usdKrw = fx.usdKrw
    let jpyKrw = fx.jpyKrw
    try {
      const r = await fetch('/api/exchange-rates', { cache: 'no-store' })
      if (r.ok) {
        const data = (await r.json()) as {
          usdKrw: number | null
          jpyKrw: number | null
        }
        usdKrw = data.usdKrw
        jpyKrw = data.jpyKrw
        setFx({ usdKrw, jpyKrw })
      }
    } catch {
      // ignore
    }

    if (kis) {
      // 점진적 로딩 — 각 fetch가 독립적으로 state 업데이트. 빠른 응답부터 화면에 표시.
      const overseasPairs = OVERSEAS_INDICES.map(
        (o) => `${o.exchange}:${o.symbol}`
      ).join(',')

      async function fetchJson<T>(url: string): Promise<T | null> {
        try {
          const r = await fetch(url, { cache: 'no-store' })
          if (!r.ok) return null
          return (await r.json()) as T
        } catch {
          return null
        }
      }

      const tasks: Promise<unknown>[] = [
        fetchJson<{ items: IndexItem[] }>('/api/kis/indices').then((d) => {
          if (d?.items) setIndices(d.items)
        }),
        fetchJson<{ items: RankingItem[] }>(
          '/api/kis/rankings?type=value&limit=10'
        ).then((d) => {
          if (d?.items) setValueRank(d.items)
        }),
        fetchJson<{ items: RankingItem[] }>(
          '/api/kis/rankings?type=rise&limit=10'
        ).then((d) => {
          if (d?.items) setRiseRank(d.items)
        }),
        fetchJson<{ items: RankingItem[] }>(
          '/api/kis/rankings?type=fall&limit=10'
        ).then((d) => {
          if (d?.items) setFallRank(d.items)
        }),
        fetchJson<{ items: NewsItem[] }>('/api/kis/news?limit=15').then((d) => {
          if (d?.items) setNews(d.items)
        }),
        fetchJson<{ sectors: SectorItem[] }>(
          '/api/kis/sectors?market=KOSPI'
        ).then((d) => {
          if (d?.sectors) setKospiSectors(d.sectors)
        }),
        fetchJson<{ sectors: SectorItem[] }>(
          '/api/kis/sectors?market=KOSDAQ'
        ).then((d) => {
          if (d?.sectors) setKosdaqSectors(d.sectors)
        }),
        fetchJson<{ items: ViItem[] }>('/api/kis/vi?market=ALL&limit=15').then(
          (d) => {
            if (d?.items) setViItems(d.items)
          }
        ),
        fetchJson<{ items: MarketInvestorRow[] }>(
          '/api/kis/market-investors?market=KOSPI&limit=10'
        ).then((d) => {
          if (d?.items) setKospiInvestors(d.items)
        }),
        fetchJson<{ items: MarketInvestorRow[] }>(
          '/api/kis/market-investors?market=KOSDAQ&limit=10'
        ).then((d) => {
          if (d?.items) setKosdaqInvestors(d.items)
        }),
        fetchJson<{ items: PowerItem[] }>(
          '/api/kis/power-ranking?limit=10'
        ).then((d) => {
          if (d?.items) setPowerRank(d.items)
        }),
        fetchJson<{ items: OverseasQuote[] }>(
          `/api/kis/overseas?pairs=${encodeURIComponent(overseasPairs)}`
        ).then((d) => {
          if (d?.items) setOverseas(d.items)
        }),
        fetchJson<{
          items: Array<{
            rank: number
            code: string
            name: string
            expected: number | null
            changeRate: number | null
          }>
        }>('/api/kis/expected-ranking?type=rise&limit=10').then((d) => {
          if (d?.items) setExpectedRiseRank(d.items)
        }),
        fetchJson<{
          items: Array<{
            rank: number
            code: string
            name: string
            expected: number | null
            changeRate: number | null
          }>
        }>('/api/kis/expected-ranking?type=fall&limit=10').then((d) => {
          if (d?.items) setExpectedFallRank(d.items)
        }),
        fetchJson<{ items: RankingItem[] }>(
          '/api/kis/bulk-ranking?limit=10'
        ).then((d) => {
          if (d?.items) setBulkRank(d.items)
        }),
        fetchJson<{ items: RankingItem[] }>(
          '/api/kis/supply-ranking?side=foreign&limit=10'
        ).then((d) => {
          if (d?.items) setForeignRank(d.items)
        }),
        fetchJson<{ items: RankingItem[] }>(
          '/api/kis/supply-ranking?side=inst&limit=10'
        ).then((d) => {
          if (d?.items) setInstRank(d.items)
        }),
      ]

      // ETF — 카드별로 분리하면 더 점진적이지만 비교적 빠른 호출이라 묶음
      const etfTask = (async () => {
        const results = await Promise.all(
          COMMODITY_ETFS.map(async (e) => {
            const j = await fetchJson<{
              price?: number | null
              prevClose?: number | null
            }>(`/api/holdings/quote?symbol=${e.code}`)
            if (!j) return null
            const price = j.price ?? null
            const prevClose = j.prevClose ?? null
            const rate =
              price !== null && prevClose && prevClose !== 0
                ? ((price - prevClose) / prevClose) * 100
                : null
            return {
              code: e.code,
              name: e.name,
              price,
              prevClose,
              changeRate: rate,
            } as EtfQuote
          })
        )
        setEtfs(results.filter((x): x is EtfQuote => x !== null))
      })()
      tasks.push(etfTask)

      await Promise.allSettled(tasks)
    }

    // 내 보유 요약 — /api/holdings 응답 가공
    try {
      const r = await fetch('/api/holdings', { cache: 'no-store' })
      if (r.ok) {
        const data = (await r.json()) as {
          items: Array<{
            currency: string
            aggregate: {
              totalInvested: number
              realizedPnL: number
              unrealizedPnL: number | null
              marketValue: number | null
            }
          }>
        }
        const usdRate = usdKrw ?? 1
        const jpyRate = jpyKrw ?? 1
        let invested = 0
        let realized = 0
        let unrealized = 0
        let marketValue = 0
        let hasMarket = false
        for (const h of data.items) {
          const c = h.currency.toUpperCase()
          const rate =
            c === 'KRW' ? 1 : c === 'USD' ? usdRate : c === 'JPY' ? jpyRate : 1
          const a = h.aggregate
          invested += a.totalInvested * rate
          realized += a.realizedPnL * rate
          if (a.unrealizedPnL !== null) {
            unrealized += a.unrealizedPnL * rate
            hasMarket = true
          }
          if (a.marketValue !== null) marketValue += a.marketValue * rate
        }
        const totalPnl = realized + (hasMarket ? unrealized : 0)
        const returnRate =
          invested > 0 ? (totalPnl / invested) * 100 : null
        setSummary({
          count: data.items.length,
          invested: Math.round(invested),
          realized: Math.round(realized),
          unrealized: hasMarket ? Math.round(unrealized) : null,
          marketValue: hasMarket ? Math.round(marketValue) : null,
          totalPnl: Math.round(totalPnl),
          returnRate,
        })
      }
    } catch {
      // ignore
    }

    // 가격 알람 체크 — 활성 알람 + 현재가 비교 → 도달 시 토스트 + triggered 표시
    try {
      const ar = await fetch('/api/stock-alarm', { cache: 'no-store' })
      if (ar.ok) {
        const data = (await ar.json()) as {
          items: Array<{
            id: string
            market: string
            symbol: string
            name: string
            target: number
            direction: 'ABOVE' | 'BELOW'
            enabled: boolean
            triggeredAt: string | null
          }>
        }
        const active = data.items.filter(
          (a) => a.enabled && !a.triggeredAt && a.market === 'KR'
        )
        for (const a of active) {
          // 캐시 적극 활용 — getKisQuote는 10초 TTL
          try {
            const qr = await fetch(
              `/api/holdings/quote?symbol=${a.symbol}`,
              { cache: 'no-store' }
            )
            if (!qr.ok) continue
            const q = (await qr.json()) as { price?: number | null }
            const price = q.price ?? null
            if (price === null) continue
            const hit =
              (a.direction === 'ABOVE' && price >= a.target) ||
              (a.direction === 'BELOW' && price <= a.target)
            if (hit) {
              toast.info(
                `🔔 ${a.name}: ${a.direction === 'ABOVE' ? '≥' : '≤'} ${a.target.toLocaleString('ko-KR')} 도달 (현재 ${price.toLocaleString('ko-KR')})`
              )
              await fetch(`/api/stock-alarm/${a.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ triggered: true }),
              })
            }
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
  }, [fx.usdKrw, fx.jpyKrw, toast])

  // 초기/수동 로드 — 스켈레톤 표시
  const loadAll = useCallback(async () => {
    setLoading(true)
    await fetchAllData()
    setAutoTick(new Date().toISOString())
    setLoading(false)
  }, [fetchAllData])

  // 자동 갱신용 silent 로드 — 스켈레톤 없음
  const reloadAllSilent = useCallback(async () => {
    setRefreshing(true)
    await fetchAllData()
    setAutoTick(new Date().toISOString())
    setRefreshing(false)
  }, [fetchAllData])

  // 인터벌이 stale closure에 묶이지 않게 ref로 최신 함수 캡쳐
  const reloadAllSilentRef = useRef(reloadAllSilent)
  useEffect(() => {
    reloadAllSilentRef.current = reloadAllSilent
  })

  useEffect(() => {
    if (!autoRefresh) return
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void reloadAllSilentRef.current()
      }
    }, 15_000)
    return () => window.clearInterval(interval)
  }, [autoRefresh])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadAll()
    }, 0)
    return () => window.clearTimeout(t)
  }, [loadAll])

  const ranking =
    rankTab === 'value'
      ? valueRank
      : rankTab === 'rise'
        ? riseRank
        : rankTab === 'bulk'
          ? bulkRank
          : rankTab === 'foreign'
            ? foreignRank
            : rankTab === 'inst'
              ? instRank
              : fallRank

  return (
    <main className="w-full px-3 py-6 sm:px-4 lg:px-6">
      <div className="grid gap-6">
        {/* 헤더 */}
        <div className="surface card-pad card-hover-border-only">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">시장 / 주식 시세</h1>
              <p
                className="mt-1 text-sm"
                style={{ color: 'var(--muted)' }}
              >
                국내 지수 + 거래대금/등락률 상위 + 내 보유 자산 요약
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LedgerNavKisSettings />
              <LedgerNavStocks />
              <LedgerNavBack />
            </div>
          </div>

          {/* 자동 갱신 컨트롤 + 시장 상태 */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <label
              className="flex items-center gap-1"
              title="15초마다 자동으로 갱신합니다 (탭이 활성 상태일 때만)."
            >
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              자동 갱신 (15초)
              {autoTick ? (
                <span style={{ color: 'var(--muted)' }}>
                  · {relativeTimeFromIso(autoTick)}
                </span>
              ) : null}
            </label>
            <button
              type="button"
              className="btn btn-outline text-xs"
              onClick={() => void reloadAllSilent()}
              disabled={refreshing}
              title="지금 새로 가져오기"
            >
              {refreshing ? '갱신중...' : '↻ 지금 갱신'}
            </button>
            <div className="ml-auto">
              <MarketStatus />
            </div>
          </div>
        </div>

        {kisEnabled === false ? (
          <div className="surface card-pad card-hover-border-only">
            <div className="font-extrabold">KIS 자격증명이 필요합니다</div>
            <p
              className="mt-1 text-sm"
              style={{ color: 'var(--muted)' }}
            >
              지수·랭킹 조회는 한국투자증권 API를 사용합니다. 우상단{' '}
              <span className="font-mono">🗝</span> 버튼으로 자격증명을
              등록하세요.
            </p>
          </div>
        ) : null}

        {/* 종목 검색 */}
        <div className="surface card-pad card-hover-border-only">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="font-extrabold">종목 검색</div>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              실시간 자동완성 (네이버 기반)
            </span>
          </div>
          <StockSearchBox
            onSelectKr={(code, name) => setActiveStock({ code, name })}
            onSelectOverseas={(exchange, symbol, name) =>
              setActiveOverseas({ exchange, symbol, name })
            }
          />
        </div>

        {/* 관심종목 위젯 */}
        {watchlist.length > 0 && (
          <div className="surface card-pad card-hover-border-only">
            <div className="flex items-center justify-between">
              <div className="font-extrabold">★ 관심종목</div>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                {watchlist.length}개
              </span>
            </div>
            <div className="mt-3 grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {watchlist.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    if (w.market === 'KR' && /^\d{6}$/.test(w.symbol)) {
                      setActiveStock({ code: w.symbol, name: w.name })
                    }
                  }}
                  className="card p-2 card-hover-border-only text-left"
                >
                  <div
                    className="text-xs truncate font-semibold"
                    style={{ color: 'var(--foreground)' }}
                    title={w.name}
                  >
                    {w.name}
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-1">
                    <div className="text-sm font-bold">
                      {w.price !== null && w.price !== undefined
                        ? fmtKRW(w.price)
                        : '—'}
                    </div>
                    <div
                      className={
                        'text-xs font-semibold ' +
                        rateColor(w.changeRate ?? null)
                      }
                    >
                      {fmtRate(w.changeRate ?? null)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 지수 대시보드 */}
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          {indices.map((idx) => (
            <button
              key={idx.code}
              type="button"
              onClick={() =>
                setActiveIndex({
                  code: idx.code,
                  name: idx.name,
                  price: idx.price,
                  change: idx.change,
                  changeRate: idx.changeRate,
                })
              }
              className="surface card-pad card-hover-border-only text-left"
            >
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                {idx.name}
              </div>
              <div className="mt-1 text-xl font-extrabold sm:text-2xl">
                {fmtIndex(idx.price)}
              </div>
              <div
                className={'mt-1 text-xs font-semibold ' + rateColor(idx.changeRate)}
              >
                {idx.change !== null
                  ? `${idx.change >= 0 ? '+' : ''}${idx.change.toFixed(2)}`
                  : '—'}
                {idx.changeRate !== null
                  ? ` (${fmtRate(idx.changeRate)})`
                  : ''}
              </div>
            </button>
          ))}
          {/* 환율 카드 — 클릭 시 시계열 차트 */}
          <button
            type="button"
            onClick={() =>
              setActiveFx({
                base: 'USD',
                target: 'KRW',
                name: 'USD/KRW',
                price: fx.usdKrw,
              })
            }
            className="surface card-pad card-hover-border-only text-left"
          >
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              USD/KRW
            </div>
            <div className="mt-1 text-xl font-extrabold sm:text-2xl">
              {fx.usdKrw !== null
                ? `₩${fx.usdKrw.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`
                : '—'}
            </div>
            <div className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              클릭 시 시계열
            </div>
          </button>
          <button
            type="button"
            onClick={() =>
              setActiveFx({
                base: 'JPY',
                target: 'KRW',
                name: 'JPY/KRW',
                price: fx.jpyKrw,
              })
            }
            className="surface card-pad card-hover-border-only text-left"
          >
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              JPY/KRW
            </div>
            <div className="mt-1 text-xl font-extrabold sm:text-2xl">
              {fx.jpyKrw !== null
                ? `₩${fx.jpyKrw.toLocaleString('ko-KR', { maximumFractionDigits: 4 })}`
                : '—'}
            </div>
            <div className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              클릭 시 시계열
            </div>
          </button>
        </div>

        {/* 해외 지수 (NASDAQ / 다우 / S&P 500) — 클릭 시 상세 */}
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          {OVERSEAS_INDICES.map((meta) => {
            const found = overseas.find(
              (o) => o.exchange === meta.exchange && o.symbol === meta.symbol
            )
            return (
              <button
                key={`ovrs-${meta.exchange}-${meta.symbol}`}
                type="button"
                onClick={() =>
                  setActiveOverseas({
                    exchange: meta.exchange,
                    symbol: meta.symbol,
                    name: meta.name,
                  })
                }
                className="surface card-pad card-hover-border-only text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>
                    {meta.name}
                  </div>
                  <span
                    className="text-[10px] font-bold rounded-full px-1.5 py-0.5"
                    style={{
                      background: 'var(--surface-muted, rgba(0,0,0,0.06))',
                      color: 'var(--muted)',
                    }}
                  >
                    {meta.exchange}
                  </span>
                </div>
                <div className="mt-1 text-xl font-extrabold sm:text-2xl">
                  {found?.price !== null && found?.price !== undefined
                    ? found.price.toLocaleString('en-US', {
                        minimumFractionDigits: found.decimals,
                        maximumFractionDigits: found.decimals,
                      })
                    : '—'}
                </div>
                <div
                  className={
                    'mt-1 text-xs font-semibold ' + rateColor(found?.changeRate ?? null)
                  }
                >
                  {found?.change !== null && found?.change !== undefined
                    ? `${found.change >= 0 ? '+' : ''}${found.change.toFixed(2)}`
                    : '—'}
                  {found?.changeRate !== null && found?.changeRate !== undefined
                    ? ` (${fmtRate(found.changeRate)})`
                    : ''}
                </div>
              </button>
            )
          })}
        </div>

        {/* 원자재/달러 ETF — 클릭 시 종목 상세 모달 */}
        <div className="surface card-pad card-hover-border-only">
          <div className="flex items-center justify-between">
            <div className="font-extrabold">원자재 · 달러 ETF</div>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              KRX 상장 ETF · 클릭 시 상세
            </span>
          </div>
          <div className="mt-3 grid gap-2 grid-cols-2 sm:grid-cols-4">
            {COMMODITY_ETFS.map((meta) => {
              const q = etfs.find((e) => e.code === meta.code)
              return (
                <button
                  key={meta.code}
                  type="button"
                  onClick={() =>
                    setActiveStock({ code: meta.code, name: meta.name })
                  }
                  className="card p-3 card-hover-border-only text-left"
                >
                  <div
                    className="text-xs truncate"
                    style={{ color: 'var(--muted)' }}
                  >
                    {meta.name}
                  </div>
                  <div className="mt-1 text-lg font-extrabold">
                    {q?.price != null ? fmtKRW(q.price) : '—'}
                  </div>
                  <div
                    className={
                      'text-xs font-semibold ' + rateColor(q?.changeRate ?? null)
                    }
                  >
                    {fmtRate(q?.changeRate ?? null)}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* 업종별 지수 */}
        <div className="surface card-pad card-hover-border-only">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-extrabold">업종별 지수</div>
            <div className="flex gap-1">
              {(['KOSPI', 'KOSDAQ'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSectorMarket(m)}
                  className={
                    'rounded-md px-3 py-1 text-xs font-semibold ' +
                    (sectorMarket === m
                      ? 'bg-current/10 ring-1 ring-current'
                      : 'opacity-60 hover:opacity-100')
                  }
                >
                  {m === 'KOSPI' ? '코스피' : '코스닥'}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-14 rounded-md skeleton" />
              ))}
            </div>
          ) : (sectorMarket === 'KOSPI' ? kospiSectors : kosdaqSectors).length ===
            0 ? (
            <div
              className="mt-3 text-sm"
              style={{ color: 'var(--muted)' }}
            >
              데이터가 없습니다.
              {!kisEnabled ? ' KIS 자격증명 등록이 필요합니다.' : ''}
            </div>
          ) : (() => {
            // 히트맵: 등락률 크기에 따라 배경 강도 조절
            const list = sectorMarket === 'KOSPI' ? kospiSectors : kosdaqSectors
            const maxAbs = Math.max(
              0.5,
              ...list.map((s) => Math.abs(s.changeRate ?? 0))
            )
            return (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {list.map((s) => {
                  const rate = s.changeRate ?? 0
                  const intensity = Math.min(1, Math.abs(rate) / maxAbs)
                  const hue =
                    rate > 0
                      ? 'rgba(239, 68, 68, INTENSITY)' // red
                      : rate < 0
                        ? 'rgba(59, 130, 246, INTENSITY)' // blue
                        : 'rgba(128, 128, 128, INTENSITY)'
                  const bg = hue.replace(
                    'INTENSITY',
                    (intensity * 0.22).toFixed(3)
                  )
                  const border = hue.replace(
                    'INTENSITY',
                    (0.25 + intensity * 0.35).toFixed(3)
                  )
                  return (
                    <div
                      key={`${sectorMarket}-${s.code}-${s.name}`}
                      className="rounded-md p-3 transition-colors"
                      style={{
                        background: bg,
                        border: `1px solid ${border}`,
                      }}
                    >
                      <div
                        className="text-xs truncate font-semibold"
                        style={{ color: 'var(--foreground)' }}
                      >
                        {s.name || s.code}
                      </div>
                      <div className="mt-1 flex items-baseline justify-between gap-2">
                        <div className="text-lg font-extrabold">
                          {fmtIndex(s.price)}
                        </div>
                        <div
                          className={
                            'text-sm font-bold ' + rateColor(s.changeRate)
                          }
                        >
                          {fmtRate(s.changeRate)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
          <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
            히트맵 — 등락률 절대값이 클수록 진한 색.
          </p>
        </div>

        {/* 좌측 랭킹 + 우측 내 자산 */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {/* 랭킹 */}
          <div className="surface card-pad card-hover-border-only">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-extrabold">시장 랭킹</div>
              <div className="flex flex-wrap gap-1 text-xs">
                <button
                  type="button"
                  className={
                    'btn text-xs ' +
                    (rankTab === 'value' ? 'btn-primary' : 'btn-outline')
                  }
                  onClick={() => setRankTab('value')}
                >
                  거래대금 상위
                </button>
                <button
                  type="button"
                  className={
                    'btn text-xs ' +
                    (rankTab === 'rise' ? 'btn-primary' : 'btn-outline')
                  }
                  onClick={() => setRankTab('rise')}
                >
                  상승률 상위
                </button>
                <button
                  type="button"
                  className={
                    'btn text-xs ' +
                    (rankTab === 'fall' ? 'btn-primary' : 'btn-outline')
                  }
                  onClick={() => setRankTab('fall')}
                >
                  하락률 상위
                </button>
                <button
                  type="button"
                  className={
                    'btn text-xs ' +
                    (rankTab === 'power' ? 'btn-primary' : 'btn-outline')
                  }
                  onClick={() => setRankTab('power')}
                >
                  체결강도 상위
                </button>
                <button
                  type="button"
                  className={
                    'btn text-xs ' +
                    (rankTab === 'bulk' ? 'btn-primary' : 'btn-outline')
                  }
                  onClick={() => setRankTab('bulk')}
                >
                  대량체결 상위
                </button>
                <button
                  type="button"
                  className={
                    'btn text-xs ' +
                    (rankTab === 'foreign' ? 'btn-primary' : 'btn-outline')
                  }
                  onClick={() => setRankTab('foreign')}
                >
                  외국인 순매수
                </button>
                <button
                  type="button"
                  className={
                    'btn text-xs ' +
                    (rankTab === 'inst' ? 'btn-primary' : 'btn-outline')
                  }
                  onClick={() => setRankTab('inst')}
                >
                  기관 순매수
                </button>
              </div>
            </div>

            {loading ? (
              <div className="mt-3 grid gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={`rank-skel-${i}`}
                    className="h-10 rounded-md skeleton"
                  />
                ))}
              </div>
            ) : rankTab === 'power' ? (
              powerRank.length === 0 ? (
                <div
                  className="mt-3 text-sm"
                  style={{ color: 'var(--muted)' }}
                >
                  데이터가 없습니다.
                  {!kisEnabled ? ' KIS 자격증명 등록이 필요합니다.' : ''}
                </div>
              ) : (
                <div className="mt-3 grid gap-1">
                  {powerRank.map((row) => (
                    <button
                      key={`p-${row.code}-${row.rank}`}
                      type="button"
                      onClick={() =>
                        setActiveStock({ code: row.code, name: row.name })
                      }
                      className="card p-2 card-hover-border-only w-full text-left"
                    >
                      <div className="flex items-center gap-3 text-sm">
                        <span
                          className="w-6 shrink-0 text-center font-bold"
                          style={{ color: 'var(--muted)' }}
                        >
                          {row.rank}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-semibold">
                          {row.name}
                        </span>
                        <span
                          className="shrink-0 text-xs"
                          style={{ color: 'var(--muted)' }}
                        >
                          {row.code}
                        </span>
                        <span className="shrink-0 font-bold">
                          {row.price !== null ? fmtKRW(row.price) : '—'}
                        </span>
                        <span
                          className={
                            'shrink-0 font-semibold ' + rateColor(row.changeRate)
                          }
                        >
                          {fmtRate(row.changeRate)}
                        </span>
                        <span
                          className={
                            'shrink-0 font-mono text-xs ' +
                            (row.power !== null && row.power >= 100
                              ? 'text-red-500'
                              : 'text-blue-500')
                          }
                          title="체결강도 (매수/매도 ×100)"
                        >
                          {row.power !== null ? `${row.power.toFixed(0)}` : '—'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )
            ) : ranking.length === 0 ? (
              <div
                className="mt-3 text-sm"
                style={{ color: 'var(--muted)' }}
              >
                데이터가 없습니다.
                {!kisEnabled
                  ? ' KIS 자격증명 등록이 필요합니다.'
                  : ' KIS API 응답을 확인하세요.'}
              </div>
            ) : (
              <div className="mt-3 grid gap-1">
                {ranking.map((row) => (
                  <button
                    key={`${row.code}-${row.rank}`}
                    type="button"
                    onClick={() =>
                      setActiveStock({ code: row.code, name: row.name })
                    }
                    className="card p-2 card-hover-border-only w-full text-left"
                  >
                    <div className="flex items-center gap-3 text-sm">
                      <span
                        className="w-6 shrink-0 text-center font-bold"
                        style={{ color: 'var(--muted)' }}
                      >
                        {row.rank}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {row.name}
                      </span>
                      <span className="shrink-0 text-xs" style={{ color: 'var(--muted)' }}>
                        {row.code}
                      </span>
                      <span className="shrink-0 font-bold">
                        {row.price !== null ? fmtKRW(row.price) : '—'}
                      </span>
                      <span
                        className={'shrink-0 font-semibold ' + rateColor(row.changeRate)}
                      >
                        {fmtRate(row.changeRate)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <p
              className="mt-2 text-xs"
              style={{ color: 'var(--muted)' }}
            >
              KIS API 기반. 상승률 = 빨강, 하락률 = 파랑. 체결강도 ≥100은 매수 우세.
            </p>
          </div>

          {/* 내 자산 */}
          <div className="surface card-pad card-hover-border-only">
            <div className="flex items-center justify-between">
              <div className="font-extrabold">내 자산 요약</div>
              <Link href="/ledger/stocks" className="btn btn-outline text-xs">
                자세히 →
              </Link>
            </div>
            {loading ? (
              <div className="mt-3 h-32 rounded-md skeleton" />
            ) : !summary || summary.count === 0 ? (
              <div
                className="mt-3 text-sm"
                style={{ color: 'var(--muted)' }}
              >
                등록된 보유 종목이 없습니다.
              </div>
            ) : (
              <div className="mt-3 grid gap-3">
                <div>
                  <div
                    className="text-xs"
                    style={{ color: 'var(--muted)' }}
                  >
                    총 수익률
                  </div>
                  <div
                    className={
                      'mt-1 text-2xl font-extrabold ' +
                      (summary.returnRate === null
                        ? ''
                        : summary.returnRate >= 0
                          ? 'text-emerald-500'
                          : 'text-red-500')
                    }
                  >
                    {summary.returnRate === null
                      ? '—'
                      : `${summary.returnRate >= 0 ? '+' : ''}${summary.returnRate.toFixed(2)}%`}
                  </div>
                  <div
                    className="mt-1 text-xs"
                    style={{ color: 'var(--muted)' }}
                  >
                    총 손익{' '}
                    <span
                      className={
                        summary.totalPnl >= 0
                          ? 'text-emerald-500'
                          : 'text-red-500'
                      }
                    >
                      {(summary.totalPnl >= 0 ? '+' : '') +
                        fmtKRW(summary.totalPnl)}
                    </span>
                  </div>
                </div>
                <div>
                  <div
                    className="text-xs"
                    style={{ color: 'var(--muted)' }}
                  >
                    추정 자산 (KRW 환산)
                  </div>
                  <div className="mt-1 text-2xl font-extrabold">
                    {summary.marketValue !== null
                      ? fmtKRW(summary.marketValue)
                      : '—'}
                  </div>
                </div>
                <div
                  className="text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  보유 종목 {summary.count}개 · 총 매수{' '}
                  {fmtKRW(summary.invested)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* VI 발동 종목 + 시장 투자자 매매동향 */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* VI */}
          <div className="surface card-pad card-hover-border-only">
            <div className="flex items-center justify-between">
              <div className="font-extrabold">VI 발동 종목</div>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                변동성완화장치
              </span>
            </div>
            {loading ? (
              <div className="mt-3 grid gap-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-9 rounded-md skeleton" />
                ))}
              </div>
            ) : viItems.length === 0 ? (
              <div
                className="mt-3 text-sm"
                style={{ color: 'var(--muted)' }}
              >
                현재 VI 발동된 종목이 없습니다.
              </div>
            ) : (
              <ul className="mt-3 grid gap-1">
                {viItems.slice(0, 12).map((v, idx) => (
                  <li key={`${v.code}-${v.triggerTime}-${idx}`}>
                    <button
                      type="button"
                      onClick={() =>
                        v.code && /^\d{6}$/.test(v.code)
                          ? setActiveStock({ code: v.code, name: v.name })
                          : undefined
                      }
                      className="card p-2 card-hover-border-only w-full text-left"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <span
                          className={
                            'rounded-full px-2 py-0.5 text-xs font-bold ' +
                            (v.status === '1'
                              ? 'bg-red-500/15 text-red-500'
                              : 'bg-gray-500/15')
                          }
                          style={
                            v.status !== '1'
                              ? { color: 'var(--muted)' }
                              : undefined
                          }
                        >
                          {v.statusLabel || v.status || '—'}
                        </span>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{
                            background: 'var(--surface-muted, rgba(0,0,0,0.06))',
                            color: 'var(--muted)',
                          }}
                        >
                          {v.kindLabel}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-semibold">
                          {v.name || v.code}
                        </span>
                        <span
                          className="shrink-0 font-mono text-xs"
                          style={{ color: 'var(--muted)' }}
                        >
                          {fmtHHMM(v.triggerTime)}
                        </span>
                        {v.price !== null && (
                          <span className="shrink-0 text-xs font-bold">
                            {fmtKRW(v.price)}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 시장 투자자 매매동향 */}
          <div className="surface card-pad card-hover-border-only">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-extrabold">시장 투자자 매매동향</div>
              <div className="flex gap-1">
                {(['KOSPI', 'KOSDAQ'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setInvestorMarket(m)}
                    className={
                      'rounded-md px-3 py-1 text-xs font-semibold ' +
                      (investorMarket === m
                        ? 'bg-current/10 ring-1 ring-current'
                        : 'opacity-60 hover:opacity-100')
                    }
                  >
                    {m === 'KOSPI' ? '코스피' : '코스닥'}
                  </button>
                ))}
              </div>
            </div>
            {loading ? (
              <div className="mt-3 grid gap-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-9 rounded-md skeleton" />
                ))}
              </div>
            ) : (investorMarket === 'KOSPI'
                ? kospiInvestors
                : kosdaqInvestors
              ).length === 0 ? (
              <div
                className="mt-3 text-sm"
                style={{ color: 'var(--muted)' }}
              >
                데이터가 없습니다.
                {!kisEnabled
                  ? ' KIS 자격증명 등록이 필요합니다.'
                  : ''}
              </div>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      className="text-xs"
                      style={{ color: 'var(--muted)' }}
                    >
                      <th className="text-left py-1 pr-2">일자</th>
                      <th className="text-right py-1 px-2">지수</th>
                      <th className="text-right py-1 px-2">등락률</th>
                      <th className="text-right py-1 px-2">개인</th>
                      <th className="text-right py-1 px-2">외국인</th>
                      <th className="text-right py-1 pl-2">기관</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(investorMarket === 'KOSPI'
                      ? kospiInvestors
                      : kosdaqInvestors
                    ).map((row) => (
                      <tr key={row.date}>
                        <td className="py-1 pr-2 font-mono text-xs">
                          {fmtShortDate(row.date)}
                        </td>
                        <td className="text-right py-1 px-2 font-semibold">
                          {fmtIndex(row.indexPrice)}
                        </td>
                        <td
                          className={
                            'text-right py-1 px-2 ' +
                            rateColor(row.indexChangeRate)
                          }
                        >
                          {fmtRate(row.indexChangeRate)}
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
                              fmtVolumeShort(row.individual)
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
                              fmtVolumeShort(row.foreign)
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
                              fmtVolumeShort(row.institution)
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
                  순매수 수량 — 빨강 +매수, 파랑 −매도
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 예상체결 상승/하락 상위 (동시호가 시간대 유용) */}
        <div className="surface card-pad card-hover-border-only">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-extrabold">예상체결 상승/하락 상위</div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setExpectedTab('rise')}
                className={
                  'btn text-xs ' +
                  (expectedTab === 'rise' ? 'btn-primary' : 'btn-outline')
                }
              >
                상승
              </button>
              <button
                type="button"
                onClick={() => setExpectedTab('fall')}
                className={
                  'btn text-xs ' +
                  (expectedTab === 'fall' ? 'btn-primary' : 'btn-outline')
                }
              >
                하락
              </button>
            </div>
          </div>
          {loading ? (
            <div className="mt-3 grid gap-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-9 rounded-md skeleton" />
              ))}
            </div>
          ) : (expectedTab === 'rise'
              ? expectedRiseRank
              : expectedFallRank
            ).length === 0 ? (
            <div
              className="mt-3 text-sm"
              style={{ color: 'var(--muted)' }}
            >
              현재 예상체결 데이터가 없습니다. (동시호가 시간대 — 08:30~09:00, 15:20~15:30 — 에 활성)
            </div>
          ) : (
            <div className="mt-3 grid gap-1">
              {(expectedTab === 'rise'
                ? expectedRiseRank
                : expectedFallRank
              ).map((row) => (
                <button
                  key={`exp-${row.code}-${row.rank}`}
                  type="button"
                  onClick={() =>
                    setActiveStock({ code: row.code, name: row.name })
                  }
                  className="card p-2 card-hover-border-only w-full text-left"
                >
                  <div className="flex items-center gap-3 text-sm">
                    <span
                      className="w-6 shrink-0 text-center font-bold"
                      style={{ color: 'var(--muted)' }}
                    >
                      {row.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {row.name}
                    </span>
                    <span
                      className="shrink-0 text-xs"
                      style={{ color: 'var(--muted)' }}
                    >
                      {row.code}
                    </span>
                    <span className="shrink-0 font-bold">
                      {row.expected !== null ? fmtKRW(row.expected) : '—'}
                    </span>
                    <span
                      className={
                        'shrink-0 font-semibold ' + rateColor(row.changeRate)
                      }
                    >
                      {fmtRate(row.changeRate)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
          <p
            className="mt-2 text-xs"
            style={{ color: 'var(--muted)' }}
          >
            장 시작 전 동시호가(08:30~09:00) / 장 마감 단일가(15:20~15:30) 시간대의 예상 체결가 기준.
          </p>
        </div>

        {/* 주요 뉴스 (KIS 국내뉴스종합) */}
        <div className="surface card-pad card-hover-border-only">
          <div className="flex items-center justify-between">
            <div className="font-extrabold">주요 뉴스</div>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              KIS 국내뉴스종합
            </span>
          </div>
          {loading ? (
            <div className="mt-3 grid gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 rounded-md skeleton" />
              ))}
            </div>
          ) : news.length === 0 ? (
            <div
              className="mt-3 text-sm"
              style={{ color: 'var(--muted)' }}
            >
              불러올 뉴스가 없습니다.
              {!kisEnabled ? ' KIS 자격증명 등록이 필요합니다.' : ''}
            </div>
          ) : (
            <ul className="mt-3 grid gap-1">
              {news.map((item, idx) => (
                <li
                  key={item.key ?? `${item.date}-${item.time}-${idx}`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveNews(item)}
                    className="card p-2 card-hover-border-only w-full text-left"
                  >
                    <div className="flex items-baseline gap-3 text-sm">
                      <span
                        className="shrink-0 font-mono text-xs"
                        style={{ color: 'var(--muted)' }}
                      >
                        {fmtNewsTime(item.date, item.time)}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {item.title || '제목 없음'}
                      </span>
                      {item.source && (
                        <span
                          className="shrink-0 text-xs"
                          style={{ color: 'var(--muted)' }}
                        >
                          {item.source}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {activeNews && (
          <div
            onClick={() => setActiveNews(null)}
            className="fixed inset-0 z-55 bg-black/40 flex items-end sm:items-center justify-center p-2 sm:p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="surface w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl p-5 max-h-[80dvh] overflow-y-auto"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {activeNews.source && (
                    <span
                      className="rounded-full px-2 py-0.5 font-semibold"
                      style={{
                        background: 'var(--surface-muted, rgba(0,0,0,0.06))',
                      }}
                    >
                      {activeNews.source}
                    </span>
                  )}
                  {activeNews.category && (
                    <span style={{ color: 'var(--muted)' }}>
                      {activeNews.category}
                    </span>
                  )}
                  <span style={{ color: 'var(--muted)' }}>
                    {fmtNewsTime(activeNews.date, activeNews.time)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveNews(null)}
                  className="btn btn-outline text-xs shrink-0"
                >
                  닫기
                </button>
              </div>

              <h3 className="mt-3 text-lg font-extrabold leading-snug">
                {activeNews.title || '제목 없음'}
              </h3>

              <p
                className="mt-4 text-sm leading-relaxed"
                style={{ color: 'var(--muted)' }}
              >
                KIS Open API는 뉴스 본문 조회를 제공하지 않습니다. 원문을 보시려면
                아래 검색 버튼을 이용하세요.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={`https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(activeNews.title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary text-sm"
                >
                  네이버 뉴스 검색 ↗
                </a>
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(activeNews.title)}&tbm=nws`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline text-sm"
                >
                  구글 뉴스 검색 ↗
                </a>
              </div>
            </div>
          </div>
        )}

        {activeStock && (
          <StockDetailModal
            target={activeStock}
            onClose={() => setActiveStock(null)}
          />
        )}
        {activeOverseas && (
          <OverseasDetailModal
            target={activeOverseas}
            onClose={() => setActiveOverseas(null)}
          />
        )}
        {activeIndex && (
          <IndexDetailModal
            target={activeIndex}
            onClose={() => setActiveIndex(null)}
          />
        )}
        {activeFx && (
          <FxDetailModal
            target={activeFx}
            onClose={() => setActiveFx(null)}
          />
        )}
      </div>
    </main>
  )
}
