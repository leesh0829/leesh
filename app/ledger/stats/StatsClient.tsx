'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '@/app/components/ToastProvider'
import { TYPE_LABEL_KR } from '@/app/lib/accountTypes'
import { LedgerNavBack } from '../LedgerNavIcons'
import DonutChart from '../market/DonutChart'
import { ChartTooltip, useChartHover } from '@/app/components/ChartTooltip'

type Totals = { income: number; expense: number; net: number; count: number }
type AccountAgg = {
  id: string
  name: string
  bankName: string | null
  income: number
  expense: number
  net: number
  count: number
}
type AccountTypeAgg = {
  type: string
  income: number
  expense: number
  net: number
  count: number
}
type CategoryAgg = { category: string; total: number; count: number }
type MonthAgg = { month: string; income: number; expense: number; net: number }
type DayAgg = { day: string; income: number; expense: number; net: number }
type WeekdayAgg = {
  weekday: number
  income: number
  expense: number
  count: number
}
type HourAgg = {
  hour: number
  income: number
  expense: number
  count: number
}
type SubcategoryAgg = {
  category: string
  subcategories: { subcategory: string; total: number }[]
}
type TopTransaction = {
  id: string
  amount: number
  description: string
  category: string
  subcategory: string | null
  accountName: string | null
  occurredAt: string
}
type CategoryDiff = {
  category: string
  current: number
  prev: number
  diff: number
  diffPct: number | null
}
type TransferFlow = {
  from: string
  to: string
  total: number
  count: number
}

