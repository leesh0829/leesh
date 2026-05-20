// 머니 챌린지 도메인 헬퍼 — 현재 달 사용액/진행률 계산.
// 매월 1일 0시 ~ 익월 1일 0시 (KST 기준) 사이 EXPENSE LedgerEntry 합산.
// excludeFromTotals=true 항목은 제외.

import { prisma } from '@/app/lib/prisma'

export type BudgetScope = 'CATEGORY' | 'SUBCATEGORY' | 'ACCOUNT'

export type BudgetTargetRow = {
  id: string
  scope: BudgetScope
  category: string | null
  subcategory: string | null
  accountId: string | null
  accountName: string | null
  amount: number
  memo: string | null
  enabled: boolean
}

export type BudgetProgress = BudgetTargetRow & {
  spent: number
  remaining: number // amount - spent (음수면 초과)
  rate: number // spent / amount (0~∞, 1.0 = 100%)
  status: 'safe' | 'warning' | 'over' // 80% 미만 / 80~100% / 100% 초과
  label: string // UI 표시용 ("식비", "외식", "신한 SOL" 등)
}

// 이번 달 시작/끝 (서버 기준이지만 한국 사용 가정 — KST 오프셋 +9h 적용)
export function currentMonthRange(now = new Date()): {
  start: Date
  end: Date
  ym: string
} {
  // KST = UTC+9
  const KST_OFFSET = 9 * 60 * 60 * 1000
  const kstNow = new Date(now.getTime() + KST_OFFSET)
  const y = kstNow.getUTCFullYear()
  const m = kstNow.getUTCMonth()
  // KST 자정 → UTC로 환산하면 전날 15시
  const startKstMs = Date.UTC(y, m, 1, 0, 0, 0)
  const endKstMs = Date.UTC(y, m + 1, 1, 0, 0, 0)
  const start = new Date(startKstMs - KST_OFFSET)
  const end = new Date(endKstMs - KST_OFFSET)
  const ym = `${y}${String(m + 1).padStart(2, '0')}`
  return { start, end, ym }
}

function scopeLabel(t: BudgetTargetRow): string {
  if (t.scope === 'CATEGORY') return t.category ?? '(미지정 카테고리)'
  if (t.scope === 'SUBCATEGORY')
    return `${t.category ?? '?'} · ${t.subcategory ?? '?'}`
  return t.accountName ?? '(미지정 계좌)'
}

export async function listBudgetsWithProgress(
  ownerId: string,
  now = new Date()
): Promise<{ ym: string; items: BudgetProgress[] }> {
  const { start, end, ym } = currentMonthRange(now)

  const targets = await prisma.budgetTarget.findMany({
    where: { ownerId },
    orderBy: [{ scope: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      scope: true,
      category: true,
      subcategory: true,
      accountId: true,
      amount: true,
      memo: true,
      enabled: true,
      account: { select: { name: true } },
    },
  })

  // 이번 달 EXPENSE 항목을 한 번에 가져와 메모리에서 매칭
  const entries = await prisma.ledgerEntry.findMany({
    where: {
      ownerId,
      type: 'EXPENSE',
      excludeFromTotals: false,
      occurredAt: { gte: start, lt: end },
    },
    select: {
      amount: true,
      category: true,
      subcategory: true,
      accountId: true,
    },
  })

  const items: BudgetProgress[] = targets.map((t) => {
    const row: BudgetTargetRow = {
      id: t.id,
      scope: t.scope as BudgetScope,
      category: t.category,
      subcategory: t.subcategory,
      accountId: t.accountId,
      accountName: t.account?.name ?? null,
      amount: t.amount,
      memo: t.memo,
      enabled: t.enabled,
    }
    let spent = 0
    if (row.scope === 'CATEGORY') {
      for (const e of entries) {
        if (e.category === row.category) spent += e.amount
      }
    } else if (row.scope === 'SUBCATEGORY') {
      for (const e of entries) {
        if (e.category === row.category && e.subcategory === row.subcategory)
          spent += e.amount
      }
    } else {
      for (const e of entries) {
        if (e.accountId === row.accountId) spent += e.amount
      }
    }
    const rate = row.amount > 0 ? spent / row.amount : 0
    const status: BudgetProgress['status'] =
      rate >= 1 ? 'over' : rate >= 0.8 ? 'warning' : 'safe'
    return {
      ...row,
      spent,
      remaining: row.amount - spent,
      rate,
      status,
      label: scopeLabel(row),
    }
  })

  return { ym, items }
}
