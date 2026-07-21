import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { toISOStringSafe } from '@/app/lib/date'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import {
  ACCOUNT_TYPES,
  validateAccountTypes,
  type AccountType,
} from '@/app/lib/accountTypes'
import { getCurrentUserId } from '@/app/lib/serverAuth'

export const runtime = 'nodejs'

const accountCreateSchema = z
  .object({
    name: z.string().trim().min(1, 'name required').max(60),
    bankName: z
      .union([z.string().trim().max(60), z.null()])
      .optional()
      .transform((v) => (v ? v : null)),
    types: z.array(z.enum(ACCOUNT_TYPES)).min(1, 'types required'),
    memo: z
      .union([z.string().trim().max(500), z.null()])
      .optional()
      .transform((v) => (v ? v : null)),
    initialBalance: z
      .number()
      .int()
      .min(-2_000_000_000)
      .max(2_000_000_000)
      .optional()
      .default(0),
  })
  .strict()

type AccountRow = {
  id: string
  name: string
  bankName: string | null
  types: AccountType[]
  memo: string | null
  initialBalance: number
  createdAt: Date
  updatedAt: Date
  _count: { ledgerEntries: number; holdings: number }
}

export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const rows: AccountRow[] = await prisma.financialAccount.findMany({
    where: { ownerId: userId },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      bankName: true,
      types: true,
      memo: true,
      initialBalance: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { ledgerEntries: true, holdings: true } },
    },
  })

  // 계좌별 현재 잔액 = initialBalance + Σ(INCOME) − Σ(EXPENSE) (전 기간)
  // 이체 등 excludeFromTotals=true 항목도 실제 현금 이동이므로 잔액에 포함한다.
  const balanceDeltaByAccount = new Map<string, number>()
  if (rows.length > 0) {
    const balanceGroups = await prisma.ledgerEntry.groupBy({
      by: ['accountId', 'type'],
      where: { ownerId: userId, accountId: { in: rows.map((r) => r.id) } },
      _sum: { amount: true },
    })
    for (const g of balanceGroups) {
      if (!g.accountId) continue
      const amount = g._sum.amount ?? 0
      const delta = g.type === 'INCOME' ? amount : -amount
      balanceDeltaByAccount.set(
        g.accountId,
        (balanceDeltaByAccount.get(g.accountId) ?? 0) + delta
      )
    }
  }

  return NextResponse.json({
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      bankName: row.bankName,
      types: row.types,
      memo: row.memo,
      initialBalance: row.initialBalance,
      currentBalance:
        row.initialBalance + (balanceDeltaByAccount.get(row.id) ?? 0),
      entryCount: row._count.ledgerEntries,
      holdingCount: row._count.holdings,
      createdAt: toISOStringSafe(row.createdAt),
      updatedAt: toISOStringSafe(row.updatedAt),
    })),
  })
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const parsed = await parseJsonWithSchema(req, accountCreateSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid body')

  const { name, bankName, memo, initialBalance } = parsed.data
  const types = parsed.data.types as AccountType[]

  const validationError = validateAccountTypes(types)
  if (validationError)
    return NextResponse.json({ message: validationError }, { status: 400 })

  const created = await prisma.financialAccount.create({
    data: {
      ownerId: userId,
      name,
      bankName,
      types,
      memo,
      initialBalance,
    },
    select: { id: true },
  })

  return NextResponse.json(created)
}
