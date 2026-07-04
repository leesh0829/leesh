export type HoldingLedgerPayload = {
  type: 'INCOME' | 'EXPENSE'
  amount: number
  description: string
  category: string
  subcategory: string
}

type NonTradeHoldingTxType = 'DIVIDEND' | 'FEE' | 'TAX'

type NonTradePayloadInput = {
  type: NonTradeHoldingTxType
  holdingName: string
  amountKrw: number
  memo: string | null
}

type SellPayloadInput = {
  holdingName: string
  quantity: number
  pricePerUnit: number
  avgCost: number
  amountKrw: number
  memo: string | null
}

const CATEGORY = '주식/이자'

function withMemo(memo: string | null): string {
  return memo ? ` · ${memo}` : ''
}

export function deriveNonTradeHoldingLedgerPayload(
  input: NonTradePayloadInput
): HoldingLedgerPayload {
  const amount = Math.max(1, input.amountKrw)
  const memoSuffix = withMemo(input.memo)

  if (input.type === 'DIVIDEND') {
    return {
      type: 'INCOME',
      amount,
      description: `${input.holdingName} 배당금${memoSuffix}`,
      category: CATEGORY,
      subcategory: '배당금',
    }
  }

  if (input.type === 'FEE') {
    return {
      type: 'EXPENSE',
      amount,
      description: `${input.holdingName} 거래 수수료${memoSuffix}`,
      category: CATEGORY,
      subcategory: '거래 수수료',
    }
  }

  return {
    type: 'EXPENSE',
    amount,
    description: `${input.holdingName} 세금${memoSuffix}`,
    category: CATEGORY,
    subcategory: '세금',
  }
}

export function deriveSellHoldingLedgerPayload(
  input: SellPayloadInput
): HoldingLedgerPayload | null {
  const nativePnl =
    input.quantity * input.pricePerUnit - input.quantity * input.avgCost

  if (Math.abs(nativePnl) < 0.005) return null
  if (input.amountKrw <= 0) return null

  const memoSuffix = withMemo(input.memo)

  if (nativePnl > 0) {
    return {
      type: 'INCOME',
      amount: input.amountKrw,
      description: `${input.holdingName} 매도 수익${memoSuffix}`,
      category: CATEGORY,
      subcategory: '투자 수익(실현손익)',
    }
  }

  return {
    type: 'EXPENSE',
    amount: input.amountKrw,
    description: `${input.holdingName} 매도 손실${memoSuffix}`,
    category: CATEGORY,
    subcategory: '투자 손실(실현손익)',
  }
}
