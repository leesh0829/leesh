import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { getReadableScheduleOwnerIds } from '@/app/lib/scheduleShare'

export const runtime = 'nodejs'

async function getUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return null
  return prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
}

type EntryRow = {
  id: string
  type: 'INCOME' | 'EXPENSE'
  amount: number
  description: string
  category: string
  subcategory: string | null
  occurredAt: Date
  accountId: string | null
  account: { name: string; bankName: string | null; types: string[] } | null
}

type TransferRow = {
  type: 'INCOME' | 'EXPENSE'
  amount: number
  description: string
  occurredAt: Date
  accountId: string | null
  account: { name: string; bankName: string | null } | null
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function GET(req: Request) {
  const user = await getUser()
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const startParam = url.searchParams.get('start')
  const endParam = url.searchParams.get('end')

  const start = startParam ? new Date(startParam) : null
  const end = endParam ? new Date(endParam) : null
  const occurredAtFilter: { gte?: Date; lt?: Date } = {}
  if (start && !Number.isNaN(start.getTime())) occurredAtFilter.gte = start
  if (end && !Number.isNaN(end.getTime())) occurredAtFilter.lt = end

  const readableOwnerIds = await getReadableScheduleOwnerIds(user.id, 'LEDGER')

  const rows: EntryRow[] = await prisma.ledgerEntry.findMany({
    where: {
      ownerId: { in: readableOwnerIds },
      excludeFromTotals: false,
      ...(Object.keys(occurredAtFilter).length > 0
        ? { occurredAt: occurredAtFilter }
        : {}),
    },
    select: {
      id: true,
      type: true,
      amount: true,
      description: true,
      category: true,
      subcategory: true,
      occurredAt: true,
      accountId: true,
      account: { select: { name: true, bankName: true, types: true } },
    },
  })

  // 이체 항목 (excludeFromTotals=true + category=계좌이체) — Sankey/flow용
  const transferRows: TransferRow[] = await prisma.ledgerEntry.findMany({
    where: {
      ownerId: { in: readableOwnerIds },
      excludeFromTotals: true,
      category: '계좌이체',
      ...(Object.keys(occurredAtFilter).length > 0
        ? { occurredAt: occurredAtFilter }
        : {}),
    },
    select: {
      type: true,
      amount: true,
      description: true,
      occurredAt: true,
      accountId: true,
      account: { select: { name: true, bankName: true } },
    },
  })

  // 이전 기간 (같은 길이) — 비교용
  let prevTotals: { income: number; expense: number; net: number } | null = null
  let prevByCategoryExpense: Map<string, number> | null = null
  let prevByCategoryIncome: Map<string, number> | null = null
  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    const ms = end.getTime() - start.getTime()
    const prevEnd = new Date(start)
    const prevStart = new Date(start.getTime() - ms)
    const prevRows = await prisma.ledgerEntry.findMany({
      where: {
        ownerId: { in: readableOwnerIds },
        excludeFromTotals: false,
        occurredAt: { gte: prevStart, lt: prevEnd },
      },
      select: {
        type: true,
        amount: true,
        category: true,
      },
    })
    let pi = 0
    let pe = 0
    const pcExp = new Map<string, number>()
    const pcInc = new Map<string, number>()
    for (const r of prevRows) {
      if (r.type === 'INCOME') {
        pi += r.amount
        pcInc.set(r.category, (pcInc.get(r.category) ?? 0) + r.amount)
      } else {
        pe += r.amount
        pcExp.set(r.category, (pcExp.get(r.category) ?? 0) + r.amount)
      }
    }
    prevTotals = { income: pi, expense: pe, net: pi - pe }
    prevByCategoryExpense = pcExp
    prevByCategoryIncome = pcInc
  }

  let income = 0
  let expense = 0
  const byAccountMap = new Map<
    string,
    { id: string; name: string; bankName: string | null; income: number; expense: number; count: number }
  >()
  const byAccountTypeMap = new Map<
    string,
    { type: string; income: number; expense: number; count: number }
  >()
  const byCategoryIncome = new Map<string, { total: number; count: number }>()
  const byCategoryExpense = new Map<string, { total: number; count: number }>()
  const byMonth = new Map<string, { income: number; expense: number }>()
  const byDay = new Map<string, { income: number; expense: number }>()
  // 0=Sun ... 6=Sat
  const byWeekday: Array<{ income: number; expense: number; count: number }> =
    Array.from({ length: 7 }, () => ({ income: 0, expense: 0, count: 0 }))
  // 카테고리 → 소분류 → 합계
  const bySubcategoryIncome = new Map<string, Map<string, number>>()
  const bySubcategoryExpense = new Map<string, Map<string, number>>()

  const NO_ACCOUNT_KEY = '__none__'

  for (const r of rows) {
    if (r.type === 'INCOME') income += r.amount
    else expense += r.amount

    // 계좌별
    const accKey = r.accountId ?? NO_ACCOUNT_KEY
    const accEntry =
      byAccountMap.get(accKey) ??
      {
        id: accKey,
        name: r.account?.name ?? '미지정',
        bankName: r.account?.bankName ?? null,
        income: 0,
        expense: 0,
        count: 0,
      }
    if (r.type === 'INCOME') accEntry.income += r.amount
    else accEntry.expense += r.amount
    accEntry.count += 1
    byAccountMap.set(accKey, accEntry)

    // 계좌 타입별 — 계좌에 여러 type이 있으면 각 type에 같은 금액을 모두 카운트
    const accountTypes = r.account?.types ?? []
    if (accountTypes.length === 0) {
      const entry =
        byAccountTypeMap.get('__none__') ??
        { type: '__none__', income: 0, expense: 0, count: 0 }
      if (r.type === 'INCOME') entry.income += r.amount
      else entry.expense += r.amount
      entry.count += 1
      byAccountTypeMap.set('__none__', entry)
    } else {
      for (const t of accountTypes) {
        const entry =
          byAccountTypeMap.get(t) ??
          { type: t, income: 0, expense: 0, count: 0 }
        if (r.type === 'INCOME') entry.income += r.amount
        else entry.expense += r.amount
        entry.count += 1
        byAccountTypeMap.set(t, entry)
      }
    }

    // 카테고리별 (수입/지출 분리)
    const catMap = r.type === 'INCOME' ? byCategoryIncome : byCategoryExpense
    const catEntry = catMap.get(r.category) ?? { total: 0, count: 0 }
    catEntry.total += r.amount
    catEntry.count += 1
    catMap.set(r.category, catEntry)

    // 월별 (YYYY-MM)
    const d = new Date(r.occurredAt)
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const monthEntry = byMonth.get(monthKey) ?? { income: 0, expense: 0 }
    if (r.type === 'INCOME') monthEntry.income += r.amount
    else monthEntry.expense += r.amount
    byMonth.set(monthKey, monthEntry)

    // 일별 (YYYY-MM-DD)
    const dKey = dayKey(d)
    const dEntry = byDay.get(dKey) ?? { income: 0, expense: 0 }
    if (r.type === 'INCOME') dEntry.income += r.amount
    else dEntry.expense += r.amount
    byDay.set(dKey, dEntry)

    // 요일별 (0=일~6=토)
    const dow = d.getDay()
    const we = byWeekday[dow]
    if (r.type === 'INCOME') we.income += r.amount
    else we.expense += r.amount
    we.count += 1

    // 소분류별 (카테고리 → 소분류)
    const subMap = r.type === 'INCOME' ? bySubcategoryIncome : bySubcategoryExpense
    const sub = r.subcategory ?? '(소분류 없음)'
    let inner = subMap.get(r.category)
    if (!inner) {
      inner = new Map<string, number>()
      subMap.set(r.category, inner)
    }
    inner.set(sub, (inner.get(sub) ?? 0) + r.amount)
  }

  const byAccount = Array.from(byAccountMap.values())
    .map((a) => ({ ...a, net: a.income - a.expense }))
    .sort((a, b) => b.income + b.expense - (a.income + a.expense))

  const byAccountType = Array.from(byAccountTypeMap.values())
    .map((a) => ({ ...a, net: a.income - a.expense }))
    .sort((a, b) => b.income + b.expense - (a.income + a.expense))

  const byCategoryIncomeArr = Array.from(byCategoryIncome.entries())
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.total - a.total)
  const byCategoryExpenseArr = Array.from(byCategoryExpense.entries())
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.total - a.total)

  const byMonthArr = Array.from(byMonth.entries())
    .map(([month, v]) => ({ month, ...v, net: v.income - v.expense }))
    .sort((a, b) => a.month.localeCompare(b.month))

  // 일별 — 데이터 있는 날만
  const byDayArr = Array.from(byDay.entries())
    .map(([day, v]) => ({ day, ...v, net: v.income - v.expense }))
    .sort((a, b) => a.day.localeCompare(b.day))

  // 요일별
  const byWeekdayArr = byWeekday.map((v, i) => ({
    weekday: i,
    income: v.income,
    expense: v.expense,
    count: v.count,
  }))

  // 소분류별
  const bySubcategoryExpenseArr = Array.from(bySubcategoryExpense.entries()).map(
    ([category, sub]) => ({
      category,
      subcategories: Array.from(sub.entries())
        .map(([subcategory, total]) => ({ subcategory, total }))
        .sort((a, b) => b.total - a.total),
    })
  )
  const bySubcategoryIncomeArr = Array.from(bySubcategoryIncome.entries()).map(
    ([category, sub]) => ({
      category,
      subcategories: Array.from(sub.entries())
        .map(([subcategory, total]) => ({ subcategory, total }))
        .sort((a, b) => b.total - a.total),
    })
  )

  // Top 단건 거래 (수입/지출 각각 상위 5건)
  const topIncome = rows
    .filter((r) => r.type === 'INCOME')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      amount: r.amount,
      description: r.description,
      category: r.category,
      subcategory: r.subcategory,
      accountName: r.account?.name ?? null,
      occurredAt: r.occurredAt.toISOString(),
    }))
  const topExpense = rows
    .filter((r) => r.type === 'EXPENSE')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      amount: r.amount,
      description: r.description,
      category: r.category,
      subcategory: r.subcategory,
      accountName: r.account?.name ?? null,
      occurredAt: r.occurredAt.toISOString(),
    }))

  // 전월 대비 카테고리 hot list (지출 기준)
  const categoryDiffExpense = prevByCategoryExpense
    ? Array.from(byCategoryExpense.entries())
        .map(([category, v]) => {
          const prev = prevByCategoryExpense?.get(category) ?? 0
          return {
            category,
            current: v.total,
            prev,
            diff: v.total - prev,
            diffPct: prev > 0 ? ((v.total - prev) / prev) * 100 : null,
          }
        })
        .concat(
          // 이번 기간엔 없는데 전 기간엔 있었던 카테고리
          Array.from(prevByCategoryExpense.entries())
            .filter(([cat]) => !byCategoryExpense.has(cat))
            .map(([category, prev]) => ({
              category,
              current: 0,
              prev,
              diff: -prev,
              diffPct: -100,
            }))
        )
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    : null

  const categoryDiffIncome = prevByCategoryIncome
    ? Array.from(byCategoryIncome.entries())
        .map(([category, v]) => {
          const prev = prevByCategoryIncome?.get(category) ?? 0
          return {
            category,
            current: v.total,
            prev,
            diff: v.total - prev,
            diffPct: prev > 0 ? ((v.total - prev) / prev) * 100 : null,
          }
        })
        .concat(
          Array.from(prevByCategoryIncome.entries())
            .filter(([cat]) => !byCategoryIncome.has(cat))
            .map(([category, prev]) => ({
              category,
              current: 0,
              prev,
              diff: -prev,
              diffPct: -100,
            }))
        )
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    : null

  // 이체 흐름 — 출발(EXPENSE) ↔ 도착(INCOME) 페어를 occurredAt+amount로 매칭
  // description 형식: "A → B 이체" 또는 사용자 입력
  // 가장 단순한 방법: 시각+금액이 같은 EXPENSE/INCOME 페어를 묶기
  const transferFlows = new Map<
    string,
    { from: string; to: string; total: number; count: number }
  >()
  const expByKey = new Map<string, TransferRow[]>()
  const incByKey = new Map<string, TransferRow[]>()
  for (const t of transferRows) {
    const k = `${t.occurredAt.getTime()}_${t.amount}`
    if (t.type === 'EXPENSE') {
      const arr = expByKey.get(k) ?? []
      arr.push(t)
      expByKey.set(k, arr)
    } else {
      const arr = incByKey.get(k) ?? []
      arr.push(t)
      incByKey.set(k, arr)
    }
  }
  for (const [k, exps] of expByKey) {
    const incs = incByKey.get(k) ?? []
    const pairCount = Math.min(exps.length, incs.length)
    for (let i = 0; i < pairCount; i++) {
      const from = exps[i].account?.name ?? '미지정'
      const to = incs[i].account?.name ?? '미지정'
      const key = `${from} → ${to}`
      const entry = transferFlows.get(key) ?? {
        from,
        to,
        total: 0,
        count: 0,
      }
      entry.total += exps[i].amount
      entry.count += 1
      transferFlows.set(key, entry)
    }
  }
  const transferFlowsArr = Array.from(transferFlows.values()).sort(
    (a, b) => b.total - a.total
  )

  return NextResponse.json({
    totals: { income, expense, net: income - expense, count: rows.length },
    prevTotals,
    byAccount,
    byAccountType,
    byCategoryIncome: byCategoryIncomeArr,
    byCategoryExpense: byCategoryExpenseArr,
    bySubcategoryIncome: bySubcategoryIncomeArr,
    bySubcategoryExpense: bySubcategoryExpenseArr,
    byMonth: byMonthArr,
    byDay: byDayArr,
    byWeekday: byWeekdayArr,
    topIncome,
    topExpense,
    categoryDiffIncome,
    categoryDiffExpense,
    transferFlows: transferFlowsArr,
  })
}
