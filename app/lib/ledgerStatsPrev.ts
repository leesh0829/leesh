import type { Prisma } from '@prisma/client'

type LedgerStatsType = 'INCOME' | 'EXPENSE'

type PrevLedgerGroupByArgs = {
  by: ['type', 'category']
  where: Prisma.LedgerEntryWhereInput
  _sum: { amount: true }
}

export type PrevLedgerGroup = {
  type: LedgerStatsType
  category: string
  _sum: { amount: number | null }
}

export function buildPrevLedgerGroupByArgs(
  ownerIds: string[],
  prevStart: Date,
  prevEnd: Date
): PrevLedgerGroupByArgs {
  return {
    by: ['type', 'category'],
    where: {
      ownerId: { in: ownerIds },
      excludeFromTotals: false,
      occurredAt: { gte: prevStart, lt: prevEnd },
    },
    _sum: { amount: true },
  }
}

export function summarizePrevLedgerGroups(groups: PrevLedgerGroup[]) {
  let income = 0
  let expense = 0
  const prevByCategoryExpense = new Map<string, number>()
  const prevByCategoryIncome = new Map<string, number>()

  for (const group of groups) {
    const amount = group._sum.amount ?? 0
    if (group.type === 'INCOME') {
      income += amount
      prevByCategoryIncome.set(group.category, amount)
    } else {
      expense += amount
      prevByCategoryExpense.set(group.category, amount)
    }
  }

  return {
    prevTotals: { income, expense, net: income - expense },
    prevByCategoryExpense,
    prevByCategoryIncome,
  }
}
