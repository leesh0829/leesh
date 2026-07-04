import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { getCurrentUserId } from '@/app/lib/serverAuth'

export const runtime = 'nodejs'

const updateSchema = z
  .object({
    amount: z.number().int().min(1).max(2_000_000_000).optional(),
    memo: z.union([z.string().trim().max(200), z.null()]).optional(),
    enabled: z.boolean().optional(),
  })
  .strict()

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const existing = await prisma.budgetTarget.findFirst({
    where: { id, ownerId: userId },
    select: { id: true },
  })
  if (!existing)
    return NextResponse.json({ message: 'not found' }, { status: 404 })

  const parsed = await parseJsonWithSchema(req, updateSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid body')

  const data: Record<string, unknown> = {}
  if (parsed.data.amount !== undefined) data.amount = parsed.data.amount
  if (parsed.data.memo !== undefined) data.memo = parsed.data.memo
  if (parsed.data.enabled !== undefined) data.enabled = parsed.data.enabled

  const updated = await prisma.budgetTarget.update({
    where: { id },
    data,
    select: { id: true },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const existing = await prisma.budgetTarget.findFirst({
    where: { id, ownerId: userId },
    select: { id: true },
  })
  if (!existing)
    return NextResponse.json({ message: 'not found' }, { status: 404 })

  await prisma.budgetTarget.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
