import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'

export const runtime = 'nodejs'

// 계좌간 이체 — 출발 계좌에 EXPENSE, 도착 계좌에 INCOME을 한 트랜잭션으로 생성.
// 둘 다 category="계좌이체", excludeFromTotals=true 로 자산 변동 없음 처리.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const body = (await req.json()) as {
    fromAccountId?: string
    toAccountId?: string
    amount?: number
    description?: string
    occurredAt?: string | null
  }

  const fromAccountId = body.fromAccountId?.trim() ?? ''
  const toAccountId = body.toAccountId?.trim() ?? ''
  const amount = typeof body.amount === 'number' ? Math.round(body.amount) : NaN
  const description = (body.description ?? '').trim()
  const occurredAt =
    typeof body.occurredAt === 'string' && body.occurredAt
      ? new Date(body.occurredAt)
      : new Date()

  if (!fromAccountId || !toAccountId)
    return NextResponse.json(
      { message: '출발/도착 계좌를 모두 선택해주세요.' },
      { status: 400 }
    )
  if (fromAccountId === toAccountId)
    return NextResponse.json(
      { message: '서로 다른 계좌를 선택해주세요.' },
      { status: 400 }
    )
  if (!Number.isFinite(amount) || amount <= 0)
    return NextResponse.json(
      { message: '금액은 0보다 커야 합니다.' },
      { status: 400 }
    )

  // 두 계좌 모두 본인 소유인지 검증
  const accounts = await prisma.financialAccount.findMany({
    where: { id: { in: [fromAccountId, toAccountId] }, ownerId: user.id },
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
          ownerId: user.id,
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
          ownerId: user.id,
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
