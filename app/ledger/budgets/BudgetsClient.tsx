'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '@/app/components/ToastProvider'
import {
  LedgerNavBack,
  LedgerNavAccounts,
  LedgerNavStats,
} from '../LedgerNavIcons'
import { EXPENSE_CATEGORIES } from '@/app/lib/ledgerCategories'

type Scope = 'CATEGORY' | 'SUBCATEGORY' | 'ACCOUNT'
type Status = 'safe' | 'warning' | 'over'

type BudgetItem = {
  id: string
  scope: Scope
  category: string | null
  subcategory: string | null
  accountId: string | null
  accountName: string | null
  amount: number
  memo: string | null
  enabled: boolean
  spent: number
  remaining: number
  rate: number
  status: Status
  label: string
}

type AccountOption = {
  id: string
  name: string
  bankName: string | null
}

function fmtKRW(n: number): string {
  const sign = n < 0 ? '-' : ''
  return `${sign}₩${Math.abs(Math.round(n)).toLocaleString('ko-KR')}`
}

function statusColor(s: Status): string {
  if (s === 'over') return 'text-red-500'
  if (s === 'warning') return 'text-amber-500'
  return 'text-emerald-500'
}

function statusBar(s: Status): string {
  if (s === 'over') return 'bg-red-500'
  if (s === 'warning') return 'bg-amber-500'
  return 'bg-emerald-500'
}

function statusMessage(item: BudgetItem): string {
  const pct = Math.round(item.rate * 100)
  if (item.status === 'over') {
    return `⚠ 목표를 ${fmtKRW(-item.remaining)} 초과했어요 (${pct}%)`
  }
  if (item.status === 'warning') {
    return `🔥 ${pct}% 사용 — 남은 한도 ${fmtKRW(item.remaining)}`
  }
  if (item.rate <= 0) {
    return `✨ 아직 0원 — ${fmtKRW(item.amount)} 사용 가능`
  }
  return `✅ ${fmtKRW(item.remaining)} 더 사용 가능 (${pct}%)`
}

// 같은 달 같은 임계는 한 번만 토스트 알림 — localStorage로 dedup
const TOAST_KEY = 'leesh-budget-toast-v1'
type ToastState = Record<string, { ym: string; thresholds: number[] }>

