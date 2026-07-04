type HoldingTxType = 'BUY' | 'SELL' | 'DIVIDEND' | 'FEE' | 'TAX'

type SyncContext = {
  userId: string
  holdingId: string
  holdingName: string
  holdingCurrency: string
  krwRate?: number
  txId: string
  type: HoldingTxType
  quantity: number | null
  pricePerUnit: number | null
  amount: number
  occurredAt: Date
  memo: string | null
}

type HoldingTransactionData = {
  holdingId: string
  type: HoldingTxType
  quantity: number | null
  pricePerUnit: number | null
  amount: number
  occurredAt: Date
  memo: string | null
}

type HoldingTransactionUpdateData = {
  type: HoldingTxType
  quantity: number | null
  pricePerUnit: number | null
  amount: number
  occurredAt: Date
  memo: string | null
}

type LedgerSyncFn = (
  ctx: SyncContext,
  link: boolean,
  existingLedgerEntryId: string | null,
  db: TransactionClient
) => Promise<string | null>

type LedgerSyncTxRow = {
  id: string
  type: HoldingTxType
  quantity: number | null
  pricePerUnit: number | null
  amount: number
  occurredAt: Date
}

type LedgerSyncDb = {
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

type TransactionClient = LedgerSyncDb & {
  holdingTransaction: LedgerSyncDb['holdingTransaction'] & {
    create(args: {
      data: HoldingTransactionData
      select: { id: true }
    }): Promise<{ id: string }>
    update(args: {
      where: { id: string }
      data: HoldingTransactionUpdateData | { ledgerEntryId: string | null }
    }): Promise<unknown>
  }
}

type TransactionDb = {
  $transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T>
}

type PrepareSyncContextFn<TContext> = (
  ctx: TContext,
  linkToLedger: boolean
) => Promise<TContext>

async function keepSyncContext<TContext>(ctx: TContext): Promise<TContext> {
  return ctx
}

export async function createHoldingTransactionWithLedgerSync(
  input: {
    data: HoldingTransactionData
    syncContext: Omit<SyncContext, 'txId'>
    linkToLedger: boolean
  },
  db: TransactionDb,
  sync: LedgerSyncFn,
  prepareSyncContext: PrepareSyncContextFn<
    Omit<SyncContext, 'txId'>
  > = keepSyncContext
): Promise<{ id: string; ledgerEntryId: string | null }> {
  const preparedSyncContext = await prepareSyncContext(
    input.syncContext,
    input.linkToLedger
  )

  return db.$transaction(async (tx) => {
    const created = await tx.holdingTransaction.create({
      data: input.data,
      select: { id: true },
    })

    const ledgerEntryId = await sync(
      {
        ...preparedSyncContext,
        txId: created.id,
      },
      input.linkToLedger,
      null,
      tx
    )

    if (ledgerEntryId) {
      await tx.holdingTransaction.update({
        where: { id: created.id },
        data: { ledgerEntryId },
      })
    }

    return { id: created.id, ledgerEntryId }
  })
}

export async function updateHoldingTransactionWithLedgerSync(
  input: {
    txId: string
    data: HoldingTransactionUpdateData
    syncContext: SyncContext
    linkToLedger: boolean
    existingLedgerEntryId: string | null
  },
  db: TransactionDb,
  sync: LedgerSyncFn,
  prepareSyncContext: PrepareSyncContextFn<SyncContext> = keepSyncContext
): Promise<{ ledgerEntryId: string | null }> {
  const preparedSyncContext = await prepareSyncContext(
    input.syncContext,
    input.linkToLedger
  )

  return db.$transaction(async (tx) => {
    await tx.holdingTransaction.update({
      where: { id: input.txId },
      data: input.data,
    })

    const ledgerEntryId = await sync(
      preparedSyncContext,
      input.linkToLedger,
      input.existingLedgerEntryId,
      tx
    )

    await tx.holdingTransaction.update({
      where: { id: input.txId },
      data: { ledgerEntryId },
    })

    return { ledgerEntryId }
  })
}
