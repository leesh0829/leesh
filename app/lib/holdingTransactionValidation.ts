export type HoldingTransactionInputType =
  | 'BUY'
  | 'SELL'
  | 'DIVIDEND'
  | 'FEE'
  | 'TAX'

type NormalizeInput = {
  type: HoldingTransactionInputType
  quantity: number | null
  pricePerUnit: number | null
  amount: number | null | undefined
}

type NormalizeResult =
  | {
      ok: true
      quantity: number | null
      pricePerUnit: number | null
      amount: number
    }
  | {
      ok: false
      message: string
    }

export function normalizeHoldingTransactionAmounts(
  input: NormalizeInput
): NormalizeResult {
  if (input.type === 'BUY' || input.type === 'SELL') {
    if (
      input.quantity === null ||
      input.quantity <= 0 ||
      input.pricePerUnit === null ||
      input.pricePerUnit < 0
    ) {
      return { ok: false, message: '수량과 단가를 입력해 주세요.' }
    }

    return {
      ok: true,
      quantity: input.quantity,
      pricePerUnit: input.pricePerUnit,
      amount:
        typeof input.amount === 'number' && input.amount > 0
          ? input.amount
          : input.quantity * input.pricePerUnit,
    }
  }

  if (input.amount === undefined || input.amount === null || input.amount <= 0) {
    return { ok: false, message: '금액을 입력해 주세요.' }
  }

  return {
    ok: true,
    quantity: null,
    pricePerUnit: null,
    amount: input.amount,
  }
}
