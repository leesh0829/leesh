import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { toISOStringSafe, toISOStringNullable } from '@/app/lib/date'
import { summarizeSettlements } from '@/app/lib/settlements'

export const runtime = 'nodejs'

const createSchema = z
  .object({
    kind: z.enum(['REIMBURSEMENT', 'EMERGENCY']),
    amount: z.number().int().min(1).max(2_000_000_000),
    description: z.string().trim().min(1).max(200),
    occurredAt: z.union([z.string(), z.null()]).optional(),
    accountId: z.union([z.string().trim().max(40), z.null()]).optional(),
    memo: z.union([z.string().trim().max(200), z.null()]).optional(),
  })
  .strict()

export async function GET(req: Request) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const kindParam = searchParams.get('kind')
  const statusParam = searchParams.get('status')

  const where: {
    ownerId: string
    kind?: 'REIMBURSEMENT' | 'EMERGENCY'
    status?: 'PENDING' | 'SETTLED'
  } = { ownerId: userId }
  if (kindParam === 'REIMBURSEMENT' || kindParam === 'EMERGENCY')
    where.kind = kindParam
  if (statusParam === 'PENDING' || statusParam === 'SETTLED')
    where.status = statusParam

  const [rows, pending] = await Promise.all([
    prisma.settlement.findMany({
      where,
      orderBy: [{ status: 'asc' }, { occurredAt: 'desc' }],
      include: { account: { select: { name: true } } },
    }),
    prisma.settlement.findMany({
      where: { ownerId: userId, status: 'PENDING' },
      select: { kind: true, status: true, amount: true },
    }),
  ])

  const items = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    amount: r.amount,
    description: r.description,
    accountId: r.accountId,
    accountName: r.account?.name ?? null,
    memo: r.memo,
    occurredAt: toISOStringSafe(r.occurredAt),
    settledAt: toISOStringNullable(r.settledAt),
    createdAt: toISOStringSafe(r.createdAt),
  }))

  const summary = summarizeSettlements(pending)
  return NextResponse.json({ items, summary })
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const parsed = await parseJsonWithSchema(req, createSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid body')
  const v = parsed.data

  if (v.accountId) {
    const acc = await prisma.financialAccount.findFirst({
      where: { id: v.accountId, ownerId: userId },
      select: { id: true },
    })
    if (!acc)
      return NextResponse.json({ message: 'account not found' }, { status: 404 })
  }

  const occurredAt =
    v.occurredAt && !Number.isNaN(new Date(v.occurredAt).getTime())
      ? new Date(v.occurredAt)
      : new Date()

  const created = await prisma.settlement.create({
    data: {
      ownerId: userId,
      kind: v.kind,
      amount: v.amount,
      description: v.description,
      occurredAt,
      accountId: v.accountId ?? null,
      memo: v.memo ?? null,
    },
    select: { id: true },
  })

  return NextResponse.json(created)
}
