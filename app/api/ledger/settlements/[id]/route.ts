import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { settledAtForStatus } from '@/app/lib/settlements'

export const runtime = 'nodejs'

const updateSchema = z
  .object({
    kind: z.enum(['REIMBURSEMENT', 'EMERGENCY']).optional(),
    amount: z.number().int().min(1).max(2_000_000_000).optional(),
    description: z.string().trim().min(1).max(200).optional(),
    occurredAt: z.union([z.string(), z.null()]).optional(),
    accountId: z.union([z.string().trim().max(40), z.null()]).optional(),
    memo: z.union([z.string().trim().max(200), z.null()]).optional(),
    status: z.enum(['PENDING', 'SETTLED']).optional(),
  })
  .strict()

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const existing = await prisma.settlement.findFirst({
    where: { id, ownerId: userId },
    select: { id: true },
  })
  if (!existing)
    return NextResponse.json({ message: 'not found' }, { status: 404 })

  const parsed = await parseJsonWithSchema(req, updateSchema)
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

  const data: Record<string, unknown> = {}
  if (v.kind !== undefined) data.kind = v.kind
  if (v.amount !== undefined) data.amount = v.amount
  if (v.description !== undefined) data.description = v.description
  if (v.accountId !== undefined) data.accountId = v.accountId
  if (v.memo !== undefined) data.memo = v.memo
  if (
    v.occurredAt !== undefined &&
    v.occurredAt &&
    !Number.isNaN(new Date(v.occurredAt).getTime())
  )
    data.occurredAt = new Date(v.occurredAt)
  if (v.status !== undefined) {
    data.status = v.status
    data.settledAt = settledAtForStatus(v.status, new Date())
  }

  await prisma.settlement.update({ where: { id }, data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const existing = await prisma.settlement.findFirst({
    where: { id, ownerId: userId },
    select: { id: true },
  })
  if (!existing)
    return NextResponse.json({ message: 'not found' }, { status: 404 })

  await prisma.settlement.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
