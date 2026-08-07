import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { toISOStringSafe, toISOStringNullable } from '@/app/lib/date'
import {
  summarizeSettlements,
  type SettlementKind,
  type SettlementStatus,
} from '@/app/lib/settlements'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const kindParam = searchParams.get('kind')
  const statusParam = searchParams.get('status')

  const kind: SettlementKind | undefined =
    kindParam === 'REIMBURSEMENT' || kindParam === 'EMERGENCY'
      ? kindParam
      : undefined
  const status: SettlementStatus | undefined =
    statusParam === 'PENDING' || statusParam === 'SETTLED'
      ? statusParam
      : undefined

  const [rows, pending] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: {
        ownerId: userId,
        settlementKind: kind ?? { not: null },
        ...(status ? { settlementStatus: status } : {}),
      },
      orderBy: [{ settlementStatus: 'asc' }, { occurredAt: 'desc' }],
      select: {
        id: true,
        accountId: true,
        amount: true,
        description: true,
        settlementKind: true,
        settlementStatus: true,
        occurredAt: true,
        settledAt: true,
        account: { select: { name: true, bankName: true } },
      },
    }),
    prisma.ledgerEntry.findMany({
      where: {
        ownerId: userId,
        settlementKind: { not: null },
        settlementStatus: 'PENDING',
      },
      select: { settlementKind: true, settlementStatus: true, amount: true },
    }),
  ])

  const items = rows.map((r) => ({
    id: r.id,
    accountId: r.accountId,
    accountName: r.account?.name ?? null,
    accountBank: r.account?.bankName ?? null,
    amount: r.amount,
    description: r.description,
    kind: r.settlementKind as SettlementKind,
    status: r.settlementStatus as SettlementStatus,
    occurredAt: toISOStringSafe(r.occurredAt),
    settledAt: toISOStringNullable(r.settledAt),
  }))

  const summary = summarizeSettlements(
    pending.map((p) => ({
      kind: p.settlementKind as SettlementKind,
      status: p.settlementStatus as SettlementStatus,
      amount: p.amount,
    }))
  )

  return NextResponse.json({ items, summary })
}
