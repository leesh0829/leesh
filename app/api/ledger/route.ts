import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { toISOStringSafe } from '@/app/lib/date'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { getReadableScheduleOwnerIds, toUserLabel } from '@/app/lib/scheduleShare'
import { isValidCategoryCombination } from '@/app/lib/ledgerCategories'

export const runtime = 'nodejs'

const entryCreateSchema = z
  .object({
    type: z.enum(['INCOME', 'EXPENSE']),
    amount: z
      .number()
      .int('amount must be integer')
      .min(1, 'amount must be at least 1')
      .max(2_000_000_000, 'amount is too large'),
    description: z.string().trim().min(1, 'description required').max(200),
    category: z.string().trim().min(1, 'category required').max(40),
    subcategory: z
      .union([z.string().trim().max(40), z.null()])
      .optional()
      .transform((v) => (v ? v : null)),
    accountId: z
      .union([z.string().trim().max(40), z.null()])
      .optional()
      .transform((v) => (v ? v : null)),
    excludeFromTotals: z.boolean().optional().default(false),
    occurredAt: z
      .union([z.string(), z.null()])
      .optional()
      .refine(
        (v) =>
          v === undefined ||
          v === null ||
          v === '' ||
          !Number.isNaN(new Date(v).getTime()),
        { message: 'invalid date' }
      ),
  })
  .strict()

type LedgerEntryRow = {
  id: string
  ownerId: string
  accountId: string | null
  type: 'INCOME' | 'EXPENSE'
  amount: number
  description: string
  category: string
  subcategory: string | null
  excludeFromTotals: boolean
  occurredAt: Date
  createdAt: Date
  updatedAt: Date
  owner: { id: string; name: string | null; email: string | null }
  account: {
    id: string
    name: string
    bankName: string | null
    types: string[]
  } | null
  holdingTransaction: { id: string } | null
}

async function getUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return null
  return prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
}

