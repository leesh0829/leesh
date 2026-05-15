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
  type: 'INCOME' | 'EXPENSE'
  amount: number
  category: string
  subcategory: string | null
  occurredAt: Date
  accountId: string | null
  account: { name: string; bankName: string | null; types: string[] } | null
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
      type: true,
      amount: true,
      category: true,
      subcategory: true,
      occurredAt: true,
      accountId: true,
      account: { select: { name: true, bankName: true, types: true } },
    },
  })

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

  return NextResponse.json({
    totals: { income, expense, net: income - expense, count: rows.length },
    byAccount,
    byAccountType,
    byCategoryIncome: byCategoryIncomeArr,
    byCategoryExpense: byCategoryExpenseArr,
    byMonth: byMonthArr,
  })
}
