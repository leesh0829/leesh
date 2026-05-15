export type HoldingTxType = 'BUY' | 'SELL' | 'DIVIDEND' | 'FEE' | 'TAX'

export type HoldingTxRow = {
  type: HoldingTxType
  quantity: number | null
  pricePerUnit: number | null
  amount: number
  occurredAt: string | Date
}

export type HoldingAggregate = {
  quantity: number
  avgCost: number
  costBasis: number
  totalInvested: number
  realizedPnL: number
  dividendTotal: number
  feeTotal: number
  taxTotal: number
  marketValue: number | null
  unrealizedPnL: number | null
  totalReturn: number | null
}

// 가중 평균 원가 방식으로 트랜잭션 리스트를 집계
export function aggregateHolding(
  txs: HoldingTxRow[],
  currentPrice: number | null = null
): HoldingAggregate {
  const sorted = [...txs].sort((a, b) => {
    const ta = new Date(a.occurredAt).getTime()
    const tb = new Date(b.occurredAt).getTime()
    return ta - tb
  })

  let quantity = 0
  let costBasis = 0
  let totalInvested = 0
  let realizedPnL = 0
  let dividendTotal = 0
  let feeTotal = 0
  let taxTotal = 0

  for (const tx of sorted) {
    switch (tx.type) {
      case 'BUY': {
        const qty = tx.quantity ?? 0
        const price = tx.pricePerUnit ?? 0
        const cost = qty * price
        quantity += qty
        costBasis += cost
        totalInvested += cost
        break
      }
      case 'SELL': {
        if (quantity <= 0) break
        const qty = Math.min(tx.quantity ?? 0, quantity)
        const price = tx.pricePerUnit ?? 0
        const avg = costBasis / quantity
        const proceeds = qty * price
        const removedCost = qty * avg
        realizedPnL += proceeds - removedCost
        costBasis -= removedCost
        quantity -= qty
        break
      }
      case 'DIVIDEND':
        dividendTotal += tx.amount
        break
      case 'FEE':
        feeTotal += tx.amount
        break
      case 'TAX':
        taxTotal += tx.amount
        break
    }
  }

  const avgCost = quantity > 0 ? costBasis / quantity : 0
  const marketValue =
    currentPrice !== null && quantity > 0 ? quantity * currentPrice : null
  const unrealizedPnL =
    marketValue !== null ? marketValue - costBasis : null
  const totalReturn =
    unrealizedPnL !== null
      ? realizedPnL + unrealizedPnL + dividendTotal - feeTotal - taxTotal
      : null

  return {
    quantity,
    avgCost,
    costBasis,
    totalInvested,
    realizedPnL,
    dividendTotal,
    feeTotal,
    taxTotal,
    marketValue,
    unrealizedPnL,
    totalReturn,
  }
}

// 특정 SELL 시점의 평단가를 계산 (해당 트랜잭션 직전까지 누적된 가중 평균)
// 가계부 자동 연동 시, 매도 손익 계산용
export function avgCostBeforeTx(
  txs: HoldingTxRow[],
  targetTxIdx: number
): number {
  const sorted = txs
    .map((tx, idx) => ({ tx, idx }))
    .sort((a, b) => {
      const ta = new Date(a.tx.occurredAt).getTime()
      const tb = new Date(b.tx.occurredAt).getTime()
      return ta - tb
    })

  let quantity = 0
  let costBasis = 0

  for (const { tx, idx } of sorted) {
    if (idx === targetTxIdx) {
      return quantity > 0 ? costBasis / quantity : 0
    }
    if (tx.type === 'BUY') {
      const qty = tx.quantity ?? 0
      const price = tx.pricePerUnit ?? 0
      quantity += qty
      costBasis += qty * price
    } else if (tx.type === 'SELL' && quantity > 0) {
      const qty = Math.min(tx.quantity ?? 0, quantity)
      const avg = costBasis / quantity
      costBasis -= qty * avg
      quantity -= qty
    }
  }

  return quantity > 0 ? costBasis / quantity : 0
}
