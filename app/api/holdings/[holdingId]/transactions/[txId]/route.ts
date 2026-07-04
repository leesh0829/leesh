import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { normalizeHoldingTransactionAmounts } from '@/app/lib/holdingTransactionValidation'
import { updateHoldingTransactionWithLedgerSync } from '@/app/lib/holdingTransactionMutation'
import { syncTransactionToLedger } from '@/app/lib/holdingLedgerSync'
import { prepareHoldingLedgerSyncContext } from '@/app/lib/holdingLedgerSyncContext'
import { getKrwRate } from '@/app/lib/fxRate'

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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ holdingId: string; txId: string }> }
) {
  const userId = await getCurrentUserId()
  if (!userId)
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
  if (existing.holding.ownerId !== userId)
    return NextResponse.json({ message: 'forbidden' }, { status: 403 })

  const parsed = await parseJsonWithSchema(req, txPatchSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid body')

  const nextType = parsed.data.type ?? existing.type
  const candidateQuantity =
    parsed.data.quantity !== undefined ? parsed.data.quantity : existing.quantity
  const candidatePrice =
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

  const isTrade = nextType === 'BUY' || nextType === 'SELL'
  const normalized = normalizeHoldingTransactionAmounts({
    type: nextType,
    quantity: isTrade ? candidateQuantity : null,
    pricePerUnit: isTrade ? candidatePrice : null,
    amount: isTrade
      ? parsed.data.amount
      : parsed.data.amount !== undefined
        ? parsed.data.amount
        : existing.amount,
  })
  if (!normalized.ok) {
    return NextResponse.json(
      { message: normalized.message },
      { status: 400 }
    )
  }

  const {
    quantity: nextQuantity,
    pricePerUnit: nextPrice,
    amount: nextAmount,
  } = normalized

  const link =
    parsed.data.linkToLedger !== undefined
      ? parsed.data.linkToLedger
      : !!existing.ledgerEntryId

  const result = await updateHoldingTransactionWithLedgerSync(
    {
      txId,
      data: {
        type: nextType,
        quantity: nextQuantity,
        pricePerUnit: nextPrice,
        amount: nextAmount,
        occurredAt: nextOccurredAt,
        memo: nextMemo,
      },
      syncContext: {
        userId,
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
      linkToLedger: link,
      existingLedgerEntryId: existing.ledgerEntryId,
    },
    prisma,
    syncTransactionToLedger,
    (ctx, link) => prepareHoldingLedgerSyncContext(ctx, link, getKrwRate)
  )

  return NextResponse.json({ ok: true, ledgerEntryId: result.ledgerEntryId })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ holdingId: string; txId: string }> }
) {
  const userId = await getCurrentUserId()
  if (!userId)
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
  if (existing.holding.ownerId !== userId)
    return NextResponse.json({ message: 'forbidden' }, { status: 403 })

  if (existing.ledgerEntryId) {
    await prisma.ledgerEntry.deleteMany({
      where: { id: existing.ledgerEntryId, ownerId: userId },
    })
  }

  await prisma.holdingTransaction.delete({ where: { id: txId } })
  return NextResponse.json({ ok: true })
}
