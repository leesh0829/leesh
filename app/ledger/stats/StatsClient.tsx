'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '@/app/components/ToastProvider'
import { TYPE_LABEL_KR } from '@/app/lib/accountTypes'
import { LedgerNavBack } from '../LedgerNavIcons'

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

type StatsResponse = {
  totals: Totals
  byAccount: AccountAgg[]
  byAccountType: AccountTypeAgg[]
  byCategoryIncome: CategoryAgg[]
  byCategoryExpense: CategoryAgg[]
  byMonth: MonthAgg[]
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

  return (
    <div className="mt-3 overflow-x-auto">
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
              <rect
                x={x - barW - 2}
                y={padding.top + innerH - incomeH}
                width={barW}
                height={incomeH}
                fill="#10b981"
                rx="2"
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
    <div className="mt-3 flex justify-center">
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
          return (
            <path key={d.category} d={path} fill={colorForIndex(i)}>
              <title>
                {d.category}: {formatKRW(d.total)} ({((value / total) * 100).toFixed(1)}%)
              </title>
            </path>
          )
        })}
      </svg>
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