function loadToastState(): ToastState {
  try {
    const raw = localStorage.getItem(TOAST_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as ToastState
  } catch {
    return {}
  }
}

function saveToastState(state: ToastState) {
  try {
    localStorage.setItem(TOAST_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

export default function BudgetsClient() {
  const toast = useToast()
  const [items, setItems] = useState<BudgetItem[]>([])
  const [ym, setYm] = useState('')
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // 폼 상태
  const [scope, setScope] = useState<Scope>('CATEGORY')
  const [category, setCategory] = useState('')
  const [subcategory, setSubcategory] = useState('')
  const [accountId, setAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)

  const resetForm = useCallback(() => {
    setEditingId(null)
    setScope('CATEGORY')
    setCategory('')
    setSubcategory('')
    setAccountId('')
    setAmount('')
    setMemo('')
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [bRes, aRes] = await Promise.all([
        fetch('/api/ledger/budgets', { cache: 'no-store' }),
        fetch('/api/accounts', { cache: 'no-store' }),
      ])
      if (bRes.ok) {
        const j = (await bRes.json()) as { ym: string; items: BudgetItem[] }
        setItems(j.items)
        setYm(j.ym)
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

  // 임계 초과 토스트 — 같은 달, 같은 임계는 1회만
  useEffect(() => {
    if (!ym || items.length === 0) return
    const state = loadToastState()
    let changed = false
    for (const it of items) {
      const prev = state[it.id] ?? { ym, thresholds: [] }
      if (prev.ym !== ym) {
        prev.ym = ym
        prev.thresholds = []
      }
      const fired: number[] = []
      if (it.rate >= 1.2 && !prev.thresholds.includes(120)) fired.push(120)
      else if (it.rate >= 1.0 && !prev.thresholds.includes(100)) fired.push(100)
      else if (it.rate >= 0.8 && !prev.thresholds.includes(80)) fired.push(80)
      if (fired.length) {
        const max = Math.max(...fired)
        if (max >= 100)
          toast.error(`⚠ ${it.label} 목표 ${max}% 도달! ${statusMessage(it)}`)
        else toast.info(`🔥 ${it.label} 목표 ${max}% 사용 중`)
        prev.thresholds = [...new Set([...prev.thresholds, ...fired])]
        state[it.id] = prev
        changed = true
      }
    }
    if (changed) saveToastState(state)
  }, [items, ym, toast])

  const expenseCats = useMemo(
    () => EXPENSE_CATEGORIES.filter((c) => c.key !== '계좌이체'),
    []
  )

  const subOptions = useMemo(() => {
    const spec = expenseCats.find((c) => c.key === category)
    return spec?.subcategories ?? []
  }, [category, expenseCats])

  function openCreate() {
    resetForm()
    setShowForm(true)
  }

  function openEdit(it: BudgetItem) {
    setEditingId(it.id)
    setScope(it.scope)
    setCategory(it.category ?? '')
    setSubcategory(it.subcategory ?? '')
    setAccountId(it.accountId ?? '')
    setAmount(String(it.amount))
    setMemo(it.memo ?? '')
    setShowForm(true)
  }

  async function save() {
    const amt = parseInt(amount, 10)
    if (!Number.isFinite(amt) || amt < 1) {
      toast.error('금액을 1원 이상 입력해주세요.')
      return
    }
    if (scope === 'CATEGORY' && !category) {
      toast.error('카테고리를 선택해주세요.')
      return
    }
    if (scope === 'SUBCATEGORY' && (!category || !subcategory)) {
      toast.error('카테고리와 소분류를 선택해주세요.')
      return
    }
    if (scope === 'ACCOUNT' && !accountId) {
      toast.error('계좌를 선택해주세요.')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        // 편집은 금액/메모/활성만
        const r = await fetch(`/api/ledger/budgets/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: amt,
            memo: memo.trim() || null,
          }),
        })
        if (!r.ok) {
          const j = await r.json().catch(() => null)
          toast.error(j?.message ?? '수정 실패')
          return
        }
      } else {
        const r = await fetch('/api/ledger/budgets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scope,
            category: scope === 'ACCOUNT' ? null : category || null,
            subcategory: scope === 'SUBCATEGORY' ? subcategory || null : null,
            accountId: scope === 'ACCOUNT' ? accountId || null : null,
            amount: amt,
            memo: memo.trim() || null,
          }),
        })
        if (!r.ok) {
          const j = await r.json().catch(() => null)
          toast.error(j?.message ?? '저장 실패')
          return
        }
      }
      setShowForm(false)
      resetForm()
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('이 목표를 삭제할까요?')) return
    const r = await fetch(`/api/ledger/budgets/${id}`, { method: 'DELETE' })
    if (r.ok) {
      toast.info('삭제했어요.')
      await load()
    } else {
      toast.error('삭제 실패')
    }
  }

  const totalSpent = items.reduce((s, x) => s + x.spent, 0)
  const totalTarget = items.reduce((s, x) => s + x.amount, 0)
  const overCount = items.filter((i) => i.status === 'over').length
  const warnCount = items.filter((i) => i.status === 'warning').length

  return (
    <main className="w-full px-3 py-6 sm:px-4 lg:px-6">
      <div className="grid gap-6">
        {/* 헤더 */}
        <div className="surface card-pad card-hover-border-only">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">머니 챌린지</h1>
              <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                카테고리·소분류·계좌별 월간 지출 목표 ({ym
                  ? `${ym.slice(0, 4)}-${ym.slice(4)}`
                  : '이번 달'})
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LedgerNavStats />
              <LedgerNavAccounts />
              <LedgerNavBack />
            </div>
          </div>

          {/* 전체 요약 */}
          {!loading && items.length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="card p-3 card-hover-border-only">
                <div className="text-xs" style={{ color: 'var(--muted)' }}>
                  전체 사용 / 목표
                </div>
                <div className="mt-1 text-lg font-extrabold">
                  {fmtKRW(totalSpent)}{' '}
                  <span
                    className="text-sm"
                    style={{ color: 'var(--muted)' }}
                  >
                    / {fmtKRW(totalTarget)}
                  </span>
                </div>
              </div>
              <div className="card p-3 card-hover-border-only">
                <div className="text-xs" style={{ color: 'var(--muted)' }}>
                  초과 (≥100%)
                </div>
                <div className="mt-1 text-lg font-extrabold text-red-500">
                  {overCount}개
                </div>
              </div>
              <div className="card p-3 card-hover-border-only">
                <div className="text-xs" style={{ color: 'var(--muted)' }}>
                  주의 (80~100%)
                </div>
                <div className="mt-1 text-lg font-extrabold text-amber-500">
                  {warnCount}개
                </div>
              </div>
            </div>
          )}

          <div className="mt-4">
            <button
              type="button"
              className="btn btn-primary"
              onClick={openCreate}
            >
              + 목표 추가
            </button>
          </div>
        </div>

        {/* 폼 */}
        {showForm && (
          <div className="surface card-pad card-hover-border-only">
            <div className="flex items-center justify-between">
              <div className="font-extrabold">
                {editingId ? '목표 수정' : '새 목표'}
              </div>
              <button
                type="button"
                className="btn btn-outline text-xs"
                onClick={() => {
                  setShowForm(false)
                  resetForm()
                }}
              >
                닫기
              </button>
            </div>

            <div className="mt-3 grid gap-3">
              {!editingId && (
                <div className="grid gap-2">
                  <label className="text-sm font-medium">유형</label>
                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        ['CATEGORY', '카테고리'],
                        ['SUBCATEGORY', '소분류'],
                        ['ACCOUNT', '계좌'],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        className={
                          'btn text-xs ' +
                          (scope === key ? 'btn-primary' : 'btn-outline')
                        }
                        onClick={() => {
                          setScope(key)
                          setCategory('')
                          setSubcategory('')
                          setAccountId('')
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!editingId && scope !== 'ACCOUNT' && (
                <div className="grid gap-2">
                  <label className="text-sm font-medium">카테고리</label>
                  <select
                    className="select"
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value)
                      setSubcategory('')
                    }}
                  >
                    <option value="">선택</option>
                    {expenseCats.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {!editingId && scope === 'SUBCATEGORY' && subOptions.length > 0 && (
                <div className="grid gap-2">
                  <label className="text-sm font-medium">소분류</label>
                  <select
                    className="select"
                    value={subcategory}
                    onChange={(e) => setSubcategory(e.target.value)}
                  >
                    <option value="">선택</option>
                    {subOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {!editingId && scope === 'ACCOUNT' && (
                <div className="grid gap-2">
                  <label className="text-sm font-medium">계좌</label>
                  <select
                    className="select"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                  >
                    <option value="">선택</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.bankName ? `${a.bankName} · ` : ''}
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid gap-2">
                <label className="text-sm font-medium">월간 목표 금액 (원)</label>
                <input
                  type="number"
                  className="input"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="예: 500000"
                  min={1}
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">메모 (선택)</label>
                <input
                  className="input"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="예: 외식 줄이기 챌린지"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={saving}
                  onClick={save}
                >
                  {saving ? '저장중...' : editingId ? '수정' : '저장'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 목록 */}
        <div className="surface card-pad card-hover-border-only">
          <div className="font-extrabold">진행 중인 챌린지</div>

          {loading ? (
            <div className="mt-3 grid gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 rounded-md skeleton" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>
              아직 목표가 없어요. 우측 상단{' '}
              <span className="font-semibold">+ 목표 추가</span>로 시작해보세요.
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2 min-w-0">
              {items.map((it) => {
                const pct = Math.min(100, Math.round(it.rate * 100))
                const overflowPct = it.rate > 1 ? Math.round(it.rate * 100) - 100 : 0
                return (
                  <div
                    key={it.id}
                    className="card p-3 card-hover-border-only"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                            style={{
                              background: 'var(--surface-muted, rgba(0,0,0,0.06))',
                              color: 'var(--muted)',
                            }}
                          >
                            {it.scope === 'CATEGORY'
                              ? '카테고리'
                              : it.scope === 'SUBCATEGORY'
                                ? '소분류'
                                : '계좌'}
                          </span>
                          <span className="font-semibold truncate">
                            {it.label}
                          </span>
                          {it.memo && (
                            <span
                              className="text-xs truncate"
                              style={{ color: 'var(--muted)' }}
                              title={it.memo}
                            >
                              · {it.memo}
                            </span>
                          )}
                        </div>
                        <div
                          className={
                            'mt-1 text-sm font-semibold ' + statusColor(it.status)
                          }
                        >
                          {statusMessage(it)}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          className="btn btn-outline text-xs"
                          onClick={() => openEdit(it)}
                          title="목표 금액·메모 수정"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline text-xs"
                          onClick={() => remove(it.id)}
                        >
                          삭제
                        </button>
                      </div>
                    </div>

                    {/* 진행률 바 */}
                    <div className="mt-3">
                      <div
                        className="relative h-2 w-full overflow-hidden rounded-full"
                        style={{
                          background: 'color-mix(in srgb, var(--border) 50%, transparent)',
                        }}
                      >
                        <div
                          className={'absolute inset-y-0 left-0 ' + statusBar(it.status)}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-1 flex items-baseline justify-between gap-2 text-xs">
                        <span style={{ color: 'var(--muted)' }}>
                          {fmtKRW(it.spent)} / {fmtKRW(it.amount)}
                        </span>
                        <span
                          className={'font-semibold ' + statusColor(it.status)}
                        >
                          {Math.round(it.rate * 100)}%
                          {overflowPct > 0 && (
                            <span className="ml-1 text-[10px] opacity-80">
                              (+{overflowPct}p)
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
