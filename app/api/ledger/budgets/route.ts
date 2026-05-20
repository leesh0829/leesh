import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { prisma } from '@/app/lib/prisma'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { listBudgetsWithProgress } from '@/app/lib/budgetTargets'

export const runtime = 'nodejs'

const createSchema = z
  .object({
    scope: z.enum(['CATEGORY', 'SUBCATEGORY', 'ACCOUNT']),
    category: z.union([z.string().trim().max(40), z.null()]).optional(),
    subcategory: z.union([z.string().trim().max(40), z.null()]).optional(),
    accountId: z.union([z.string().trim().max(40), z.null()]).optional(),
    amount: z.number().int().min(1).max(2_000_000_000),
    memo: z.union([z.string().trim().max(200), z.null()]).optional(),
    enabled: z.boolean().optional().default(true),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.scope === 'CATEGORY' && !v.category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['category'],
        message: 'category required',
      })
    }
    if (v.scope === 'SUBCATEGORY' && (!v.category || !v.subcategory)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subcategory'],
        message: 'category + subcategory required',
      })
    }
    if (v.scope === 'ACCOUNT' && !v.accountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accountId'],
        message: 'accountId required',
      })
    }
  })

async function getUserIdOr401() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return null
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  return user?.id ?? null
}

export async function GET() {
  const userId = await getUserIdOr401()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  try {
    const data = await listBudgetsWithProgress(userId)
    return NextResponse.json(data)
  } catch (e) {
    console.error('[BUDGETS_LIST_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const userId = await getUserIdOr401()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const parsed = await parseJsonWithSchema(req, createSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid body')
  const v = parsed.data

  // 계좌 소유 확인
  if (v.scope === 'ACCOUNT' && v.accountId) {
    const acc = await prisma.financialAccount.findFirst({
      where: { id: v.accountId, ownerId: userId },
      select: { id: true },
    })
    if (!acc)
      return NextResponse.json({ message: 'account not found' }, { status: 404 })
  }

  const created = await prisma.budgetTarget.create({
    data: {
      ownerId: userId,
      scope: v.scope,
      category: v.scope === 'ACCOUNT' ? null : (v.category ?? null),
      subcategory: v.scope === 'SUBCATEGORY' ? (v.subcategory ?? null) : null,
      accountId: v.scope === 'ACCOUNT' ? (v.accountId ?? null) : null,
      amount: v.amount,
      memo: v.memo ?? null,
      enabled: v.enabled,
    },
    select: { id: true },
  })

  return NextResponse.json(created)
}
