'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { isHoliday as isKoreanHoliday } from 'korean-holidays'
import { LedgerNavBack } from '../LedgerNavIcons'

type LedgerItem = {
  id: string
  type: 'INCOME' | 'EXPENSE'
  amount: number
  description: string
  category: string
  subcategory: string | null
  accountName: string | null
  excludeFromTotals: boolean
  linkedToHolding?: boolean
  occurredAt: string
}

type DayCell = {
  date: Date
  dayNum: number
  isInMonth: boolean
  isToday: boolean
  isWeekend: boolean
  isHoliday: boolean
  holidayName: string | null
  income: number
  expense: number
  balance: number
  count: number
  hasStock: boolean
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
function toDateKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function fmtKRW(n: number) {
  if (n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 1e8) return `${(n / 1e8).toFixed(1)}억`
  if (abs >= 1e4) return `${(n / 1e4).toFixed(0)}만`
  return Math.round(n).toLocaleString('ko-KR')
}
function fmtKRWFull(n: number) {
  return `₩${Math.round(Math.abs(n)).toLocaleString('ko-KR')}`
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function LedgerCalendarClient() {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [items, setItems] = useState<LedgerItem[]>([])
  const [loading, setLoading] = useState(true)
  const [openDay, setOpenDay] = useState<DayCell | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // 캘린더 grid는 이전달 일부 + 다음달 일부도 포함 — 넉넉히 fetch
      const start = new Date(
        cursor.getFullYear(),
        cursor.getMonth() - 1,
        1
      ).toISOString()
      const end = new Date(
        cursor.getFullYear(),
        cursor.getMonth() + 2,
        1
      ).toISOString()
      const params = new URLSearchParams({ start, end })
      const r = await fetch(`/api/ledger?${params.toString()}`, {
        cache: 'no-store',
      })
      if (r.ok) {
        const j = (await r.json()) as { items: LedgerItem[] }
        setItems(j.items)
      }
    } finally {
      setLoading(false)
    }
  }, [cursor])

  useEffect(() => {
    void load()
  }, [load])

  // 일별 그룹핑
  const dayMap = useMemo(() => {
    const map = new Map<string, LedgerItem[]>()
    for (const it of items) {
      const d = new Date(it.occurredAt)
      const key = toDateKey(d)
      const arr = map.get(key) ?? []
      arr.push(it)
      map.set(key, arr)
    }
    return map
  }, [items])

  // 달력 셀
  const cells = useMemo<DayCell[]>(() => {
    const monthStart = startOfMonth(cursor)
    const monthEnd = endOfMonth(cursor)
    const startWeekday = monthStart.getDay() // 0=일
    const totalDays = monthEnd.getDate()
    const gridStart = new Date(monthStart)
    gridStart.setDate(monthStart.getDate() - startWeekday)
    const totalCells = Math.ceil((startWeekday + totalDays) / 7) * 7
    const today = new Date()
    const result: DayCell[] = []
    for (let i = 0; i < totalCells; i++) {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + i)
      const key = toDateKey(d)
      const entries = dayMap.get(key) ?? []
      let income = 0
      let expense = 0
      let hasStock = false
      let count = 0
      for (const e of entries) {
        // 합계 제외(이체 등)는 일별 합계에서 제외
        if (e.excludeFromTotals) continue
        count++
        if (e.type === 'INCOME') income += e.amount
        else expense += e.amount
        if (e.linkedToHolding) hasStock = true
      }
      const dow = d.getDay()
      const isWeekend = dow === 0 || dow === 6
      const hol = isKoreanHoliday(d, { includeSubstitute: true })
      result.push({
        date: d,
        dayNum: d.getDate(),
        isInMonth: d.getMonth() === cursor.getMonth(),
        isToday: sameDay(d, today),
        isWeekend,
        isHoliday: !!hol,
        holidayName: hol?.nameKo ?? null,
        income,
        expense,
        balance: income - expense,
        count,
        hasStock,
      })
    }
    return result
  }, [cursor, dayMap])

  // 월 합계 (이번 달 셀만)
  const monthTotal = useMemo(() => {
    let income = 0
    let expense = 0
    for (const c of cells) {
      if (!c.isInMonth) continue
      income += c.income
      expense += c.expense
    }
    return { income, expense, balance: income - expense }
  }, [cells])

  // 클릭한 날짜의 entries
  const openDayEntries = useMemo(() => {
    if (!openDay) return []
    const key = toDateKey(openDay.date)
    return dayMap.get(key) ?? []
  }, [openDay, dayMap])

  const monthLabel = `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`

  return (
    <main className="w-full px-3 py-6 sm:px-4 lg:px-6">
      <div className="grid gap-6">
        {/* 헤더 */}
        <div className="surface card-pad card-hover-border-only">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">가계부 캘린더</h1>
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                일별 수입·지출 한눈에 — 합계 제외(이체) 항목은 일별 합계에서 자동 제외
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LedgerNavBack />
            </div>
          </div>

          {/* 월 네비게이션 + 합계 */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCursor(addMonths(cursor, -1))}
                className="btn btn-outline text-sm"
                title="이전 달"
              >
                ◀
              </button>
              <div className="text-lg font-bold min-w-[120px] text-center">
                {monthLabel}
              </div>
              <button
                type="button"
                onClick={() => setCursor(addMonths(cursor, 1))}
                className="btn btn-outline text-sm"
                title="다음 달"
              >
                ▶
              </button>
              <button
                type="button"
                onClick={() => setCursor(startOfMonth(new Date()))}
                className="btn btn-outline text-xs"
              >
                오늘
              </button>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <div>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  수입{' '}
                </span>
                <span className="font-bold text-emerald-500">
                  {fmtKRWFull(monthTotal.income)}
                </span>
              </div>
              <div>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  지출{' '}
                </span>
                <span className="font-bold text-red-500">
                  {fmtKRWFull(monthTotal.expense)}
                </span>
              </div>
              <div>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  순액{' '}
                </span>
                <span
                  className={
                    'font-bold ' +
                    (monthTotal.balance < 0
                      ? 'text-red-500'
                      : 'text-emerald-500')
                  }
                >
                  {monthTotal.balance >= 0 ? '+' : '-'}
                  {fmtKRWFull(monthTotal.balance)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 캘린더 그리드 */}
        <div className="surface card-pad card-hover-border-only">
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className={
                  'text-center text-xs font-semibold py-1 ' +
                  (i === 0
                    ? 'text-red-500'
                    : i === 6
                      ? 'text-blue-500'
                      : '')
                }
                style={i !== 0 && i !== 6 ? { color: 'var(--muted)' } : undefined}
              >
                {w}
              </div>
            ))}
          </div>

          {/* 날짜 셀 */}
          {loading ? (
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="h-20 sm:h-24 rounded-md skeleton" />
              ))}
            </div>
          ) : (
            (() => {
              // 셀 1개 렌더 — 주별 묶음 안에서 재사용
              const renderCell = (c: DayCell) => {
                const dayColor =
                  c.isHoliday || (c.isWeekend && c.date.getDay() === 0)
                    ? 'text-red-500'
                    : c.isWeekend
                      ? 'text-blue-500'
                      : ''
                return (
                  <button
                    key={toDateKey(c.date)}
                    type="button"
                    onClick={() => setOpenDay(c)}
                    className={
                      'card p-1.5 sm:p-2 card-hover-border-only flex flex-col items-stretch text-left min-h-[80px] sm:min-h-[100px] ' +
                      (!c.isInMonth ? 'opacity-40' : '')
                    }
                    style={
                      c.isToday
                        ? {
                            background:
                              'color-mix(in srgb, var(--accent) 12%, var(--card))',
                            borderColor:
                              'color-mix(in srgb, var(--accent) 55%, var(--border))',
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={'text-xs font-bold ' + dayColor}
                        title={c.holidayName ?? undefined}
                      >
                        {c.dayNum}
                      </span>
                      {c.hasStock && <span className="text-[9px]">📈</span>}
                    </div>
                    {c.holidayName && c.isInMonth && (
                      <div
                        className="text-[9px] truncate text-red-500"
                        title={c.holidayName}
                      >
                        {c.holidayName}
                      </div>
                    )}
                    {c.count > 0 && (c.income > 0 || c.expense > 0) && (
                      <div
                        className={
                          'truncate text-[12px] font-extrabold leading-tight ' +
                          (c.balance < 0
                            ? 'text-red-500'
                            : c.balance > 0
                              ? 'text-emerald-500'
                              : '')
                        }
                        style={c.balance === 0 ? { color: 'var(--muted)' } : undefined}
                      >
                        {c.balance >= 0 ? '+' : '−'}
                        {fmtKRW(c.balance)}
                      </div>
                    )}
                    {c.count > 0 && (
                      <div className="mt-auto grid gap-0.5 text-[10px] leading-tight">
                        {c.income > 0 && (
                          <div className="text-emerald-500 font-semibold truncate">
                            +{fmtKRW(c.income)}
                          </div>
                        )}
                        {c.expense > 0 && (
                          <div className="text-red-500 font-semibold truncate">
                            −{fmtKRW(c.expense)}
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                )
              }

              // 7개씩 주차별로 묶기 + 주간 income/expense 집계
              const weeks: DayCell[][] = []
              for (let i = 0; i < cells.length; i += 7) {
                weeks.push(cells.slice(i, i + 7))
              }
              return (
                <div className="grid gap-1 sm:gap-2">
                  {weeks.map((week, wIdx) => {
                    let wIncome = 0
                    let wExpense = 0
                    for (const c of week) {
                      wIncome += c.income
                      wExpense += c.expense
                    }
                    const wBal = wIncome - wExpense
                    return (
                      <div key={`week-${wIdx}`} className="grid gap-0.5">
                        <div className="grid grid-cols-7 gap-1 sm:gap-2">
                          {week.map(renderCell)}
                        </div>
                        {(wIncome > 0 || wExpense > 0) && (
                          <div className="flex justify-end items-baseline gap-3 pr-1 text-[11px] sm:text-xs font-semibold">
                            {wIncome > 0 && (
                              <span className="text-emerald-500">
                                +{fmtKRW(wIncome)}원
                              </span>
                            )}
                            {wExpense > 0 && (
                              <span className="text-red-500">
                                −{fmtKRW(wExpense)}원
                              </span>
                            )}
                            {wIncome > 0 && wExpense > 0 && (
                              <span
                                className={
                                  wBal >= 0 ? 'text-emerald-500' : 'text-red-500'
                                }
                                title="주간 순액"
                              >
                                ({wBal >= 0 ? '+' : '−'}
                                {fmtKRW(wBal)})
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()
          )}

          <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
            셀 클릭 시 해당 일자 거래 상세. 📈 = 주식 거래 동기화 항목 있음.
          </p>
        </div>

        {/* 일자 상세 팝업 */}
        {openDay && (
          <div
            onClick={() => setOpenDay(null)}
            className="fixed inset-0 z-55 bg-black/40 flex items-end sm:items-center justify-center p-2 sm:p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="surface modal-frame w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl max-h-[88dvh] flex flex-col"
            >
              <div
                className="p-4 sm:p-5 overflow-y-auto"
                style={{ minHeight: 0 }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-extrabold">
                      {openDay.date.getFullYear()}년{' '}
                      {openDay.date.getMonth() + 1}월{' '}
                      {openDay.date.getDate()}일{' '}
                      <span
                        className="text-sm font-normal"
                        style={{ color: 'var(--muted)' }}
                      >
                        ({WEEKDAYS[openDay.date.getDay()]})
                      </span>
                    </h3>
                    {openDay.holidayName && (
                      <div className="text-xs text-red-500 mt-1">
                        {openDay.holidayName}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenDay(null)}
                    className="btn btn-outline text-xs shrink-0"
                  >
                    닫기
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <div>
                    <span
                      className="text-xs"
                      style={{ color: 'var(--muted)' }}
                    >
                      수입{' '}
                    </span>
                    <span className="font-bold text-emerald-500">
                      {fmtKRWFull(openDay.income)}
                    </span>
                  </div>
                  <div>
                    <span
                      className="text-xs"
                      style={{ color: 'var(--muted)' }}
                    >
                      지출{' '}
                    </span>
                    <span className="font-bold text-red-500">
                      {fmtKRWFull(openDay.expense)}
                    </span>
                  </div>
                  <div>
                    <span
                      className="text-xs"
                      style={{ color: 'var(--muted)' }}
                    >
                      순액{' '}
                    </span>
                    <span
                      className={
                        'font-bold ' +
                        (openDay.balance < 0
                          ? 'text-red-500'
                          : 'text-emerald-500')
                      }
                    >
                      {openDay.balance >= 0 ? '+' : '−'}
                      {fmtKRWFull(openDay.balance)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-1">
                  {openDayEntries.length === 0 ? (
                    <div
                      className="text-sm py-4"
                      style={{ color: 'var(--muted)' }}
                    >
                      이날 거래가 없습니다.
                    </div>
                  ) : (
                    openDayEntries.map((it) => (
                      <div
                        key={it.id}
                        className="card p-2 card-hover-border-only"
                      >
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={
                                  'font-semibold truncate ' +
                                  (it.excludeFromTotals
                                    ? 'opacity-60'
                                    : '')
                                }
                              >
                                {it.description || it.category}
                              </span>
                              {it.linkedToHolding && (
                                <span className="text-[10px]">📈</span>
                              )}
                              {it.excludeFromTotals && (
                                <span
                                  className="text-[10px] rounded-full px-1.5 py-0.5"
                                  style={{
                                    background:
                                      'var(--surface-muted, rgba(0,0,0,0.06))',
                                    color: 'var(--muted)',
                                  }}
                                >
                                  합계 제외
                                </span>
                              )}
                            </div>
                            <div
                              className="text-[11px] mt-0.5"
                              style={{ color: 'var(--muted)' }}
                            >
                              {it.category}
                              {it.subcategory ? ` · ${it.subcategory}` : ''}
                              {it.accountName ? ` · ${it.accountName}` : ''}
                            </div>
                          </div>
                          <div
                            className={
                              'shrink-0 font-bold ' +
                              (it.type === 'INCOME'
                                ? 'text-emerald-500'
                                : 'text-red-500')
                            }
                          >
                            {it.type === 'INCOME' ? '+' : '−'}
                            {fmtKRWFull(it.amount)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
