'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useToast } from '@/app/components/ToastProvider'
import { LedgerNavBack, LedgerNavStats, LedgerNavAccounts } from '../LedgerNavIcons'
import {
  SETTLEMENT_KIND_LABEL,
  SETTLEMENT_STATUS_LABEL,
  type SettlementKind,
  type SettlementStatus,
} from '@/app/lib/settlements'

type SettlementItem = {
  id: string
  accountId: string | null
  accountName: string | null
  accountBank: string | null
  amount: number
  description: string
  kind: SettlementKind
  status: SettlementStatus
  occurredAt: string
  settledAt: string | null
}

type Summary = { reimbursementPending: number; emergencyPending: number }
type KindFilter = 'ALL' | SettlementKind
type StatusFilter = 'ALL' | SettlementStatus

function fmtKRW(n: number): string {
  const sign = n < 0 ? '-' : ''
  return `${sign}₩${Math.abs(Math.round(n)).toLocaleString('ko-KR')}`
}

function kindBadge(kind: SettlementKind): string {
  return kind === 'REIMBURSEMENT'
    ? 'bg-sky-500/15 text-sky-500'
    : 'bg-amber-500/15 text-amber-500'
}

export default function SettlementsClient() {
  const toast = useToast()
  const [items, setItems] = useState<SettlementItem[]>([])
  const [summary, setSummary] = useState<Summary>({
    reimbursementPending: 0,
    emergencyPending: 0,
  })
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [kindFilter, setKindFilter] = useState<KindFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/ledger/settlements', { cache: 'no-store' })
      if (r.ok) {
        const j = (await r.json()) as { items: SettlementItem[]; summary: Summary }
        setItems(j.items)
        setSummary(j.summary)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(
    () =>
      items.filter(
        (it) =>
          (kindFilter === 'ALL' || it.kind === kindFilter) &&
          (statusFilter === 'ALL' || it.status === statusFilter)
      ),
    [items, kindFilter, statusFilter]
  )

  async function settle(it: SettlementItem, next: SettlementStatus) {
    setBusyId(it.id)
    try {
      const r = await fetch(`/api/ledger/${it.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settlementStatus: next }),
      })
      if (r.ok) {
        toast.info(
          next === 'SETTLED' ? '정산 완료로 표시했어요.' : '미정산으로 되돌렸어요.'
        )
        await load()
      } else {
        toast.error('처리 실패')
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="w-full px-3 py-6 sm:px-4 lg:px-6">
      <div className="grid gap-6">
        {/* 헤더 + 요약 */}
        <div className="surface card-pad card-hover-border-only">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">정산 대기함</h1>
              <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                다음 월급에 정상화할 청구·비상금 내역을 모아 확인해요
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LedgerNavStats />
              <LedgerNavAccounts />
              <LedgerNavBack />
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="card p-3 card-hover-border-only">
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                받을 청구 (미정산)
              </div>
              <div className="mt-1 text-lg font-extrabold text-sky-500">
                {fmtKRW(summary.reimbursementPending)}
              </div>
            </div>
            <div className="card p-3 card-hover-border-only">
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                갚을 비상금 (미정산)
              </div>
              <div className="mt-1 text-lg font-extrabold text-amber-500">
                {fmtKRW(summary.emergencyPending)}
              </div>
            </div>
          </div>

          <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
            항목 추가·수정·삭제는{' '}
            <Link href="/ledger" className="underline">
              가계부 내역
            </Link>
            에서 하세요. 여기서는 정산 여부만 체크해요.
          </p>
        </div>

        {/* 필터 */}
        <div className="surface card-pad">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as KindFilter)}
              className="input"
            >
              <option value="ALL">전체 종류</option>
              <option value="REIMBURSEMENT">청구</option>
              <option value="EMERGENCY">비상금</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="input"
            >
              <option value="ALL">전체 상태</option>
              <option value="PENDING">미정산</option>
              <option value="SETTLED">정산완료</option>
            </select>
          </div>
        </div>

        {/* 목록 */}
        <div className="grid gap-3">
          {loading ? (
            <div className="surface card-pad text-sm" style={{ color: 'var(--muted)' }}>
              불러오는 중…
            </div>
          ) : filtered.length === 0 ? (
            <div className="surface card-pad text-sm" style={{ color: 'var(--muted)' }}>
              표시할 정산 항목이 없어요.
            </div>
          ) : (
            filtered.map((it) => (
              <div key={it.id} className="surface card-pad card-hover-border-only">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-bold ${kindBadge(it.kind)}`}
                  >
                    {SETTLEMENT_KIND_LABEL[it.kind]}
                  </span>
                  <span
                    className="rounded px-2 py-0.5 text-xs"
                    style={{
                      color: it.status === 'SETTLED' ? 'var(--muted)' : 'inherit',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {SETTLEMENT_STATUS_LABEL[it.status]}
                  </span>
                  <span className="text-lg font-extrabold">{fmtKRW(it.amount)}</span>
                  <span className="ml-auto text-xs" style={{ color: 'var(--muted)' }}>
                    {it.occurredAt.slice(0, 10)}
                  </span>
                </div>
                <div className="mt-2 text-sm">{it.description}</div>
                {it.accountName ? (
                  <div className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                    계좌: {it.accountName}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {it.status === 'PENDING' ? (
                    <button
                      className="btn btn-primary"
                      disabled={busyId === it.id}
                      onClick={() => settle(it, 'SETTLED')}
                    >
                      정산 완료
                    </button>
                  ) : (
                    <button
                      className="btn"
                      disabled={busyId === it.id}
                      onClick={() => settle(it, 'PENDING')}
                    >
                      미정산으로
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  )
}
