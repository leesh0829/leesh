import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import {
  ACCOUNT_TYPES,
  validateAccountTypes,
  type AccountType,
} from '@/app/lib/accountTypes'

export const runtime = 'nodejs'

const accountPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    bankName: z
      .union([z.string().trim().max(60), z.null()])
      .optional()
      .transform((v) => (v === undefined ? undefined : v ? v : null)),
    types: z.array(z.enum(ACCOUNT_TYPES)).min(1).optional(),
    memo: z
      .union([z.string().trim().max(500), z.null()])
      .optional()
      .transform((v) => (v === undefined ? undefined : v ? v : null)),
    initialBalance: z
      .number()
      .int()
      .min(-2_000_000_000)
      .max(2_000_000_000)
      .optional(),
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
  { params }: { params: Promise<{ accountId: string }> }
) {
  const user = await getUser()
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const { accountId } = await params
  const existing = await prisma.financialAccount.findUnique({
    where: { id: accountId },
    select: { ownerId: true },
  })
  if (!existing)
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  if (existing.ownerId !== user.id)
    return NextResponse.json({ message: 'forbidden' }, { status: 403 })

  const parsed = await parseJsonWithSchema(req, accountPatchSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid body')

  if (parsed.data.types !== undefined) {
    const validationError = validateAccountTypes(
      parsed.data.types as AccountType[]
    )
    if (validationError)
      return NextResponse.json({ message: validationError }, { status: 400 })
  }

  await prisma.financialAccount.update({
    where: { id: accountId },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.bankName !== undefined
        ? { bankName: parsed.data.bankName }
        : {}),
      ...(parsed.data.types !== undefined
        ? { types: parsed.data.types as AccountType[] }
        : {}),
      ...(parsed.data.memo !== undefined ? { memo: parsed.data.memo } : {}),
      ...(parsed.data.initialBalance !== undefined
        ? { initialBalance: parsed.data.initialBalance }
        : {}),
    },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const user = await getUser()
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const { accountId } = await params
  const existing = await prisma.financialAccount.findUnique({
    where: { id: accountId },
    select: { ownerId: true },
  })
  if (!existing)
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  if (existing.ownerId !== user.id)
    return NextResponse.json({ message: 'forbidden' }, { status: 403 })

  await prisma.financialAccount.delete({ where: { id: accountId } })
  return NextResponse.json({ ok: true })
}
