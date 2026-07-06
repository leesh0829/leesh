type HoldingLedgerSyncContext = {
  holdingCurrency: string
  type: 'BUY' | 'SELL' | 'DIVIDEND' | 'FEE' | 'TAX'
  krwRate?: number
}

export async function prepareHoldingLedgerSyncContext<
  T extends HoldingLedgerSyncContext,
>(
  ctx: T,
  linkToLedger: boolean,
  getKrwRate: (currency: string) => Promise<number>
): Promise<T> {
  if (!linkToLedger || ctx.type === 'BUY') return ctx

  const currency = ctx.holdingCurrency.toUpperCase()
  if (currency === 'KRW') return { ...ctx, krwRate: 1 }

  const krwRate = await getKrwRate(currency)
  return { ...ctx, krwRate }
}
