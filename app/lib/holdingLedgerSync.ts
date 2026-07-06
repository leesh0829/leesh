import { prisma } from './prisma'
import { avgCostBeforeTx } from './holdingAggregate'
import {
  deriveNonTradeHoldingLedgerPayload,
  deriveSellHoldingLedgerPayload,
  type HoldingLedgerPayload,
} from './holdingLedgerPayload'
import { toKrw } from './fxRate'

export type SyncContext = {
  userId: string
  holdingId: string
  holdingName: string
  holdingCurrency: string
  krwRate?: number
  txId: string
  type: 'BUY' | 'SELL' | 'DIVIDEND' | 'FEE' | 'TAX'
  quantity: number | null
  pricePerUnit: number | null
  amount: number
  occurredAt: Date
  memo: string | null
}

type LedgerSyncTxRow = {
  id: string
  type: SyncContext['type']
  quantity: number | null
  pricePerUnit: number | null
  amount: number
  occurredAt: Date
}

export type LedgerSyncDb = {
  holdingTransaction: {
    findMany(args: unknown): Promise<LedgerSyncTxRow[]>
  }
  holding: {
    findUnique(args: unknown): Promise<{ accountId: string | null } | null>
  }
  ledgerEntry: {
    deleteMany(args: unknown): Promise<unknown>
    create(args: unknown): Promise<{ id: string }>
  }
}

// 트랜잭션에 따라 자동 생성할 가계부 항목 정보를 계산
async function deriveLedgerPayload(
  ctx: SyncContext,
  db: LedgerSyncDb
): Promise<HoldingLedgerPayload | null> {
  // 비-KRW 종목은 가계부에 KRW 환산해서 기록 (현재 환율 기준)
  const toLedgerKrw = (nativeAmount: number) =>
    ctx.krwRate === undefined
      ? toKrw(nativeAmount, ctx.holdingCurrency)
      : Math.round(nativeAmount * ctx.krwRate)

  if (ctx.type === 'DIVIDEND' || ctx.type === 'FEE' || ctx.type === 'TAX') {
    const krw = await toLedgerKrw(ctx.amount)
    return deriveNonTradeHoldingLedgerPayload({
      type: ctx.type,
      holdingName: ctx.holdingName,
      amountKrw: krw,
      memo: ctx.memo,
    })
  }

  if (ctx.type === 'SELL') {
    // 실현 손익 계산 — 해당 트랜잭션 시점의 평단가 기준
    const rows = await db.holdingTransaction.findMany({
      where: { holdingId: ctx.holdingId },
      select: {
        id: true,
        type: true,
        quantity: true,
        pricePerUnit: true,
        amount: true,
        occurredAt: true,
      },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    })
    type Row = (typeof rows)[number]
    const idx = rows.findIndex((r: Row) => r.id === ctx.txId)
    if (idx < 0) return null

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
    const nativePnl = qty * price - qty * avg
    const pnlKrw = await toLedgerKrw(Math.abs(nativePnl))

    return deriveSellHoldingLedgerPayload({
      holdingName: ctx.holdingName,
      quantity: qty,
      pricePerUnit: price,
      avgCost: avg,
      amountKrw: pnlKrw,
      memo: ctx.memo,
    })
  }

  // BUY: 가계부 연동 안 함 (자산 이동)
  return null
}

// 트랜잭션 생성/수정 시 가계부 항목 동기화
// 기존 연결된 가계부 항목이 있으면 업데이트 또는 삭제, 없으면 생성
export async function syncTransactionToLedger(
  ctx: SyncContext,
  link: boolean,
  existingLedgerEntryId: string | null,
  db: LedgerSyncDb = prisma
): Promise<string | null> {
  // 기존 연결 해제 또는 삭제
  if (existingLedgerEntryId) {
    await db.ledgerEntry.deleteMany({
      where: { id: existingLedgerEntryId, ownerId: ctx.userId },
    })
  }

  if (!link) return null

  const payload = await deriveLedgerPayload(ctx, db)
  if (!payload) return null

  // 종목 자체에 지정된 계좌가 있으면 그 계좌로 가계부 항목 연결
  const holding = await db.holding.findUnique({
    where: { id: ctx.holdingId },
    select: { accountId: true },
  })

  const created = await db.ledgerEntry.create({
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
