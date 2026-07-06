import type { Prisma } from '@prisma/client'

type LedgerStatsType = 'INCOME' | 'EXPENSE'

type LedgerStatsGroupByArgs = {
  by: ['type', 'category']
  where: Prisma.LedgerEntryWhereInput
  _sum: { amount: true }
  _count: { _all: true }
}

export type LedgerStatGroup = {
  type: LedgerStatsType
  category: string
  _sum: { amount: number | null }
  _count: { _all: number }
}

type OccurredAtFilter = {
  gte?: Date
  lt?: Date
}

export function buildLedgerStatsGroupByArgs(
  ownerIds: string[],
  occurredAtFilter: OccurredAtFilter
): LedgerStatsGroupByArgs {
  return {
    by: ['type', 'category'],
    where: {
      ownerId: { in: ownerIds },
      excludeFromTotals: false,
      ...(Object.keys(occurredAtFilter).length > 0
        ? { occurredAt: occurredAtFilter }
        : {}),
    },
    _sum: { amount: true },
    _count: { _all: true },
  }
}

export function summarizeLedgerStatGroups(groups: LedgerStatGroup[]) {
  let income = 0
  let expense = 0
  let count = 0
  const byCategoryIncome = new Map<string, { total: number; count: number }>()
  const byCategoryExpense = new Map<string, { total: number; count: number }>()

  for (const group of groups) {
    const amount = group._sum.amount ?? 0
    const groupCount = group._count._all
    count += groupCount

    if (group.type === 'INCOME') {
      income += amount
      byCategoryIncome.set(group.category, { total: amount, count: groupCount })
    } else {
      expense += amount
      byCategoryExpense.set(group.category, { total: amount, count: groupCount })
    }
  }

  return {
    income,
    expense,
    count,
    byCategoryIncome,
    byCategoryExpense,
  }
}
