import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { z } from 'zod'

export const runtime = 'nodejs'

const transferSchema = z
  .object({
    fromAccountId: z.preprocess(
      (value) => (value == null ? '' : String(value).trim()),
      z.string().min(1, '출발/도착 계좌를 모두 선택해주세요.').max(80)
    ),
    toAccountId: z.preprocess(
      (value) => (value == null ? '' : String(value).trim()),
      z.string().min(1, '출발/도착 계좌를 모두 선택해주세요.').max(80)
    ),
    amount: z
      .number()
      .finite()
      .positive('금액은 0보다 커야 합니다.')
      .max(2_000_000_000, '금액이 너무 큽니다.'),
    description: z.string().trim().max(200).optional().default(''),
    occurredAt: z.union([z.string(), z.null()]).optional().default(null),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.fromAccountId === value.toAccountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['toAccountId'],
        message: '서로 다른 계좌를 선택해주세요.',
      })
    }
    if (value.occurredAt) {
      const d = new Date(value.occurredAt)
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['occurredAt'],
          message: 'invalid occurredAt',
        })
      }
    }
  })

// 계좌간 이체 — 출발 계좌에 EXPENSE, 도착 계좌에 INCOME을 한 트랜잭션으로 생성.
// 둘 다 category="계좌이체", excludeFromTotals=true 로 자산 변동 없음 처리.
export async function POST(req: Request) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const parsed = await parseJsonWithSchema(req, transferSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid body')

  const { fromAccountId, toAccountId, description } = parsed.data
  const amount = Math.round(parsed.data.amount)
  const occurredAt = parsed.data.occurredAt
    ? new Date(parsed.data.occurredAt)
    : new Date()

  // 두 계좌 모두 본인 소유인지 검증
  const accounts = await prisma.financialAccount.findMany({
    where: { id: { in: [fromAccountId, toAccountId] }, ownerId: userId },
    select: { id: true, name: true },
  })
  if (accounts.length !== 2)
    return NextResponse.json(
      { message: '유효하지 않은 계좌입니다.' },
      { status: 400 }
    )

  const fromName = accounts.find((a) => a.id === fromAccountId)?.name ?? '계좌'
  const toName = accounts.find((a) => a.id === toAccountId)?.name ?? '계좌'
  const descBase = description || `${fromName} → ${toName} 이체`

  try {
    const result = await prisma.$transaction([
      prisma.ledgerEntry.create({
        data: {
          ownerId: userId,
          accountId: fromAccountId,
          type: 'EXPENSE',
          amount,
          description: descBase,
          category: '계좌이체',
          subcategory: null,
          excludeFromTotals: true,
          occurredAt,
        },
        select: { id: true },
      }),
      prisma.ledgerEntry.create({
        data: {
          ownerId: userId,
          accountId: toAccountId,
          type: 'INCOME',
          amount,
          description: descBase,
          category: '계좌이체',
          subcategory: null,
          excludeFromTotals: true,
          occurredAt,
        },
        select: { id: true },
      }),
    ])
    return NextResponse.json({ ok: true, ids: result.map((r) => r.id) })
  } catch (e) {
    console.error('[LEDGER_TRANSFER_ERROR]', e)
    return NextResponse.json(
      { message: '이체 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