export async function GET(req: Request) {
  const user = await getUser()
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const startParam = url.searchParams.get('start')
  const endParam = url.searchParams.get('end')
  const excludeOwnersParam = url.searchParams.get('excludeOwners')

  const start = startParam ? new Date(startParam) : null
  const end = endParam ? new Date(endParam) : null

  const occurredAtFilter: { gte?: Date; lt?: Date } = {}
  if (start && !Number.isNaN(start.getTime())) occurredAtFilter.gte = start
  if (end && !Number.isNaN(end.getTime())) occurredAtFilter.lt = end

  const readableOwnerIds = await getReadableScheduleOwnerIds(
    user.id,
    'LEDGER'
  )

  // 사용자가 명시적으로 끈 owner들을 제외
  const excludedOwnerIds = excludeOwnersParam
    ? new Set(
        excludeOwnersParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      )
    : new Set<string>()
  const effectiveOwnerIds = readableOwnerIds.filter(
    (id) => !excludedOwnerIds.has(id)
  )

  const rows: LedgerEntryRow[] = await prisma.ledgerEntry.findMany({
    where: {
      ownerId: { in: effectiveOwnerIds },
      ...(Object.keys(occurredAtFilter).length > 0
        ? { occurredAt: occurredAtFilter }
        : {}),
    },
    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      ownerId: true,
      accountId: true,
      type: true,
      amount: true,
      description: true,
      category: true,
      subcategory: true,
      excludeFromTotals: true,
      occurredAt: true,
      createdAt: true,
      updatedAt: true,
      owner: { select: { id: true, name: true, email: true } },
      account: { select: { id: true, name: true, bankName: true, types: true } },
      holdingTransaction: { select: { id: true } },
    },
  })

  // 계좌별 누적 잔액(runningBalance) 계산 — 각 항목 시점에 그 계좌가 얼마였는지.
  // 1) 계좌의 initialBalance (가계부 시작 시점 금액) → carry 시작값
  // 2) 기간 시작 이전 항목들의 합을 더함 → 기간 시작 직전 잔액
  // 3) 기간 내 항목을 occurredAt 오름차순으로 순회하며 누적
  // excludeFromTotals=true 항목은 잔액 변동에 미포함
  const accountIdSet = new Set<string>()
  for (const r of rows) {
    if (r.accountId) accountIdSet.add(r.accountId)
  }
  const accountInitialMap = new Map<string, number>()
  if (accountIdSet.size > 0) {
    const accRows = await prisma.financialAccount.findMany({
      where: { id: { in: Array.from(accountIdSet) } },
      select: { id: true, initialBalance: true },
    })
    for (const a of accRows) accountInitialMap.set(a.id, a.initialBalance)
  }
  const carryBalances = new Map<string, number>()
  for (const accId of accountIdSet) {
    carryBalances.set(accId, accountInitialMap.get(accId) ?? 0)
  }
  if (accountIdSet.size > 0 && occurredAtFilter.gte) {
    const carryRows = await prisma.ledgerEntry.findMany({
      where: {
        ownerId: { in: effectiveOwnerIds },
        accountId: { in: Array.from(accountIdSet) },
        excludeFromTotals: false,
        occurredAt: { lt: occurredAtFilter.gte },
      },
      select: { accountId: true, type: true, amount: true },
    })
    for (const r of carryRows) {
      if (!r.accountId) continue
      const prev = carryBalances.get(r.accountId) ?? 0
      const delta = r.type === 'INCOME' ? r.amount : -r.amount
      carryBalances.set(r.accountId, prev + delta)
    }
  }
  // occurredAt 오름차순 (동률은 createdAt 오름차순) — 시간순 누적
  const asc = [...rows].sort((a, b) => {
    const da = a.occurredAt.getTime() - b.occurredAt.getTime()
    if (da !== 0) return da
    return a.createdAt.getTime() - b.createdAt.getTime()
  })
  const running = new Map<string, number>(carryBalances)
  const balanceById = new Map<string, number>()
  for (const r of asc) {
    if (!r.accountId) continue
    const prev = running.get(r.accountId) ?? 0
    const delta = r.excludeFromTotals
      ? 0
      : r.type === 'INCOME'
        ? r.amount
        : -r.amount
    const next = prev + delta
    running.set(r.accountId, next)
    balanceById.set(r.id, next)
  }

  const items = rows.map((row) => ({
    id: row.id,
    ownerId: row.ownerId,
    ownerLabel: toUserLabel(row.owner.name, row.owner.email),
    shared: row.ownerId !== user.id,
    canEdit: row.ownerId === user.id,
    accountId: row.accountId,
    accountName: row.account?.name ?? null,
    accountBank: row.account?.bankName ?? null,
    accountTypes: row.account?.types ?? [],
    type: row.type,
    amount: row.amount,
    description: row.description,
    category: row.category,
    subcategory: row.subcategory,
    excludeFromTotals: row.excludeFromTotals,
    linkedToHolding: !!row.holdingTransaction,
    runningBalance: row.accountId
      ? (balanceById.get(row.id) ?? null)
      : null,
    occurredAt: toISOStringSafe(row.occurredAt),
    createdAt: toISOStringSafe(row.createdAt),
    updatedAt: toISOStringSafe(row.updatedAt),
  }))

  // 전체 잔액 (기간 무관, 본인+공유 합산, 합계 제외 항목 제외)
  // owner별로도 그룹핑해서 분리 모드 표시에 사용
  const allRows: {
    ownerId: string
    type: 'INCOME' | 'EXPENSE'
    amount: number
  }[] = await prisma.ledgerEntry.findMany({
    where: {
      ownerId: { in: effectiveOwnerIds },
      excludeFromTotals: false,
    },
    select: { ownerId: true, type: true, amount: true },
  })
  let totalIncome = 0
  let totalExpense = 0
  const ownerTotalsMap = new Map<
    string,
    { income: number; expense: number; initial: number }
  >()
  for (const r of allRows) {
    if (r.type === 'INCOME') totalIncome += r.amount
    else totalExpense += r.amount
    const entry =
      ownerTotalsMap.get(r.ownerId) ?? { income: 0, expense: 0, initial: 0 }
    if (r.type === 'INCOME') entry.income += r.amount
    else entry.expense += r.amount
    ownerTotalsMap.set(r.ownerId, entry)
  }

  // 계좌 초기 잔액 합산 — 잔액에는 더해지지만 income/expense에는 미포함
  const allAccounts = await prisma.financialAccount.findMany({
    where: { ownerId: { in: effectiveOwnerIds } },
    select: { ownerId: true, initialBalance: true },
  })
  let totalInitial = 0
  for (const a of allAccounts) {
    totalInitial += a.initialBalance
    const entry =
      ownerTotalsMap.get(a.ownerId) ?? { income: 0, expense: 0, initial: 0 }
    entry.initial += a.initialBalance
    ownerTotalsMap.set(a.ownerId, entry)
  }

  const totalsByOwner = Array.from(ownerTotalsMap.entries()).map(
    ([ownerId, v]) => ({
      ownerId,
      income: v.income,
      expense: v.expense,
      balance: v.income - v.expense + v.initial,
    })
  )

  return NextResponse.json({
    items,
    totals: {
      income: totalIncome,
      expense: totalExpense,
      balance: totalIncome - totalExpense + totalInitial,
    },
    totalsByOwner,
  })
}

export async function POST(req: Request) {
  const user = await getUser()
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const parsed = await parseJsonWithSchema(req, entryCreateSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid body')

  const { type, amount, description, category } = parsed.data
  const subcategory = parsed.data.subcategory ?? null
  const excludeFromTotals = parsed.data.excludeFromTotals
  const accountId = parsed.data.accountId ?? null

  // 계좌가 본인 소유인지 확인
  if (accountId) {
    const acc = await prisma.financialAccount.findUnique({
      where: { id: accountId },
      select: { ownerId: true },
    })
    if (!acc || acc.ownerId !== user.id) {
      return NextResponse.json(
        { message: '유효하지 않은 계좌입니다.' },
        { status: 400 }
      )
    }
  }

  if (!isValidCategoryCombination(type, category, subcategory)) {
    return NextResponse.json(
      { message: '대분류/소분류 조합이 올바르지 않습니다.' },
      { status: 400 }
    )
  }

  const occurredAt =
    typeof parsed.data.occurredAt === 'string' && parsed.data.occurredAt
      ? new Date(parsed.data.occurredAt)
      : new Date()

  const created = await prisma.ledgerEntry.create({
    data: {
      ownerId: user.id,
      accountId,
      type,
      amount,
      description,
      category,
      subcategory,
      excludeFromTotals,
      occurredAt,
    },
    select: { id: true },
  })

  return NextResponse.json(created)
}
