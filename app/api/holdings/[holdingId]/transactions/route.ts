import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { syncTransactionToLedger } from '@/app/lib/holdingLedgerSync'

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

async function getUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return null
  return prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ holdingId: string }> }
) {
  const user = await getUser()
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const { holdingId } = await params
  const holding = await prisma.holding.findUnique({
    where: { id: holdingId },
    select: { id: true, ownerId: true, name: true, currency: true },
  })
  if (!holding)
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  if (holding.ownerId !== user.id)
    return NextResponse.json({ message: 'forbidden' }, { status: 403 })

  const parsed = await parseJsonWithSchema(req, txCreateSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid body')

  const { type, linkToLedger } = parsed.data
  const occurredAt =
    typeof parsed.data.occurredAt === 'string' && parsed.data.occurredAt
      ? new Date(parsed.data.occurredAt)
      : new Date()

  // BUY/SELL: quantity & pricePerUnit 필수, amount = qty * price
  // DIVIDEND/FEE/TAX: amount 필수
  let quantity: number | null = null
  let pricePerUnit: number | null = null
  let amount = 0
  if (type === 'BUY' || type === 'SELL') {
    quantity = parsed.data.quantity ?? null
    pricePerUnit = parsed.data.pricePerUnit ?? null
    if (
      quantity === null ||
      quantity <= 0 ||
      pricePerUnit === null ||
      pricePerUnit < 0
    ) {
      return NextResponse.json(
        { message: '수량과 단가를 입력해 주세요.' },
        { status: 400 }
      )
    }
    amount = quantity * pricePerUnit
  } else {
    if (
      parsed.data.amount === undefined ||
      parsed.data.amount === null ||
      parsed.data.amount <= 0
    ) {
      return NextResponse.json(
        { message: '금액을 입력해 주세요.' },
        { status: 400 }
      )
    }
    amount = parsed.data.amount
  }

  const created = await prisma.holdingTransaction.create({
    data: {
      holdingId,
      type,
      quantity,
      pricePerUnit,
      amount,
      occurredAt,
      memo: parsed.data.memo,
    },
    select: { id: true },
  })

  // 가계부 자동 연동
  const ledgerEntryId = await syncTransactionToLedger(
    {
      userId: user.id,
      holdingId,
      holdingName: holding.name,
      holdingCurrency: holding.currency,
      txId: created.id,
      type,
      quantity,
      pricePerUnit,
      amount,
      occurredAt,
      memo: parsed.data.memo,
    },
    linkToLedger,
    null
  )
  if (ledgerEntryId) {
    await prisma.holdingTransaction.update({
      where: { id: created.id },
      data: { ledgerEntryId },
    })
  }

  return NextResponse.json({ id: created.id, ledgerEntryId })
}
