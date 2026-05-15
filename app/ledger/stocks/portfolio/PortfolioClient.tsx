'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import DonutChart, {
  type DonutSegment,
} from '../../market/DonutChart'

type HoldingItem = {
  id: string
  name: string
  symbol: string | null
  currency: string
  accountId: string | null
  accountName: string | null
  accountBank: string | null
  accountTypes: string[]
  aggregate: {
    totalInvested: number
    realizedPnL: number
    unrealizedPnL: number | null
    marketValue: number | null
    costBasis: number
  }
}

type FxData = {
  usdKrw: number | null
  jpyKrw: number | null
}

function fmtKRWShort(n: number) {
  const abs = Math.abs(n)
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}조원`
  if (abs >= 1e8) return `${(n / 1e8).toFixed(1)}억원`
  if (abs >= 1e4) return `${(n / 1e4).toFixed(0)}만원`
  return `${Math.round(n).toLocaleString('ko-KR')}원`
}

const TYPE_LABEL: Record<string, string> = {
  STOCK: '일반 주식',
  ISA: 'ISA',
  PENSION: '연금',
  SAVINGS: '저축',
  CHECKING: '입출금',
  EMERGENCY: '비상금',
  SALARY: '급여',
  LIVING: '생활비',
  BUSINESS: '사업',
  SHARED: '공유',
  CORPORATE: '법인',
  FOREIGN_CURRENCY: '외화',
  SHOPPING: '쇼핑',
  CEREMONIAL: '경조사',
  CARD: '카드',
  FIXED_EXPENSE: '고정비',
  TRANSPORT: '교통',
  OTHER: '기타',
}

export default function PortfolioClient() {
  const [holdings, setHoldings] = useState<HoldingItem[]>([])
  const [fx, setFx] = useState<FxData>({ usdKrw: null, jpyKrw: null })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [hRes, fRes] = await Promise.all([
          fetch('/api/holdings', { cache: 'no-store' }),
          fetch('/api/exchange-rates', { cache: 'no-store' }),
        ])
        if (cancelled) return
        if (hRes.ok) {
          const j = (await hRes.json()) as { items: HoldingItem[] }
          setHoldings(j.items)
        }
        if (fRes.ok) {
          const j = (await fRes.json()) as FxData
          setFx(j)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  // 환율 적용해서 KRW 단위 평가금액 계산
  const enriched = useMemo(() => {
    const usdRate = fx.usdKrw ?? 1
    const jpyRate = fx.jpyKrw ?? 1
    return holdings.map((h) => {
      const c = h.currency.toUpperCase()
      const rate =
        c === 'KRW' ? 1 : c === 'USD' ? usdRate : c === 'JPY' ? jpyRate : 1
      const marketKRW =
        h.aggregate.marketValue !== null
          ? h.aggregate.marketValue * rate
          : h.aggregate.totalInvested * rate // 평가금액 없으면 매수원가로 대체
      return {
        ...h,
        marketKRW: Math.max(0, marketKRW),
        invested: h.aggregate.totalInvested * rate,
      }
    })
  }, [holdings, fx])

  const totalKRW = useMemo(
    () => enriched.reduce((s, x) => s + x.marketKRW, 0),
    [enriched]
  )

  // 통화별
  const byCurrency = useMemo<DonutSegment[]>(() => {
    const map = new Map<string, number>()
    for (const h of enriched) {
      const k = h.currency.toUpperCase()
      map.set(k, (map.get(k) ?? 0) + h.marketKRW)
    }
    return Array.from(map.entries()).map(([label, value]) => ({
      label,
      value,
    }))
  }, [enriched])

  // 계좌별
  const byAccount = useMemo<DonutSegment[]>(() => {
    const map = new Map<string, number>()
    for (const h of enriched) {
      const key = h.accountName
        ? `${h.accountName}${h.accountBank ? ` (${h.accountBank})` : ''}`
        : '계좌 미지정'
      map.set(key, (map.get(key) ?? 0) + h.marketKRW)
    }
    return Array.from(map.entries()).map(([label, value]) => ({
      label,
      value,
    }))
  }, [enriched])

  // 계좌 유형별 (STOCK/ISA/PENSION 등)
  const byAccountType = useMemo<DonutSegment[]>(() => {
    const map = new Map<string, number>()
    for (const h of enriched) {
      // 한 계좌가 여러 유형이면 분산해 누적 (대표 1개만 쓸 수도 있지만 시각화 목적상 모두 카운트하면 합이 과장됨)
      // 대신 첫 번째 유형만 사용
      const t = h.accountTypes[0] ?? 'OTHER'
      const label = TYPE_LABEL[t] ?? t
      map.set(label, (map.get(label) ?? 0) + h.marketKRW)
    }
    return Array.from(map.entries()).map(([label, value]) => ({
      label,
      value,
    }))
  }, [enriched])

  // 종목별 (TOP 10 + 기타)
  const bySymbol = useMemo<DonutSegment[]>(() => {
    const sorted = enriched
      .map((h) => ({ label: h.name, value: h.marketKRW }))
      .sort((a, b) => b.value - a.value)
    if (sorted.length <= 10) return sorted
    const top = sorted.slice(0, 9)
    const restTotal = sorted.slice(9).reduce((s, x) => s + x.value, 0)
    return [...top, { label: `기타 ${sorted.length - 9}개`, value: restTotal }]
  }, [enriched])

  return (
    <main className="w-full px-3 py-6 sm:px-4 lg:px-6">
      <div className="grid gap-6">
        {/* 헤더 */}
        <div className="surface card-pad card-hover-border-only">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">포트폴리오 분석</h1>
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                보유 종목 평가금액 기준 — 환율은 현재 시점으로 KRW 환산
              </p>
            </div>
            <Link href="/ledger/stocks" className="btn btn-outline text-xs">
              ← 보유 종목
            </Link>
          </div>
          <div className="mt-3">
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              총 평가금액
            </div>
            <div className="mt-1 text-3xl font-extrabold sm:text-4xl">
              {loading ? '—' : fmtKRWShort(totalKRW)}
            </div>
            <div className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              보유 종목 {enriched.length}개 · USD/KRW{' '}
              {fx.usdKrw !== null ? `₩${fx.usdKrw.toFixed(2)}` : '—'} · JPY/KRW{' '}
              {fx.jpyKrw !== null ? `₩${fx.jpyKrw.toFixed(4)}` : '—'}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="surface card-pad card-hover-border-only">
                <div className="h-48 rounded-md skeleton" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="surface card-pad card-hover-border-only">
              <div className="font-extrabold">종목별 비중 (TOP 10)</div>
              <div className="mt-3">
                <DonutChart
                  segments={bySymbol}
                  centerLabel="종목"
                  centerValue={`${enriched.length}개`}
                />
              </div>
            </div>
            <div className="surface card-pad card-hover-border-only">
              <div className="font-extrabold">통화별 분포</div>
              <div className="mt-3">
                <DonutChart
                  segments={byCurrency}
                  centerLabel="통화"
                  centerValue={`${byCurrency.length}종`}
                />
              </div>
            </div>
            <div className="surface card-pad card-hover-border-only">
              <div className="font-extrabold">계좌별 분포</div>
              <div className="mt-3">
                <DonutChart
                  segments={byAccount}
                  centerLabel="계좌"
                  centerValue={`${byAccount.length}개`}
                />
              </div>
            </div>
            <div className="surface card-pad card-hover-border-only">
              <div className="font-extrabold">계좌 유형별</div>
              <div className="mt-3">
                <DonutChart
                  segments={byAccountType}
                  centerLabel="유형"
                  centerValue={`${byAccountType.length}종`}
                />
              </div>
              <p
                className="mt-2 text-[11px]"
                style={{ color: 'var(--muted)' }}
              >
                계좌가 복수 유형일 때 첫 번째 유형 기준으로 집계
              </p>
            </div>
          </div>
        )}

        {!loading && enriched.length === 0 && (
          <div className="surface card-pad card-hover-border-only">
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              보유 종목이 없습니다. 먼저{' '}
              <Link
                href="/ledger/stocks"
                className="text-blue-500 hover:underline"
              >
                /ledger/stocks
              </Link>
              에서 종목을 추가하세요.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
