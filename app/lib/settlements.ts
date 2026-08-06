export type SettlementKind = 'REIMBURSEMENT' | 'EMERGENCY'
export type SettlementStatus = 'PENDING' | 'SETTLED'

export const SETTLEMENT_KINDS: { key: SettlementKind; label: string }[] = [
  { key: 'REIMBURSEMENT', label: '청구' },
  { key: 'EMERGENCY', label: '비상금' },
]

export const SETTLEMENT_KIND_LABEL: Record<SettlementKind, string> = {
  REIMBURSEMENT: '청구',
  EMERGENCY: '비상금',
}

export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  PENDING: '미정산',
  SETTLED: '정산완료',
}

export type SettlementSummary = {
  reimbursementPending: number
  emergencyPending: number
}

export function summarizeSettlements(
  items: { kind: SettlementKind; status: SettlementStatus; amount: number }[]
): SettlementSummary {
  let reimbursementPending = 0
  let emergencyPending = 0
  for (const it of items) {
    if (it.status !== 'PENDING') continue
    if (it.kind === 'REIMBURSEMENT') reimbursementPending += it.amount
    else if (it.kind === 'EMERGENCY') emergencyPending += it.amount
  }
  return { reimbursementPending, emergencyPending }
}

export function settledAtForStatus(
  status: SettlementStatus,
  now: Date
): Date | null {
  return status === 'SETTLED' ? now : null
}
