import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { isValidCategoryCombination } from '@/app/lib/ledgerCategories'

export const runtime = 'nodejs'

const entryPatchSchema = z
  .object({
    type: z.enum(['INCOME', 'EXPENSE']).optional(),
    amount: z
      .number()
      .int()
      .min(1)
      .max(2_000_000_000)
      .optional(),
    description: z.string().trim().min(1).max(200).optional(),
    category: z.string().trim().min(1).max(40).optional(),
    subcategory: z
      .union([z.string().trim().max(40), z.null()])
      .optional()
      .transform((v) => (v === undefined ? undefined : v ? v : null)),
    accountId: z
      .union([z.string().trim().max(40), z.null()])
      .optional()
      .transform((v) => (v === undefined ? undefined : v ? v : null)),
    excludeFromTotals: z.boolean().optional(),
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
  { params }: { params: Promise<{ entryId: string }> }
) {
  const user = await getUser()
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const { entryId } = await params
  const existing = await prisma.ledgerEntry.findUnique({
    where: { id: entryId },
    select: { id: true, ownerId: true, type: true, category: true, subcategory: true },
  })
  if (!existing)
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  if (existing.ownerId !== user.id)
    return NextResponse.json({ message: 'forbidden' }, { status: 403 })

  const parsed = await parseJsonWithSchema(req, entryPatchSchema)
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

  const nextType = parsed.data.type ?? existing.type
  const nextCategory = parsed.data.category ?? existing.category
  const nextSubcategory =
    parsed.data.subcategory === undefined
      ? existing.subcategory
      : parsed.data.subcategory

  if (
    parsed.data.type !== undefined ||
    parsed.data.category !== undefined ||
    parsed.data.subcategory !== undefined
  ) {
    if (!isValidCategoryCombination(nextType, nextCategory, nextSubcategory)) {
      return NextResponse.json(
        { message: '대분류/소분류 조합이 올바르지 않습니다.' },
        { status: 400 }
      )
    }
  }

  const occurredAt =
    parsed.data.occurredAt === undefined
      ? undefined
      : typeof parsed.data.occurredAt === 'string' && parsed.data.occurredAt
        ? new Date(parsed.data.occurredAt)
        : null

  await prisma.ledgerEntry.update({
    where: { id: entryId },
    data: {
      ...(parsed.data.type !== undefined ? { type: parsed.data.type } : {}),
      ...(parsed.data.amount !== undefined
        ? { amount: parsed.data.amount }
        : {}),
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description }
        : {}),
      ...(parsed.data.category !== undefined
        ? { category: parsed.data.category }
        : {}),
      ...(parsed.data.subcategory !== undefined
        ? { subcategory: parsed.data.subcategory }
        : {}),
      ...(parsed.data.excludeFromTotals !== undefined
        ? { excludeFromTotals: parsed.data.excludeFromTotals }
        : {}),
      ...(parsed.data.accountId !== undefined
        ? { accountId: parsed.data.accountId }
        : {}),
      ...(occurredAt !== undefined
        ? { occurredAt: occurredAt ?? new Date() }
        : {}),
    },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ entryId: string }> }
) {
  const user = await getUser()
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const { entryId } = await params
  const existing = await prisma.ledgerEntry.findUnique({
    where: { id: entryId },
    select: { ownerId: true },
  })
  if (!existing)
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  if (existing.ownerId !== user.id)
    return NextResponse.json({ message: 'forbidden' }, { status: 403 })

  await prisma.ledgerEntry.delete({ where: { id: entryId } })
  return NextResponse.json({ ok: true })
}
