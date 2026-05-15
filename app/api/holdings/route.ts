import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { toISOStringSafe } from '@/app/lib/date'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { aggregateHolding } from '@/app/lib/holdingAggregate'
import { getReadableScheduleOwnerIds, toUserLabel } from '@/app/lib/scheduleShare'

export const runtime = 'nodejs'

const holdingCreateSchema = z
  .object({
    name: z.string().trim().min(1, 'name required').max(60),
    symbol: z
      .union([z.string().trim().max(20), z.null()])
      .optional()
      .transform((v) => (v ? v : null)),
    exchange: z
      .union([z.string().trim().max(20), z.null()])
      .optional()
      .transform((v) => (v ? v : null)),
    currency: z.string().trim().min(1).max(8).optional().default('KRW'),
    memo: z
      .union([z.string().trim().max(500), z.null()])
      .optional()
      .transform((v) => (v ? v : null)),
    currentPrice: z
      .union([z.number().min(0).max(2_000_000_000_000), z.null()])
      .optional(),
    accountId: z
      .union([z.string().trim().max(40), z.null()])
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .strict()

async function getUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return null
  return prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
}

type HoldingRow = {
  id: string
  ownerId: string
  accountId: string | null
  name: string
  symbol: string | null
  exchange: string | null
  currency: string
  memo: string | null
  currentPrice: number | null
  priceUpdatedAt: Date | null
  createdAt: Date
  updatedAt: Date
  owner: { id: string; name: string | null; email: string | null }
  account: {
    id: string
    name: string
    bankName: string | null
    types: string[]
  } | null
  transactions: {
    type: 'BUY' | 'SELL' | 'DIVIDEND' | 'FEE' | 'TAX'
    quantity: number | null
    pricePerUnit: number | null
    amount: number
    occurredAt: Date
  }[]
}

export async function GET(req: Request) {
  const user = await getUser()
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const readableOwnerIds = await getReadableScheduleOwnerIds(user.id, 'STOCK')

  const url = new URL(req.url)
  const excludeOwnersParam = url.searchParams.get('excludeOwners')
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

  const rows: HoldingRow[] = await prisma.holding.findMany({
    where: { ownerId: { in: effectiveOwnerIds } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      ownerId: true,
      accountId: true,
      name: true,
      symbol: true,
      exchange: true,
      currency: true,
      memo: true,
      currentPrice: true,
      priceUpdatedAt: true,
      createdAt: true,
      updatedAt: true,
      owner: { select: { id: true, name: true, email: true } },
      account: {
        select: { id: true, name: true, bankName: true, types: true },
      },
      transactions: {
        select: {
          type: true,
          quantity: true,
          pricePerUnit: true,
          amount: true,
          occurredAt: true,
        },
      },
    },
  })

  const items = rows.map((row: HoldingRow) => {
    const agg = aggregateHolding(
      row.transactions.map((t) => ({
        type: t.type,
        quantity: t.quantity,
        pricePerUnit: t.pricePerUnit,
        amount: t.amount,
        occurredAt: t.occurredAt,
      })),
      row.currentPrice
    )
    return {
      id: row.id,
      ownerId: row.ownerId,
      ownerLabel: toUserLabel(row.owner.name, row.owner.email),
      shared: row.ownerId !== user.id,
      canEdit: row.ownerId === user.id,
      accountId: row.accountId,
      accountName: row.account?.name ?? null,
      accountBank: row.account?.bankName ?? null,
      accountTypes: row.account?.types ?? [],
      name: row.name,
      symbol: row.symbol,
      exchange: row.exchange,
      currency: row.currency,
      memo: row.memo,
      currentPrice: row.currentPrice,
      priceUpdatedAt: row.priceUpdatedAt
        ? toISOStringSafe(row.priceUpdatedAt)
        : null,
      createdAt: toISOStringSafe(row.createdAt),
      updatedAt: toISOStringSafe(row.updatedAt),
      aggregate: agg,
      txCount: row.transactions.length,
    }
  })

  return NextResponse.json({ items })
}

export async function POST(req: Request) {
  const user = await getUser()
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const parsed = await parseJsonWithSchema(req, holdingCreateSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid body')

  // 계좌 본인 소유 검증
  if (parsed.data.accountId) {
    const acc = await prisma.financialAccount.findUnique({
      where: { id: parsed.data.accountId },
      select: { ownerId: true },
    })
    if (!acc || acc.ownerId !== user.id) {
      return NextResponse.json(
        { message: '유효하지 않은 계좌입니다.' },
        { status: 400 }
      )
    }
  }

  const created = await prisma.holding.create({
    data: {
      ownerId: user.id,
      accountId: parsed.data.accountId ?? null,
      name: parsed.data.name,
      symbol: parsed.data.symbol,
      exchange: parsed.data.exchange,
      currency: parsed.data.currency,
      memo: parsed.data.memo,
      currentPrice: parsed.data.currentPrice ?? null,
      priceUpdatedAt: parsed.data.currentPrice ? new Date() : null,
    },
    select: { id: true },
  })

  return NextResponse.json(created)
}
