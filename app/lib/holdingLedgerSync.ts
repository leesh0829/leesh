import { prisma } from '@/app/lib/prisma'
import { avgCostBeforeTx } from '@/app/lib/holdingAggregate'
import { toKrw } from '@/app/lib/fxRate'

export type SyncContext = {
  userId: string
  holdingId: string
  holdingName: string
  holdingCurrency: string
  txId: string
  type: 'BUY' | 'SELL' | 'DIVIDEND' | 'FEE' | 'TAX'
  quantity: number | null
  pricePerUnit: number | null
  amount: number
  occurredAt: Date
  memo: string | null
}

// 트랜잭션에 따라 자동 생성할 가계부 항목 정보를 계산
async function deriveLedgerPayload(
  ctx: SyncContext
): Promise<{
  type: 'INCOME' | 'EXPENSE'
  amount: number
  description: string
  category: string
  subcategory: string
} | null> {
  // 종목명 + 메모 조합
  const memoSuffix = ctx.memo ? ` · ${ctx.memo}` : ''

  // 비-KRW 종목은 가계부에 KRW 환산해서 기록 (현재 환율 기준)
  const toLedgerKrw = (nativeAmount: number) => toKrw(nativeAmount, ctx.holdingCurrency)

  if (ctx.type === 'DIVIDEND') {
    const krw = await toLedgerKrw(ctx.amount)
    return {
      type: 'INCOME',
      amount: Math.max(1, krw),
      description: `${ctx.holdingName} 배당금${memoSuffix}`,
      category: '주식/이자',
      subcategory: '배당금',
    }
  }

  if (ctx.type === 'FEE') {
    const krw = await toLedgerKrw(ctx.amount)
    return {
      type: 'EXPENSE',
      amount: Math.max(1, krw),
      description: `${ctx.holdingName} 거래 수수료${memoSuffix}`,
      category: '주식/이자',
      subcategory: '거래 수수료',
    }
  }

  if (ctx.type === 'TAX') {
    const krw = await toLedgerKrw(ctx.amount)
    return {
      type: 'EXPENSE',
      amount: Math.max(1, krw),
      description: `${ctx.holdingName} 세금${memoSuffix}`,
      category: '주식/이자',
      subcategory: '세금',
    }
  }

  if (ctx.type === 'SELL') {
    // 실현 손익 계산 — 해당 트랜잭션 시점의 평단가 기준
    const rows = await prisma.holdingTransaction.findMany({
      where: { holdingId: ctx.holdingId },
      select: {
        id: true,
        type: true,
        quantity: true,
        pricePerUnit: true,
        amount: true,
        occurredAt: true,
      },
      orderBy: { occurredAt: 'asc' },
    })
    type Row = (typeof rows)[number]
    const idx = rows.findIndex((r: Row) => r.id === ctx.txId)
    const avg = avgCostBeforeTx(
      rows.map((r: Row) => ({
        type: r.type,
        quantity: r.quantity,
        pricePerUnit: r.pricePerUnit,
        amount: r.amount,
        occurredAt: r.occurredAt,
      })),
      idx
    )
    const qty = ctx.quantity ?? 0
    const price = ctx.pricePerUnit ?? 0
    const proceeds = qty * price
    const cost = qty * avg
    const nativePnl = proceeds - cost
    if (Math.abs(nativePnl) < 0.005) return null
    const pnlKrw = await toLedgerKrw(Math.abs(nativePnl))
    if (pnlKrw === 0) return null
    if (nativePnl > 0) {
      return {
        type: 'INCOME',
        amount: pnlKrw,
        description: `${ctx.holdingName} 매도 수익${memoSuffix}`,
        category: '주식/이자',
        subcategory: '투자 수익(실현손익)',
      }
    }
    return {
      type: 'EXPENSE',
      amount: pnlKrw,
      description: `${ctx.holdingName} 매도 손실${memoSuffix}`,
      category: '주식/이자',
      subcategory: '투자 손실(실현손익)',
    }
  }

  // BUY: 가계부 연동 안 함 (자산 이동)
  return null
}

// 트랜잭션 생성/수정 시 가계부 항목 동기화
// 기존 연결된 가계부 항목이 있으면 업데이트 또는 삭제, 없으면 생성
export async function syncTransactionToLedger(
  ctx: SyncContext,
  link: boolean,
  existingLedgerEntryId: string | null
): Promise<string | null> {
  // 기존 연결 해제 또는 삭제
  if (existingLedgerEntryId) {
    await prisma.ledgerEntry.deleteMany({
      where: { id: existingLedgerEntryId, ownerId: ctx.userId },
    })
  }

  if (!link) return null

  const payload = await deriveLedgerPayload(ctx)
  if (!payload) return null

  // 종목 자체에 지정된 계좌가 있으면 그 계좌로 가계부 항목 연결
  const holding = await prisma.holding.findUnique({
    where: { id: ctx.holdingId },
    select: { accountId: true },
  })

  const created = await prisma.ledgerEntry.create({
    data: {
      ownerId: ctx.userId,
      accountId: holding?.accountId ?? null,
      type: payload.type,
      amount: payload.amount,
      description: payload.description,
      category: payload.category,
      subcategory: payload.subcategory,
      excludeFromTotals: false,
      occurredAt: ctx.occurredAt,
    },
    select: { id: true },
  })
  return created.id
}
