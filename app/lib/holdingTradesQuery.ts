import type { Prisma } from '@prisma/client'

export type HoldingTradeRow = {
  id: string
  type: string
  quantity: number | null
  pricePerUnit: number | null
  occurredAt: Date
}

export const holdingTradesSelect = {
  id: true,
  type: true,
  quantity: true,
  pricePerUnit: true,
  occurredAt: true,
} as const satisfies Prisma.HoldingTransactionSelect

export const holdingTradesOrderBy = [
  { occurredAt: 'asc' },
  { createdAt: 'asc' },
] satisfies Prisma.HoldingTransactionOrderByWithRelationInput[]

export function buildHoldingTradesWhere(
  userId: string,
  symbol: string
): Prisma.HoldingTransactionWhereInput {
  return {
    holding: {
      ownerId: userId,
      symbol,
    },
    type: { in: ['BUY', 'SELL'] },
  }
}

export function toHoldingTradeMarker(row: HoldingTradeRow) {
  return {
    id: row.id,
    type: row.type,
    quantity: row.quantity,
    unitPrice: row.pricePerUnit,
    date: row.occurredAt.toISOString().slice(0, 10).replace(/-/g, ''),
  }
}
