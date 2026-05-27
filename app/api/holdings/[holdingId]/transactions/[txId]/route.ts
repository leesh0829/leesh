import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { syncTransactionToLedger } from '@/app/lib/holdingLedgerSync'

export const runtime = 'nodejs'

const txPatchSchema = z
  .object({
    type: z.enum(['BUY', 'SELL', 'DIVIDEND', 'FEE', 'TAX']).optional(),
    quantity: z
      .union([z.number().min(0).max(1_000_000_000), z.null()])
      .optional(),
    pricePerUnit: z
      .union([z.number().min(0).max(2_000_000_000_000), z.null()])
      .optional(),
    amount: z.number().min(0).max(2_000_000_000_000).optional(),
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
    memo: z
      .union([z.string().trim().max(500), z.null()])
      .optional()
      .transform((v) => (v === undefined ? undefined : v ? v : null)),
    linkToLedger: z.boolean().optional(),
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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ holdingId: string; txId: string }> }
) {
  const user = await getUser()
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const { holdingId, txId } = await params
  const existing = await prisma.holdingTransaction.findUnique({
    where: { id: txId },
    select: {
      id: true,
      holdingId: true,
      type: true,
      quantity: true,
      pricePerUnit: true,
      amount: true,
      occurredAt: true,
      memo: true,
      ledgerEntryId: true,
      holding: { select: { ownerId: true, name: true, currency: true } },
    },
  })
  if (!existing || existing.holdingId !== holdingId)
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  if (existing.holding.ownerId !== user.id)
    return NextResponse.json({ message: 'forbidden' }, { status: 403 })

  const parsed = await parseJsonWithSchema(req, txPatchSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid body')

  const nextType = parsed.data.type ?? existing.type
  const nextQuantity =
    parsed.data.quantity !== undefined ? parsed.data.quantity : existing.quantity
  const nextPrice =
    parsed.data.pricePerUnit !== undefined
      ? parsed.data.pricePerUnit
      : existing.pricePerUnit
  const nextMemo =
    parsed.data.memo !== undefined ? parsed.data.memo : existing.memo
  const nextOccurredAt =
    parsed.data.occurredAt === undefined
      ? existing.occurredAt
      : typeof parsed.data.occurredAt === 'string' && parsed.data.occurredAt
        ? new Date(parsed.data.occurredAt)
        : existing.occurredAt

  let nextAmount = existing.amount
  if (nextType === 'BUY' || nextType === 'SELL') {
    if (nextQuantity === null || nextPrice === null) {
      return NextResponse.json(
        { message: '수량과 단가를 입력해 주세요.' },
        { status: 400 }
      )
    }
    // 클라이언트가 amount를 명시적으로 보냈으면 그 값 우선 (소수점매수/매도)
    nextAmount =
      parsed.data.amount !== undefined && parsed.data.amount > 0
        ? parsed.data.amount
        : nextQuantity * nextPrice
  } else {
    if (parsed.data.amount !== undefined) {
      nextAmount = parsed.data.amount
    }
  }

  await prisma.holdingTransaction.update({
    where: { id: txId },
    data: {
      type: nextType,
      quantity: nextQuantity,
      pricePerUnit: nextPrice,
      amount: nextAmount,
      occurredAt: nextOccurredAt,
      memo: nextMemo,
    },
  })

  // 가계부 동기화
  // linkToLedger가 명시되지 않았으면 기존 연결 유지 (재계산해서 업데이트)
  const link =
    parsed.data.linkToLedger !== undefined
      ? parsed.data.linkToLedger
      : !!existing.ledgerEntryId

  const newLedgerEntryId = await syncTransactionToLedger(
    {
      userId: user.id,
      holdingId,
      holdingName: existing.holding.name,
      holdingCurrency: existing.holding.currency,
      txId,
      type: nextType,
      quantity: nextQuantity,
      pricePerUnit: nextPrice,
      amount: nextAmount,
      occurredAt: nextOccurredAt,
      memo: nextMemo,
    },
    link,
    existing.ledgerEntryId
  )
  await prisma.holdingTransaction.update({
    where: { id: txId },
    data: { ledgerEntryId: newLedgerEntryId },
  })

  return NextResponse.json({ ok: true, ledgerEntryId: newLedgerEntryId })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ holdingId: string; txId: string }> }
) {
  const user = await getUser()
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const { holdingId, txId } = await params
  const existing = await prisma.holdingTransaction.findUnique({
    where: { id: txId },
    select: {
      id: true,
      holdingId: true,
      ledgerEntryId: true,
      holding: { select: { ownerId: true } },
    },
  })
  if (!existing || existing.holdingId !== holdingId)
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  if (existing.holding.ownerId !== user.id)
    return NextResponse.json({ message: 'forbidden' }, { status: 403 })

  if (existing.ledgerEntryId) {
    await prisma.ledgerEntry.deleteMany({
      where: { id: existing.ledgerEntryId, ownerId: user.id },
    })
  }

  await prisma.holdingTransaction.delete({ where: { id: txId } })
  return NextResponse.json({ ok: true })
}
