'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '@/app/components/ToastProvider'
import {
  LedgerNavBack,
  LedgerNavStats,
  LedgerNavAccounts,
} from '../LedgerNavIcons'
import {
  SETTLEMENT_KIND_LABEL,
  SETTLEMENT_STATUS_LABEL,
  type SettlementKind,
  type SettlementStatus,
} from '@/app/lib/settlements'

type SettlementItem = {
  id: string
  kind: SettlementKind
  status: SettlementStatus
  amount: number
  description: string
  accountId: string | null
  accountName: string | null
  memo: string | null
  occurredAt: string
  settledAt: string | null
  createdAt: string
}

type Summary = { reimbursementPending: number; emergencyPending: number }
type AccountOption = { id: string; name: string; bankName: string | null }
type KindFilter = 'ALL' | SettlementKind
type StatusFilter = 'ALL' | SettlementStatus

function fmtKRW(n: number): string {
  const sign = n < 0 ? '-' : ''
  return `${sign}₩${Math.abs(Math.round(n)).toLocaleString('ko-KR')}`
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [loading, setLoading] = useState(true)

  const [kindFilter, setKindFilter] = useState<KindFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING')

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [kind, setKind] = useState<SettlementKind>('REIMBURSEMENT')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [occurredAt, setOccurredAt] = useState('')
  const [accountId, setAccountId] = useState('')
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)

  const resetForm = useCallback(() => {
    setEditingId(null)
    setKind('REIMBURSEMENT')
    setAmount('')
    setDescription('')
    setOccurredAt('')
    setAccountId('')
    setMemo('')
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sRes, aRes] = await Promise.all([
        fetch('/api/ledger/settlements', { cache: 'no-store' }),
        fetch('/api/accounts', { cache: 'no-store' }),
      ])
      if (sRes.ok) {
        const j = (await sRes.json()) as {
          items: SettlementItem[]
          summary: Summary
        }
        setItems(j.items)
        setSummary(j.summary)
      }
      if (aRes.ok) {
        const j = (await aRes.json()) as { items: AccountOption[] }
        setAccounts(j.items)
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

  function openCreate() {
    resetForm()
    setShowForm(true)
  }

  function openEdit(it: SettlementItem) {
    setEditingId(it.id)
    setKind(it.kind)
    setAmount(String(it.amount))
    setDescription(it.description)
    setOccurredAt(toLocalInput(it.occurredAt))
    setAccountId(it.accountId ?? '')
    setMemo(it.memo ?? '')
    setShowForm(true)
  }

  async function save() {
    const amt = parseInt(amount.replace(/[^0-9]/g, ''), 10)
    if (!Number.isFinite(amt) || amt < 1) {
      toast.error('금액을 1원 이상 입력해주세요.')
      return
    }
    if (!description.trim()) {
      toast.error('내역을 입력해주세요.')
      return
    }
    setSaving(true)
    try {
      const body = {
        kind,
        amount: amt,
        description: description.trim(),
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : null,
        accountId: accountId || null,
        memo: memo.trim() || null,
      }
      const url = editingId
        ? `/api/ledger/settlements/${editingId}`
        : '/api/ledger/settlements'
      const method = editingId ? 'PATCH' : 'POST'
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => null)
        toast.error(j?.message ?? (editingId ? '수정 실패' : '저장 실패'))
        return
      }
      setShowForm(false)
      resetForm()
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function settle(it: SettlementItem, next: SettlementStatus) {
    const r = await fetch(`/api/ledger/settlements/${it.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    if (r.ok) {
      toast.info(
        next === 'SETTLED' ? '정산 완료로 표시했어요.' : '미정산으로 되돌렸어요.'
      )
      await load()
    } else {
      toast.error('처리 실패')
    }
  }

  async function remove(id: string) {
    if (!confirm('이 항목을 삭제할까요?')) return
    const r = await fetch(`/api/ledger/settlements/${id}`, { method: 'DELETE' })
    if (r.ok) {
      toast.info('삭제했어요.')
      await load()
    } else {
      toast.error('삭제 실패')
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
        </div>

        {/* 필터 + 폼 */}
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
            <button className="btn btn-primary ml-auto" onClick={openCreate}>
              + 항목 추가
            </button>
          </div>

          {showForm && (
            <div className="mt-4 grid gap-3 card p-4">
              <div className="flex flex-wrap gap-2">
                {(['REIMBURSEMENT', 'EMERGENCY'] as SettlementKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={k === kind ? 'btn btn-primary' : 'btn btn-outline'}
                  >
                    {SETTLEMENT_KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              <input
                className="input"
                placeholder="금액 (원)"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <input
                className="input"
                placeholder="내역 / 사유"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <input
                className="input"
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
              <select
                className="input"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">계좌 선택 안 함</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.bankName ? ` (${a.bankName})` : ''}
                  </option>
                ))}
              </select>
              <input
                className="input"
                placeholder="메모 (선택)"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  className="btn btn-primary"
                  disabled={saving}
                  onClick={save}
                >
                  {editingId ? '수정' : '저장'}
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setShowForm(false)
                    resetForm()
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 목록 */}
        <div className="grid gap-3">
          {loading ? (
            <div
              className="surface card-pad text-sm"
              style={{ color: 'var(--muted)' }}
            >
              불러오는 중…
            </div>
          ) : filtered.length === 0 ? (
            <div
              className="surface card-pad text-sm"
              style={{ color: 'var(--muted)' }}
            >
              표시할 정산 항목이 없어요.
            </div>
          ) : (
            filtered.map((it) => (
              <div
                key={it.id}
                className="surface card-pad card-hover-border-only"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-bold ${kindBadge(it.kind)}`}
                  >
                    {SETTLEMENT_KIND_LABEL[it.kind]}
                  </span>
                  <span
                    className="rounded px-2 py-0.5 text-xs"
                    style={{
                      color:
                        it.status === 'SETTLED' ? 'var(--muted)' : 'inherit',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {SETTLEMENT_STATUS_LABEL[it.status]}
                  </span>
                  <span className="text-lg font-extrabold">
                    {fmtKRW(it.amount)}
                  </span>
                  <span
                    className="ml-auto text-xs"
                    style={{ color: 'var(--muted)' }}
                  >
                    {it.occurredAt.slice(0, 10)}
                  </span>
                </div>
                <div className="mt-2 text-sm">{it.description}</div>
                {(it.accountName || it.memo) && (
                  <div
                    className="mt-1 text-xs"
                    style={{ color: 'var(--muted)' }}
                  >
                    {it.accountName ? `계좌: ${it.accountName}` : ''}
                    {it.accountName && it.memo ? ' · ' : ''}
                    {it.memo ?? ''}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {it.status === 'PENDING' ? (
                    <button
                      className="btn btn-primary"
                      onClick={() => settle(it, 'SETTLED')}
                    >
                      정산 완료
                    </button>
                  ) : (
                    <button className="btn" onClick={() => settle(it, 'PENDING')}>
                      미정산으로
                    </button>
                  )}
                  <button className="btn" onClick={() => openEdit(it)}>
                    수정
                  </button>
                  <button className="btn" onClick={() => remove(it.id)}>
                    삭제
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  )
}