type StatsResponse = {
  totals: Totals
  prevTotals: { income: number; expense: number; net: number } | null
  byAccount: AccountAgg[]
  byAccountType: AccountTypeAgg[]
  byCategoryIncome: CategoryAgg[]
  byCategoryExpense: CategoryAgg[]
  bySubcategoryIncome: SubcategoryAgg[]
  bySubcategoryExpense: SubcategoryAgg[]
  byMonth: MonthAgg[]
  byDay: DayAgg[]
  byWeekday: WeekdayAgg[]
  byHour: HourAgg[]
  topIncome: TopTransaction[]
  topExpense: TopTransaction[]
  categoryDiffIncome: CategoryDiff[] | null
  categoryDiffExpense: CategoryDiff[] | null
  transferFlows: TransferFlow[]
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`
}
function toDateInputValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}
function startOfYearAgo(months: number) {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() - months, 1)
}
function dateInputToIso(value: string, endExclusive = false): string | null {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  const dt = new Date(y, m - 1, endExclusive ? d + 1 : d)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString()
}

function formatKRW(n: number) {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  return `${sign}₩${Math.round(abs).toLocaleString('ko-KR')}`
}

// 컬러 팔레트 (카테고리 색)
const PALETTE = [
  '#10b981',
  '#3b82f6',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#6366f1',
  '#f97316',
  '#84cc16',
  '#06b6d4',
  '#a855f7',
]

function colorForIndex(i: number) {
  return PALETTE[i % PALETTE.length]
}

export default function StatsClient() {
  const toast = useToast()
  const [data, setData] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // 기본: 이번 달 (1일 ~ 말일)
  const [periodStart, setPeriodStart] = useState<string>(() =>
    toDateInputValue(startOfMonth(new Date()))
  )
  const [periodEnd, setPeriodEnd] = useState<string>(() =>
    toDateInputValue(endOfMonth(new Date()))
  )

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    const s = dateInputToIso(periodStart)
    const e = dateInputToIso(periodEnd, true)
    if (s) params.set('start', s)
    if (e) params.set('end', e)
    const r = await fetch(`/api/ledger/stats?${params.toString()}`, {
      cache: 'no-store',
    })
    if (!r.ok) {
      setErr('통계 불러오기 실패')
      toast.error('통계 불러오기 실패')
      setLoading(false)
      return
    }
    const d = (await r.json()) as StatsResponse
    setData(d)
    setErr(null)
    setLoading(false)
  }, [periodStart, periodEnd, toast])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(t)
  }, [load])

  const setThisMonth = () => {
    const now = new Date()
    setPeriodStart(toDateInputValue(startOfMonth(now)))
    setPeriodEnd(toDateInputValue(endOfMonth(now)))
  }
  const setLast3Months = () => {
    setPeriodStart(toDateInputValue(startOfYearAgo(2)))
    setPeriodEnd(toDateInputValue(endOfMonth(new Date())))
  }
  const setLast6Months = () => {
    setPeriodStart(toDateInputValue(startOfYearAgo(5)))
    setPeriodEnd(toDateInputValue(endOfMonth(new Date())))
  }
  const setThisYear = () => {
    const y = new Date().getFullYear()
    setPeriodStart(toDateInputValue(new Date(y, 0, 1)))
    setPeriodEnd(toDateInputValue(new Date(y, 11, 31)))
  }
  const setAllTime = () => {
    setPeriodStart('')
    setPeriodEnd('')
  }

  const totals = data?.totals
  const byAccount = useMemo(() => data?.byAccount ?? [], [data])
  const byAccountType = useMemo(() => data?.byAccountType ?? [], [data])
  const byCategoryIncome = useMemo(
    () => data?.byCategoryIncome ?? [],
    [data]
  )
  const byCategoryExpense = useMemo(
    () => data?.byCategoryExpense ?? [],
    [data]
  )
  const byMonth = useMemo(() => data?.byMonth ?? [], [data])
  const byDay = useMemo(() => data?.byDay ?? [], [data])
  const byWeekday = useMemo(() => data?.byWeekday ?? [], [data])
  const byHour = useMemo(() => data?.byHour ?? [], [data])
  const bySubcategoryIncome = useMemo(
    () => data?.bySubcategoryIncome ?? [],
    [data]
  )
  const bySubcategoryExpense = useMemo(
    () => data?.bySubcategoryExpense ?? [],
    [data]
  )
  const topIncome = useMemo(() => data?.topIncome ?? [], [data])
  const topExpense = useMemo(() => data?.topExpense ?? [], [data])
  const categoryDiffIncome = useMemo(
    () => data?.categoryDiffIncome ?? null,
    [data]
  )
  const categoryDiffExpense = useMemo(
    () => data?.categoryDiffExpense ?? null,
    [data]
  )
  const transferFlows = useMemo(() => data?.transferFlows ?? [], [data])
  const prevTotals = data?.prevTotals

  const incomeRate =
    totals && totals.income + totals.expense > 0
      ? (totals.income / (totals.income + totals.expense)) * 100
      : 0
  const savingRate =
    totals && totals.income > 0 ? (totals.net / totals.income) * 100 : null

  // 월간 비교 (가장 최근 2달)
  const lastTwoMonths = useMemo(() => {
    if (byMonth.length < 2) return null
    const a = byMonth[byMonth.length - 2]
    const b = byMonth[byMonth.length - 1]
    return { prev: a, curr: b }
  }, [byMonth])

  // 일평균 / 월말 예측
  const dailyAverage = useMemo(() => {
    if (!byDay.length || !totals) return null
    // 기간 전체 일수가 아닌 "데이터가 있는 일수" 기준
    const days = byDay.length
    return {
      incomePerDay: totals.income / days,
      expensePerDay: totals.expense / days,
      netPerDay: totals.net / days,
      activeDays: days,
    }
  }, [byDay, totals])

  // 월말까지 잔여일 기준 예측 (기간 시작/종료가 이번달이라 가정 — 휴리스틱)
  const monthEndProjection = useMemo(() => {
    if (!periodEnd || !totals) return null
    const end = new Date(periodEnd)
    const today = new Date()
    const start = new Date(periodStart)
    if (today < start || today > end) return null // 현재가 기간 밖이면 의미 없음
    const msPerDay = 86_400_000
    const elapsedDays = Math.max(
      1,
      Math.ceil((today.getTime() - start.getTime()) / msPerDay) + 1
    )
    const remainingDays = Math.max(
      0,
      Math.ceil((end.getTime() - today.getTime()) / msPerDay)
    )
    const dailyExpense = totals.expense / elapsedDays
    const dailyIncome = totals.income / elapsedDays
    return {
      remainingDays,
      projectedExpense: totals.expense + dailyExpense * remainingDays,
      projectedIncome: totals.income + dailyIncome * remainingDays,
    }
  }, [periodEnd, periodStart, totals])

  // 카테고리 → 소분류 펼침 상태
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({})
  const toggleCategory = (cat: string) =>
    setExpandedCategories((p) => ({ ...p, [cat]: !p[cat] }))

  return (
    <main className="w-full px-3 py-6 sm:px-4 lg:px-6">
      <div className="grid gap-6">
        {/* 헤더 */}
        <div className="surface card-pad card-hover-border-only">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">통계 / 분석</h1>
              <p
                className="mt-1 text-sm"
                style={{ color: 'var(--muted)' }}
              >
                기간별 수입·지출 흐름, 계좌별 / 카테고리별 분석.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LedgerNavBack />
            </div>
          </div>

          {err ? (
            <div className="mt-4 card p-3" style={{ color: 'crimson' }}>
              {err}
            </div>
          ) : null}
        </div>

        {/* 기간 선택 */}
        <div className="surface card-pad card-hover-border-only">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-extrabold">기간 설정</div>
            <div className="flex flex-wrap gap-1 text-xs">
              <button
                type="button"
                className="btn btn-outline text-xs"
                onClick={setThisMonth}
              >
                이번 달
              </button>
              <button
                type="button"
                className="btn btn-outline text-xs"
                onClick={setLast3Months}
              >
                최근 3개월
              </button>
              <button
                type="button"
                className="btn btn-outline text-xs"
                onClick={setLast6Months}
              >
                최근 6개월
              </button>
              <button
                type="button"
                className="btn btn-outline text-xs"
                onClick={setThisYear}
              >
                올해
              </button>
              <button
                type="button"
                className="btn btn-outline text-xs"
                onClick={setAllTime}
              >
                전체
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="date"
              className="input"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
            <span style={{ color: 'var(--muted)' }}>~</span>
            <input
              type="date"
              className="input"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="surface card-pad card-hover-border-only">
            <div className="grid gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={`skel-${i}`}
                  className="h-24 rounded-lg skeleton"
                />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* 전체 요약 */}
            <div className="surface card-pad card-hover-border-only">
              <div className="font-extrabold">전체 요약</div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Card
                  label="수입 (+)"
                  value={formatKRW(totals?.income ?? 0)}
                  tone="good"
                />
                <Card
                  label="지출 (−)"
                  value={'−' + formatKRW(totals?.expense ?? 0).replace('-', '')}
                  tone="bad"
                />
                <Card
                  label="순합"
                  value={
                    ((totals?.net ?? 0) >= 0 ? '+' : '') +
                    formatKRW(totals?.net ?? 0)
                  }
                  tone={(totals?.net ?? 0) >= 0 ? 'good' : 'bad'}
                />
                <Card
                  label="저축률"
                  value={
                    savingRate === null
                      ? '—'
                      : `${savingRate.toFixed(1)}%`
                  }
                  tone={
                    savingRate === null
                      ? 'neutral'
                      : savingRate >= 0
                        ? 'good'
                        : 'bad'
                  }
                />
              </div>
              {totals && totals.income + totals.expense > 0 ? (
                <div className="mt-3">
                  <div
                    className="text-xs"
                    style={{ color: 'var(--muted)' }}
                  >
                    수입 대 지출 비율
                  </div>
                  <div
                    className="mt-1 flex h-3 overflow-hidden rounded-full"
                    style={{
                      background: 'color-mix(in srgb, var(--border) 60%, transparent)',
                    }}
                  >
                    <div
                      className="h-full"
                      style={{
                        width: `${incomeRate}%`,
                        background: '#10b981',
                      }}
                    />
                    <div
                      className="h-full"
                      style={{
                        width: `${100 - incomeRate}%`,
                        background: '#ef4444',
                      }}
                    />
                  </div>
                  <div
                    className="mt-1 flex justify-between text-xs"
                    style={{ color: 'var(--muted)' }}
                  >
                    <span>수입 {incomeRate.toFixed(1)}%</span>
                    <span>지출 {(100 - incomeRate).toFixed(1)}%</span>
                  </div>
                </div>
              ) : null}
              <p
                className="mt-3 text-xs"
                style={{ color: 'var(--muted)' }}
              >
                저축률 = 순합 ÷ 수입 × 100 (양수일수록 좋음). 합계 제외 항목은
                통계에서 빠집니다.
              </p>
            </div>

            {/* 페이스: 일평균 + 월말 예측 + 전 기간 대비 */}
            {(dailyAverage || monthEndProjection || prevTotals) && (
              <div className="surface card-pad card-hover-border-only">
                <div className="font-extrabold">페이스 / 비교</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {dailyAverage && (
                    <div className="card p-3">
                      <div
                        className="text-xs"
                        style={{ color: 'var(--muted)' }}
                      >
                        일평균 (활동 {dailyAverage.activeDays}일 기준)
                      </div>
                      <div className="mt-1 text-sm">
                        수입{' '}
                        <span className="font-bold text-emerald-500">
                          +{formatKRW(dailyAverage.incomePerDay)}
                        </span>
                      </div>
                      <div className="text-sm">
                        지출{' '}
                        <span className="font-bold text-red-500">
                          −{formatKRW(dailyAverage.expensePerDay)}
                        </span>
                      </div>
                      <div className="text-sm">
                        순합{' '}
                        <span
                          className={
                            'font-bold ' +
                            (dailyAverage.netPerDay >= 0
                              ? 'text-emerald-500'
                              : 'text-red-500')
                          }
                        >
                          {dailyAverage.netPerDay >= 0 ? '+' : ''}
                          {formatKRW(dailyAverage.netPerDay)}
                        </span>
                      </div>
                    </div>
                  )}
                  {monthEndProjection && (
                    <div className="card p-3">
                      <div
                        className="text-xs"
                        style={{ color: 'var(--muted)' }}
                      >
                        기간 종료까지 예측 ({monthEndProjection.remainingDays}일 남음)
                      </div>
                      <div className="mt-1 text-sm">
                        예상 수입{' '}
                        <span className="font-bold text-emerald-500">
                          {formatKRW(monthEndProjection.projectedIncome)}
                        </span>
                      </div>
                      <div className="text-sm">
                        예상 지출{' '}
                        <span className="font-bold text-red-500">
                          {formatKRW(monthEndProjection.projectedExpense)}
                        </span>
                      </div>
                      <div
                        className="mt-1 text-[10px]"
                        style={{ color: 'var(--muted)' }}
                      >
                        현재 페이스 단순 외삽
                      </div>
                    </div>
                  )}
                  {prevTotals && totals && (
                    <div className="card p-3">
                      <div
                        className="text-xs"
                        style={{ color: 'var(--muted)' }}
                      >
                        직전 동기간 대비
                      </div>
                      {(['income', 'expense', 'net'] as const).map((k) => {
                        const cur = totals[k]
                        const prev = prevTotals[k]
                        const diff = cur - prev
                        const pct = prev !== 0 ? (diff / Math.abs(prev)) * 100 : null
                        const label = k === 'income' ? '수입' : k === 'expense' ? '지출' : '순합'
                        // 지출은 줄어드는 게 좋음 — 색 반대
                        const goodDir = k === 'expense' ? -1 : 1
                        const tone = diff * goodDir > 0 ? 'text-emerald-500' : diff * goodDir < 0 ? 'text-red-500' : ''
                        return (
                          <div key={k} className="text-sm">
                            {label}{' '}
                            <span className={'font-bold ' + tone}>
                              {diff >= 0 ? '+' : ''}
                              {formatKRW(diff)}
                            </span>
                            {pct !== null && (
                              <span
                                className="ml-1 text-xs"
                                style={{ color: 'var(--muted)' }}
                              >
                                ({pct >= 0 ? '+' : ''}
                                {pct.toFixed(1)}%)
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 일별 추이 라인 + 누적 영역 */}
            {byDay.length > 0 && (
              <div className="surface card-pad card-hover-border-only">
                <div className="font-extrabold">일별 추이</div>
                <DayLineChart data={byDay} />
                <p
                  className="mt-2 text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  거래가 발생한 날만 표시. 누적 라인은 시작일부터 현재까지의 순합 누적.
                </p>
              </div>
            )}

            {/* 요일별 평균 */}
            {byWeekday.some((w) => w.count > 0) && (
              <div className="surface card-pad card-hover-border-only">
                <div className="font-extrabold">요일별 평균</div>
                <WeekdayBarChart data={byWeekday} />
                <p
                  className="mt-2 text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  요일마다 거래 발생 횟수가 다르므로 평균(건당)으로 비교
                </p>
              </div>
            )}

            {/* 시간별 패턴 (0h~23h) */}
            {byHour.some((h) => h.count > 0) && (
              <div className="surface card-pad card-hover-border-only">
                <div className="font-extrabold">시간별 패턴</div>
                <HourBarChart data={byHour} />
                <p
                  className="mt-2 text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  거래가 기록된 시각(occurredAt) 기준 0시~23시 — 합계 + 건수
                </p>
              </div>
            )}

            {/* 카테고리 도넛 (지출) */}
            {byCategoryExpense.length > 0 && (
              <div className="surface card-pad card-hover-border-only">
                <div className="font-extrabold">지출 카테고리 분포</div>
                <div className="mt-3">
                  <DonutChart
                    segments={byCategoryExpense.map((c, i) => ({
                      label: c.category,
                      value: c.total,
                      color: colorForIndex(i),
                    }))}
                    centerLabel="카테고리"
                    centerValue={`${byCategoryExpense.length}개`}
                  />
                </div>
              </div>
            )}

            {/* 카테고리 도넛 (수입) */}
            {byCategoryIncome.length > 0 && (
              <div className="surface card-pad card-hover-border-only">
                <div className="font-extrabold">수입 카테고리 분포</div>
                <div className="mt-3">
                  <DonutChart
                    segments={byCategoryIncome.map((c, i) => ({
                      label: c.category,
                      value: c.total,
                      color: colorForIndex(i),
                    }))}
                    centerLabel="카테고리"
                    centerValue={`${byCategoryIncome.length}개`}
                  />
                </div>
              </div>
            )}

            {/* 카테고리 × 소분류 드릴다운 (지출) */}
            {bySubcategoryExpense.length > 0 && (
              <div className="surface card-pad card-hover-border-only">
                <div className="font-extrabold">지출 — 카테고리 / 소분류</div>
                <div className="mt-3 grid gap-1.5">
                  {byCategoryExpense.map((c) => {
                    const sub = bySubcategoryExpense.find(
                      (s) => s.category === c.category
                    )
                    const isOpen = expandedCategories[c.category] === true
                    const max = byCategoryExpense[0].total || 1
                    return (
                      <div
                        key={c.category}
                        className="rounded-md border p-2"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <button
                          type="button"
                          onClick={() => toggleCategory(c.category)}
                          className="flex w-full items-center gap-2 text-left"
                        >
                          <span className="font-semibold">{c.category}</span>
                          <div
                            className="flex-1 h-2 rounded-full overflow-hidden"
                            style={{
                              background: 'color-mix(in srgb, var(--border) 60%, transparent)',
                            }}
                          >
                            <div
                              className="h-full"
                              style={{
                                width: `${(c.total / max) * 100}%`,
                                background: '#ef4444',
                              }}
                            />
                          </div>
                          <span className="font-mono text-sm font-bold text-red-500">
                            {formatKRW(c.total)}
                          </span>
                          <span
                            className="text-xs w-3 text-center"
                            style={{ color: 'var(--muted)' }}
                          >
                            {isOpen ? '▼' : '▶'}
                          </span>
                        </button>
                        {isOpen && sub && (
                          <ul className="mt-2 grid gap-1 pl-3 border-l text-sm" style={{ borderColor: 'var(--border)' }}>
                            {sub.subcategories.map((s) => (
                              <li
                                key={s.subcategory}
                                className="flex items-center justify-between"
                              >
                                <span
                                  className="truncate"
                                  style={{ color: 'var(--muted)' }}
                                >
                                  {s.subcategory}
                                </span>
                                <span className="font-mono">
                                  {formatKRW(s.total)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 카테고리 × 소분류 드릴다운 (수입) */}
            {bySubcategoryIncome.length > 0 && (
              <div className="surface card-pad card-hover-border-only">
                <div className="font-extrabold">수입 — 카테고리 / 소분류</div>
                <div className="mt-3 grid gap-1.5">
                  {byCategoryIncome.map((c) => {
                    const sub = bySubcategoryIncome.find(
                      (s) => s.category === c.category
                    )
                    const key = `inc_${c.category}`
                    const isOpen = expandedCategories[key] === true
                    const max = byCategoryIncome[0].total || 1
                    return (
                      <div
                        key={key}
                        className="rounded-md border p-2"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <button
                          type="button"
                          onClick={() => toggleCategory(key)}
                          className="flex w-full items-center gap-2 text-left"
                        >
                          <span className="font-semibold">{c.category}</span>
                          <div
                            className="flex-1 h-2 rounded-full overflow-hidden"
                            style={{
                              background: 'color-mix(in srgb, var(--border) 60%, transparent)',
                            }}
                          >
                            <div
                              className="h-full"
                              style={{
                                width: `${(c.total / max) * 100}%`,
                                background: '#10b981',
                              }}
                            />
                          </div>
                          <span className="font-mono text-sm font-bold text-emerald-500">
                            {formatKRW(c.total)}
                          </span>
                          <span
                            className="text-xs w-3 text-center"
                            style={{ color: 'var(--muted)' }}
                          >
                            {isOpen ? '▼' : '▶'}
                          </span>
                        </button>
                        {isOpen && sub && (
                          <ul className="mt-2 grid gap-1 pl-3 border-l text-sm" style={{ borderColor: 'var(--border)' }}>
                            {sub.subcategories.map((s) => (
                              <li
                                key={s.subcategory}
                                className="flex items-center justify-between"
                              >
                                <span
                                  className="truncate"
                                  style={{ color: 'var(--muted)' }}
                                >
                                  {s.subcategory}
                                </span>
                                <span className="font-mono">
                                  {formatKRW(s.total)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 카테고리 변동 hot list */}
            {(categoryDiffExpense || categoryDiffIncome) && (
              <div className="surface card-pad card-hover-border-only">
                <div className="font-extrabold">직전 기간 대비 카테고리 변동</div>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {categoryDiffExpense && categoryDiffExpense.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                        지출
                      </div>
                      <ul className="mt-1 grid gap-1 text-sm">
                        {categoryDiffExpense.slice(0, 8).map((d) => (
                          <li key={d.category} className="flex items-center justify-between">
                            <span className="truncate">{d.category}</span>
                            <span
                              className={
                                'font-mono ' +
                                (d.diff > 0 ? 'text-red-500' : d.diff < 0 ? 'text-emerald-500' : '')
                              }
                            >
                              {d.diff > 0 ? '+' : ''}
                              {formatKRW(d.diff)}
                              {d.diffPct !== null && (
                                <span className="ml-1 text-xs opacity-70">
                                  ({d.diffPct >= 0 ? '+' : ''}
                                  {d.diffPct.toFixed(0)}%)
                                </span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {categoryDiffIncome && categoryDiffIncome.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                        수입
                      </div>
                      <ul className="mt-1 grid gap-1 text-sm">
                        {categoryDiffIncome.slice(0, 8).map((d) => (
                          <li key={d.category} className="flex items-center justify-between">
                            <span className="truncate">{d.category}</span>
                            <span
                              className={
                                'font-mono ' +
                                (d.diff > 0 ? 'text-emerald-500' : d.diff < 0 ? 'text-red-500' : '')
                              }
                            >
                              {d.diff > 0 ? '+' : ''}
                              {formatKRW(d.diff)}
                              {d.diffPct !== null && (
                                <span className="ml-1 text-xs opacity-70">
                                  ({d.diffPct >= 0 ? '+' : ''}
                                  {d.diffPct.toFixed(0)}%)
                                </span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
                  기간 길이가 같은 직전 구간과 비교. 지출은 −가 좋음(초록), +가 나쁨(빨강).
                </p>
              </div>
            )}

            {/* Top 단건 거래 */}
            {(topExpense.length > 0 || topIncome.length > 0) && (
              <div className="surface card-pad card-hover-border-only">
                <div className="font-extrabold">Top 단건 거래</div>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {topExpense.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-red-500">
                        지출 TOP 5
                      </div>
                      <ul className="mt-1 grid gap-1 text-sm">
                        {topExpense.map((t) => (
                          <li key={t.id} className="flex items-baseline justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-semibold">
                                {t.description || t.category}
                              </div>
                              <div
                                className="text-[11px]"
                                style={{ color: 'var(--muted)' }}
                              >
                                {t.occurredAt.slice(0, 10)}
                                {t.accountName ? ` · ${t.accountName}` : ''}
                                {' · ' + t.category}
                              </div>
                            </div>
                            <div className="font-bold text-red-500 shrink-0">
                              −{formatKRW(t.amount)}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {topIncome.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-emerald-500">
                        수입 TOP 5
                      </div>
                      <ul className="mt-1 grid gap-1 text-sm">
                        {topIncome.map((t) => (
                          <li key={t.id} className="flex items-baseline justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-semibold">
                                {t.description || t.category}
                              </div>
                              <div
                                className="text-[11px]"
                                style={{ color: 'var(--muted)' }}
                              >
                                {t.occurredAt.slice(0, 10)}
                                {t.accountName ? ` · ${t.accountName}` : ''}
                                {' · ' + t.category}
                              </div>
                            </div>
                            <div className="font-bold text-emerald-500 shrink-0">
                              +{formatKRW(t.amount)}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 계좌간 이체 흐름 */}
            {transferFlows.length > 0 && (
              <div className="surface card-pad card-hover-border-only">
                <div className="font-extrabold">계좌간 이체 흐름</div>
                <ul className="mt-3 grid gap-1.5">
                  {transferFlows.map((f, i) => {
                    const max = transferFlows[0].total || 1
                    return (
                      <li
                        key={`${f.from}->${f.to}-${i}`}
                        className="rounded-md border p-2"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <div className="truncate">
                            <span className="font-semibold">{f.from}</span>
                            <span className="mx-1" style={{ color: 'var(--muted)' }}>
                              →
                            </span>
                            <span className="font-semibold">{f.to}</span>
                          </div>
                          <div className="shrink-0 font-mono font-bold">
                            {formatKRW(f.total)}
                          </div>
                        </div>
                        <div
                          className="mt-1 h-1.5 rounded-full overflow-hidden"
                          style={{
                            background: 'color-mix(in srgb, var(--border) 60%, transparent)',
                          }}
                        >
                          <div
                            className="h-full"
                            style={{
                              width: `${(f.total / max) * 100}%`,
                              background: '#8b5cf6',
                            }}
                          />
                        </div>
                        <div
                          className="mt-0.5 text-[10px]"
                          style={{ color: 'var(--muted)' }}
                        >
                          {f.count}건
                        </div>
                      </li>
                    )
                  })}
                </ul>
                <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
                  합계 제외 + 카테고리 &quot;계좌이체&quot;인 항목을 시각+금액 기준으로 출금/입금 페어로 묶음
                </p>
              </div>
            )}

            {/* 월별 추이 */}
            {byMonth.length > 0 ? (
              <div className="surface card-pad card-hover-border-only">
                <div className="font-extrabold">월별 추이</div>
                <MonthBarChart data={byMonth} />
                {lastTwoMonths ? (
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <Card
                      label={`${lastTwoMonths.curr.month} 수입`}
                      value={formatKRW(lastTwoMonths.curr.income)}
                      delta={lastTwoMonths.curr.income - lastTwoMonths.prev.income}
                      tone="good"
                    />
                    <Card
                      label={`${lastTwoMonths.curr.month} 지출`}
                      value={formatKRW(lastTwoMonths.curr.expense)}
                      delta={lastTwoMonths.curr.expense - lastTwoMonths.prev.expense}
                      tone="bad"
                      flipDelta
                    />
                    <Card
                      label={`${lastTwoMonths.curr.month} 순합`}
                      value={
                        (lastTwoMonths.curr.net >= 0 ? '+' : '') +
                        formatKRW(lastTwoMonths.curr.net)
                      }
                      delta={lastTwoMonths.curr.net - lastTwoMonths.prev.net}
                      tone={lastTwoMonths.curr.net >= 0 ? 'good' : 'bad'}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* 계좌별 분석 */}
            {byAccount.length > 0 ? (
              <div className="surface card-pad card-hover-border-only">
                <div className="font-extrabold">계좌별 분석</div>
                <div className="mt-3 grid gap-2">
                  {byAccount.map((a) => (
                    <AccountRow key={a.id} item={a} />
                  ))}
                </div>
              </div>
            ) : null}

            {/* 용도(타입)별 분석 — 한 계좌가 여러 태그면 각 태그에 합산 */}
            {byAccountType.length > 0 ? (
              <div className="surface card-pad card-hover-border-only">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-extrabold">용도별 분석</div>
                  <span
                    className="text-xs"
                    style={{ color: 'var(--muted)' }}
                  >
                    한 계좌가 여러 용도면 각 용도에 중복 합산됩니다
                  </span>
                </div>
                <div className="mt-3 grid gap-2">
                  {byAccountType.map((t) => (
                    <AccountTypeRow key={t.type} item={t} />
                  ))}
                </div>
              </div>
            ) : null}

            {/* 카테고리별 분석 */}
            <div className="grid gap-6 md:grid-cols-2">
              <div className="surface card-pad card-hover-border-only">
                <div className="font-extrabold">카테고리별 수입</div>
                {byCategoryIncome.length === 0 ? (
                  <div
                    className="mt-3 text-sm"
                    style={{ color: 'var(--muted)' }}
                  >
                    수입 항목이 없습니다.
                  </div>
                ) : (
                  <>
                    <Donut data={byCategoryIncome} />
                    <CategoryList data={byCategoryIncome} tone="good" />
                  </>
                )}
              </div>

              <div className="surface card-pad card-hover-border-only">
                <div className="font-extrabold">카테고리별 지출</div>
                {byCategoryExpense.length === 0 ? (
                  <div
                    className="mt-3 text-sm"
                    style={{ color: 'var(--muted)' }}
                  >
                    지출 항목이 없습니다.
                  </div>
                ) : (
                  <>
                    <Donut data={byCategoryExpense} />
                    <CategoryList data={byCategoryExpense} tone="bad" />
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

function Card({
  label,
  value,
  tone = 'neutral',
  delta,
  flipDelta,
}: {
  label: string
  value: string
  tone?: 'good' | 'bad' | 'neutral'
  delta?: number
  flipDelta?: boolean
}) {
  const color =
    tone === 'good' ? 'text-emerald-500' : tone === 'bad' ? 'text-red-500' : ''
  let deltaText: string | null = null
  let deltaColor = ''
  if (delta !== undefined) {
    const isImprovement = flipDelta ? delta < 0 : delta > 0
    const sign = delta > 0 ? '+' : delta < 0 ? '−' : ''
    deltaText = `${sign}${formatKRW(Math.abs(delta))}`
    deltaColor = isImprovement ? 'text-emerald-500' : delta === 0 ? '' : 'text-red-500'
  }
  return (
    <div className="card p-3 card-hover-border-only">
      <div className="text-xs" style={{ color: 'var(--muted)' }}>
        {label}
      </div>
      <div className={'mt-1 text-base font-extrabold ' + color}>{value}</div>
      {deltaText ? (
        <div className={'mt-1 text-xs ' + deltaColor}>
          전기 대비 {deltaText}
        </div>
      ) : null}
    </div>
  )
}

function MonthBarChart({ data }: { data: MonthAgg[] }) {
  const maxVal = Math.max(
    1,
    ...data.map((d) => Math.max(d.income, d.expense))
  )
  const W = 600
  const H = 200
  const padding = { top: 10, right: 10, bottom: 30, left: 10 }
  const innerW = W - padding.left - padding.right
  const innerH = H - padding.top - padding.bottom
  const groupW = innerW / data.length
  const barW = Math.max(4, (groupW - 6) / 2)

  const { ref, pos, hovered, onMove, onLeave, show } = useChartHover<{
    item: MonthAgg
    side: 'income' | 'expense' | 'group'
  }>()

  return (
    <div
      ref={ref}
      className="mt-3 overflow-x-auto relative"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ maxHeight: H, minWidth: 480 }}
        aria-label="월별 수입/지출 차트"
      >
        {/* 가로 가이드라인 */}
        {[0.25, 0.5, 0.75, 1].map((p, i) => (
          <line
            key={`grid-${i}`}
            x1={padding.left}
            x2={padding.left + innerW}
            y1={padding.top + innerH * (1 - p)}
            y2={padding.top + innerH * (1 - p)}
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray="2 4"
            opacity={0.5}
          />
        ))}
        {data.map((d, i) => {
          const x = padding.left + groupW * i + groupW / 2
          const incomeH = (d.income / maxVal) * innerH
          const expenseH = (d.expense / maxVal) * innerH
          return (
            <g key={d.month}>
              {/* 그룹 영역 호버용 투명 박스 — 막대 사이 빈 공간도 잡아줌 */}
              <rect
                x={padding.left + groupW * i}
                y={padding.top}
                width={groupW}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => show({ item: d, side: 'group' })}
              />
              <rect
                x={x - barW - 2}
                y={padding.top + innerH - incomeH}
                width={barW}
                height={incomeH}
                fill="#10b981"
                rx="2"
                onMouseEnter={() => show({ item: d, side: 'income' })}
              >
                <title>
                  {d.month} 수입: {formatKRW(d.income)}
                </title>
              </rect>
              <rect
                x={x + 2}
                y={padding.top + innerH - expenseH}
                width={barW}
                height={expenseH}
                fill="#ef4444"
                rx="2"
                onMouseEnter={() => show({ item: d, side: 'expense' })}
              >
                <title>
                  {d.month} 지출: {formatKRW(d.expense)}
                </title>
              </rect>
              <text
                x={x}
                y={padding.top + innerH + 16}
                textAnchor="middle"
                fontSize="10"
                fill="var(--muted)"
              >
                {d.month.slice(2)}
              </text>
            </g>
          )
        })}
      </svg>
      <ChartTooltip pos={pos} visible={!!hovered}>
        {hovered && (
          <>
            <div className="font-bold mb-0.5">{hovered.item.month}</div>
            <div className="text-emerald-500">
              수입 {formatKRW(hovered.item.income)}
            </div>
            <div className="text-red-500">
              지출 {formatKRW(hovered.item.expense)}
            </div>
            <div
              className={
                'mt-0.5 ' +
                (hovered.item.net >= 0 ? 'text-emerald-500' : 'text-red-500')
              }
            >
              순액 {hovered.item.net >= 0 ? '+' : ''}
              {formatKRW(hovered.item.net)}
            </div>
          </>
        )}
      </ChartTooltip>
      <div className="mt-1 flex justify-end gap-3 text-xs">
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ background: '#10b981' }}
          />
          수입
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ background: '#ef4444' }}
          />
          지출
        </span>
      </div>
    </div>
  )
}

function Donut({ data }: { data: CategoryAgg[] }) {
  const total = data.reduce((s, d) => s + d.total, 0)
  const { ref, pos, hovered, onMove, onLeave, show } = useChartHover<{
    item: CategoryAgg
    pct: number
  }>()
  if (total === 0) return null
  const W = 200
  const R = 80
  const r = 50
  // 미리 각 segment의 시작/끝 누적값 계산 (mutation 없이)
  const slices = data.reduce<{ start: number; end: number }[]>((acc, d) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].end : 0
    acc.push({ start: prev, end: prev + d.total })
    return acc
  }, [])
  return (
    <div
      ref={ref}
      className="mt-3 flex justify-center relative"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <svg viewBox={`0 0 ${W} ${W}`} className="w-44 h-44">
        {data.map((d, i) => {
          const value = d.total
          const slice = slices[i]
          const a0 = (slice.start / total) * Math.PI * 2 - Math.PI / 2
          const a1 = (slice.end / total) * Math.PI * 2 - Math.PI / 2
          const large = a1 - a0 > Math.PI ? 1 : 0
          const cx = W / 2
          const cy = W / 2
          const x0 = cx + R * Math.cos(a0)
          const y0 = cy + R * Math.sin(a0)
          const x1 = cx + R * Math.cos(a1)
          const y1 = cy + R * Math.sin(a1)
          const xi0 = cx + r * Math.cos(a0)
          const yi0 = cy + r * Math.sin(a0)
          const xi1 = cx + r * Math.cos(a1)
          const yi1 = cy + r * Math.sin(a1)
          const path = [
            `M ${x0} ${y0}`,
            `A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`,
            `L ${xi1} ${yi1}`,
            `A ${r} ${r} 0 ${large} 0 ${xi0} ${yi0}`,
            'Z',
          ].join(' ')
          const pct = (value / total) * 100
          return (
            <path
              key={d.category}
              d={path}
              fill={colorForIndex(i)}
              onMouseEnter={() => show({ item: d, pct })}
            >
              <title>
                {d.category}: {formatKRW(d.total)} ({pct.toFixed(1)}%)
              </title>
            </path>
          )
        })}
      </svg>
      <ChartTooltip pos={pos} visible={!!hovered}>
        {hovered && (
          <>
            <div className="font-bold mb-0.5">{hovered.item.category}</div>
            <div>금액 {formatKRW(hovered.item.total)}</div>
            <div style={{ color: 'var(--muted)' }}>
              비율 {hovered.pct.toFixed(1)}% · {hovered.item.count}건
            </div>
          </>
        )}
      </ChartTooltip>
    </div>
  )
}

function CategoryList({
  data,
  tone,
}: {
  data: CategoryAgg[]
  tone: 'good' | 'bad'
}) {
  const total = data.reduce((s, d) => s + d.total, 0)
  return (
    <div className="mt-3 grid gap-1.5">
      {data.map((d, i) => {
        const pct = total > 0 ? (d.total / total) * 100 : 0
        return (
          <div key={d.category}>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ background: colorForIndex(i) }}
                />
                <span>{d.category}</span>
                <span
                  className="text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  {d.count}건
                </span>
              </span>
              <span
                className={
                  'font-semibold ' +
                  (tone === 'good' ? 'text-emerald-500' : 'text-red-500')
                }
              >
                {formatKRW(d.total)}
                <span
                  className="ml-2 text-xs font-normal"
                  style={{ color: 'var(--muted)' }}
                >
                  {pct.toFixed(1)}%
                </span>
              </span>
            </div>
            <div
              className="mt-0.5 h-1 overflow-hidden rounded-full"
              style={{
                background: 'color-mix(in srgb, var(--border) 60%, transparent)',
              }}
            >
              <div
                className="h-full"
                style={{
                  width: `${pct}%`,
                  background: colorForIndex(i),
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AccountTypeRow({ item }: { item: AccountTypeAgg }) {
  const total = item.income + item.expense
  const incomePct = total > 0 ? (item.income / total) * 100 : 0
  const label =
    item.type === '__none__'
      ? '용도 미지정'
      : (TYPE_LABEL_KR[item.type as keyof typeof TYPE_LABEL_KR] ?? item.type)
  return (
    <div className="card p-3 card-hover-border-only">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{label}</span>
          <span className="badge">{item.count}건</span>
        </div>
        <div
          className={
            'font-extrabold ' +
            (item.net >= 0 ? 'text-emerald-500' : 'text-red-500')
          }
        >
          {item.net >= 0 ? '+' : ''}
          {formatKRW(item.net)}
        </div>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1 text-xs">
        <span className="text-emerald-500 font-semibold">
          +{formatKRW(item.income)}
        </span>
        <span className="text-red-500 font-semibold text-right sm:text-left">
          −{formatKRW(item.expense)}
        </span>
      </div>
      {total > 0 ? (
        <div
          className="mt-2 flex h-2 overflow-hidden rounded-full"
          style={{
            background: 'color-mix(in srgb, var(--border) 60%, transparent)',
          }}
        >
          <div
            className="h-full"
            style={{ width: `${incomePct}%`, background: '#10b981' }}
          />
          <div
            className="h-full"
            style={{ width: `${100 - incomePct}%`, background: '#ef4444' }}
          />
        </div>
      ) : null}
    </div>
  )
}

function AccountRow({ item }: { item: AccountAgg }) {
  const total = item.income + item.expense
  const incomePct = total > 0 ? (item.income / total) * 100 : 0
  return (
    <div className="card p-3 card-hover-border-only">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{item.name}</span>
          {item.bankName ? (
            <span
              className="text-xs"
              style={{ color: 'var(--muted)' }}
            >
              {item.bankName}
            </span>
          ) : null}
          <span className="badge">{item.count}건</span>
        </div>
        <div
          className={
            'font-extrabold ' +
            (item.net >= 0 ? 'text-emerald-500' : 'text-red-500')
          }
        >
          {item.net >= 0 ? '+' : ''}
          {formatKRW(item.net)}
        </div>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1 text-xs">
        <span className="text-emerald-500 font-semibold">
          +{formatKRW(item.income)}
        </span>
        <span className="text-red-500 font-semibold text-right sm:text-left">
          −{formatKRW(item.expense)}
        </span>
      </div>
      {total > 0 ? (
        <div
          className="mt-2 flex h-2 overflow-hidden rounded-full"
          style={{
            background: 'color-mix(in srgb, var(--border) 60%, transparent)',
          }}
        >
          <div
            className="h-full"
            style={{ width: `${incomePct}%`, background: '#10b981' }}
          />
          <div
            className="h-full"
            style={{ width: `${100 - incomePct}%`, background: '#ef4444' }}
          />
        </div>
      ) : null}
    </div>
  )
}


function DayLineChart({ data }: { data: DayAgg[] }) {
  const { ref, pos, hovered, onMove, onLeave, show } = useChartHover<{
    item: DayAgg
    cumulative: number
  }>()
  if (data.length === 0) return null
  const W = 720
  const H = 220
  const padL = 8
  const padR = 50
  const padT = 12
  const padB = 22
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  // 누적 net
  const cumulative: number[] = []
  let acc = 0
  for (const d of data) {
    acc += d.net
    cumulative.push(acc)
  }
  const allVals = [
    ...data.map((d) => d.income),
    ...data.map((d) => d.expense),
    ...cumulative,
    0,
  ]
  const max = Math.max(...allVals)
  const min = Math.min(...allVals)
  const range = max - min || 1
  function y(v: number) {
    return padT + (1 - (v - min) / range) * innerH
  }
  function x(i: number) {
    return data.length <= 1
      ? padL
      : padL + (i / (data.length - 1)) * innerW
  }
  // 데이터 인덱스별 hover-strip 폭
  const stripW = data.length <= 1 ? innerW : innerW / data.length
  function makePath(values: number[]) {
    return values
      .map((v, i) => (i === 0 ? `M${x(i)},${y(v)}` : `L${x(i)},${y(v)}`))
      .join(' ')
  }
  // x축 라벨 5개
  const labels: { x: number; text: string }[] = []
  const n = Math.min(5, data.length)
  for (let i = 0; i < n; i++) {
    const idx = Math.round(((data.length - 1) * i) / Math.max(1, n - 1))
    labels.push({
      x: x(idx),
      text: data[idx].day.slice(5), // MM-DD
    })
  }
  return (
    <div
      ref={ref}
      className="relative"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="block">
      {/* 0 라인 */}
      <line
        x1={padL}
        x2={W - padR}
        y1={y(0)}
        y2={y(0)}
        stroke="currentColor"
        strokeOpacity={0.2}
        strokeDasharray="2 2"
      />
      {/* 수입 영역 */}
      <path
        d={
          makePath(data.map((d) => d.income)) +
          ` L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`
        }
        fill="#10b981"
        fillOpacity={0.12}
        stroke="#10b981"
        strokeWidth={1.2}
      />
      {/* 지출 영역 */}
      <path
        d={
          makePath(data.map((d) => -d.expense)) +
          ` L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`
        }
        fill="#ef4444"
        fillOpacity={0.12}
        stroke="#ef4444"
        strokeWidth={1.2}
      />
      {/* 누적 순합 */}
      <path
        d={makePath(cumulative)}
        fill="none"
        stroke="#8b5cf6"
        strokeWidth={1.6}
      />
      {/* y축 라벨 */}
      <text
        x={W - padR + 4}
        y={y(max) + 4}
        fontSize={10}
        fill="currentColor"
        opacity={0.55}
      >
        {Math.round(max / 10000)}만
      </text>
      <text
        x={W - padR + 4}
        y={y(min) + 4}
        fontSize={10}
        fill="currentColor"
        opacity={0.55}
      >
        {Math.round(min / 10000)}만
      </text>
      {/* x축 라벨 */}
      {labels.map((l, i) => (
        <text
          key={i}
          x={l.x}
          y={H - 4}
          fontSize={10}
          fill="currentColor"
          opacity={0.55}
          textAnchor="middle"
        >
          {l.text}
        </text>
      ))}
      {/* 범례 */}
      <g transform={`translate(${padL}, ${padT})`}>
        <rect x={0} y={0} width={8} height={8} fill="#10b981" />
        <text x={12} y={8} fontSize={10} fill="currentColor" opacity={0.7}>
          수입
        </text>
        <rect x={50} y={0} width={8} height={8} fill="#ef4444" />
        <text x={62} y={8} fontSize={10} fill="currentColor" opacity={0.7}>
          지출
        </text>
        <rect x={100} y={0} width={8} height={8} fill="#8b5cf6" />
        <text x={112} y={8} fontSize={10} fill="currentColor" opacity={0.7}>
          누적 순합
        </text>
      </g>
      {/* 호버 잡이용 투명 strip + 호버 시 세로 가이드 */}
      {data.map((d, i) => {
        const cx = x(i)
        const isHover =
          hovered && hovered.item.day === d.day
        return (
          <g key={`hov-${d.day}`}>
            {isHover && (
              <line
                x1={cx}
                x2={cx}
                y1={padT}
                y2={padT + innerH}
                stroke="currentColor"
                strokeOpacity={0.35}
                strokeDasharray="2 2"
                strokeWidth={1}
              />
            )}
            <rect
              x={cx - stripW / 2}
              y={padT}
              width={stripW}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => show({ item: d, cumulative: cumulative[i] })}
            />
          </g>
        )
      })}
    </svg>
    <ChartTooltip pos={pos} visible={!!hovered}>
      {hovered && (
        <>
          <div className="font-bold mb-0.5">{hovered.item.day}</div>
          <div className="text-emerald-500">
            수입 {formatKRW(hovered.item.income)}
          </div>
          <div className="text-red-500">
            지출 {formatKRW(hovered.item.expense)}
          </div>
          <div
            className={
              hovered.item.net >= 0 ? 'text-emerald-500' : 'text-red-500'
            }
          >
            순액 {hovered.item.net >= 0 ? '+' : ''}
            {formatKRW(hovered.item.net)}
          </div>
          <div className="mt-0.5" style={{ color: '#8b5cf6' }}>
            누적 {hovered.cumulative >= 0 ? '+' : ''}
            {formatKRW(hovered.cumulative)}
          </div>
        </>
      )}
    </ChartTooltip>
    </div>
  )
}

function WeekdayBarChart({ data }: { data: WeekdayAgg[] }) {
  const wdays = ['일', '월', '화', '수', '목', '금', '토']
  // 건당 평균
  const stats = data.map((d) => ({
    weekday: d.weekday,
    income: d.income,
    expense: d.expense,
    incomeAvg: d.count > 0 ? d.income / d.count : 0,
    expenseAvg: d.count > 0 ? d.expense / d.count : 0,
    count: d.count,
  }))
  const max = Math.max(
    ...stats.map((s) => Math.max(s.incomeAvg, s.expenseAvg)),
    1
  )
  const W = 720
  const H = 200
  const padL = 30
  const padR = 8
  const padT = 12
  const padB = 24
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const slot = innerW / 7
  const barW = (slot - 8) / 2
  const { ref, pos, hovered, onMove, onLeave, show } = useChartHover<
    (typeof stats)[number]
  >()
  return (
    <div
      ref={ref}
      className="relative"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="block">
      {stats.map((s, i) => {
        const cx = padL + slot * i + slot / 2
        const incH = (s.incomeAvg / max) * innerH
        const expH = (s.expenseAvg / max) * innerH
        const baseY = padT + innerH
        return (
          <g key={i}>
            {/* 호버 잡이용 슬롯 전체 투명 박스 */}
            <rect
              x={padL + slot * i}
              y={padT}
              width={slot}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => show(s)}
            />
            {/* income bar */}
            <rect
              x={cx - barW - 1}
              y={baseY - incH}
              width={barW}
              height={incH}
              fill="#10b981"
            />
            {/* expense bar */}
            <rect
              x={cx + 1}
              y={baseY - expH}
              width={barW}
              height={expH}
              fill="#ef4444"
            />
            {/* weekday label */}
            <text
              x={cx}
              y={H - 6}
              fontSize={11}
              fill={
                i === 0
                  ? '#ef4444'
                  : i === 6
                    ? '#3b82f6'
                    : 'currentColor'
              }
              opacity={i === 0 || i === 6 ? 1 : 0.7}
              fontWeight={700}
              textAnchor="middle"
            >
              {wdays[i]}
            </text>
            {/* count */}
            <text
              x={cx}
              y={padT + 10}
              fontSize={9}
              fill="currentColor"
              opacity={0.5}
              textAnchor="middle"
            >
              {s.count}건
            </text>
          </g>
        )
      })}
      {/* y axis labels */}
      <text
        x={padL - 4}
        y={padT + 12}
        fontSize={10}
        fill="currentColor"
        opacity={0.55}
        textAnchor="end"
      >
        {Math.round(max / 10000)}만
      </text>
      <text
        x={padL - 4}
        y={padT + innerH - 2}
        fontSize={10}
        fill="currentColor"
        opacity={0.55}
        textAnchor="end"
      >
        0
      </text>
    </svg>
    <ChartTooltip pos={pos} visible={!!hovered}>
      {hovered && (
        <>
          <div className="font-bold mb-0.5">{wdays[hovered.weekday]}요일</div>
          <div style={{ color: 'var(--muted)' }}>{hovered.count}건</div>
          <div className="text-emerald-500">
            수입 평균 {formatKRW(hovered.incomeAvg)}
            <span className="ml-1" style={{ color: 'var(--muted)' }}>
              (합 {formatKRW(hovered.income)})
            </span>
          </div>
          <div className="text-red-500">
            지출 평균 {formatKRW(hovered.expenseAvg)}
            <span className="ml-1" style={{ color: 'var(--muted)' }}>
              (합 {formatKRW(hovered.expense)})
            </span>
          </div>
        </>
      )}
    </ChartTooltip>
    </div>
  )
}

function HourBarChart({ data }: { data: HourAgg[] }) {
  const stats = data.map((d) => ({
    hour: d.hour,
    income: d.income,
    expense: d.expense,
    count: d.count,
  }))
  const max = Math.max(
    ...stats.map((s) => Math.max(s.income, s.expense)),
    1
  )
  const W = 720
  const H = 200
  const padL = 30
  const padR = 8
  const padT = 12
  const padB = 24
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const slot = innerW / 24
  const barW = Math.max(1, (slot - 2) / 2)
  const { ref, pos, hovered, onMove, onLeave, show } = useChartHover<
    (typeof stats)[number]
  >()
  return (
    <div
      ref={ref}
      className="relative"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="block">
      {stats.map((s, i) => {
        const cx = padL + slot * i + slot / 2
        const incH = (s.income / max) * innerH
        const expH = (s.expense / max) * innerH
        const baseY = padT + innerH
        return (
          <g key={i}>
            <rect
              x={padL + slot * i}
              y={padT}
              width={slot}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => show(s)}
            />
            <rect
              x={cx - barW - 0.5}
              y={baseY - incH}
              width={barW}
              height={incH}
              fill="#10b981"
            />
            <rect
              x={cx + 0.5}
              y={baseY - expH}
              width={barW}
              height={expH}
              fill="#ef4444"
            />
            {/* 3시간 간격 라벨 (0, 3, 6, ..., 21) */}
            {i % 3 === 0 && (
              <text
                x={cx}
                y={H - 6}
                fontSize={10}
                fill="currentColor"
                opacity={0.7}
                fontWeight={600}
                textAnchor="middle"
              >
                {i}시
              </text>
            )}
          </g>
        )
      })}
      {/* y axis labels */}
      <text
        x={padL - 4}
        y={padT + 12}
        fontSize={10}
        fill="currentColor"
        opacity={0.55}
        textAnchor="end"
      >
        {Math.round(max / 10000)}만
      </text>
      <text
        x={padL - 4}
        y={padT + innerH - 2}
        fontSize={10}
        fill="currentColor"
        opacity={0.55}
        textAnchor="end"
      >
        0
      </text>
    </svg>
    <ChartTooltip pos={pos} visible={!!hovered}>
      {hovered && (
        <>
          <div className="font-bold mb-0.5">
            {String(hovered.hour).padStart(2, '0')}:00 ~{' '}
            {String((hovered.hour + 1) % 24).padStart(2, '0')}:00
          </div>
          <div style={{ color: 'var(--muted)' }}>{hovered.count}건</div>
          <div className="text-emerald-500">
            수입 {formatKRW(hovered.income)}
          </div>
          <div className="text-red-500">
            지출 {formatKRW(hovered.expense)}
          </div>
        </>
      )}
    </ChartTooltip>
    </div>
  )
}
