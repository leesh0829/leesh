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

const holdingPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    symbol: z
      .union([z.string().trim().max(20), z.null()])
      .optional()
      .transform((v) => (v === undefined ? undefined : v ? v : null)),
    exchange: z
      .union([z.string().trim().max(20), z.null()])
      .optional()
      .transform((v) => (v === undefined ? undefined : v ? v : null)),
    currency: z.string().trim().min(1).max(8).optional(),
    memo: z
      .union([z.string().trim().max(500), z.null()])
      .optional()
      .transform((v) => (v === undefined ? undefined : v ? v : null)),
    currentPrice: z
      .union([z.number().min(0).max(2_000_000_000_000), z.null()])
      .optional(),
    accountId: z
      .union([z.string().trim().max(40), z.null()])
      .optional()
      .transform((v) => (v === undefined ? undefined : v ? v : null)),
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

type TxRow = {
  id: string
  type: 'BUY' | 'SELL' | 'DIVIDEND' | 'FEE' | 'TAX'
  quantity: number | null
  pricePerUnit: number | null
  amount: number
  occurredAt: Date
  memo: string | null
  ledgerEntryId: string | null
  createdAt: Date
  updatedAt: Date
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ holdingId: string }> }
) {
  const user = await getUser()
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const { holdingId } = await params
  const holding = await prisma.holding.findUnique({
    where: { id: holdingId },
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
        orderBy: { occurredAt: 'desc' },
        select: {
          id: true,
          type: true,
          quantity: true,
          pricePerUnit: true,
          amount: true,
          occurredAt: true,
          memo: true,
          ledgerEntryId: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  })
  if (!holding)
    return NextResponse.json({ message: 'not found' }, { status: 404 })

  const readableOwnerIds = await getReadableScheduleOwnerIds(user.id, 'STOCK')
  if (!readableOwnerIds.includes(holding.ownerId))
    return NextResponse.json({ message: 'forbidden' }, { status: 403 })

  const agg = aggregateHolding(
    holding.transactions.map((t: TxRow) => ({
      type: t.type,
      quantity: t.quantity,
      pricePerUnit: t.pricePerUnit,
      amount: t.amount,
      occurredAt: t.occurredAt,
    })),
    holding.currentPrice
  )

  return NextResponse.json({
    id: holding.id,
    ownerId: holding.ownerId,
    ownerLabel: toUserLabel(holding.owner.name, holding.owner.email),
    shared: holding.ownerId !== user.id,
    canEdit: holding.ownerId === user.id,
    accountId: holding.accountId,
    accountName: holding.account?.name ?? null,
    accountBank: holding.account?.bankName ?? null,
    accountTypes: holding.account?.types ?? [],
    name: holding.name,
    symbol: holding.symbol,
    exchange: holding.exchange,
    currency: holding.currency,
    memo: holding.memo,
    currentPrice: holding.currentPrice,
    priceUpdatedAt: holding.priceUpdatedAt
      ? toISOStringSafe(holding.priceUpdatedAt)
      : null,
    createdAt: toISOStringSafe(holding.createdAt),
    updatedAt: toISOStringSafe(holding.updatedAt),
    aggregate: agg,
    transactions: holding.transactions.map((t: TxRow) => ({
      id: t.id,
      type: t.type,
      quantity: t.quantity,
      pricePerUnit: t.pricePerUnit,
      amount: t.amount,
      occurredAt: toISOStringSafe(t.occurredAt),
      memo: t.memo,
      linked: !!t.ledgerEntryId,
      createdAt: toISOStringSafe(t.createdAt),
      updatedAt: toISOStringSafe(t.updatedAt),
    })),
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ holdingId: string }> }
) {
  const user = await getUser()
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const { holdingId } = await params
  const existing = await prisma.holding.findUnique({
    where: { id: holdingId },
    select: { ownerId: true },
  })
  if (!existing)
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  if (existing.ownerId !== user.id)
    return NextResponse.json({ message: 'forbidden' }, { status: 403 })

  const parsed = await parseJsonWithSchema(req, holdingPatchSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid body')

  // 계좌 변경 시 본인 소유 검증
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

  await prisma.holding.update({
    where: { id: holdingId },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.symbol !== undefined
        ? { symbol: parsed.data.symbol }
        : {}),
      ...(parsed.data.exchange !== undefined
        ? { exchange: parsed.data.exchange }
        : {}),
      ...(parsed.data.currency !== undefined
        ? { currency: parsed.data.currency }
        : {}),
      ...(parsed.data.memo !== undefined ? { memo: parsed.data.memo } : {}),
      ...(parsed.data.currentPrice !== undefined
        ? {
            currentPrice: parsed.data.currentPrice,
            priceUpdatedAt:
              parsed.data.currentPrice !== null ? new Date() : null,
          }
        : {}),
      ...(parsed.data.accountId !== undefined
        ? { accountId: parsed.data.accountId }
        : {}),
    },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ holdingId: string }> }
) {
  const user = await getUser()
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const { holdingId } = await params
  const existing = await prisma.holding.findUnique({
    where: { id: holdingId },
    select: { ownerId: true },
  })
  if (!existing)
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  if (existing.ownerId !== user.id)
    return NextResponse.json({ message: 'forbidden' }, { status: 403 })

  // 연결된 가계부 항목들도 함께 정리 (txs cascade delete 전에)
  const linkedTxs: { ledgerEntryId: string | null }[] =
    await prisma.holdingTransaction.findMany({
      where: { holdingId, ledgerEntryId: { not: null } },
      select: { ledgerEntryId: true },
    })
  const ledgerIds = linkedTxs
    .map((r) => r.ledgerEntryId)
    .filter((v): v is string => !!v)
  if (ledgerIds.length > 0) {
    await prisma.ledgerEntry.deleteMany({
      where: { id: { in: ledgerIds }, ownerId: user.id },
    })
  }

  await prisma.holding.delete({ where: { id: holdingId } })
  return NextResponse.json({ ok: true })
}
