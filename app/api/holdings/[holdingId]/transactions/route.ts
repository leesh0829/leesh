import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { normalizeHoldingTransactionAmounts } from '@/app/lib/holdingTransactionValidation'
import { createHoldingTransactionWithLedgerSync } from '@/app/lib/holdingTransactionMutation'
import { syncTransactionToLedger } from '@/app/lib/holdingLedgerSync'
import { prepareHoldingLedgerSyncContext } from '@/app/lib/holdingLedgerSyncContext'
import { getKrwRate } from '@/app/lib/fxRate'

export const runtime = 'nodejs'

const txCreateSchema = z
  .object({
    type: z.enum(['BUY', 'SELL', 'DIVIDEND', 'FEE', 'TAX']),
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
      .transform((v) => (v ? v : null)),
    linkToLedger: z.boolean().optional().default(false),
  })
  .strict()

export async function POST(
  req: Request,
  { params }: { params: Promise<{ holdingId: string }> }
) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const { holdingId } = await params
  const holding = await prisma.holding.findUnique({
    where: { id: holdingId },
    select: { id: true, ownerId: true, name: true, currency: true },
  })
  if (!holding)
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  if (holding.ownerId !== userId)
    return NextResponse.json({ message: 'forbidden' }, { status: 403 })

  const parsed = await parseJsonWithSchema(req, txCreateSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid body')

  const { type, linkToLedger } = parsed.data
  const occurredAt =
    typeof parsed.data.occurredAt === 'string' && parsed.data.occurredAt
      ? new Date(parsed.data.occurredAt)
      : new Date()

  // BUY/SELL: quantity & pricePerUnit 필수, amount 미지정 시 qty * price.
  // DIVIDEND/FEE/TAX: amount 필수, quantity/price는 저장하지 않음.
  const isTrade = type === 'BUY' || type === 'SELL'
  const normalized = normalizeHoldingTransactionAmounts({
    type,
    quantity: isTrade ? (parsed.data.quantity ?? null) : null,
    pricePerUnit: isTrade ? (parsed.data.pricePerUnit ?? null) : null,
    amount: parsed.data.amount,
  })
  if (!normalized.ok) {
    return NextResponse.json(
      { message: normalized.message },
      { status: 400 }
    )
  }

  const { quantity, pricePerUnit, amount } = normalized

  const result = await createHoldingTransactionWithLedgerSync(
    {
      data: {
        holdingId,
        type,
        quantity,
        pricePerUnit,
        amount,
        occurredAt,
        memo: parsed.data.memo,
      },
      syncContext: {
        userId,
        holdingId,
        holdingName: holding.name,
        holdingCurrency: holding.currency,
        type,
        quantity,
        pricePerUnit,
        amount,
        occurredAt,
        memo: parsed.data.memo,
      },
      linkToLedger,
    },
    prisma,
    syncTransactionToLedger,
    (ctx, link) => prepareHoldingLedgerSyncContext(ctx, link, getKrwRate)
  )

  return NextResponse.json(result)
}
