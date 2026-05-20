'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/app/components/ToastProvider'
import { useAsyncLock } from '@/app/lib/useAsyncLock'
import { LedgerNavBack } from '../LedgerNavIcons'
import {
  ACCOUNT_TYPES,
  TYPE_LABEL_KR,
  isStockType,
  validateAccountTypes,
  type AccountType,
} from '@/app/lib/accountTypes'

type AccountItem = {
  id: string
  name: string
  bankName: string | null
  types: AccountType[]
  memo: string | null
  initialBalance: number
  entryCount: number
  holdingCount: number
  createdAt: string
  updatedAt: string
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

async function readApiErrorMessage(r: Response): Promise<string | null> {
  try {
    const j: unknown = await r.json()
    if (isRecord(j) && typeof j.message === 'string') return j.message
    return null
  } catch {
    return null
  }
}

// chip 클릭 시 적용되는 상호배타 규칙: STOCK/ISA/PENSION은 단독만
function toggleType(current: AccountType[], t: AccountType): AccountType[] {
  const has = current.includes(t)
  if (has) return current.filter((x) => x !== t)
  if (isStockType(t)) return [t] // stock 타입 선택 시 다른 거 모두 제거
  // non-stock 추가 시 stock 타입은 모두 제거
  return [...current.filter((x) => !isStockType(x)), t]
}

function TypeChips({
  selected,
  onChange,
  disabled,
}: {
  selected: AccountType[]
  onChange: (next: AccountType[]) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ACCOUNT_TYPES.map((t) => {
        const active = selected.includes(t)
        const stock = isStockType(t)
        const baseStyle = active
          ? stock
            ? {
                background:
                  'color-mix(in srgb, #8b5cf6 22%, var(--card))',
                borderColor:
                  'color-mix(in srgb, #8b5cf6 55%, var(--border))',
                color: 'var(--foreground)',
              }
            : {
                background:
                  'color-mix(in srgb, #0ea5e9 18%, var(--card))',
                borderColor:
                  'color-mix(in srgb, #0ea5e9 55%, var(--border))',
                color: 'var(--foreground)',
              }
          : undefined
        return (
          <button
            type="button"
            key={t}
            disabled={disabled}
            className={'btn text-xs ' + (active ? '' : 'btn-outline')}
            style={baseStyle}
            onClick={() => onChange(toggleType(selected, t))}
          >
            {TYPE_LABEL_KR[t]}
          </button>
        )
      })}
    </div>
  )
}

export default function AccountsClient() {
  const toast = useToast()
  const [items, setItems] = useState<AccountItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // 생성 폼
  const [newName, setNewName] = useState('')
  const [newBank, setNewBank] = useState('')
  const [newTypes, setNewTypes] = useState<AccountType[]>([])
  const [newMemo, setNewMemo] = useState('')
  const [newInitial, setNewInitial] = useState('') // 빈문자열 = 0
  const { pending: creating, run: runCreate } = useAsyncLock()

  // 인라인 수정
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editBank, setEditBank] = useState('')
  const [editTypes, setEditTypes] = useState<AccountType[]>([])
  const [editMemo, setEditMemo] = useState('')
  const [editInitial, setEditInitial] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/accounts', { cache: 'no-store' })
    if (!r.ok) {
      const msg = await readApiErrorMessage(r)
      const message = `${r.status} ${r.statusText} · ${msg ?? '불러오기 실패'}`
      setErr(message)
      toast.error(message)
      setLoading(false)
      return
    }
    const data = (await r.json()) as { items: AccountItem[] }
    setItems(data.items)
    setErr(null)
    setLoading(false)
  }, [toast])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(t)
  }, [load])

  const create = async () => {
    await runCreate(async () => {
      const name = newName.trim()
      if (!name) {
        toast.error('계좌 이름을 입력해 주세요.')
        return
      }
      const err = validateAccountTypes(newTypes)
      if (err) {
        toast.error(err)
        return
      }
      const initRaw = newInitial.trim()
      const initialBalance = initRaw === '' ? 0 : parseInt(initRaw, 10)
      if (initRaw !== '' && !Number.isFinite(initialBalance)) {
        toast.error('초기 잔액은 숫자여야 합니다.')
        return
      }
      const r = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          bankName: newBank.trim() || null,
          types: newTypes,
          memo: newMemo.trim() || null,
          initialBalance,
        }),
      })
      if (!r.ok) {
        const msg = await readApiErrorMessage(r)
        toast.error(`${r.status} · ${msg ?? '생성 실패'}`)
        return
      }
      setNewName('')
      setNewBank('')
      setNewTypes([])
      setNewMemo('')
      setNewInitial('')
      await load()
      toast.success('계좌를 추가했습니다.')
    })
  }

  const startEdit = (a: AccountItem) => {
    setEditingId(a.id)
    setEditName(a.name)
    setEditBank(a.bankName ?? '')
    setEditTypes(a.types)
    setEditMemo(a.memo ?? '')
    setEditInitial(String(a.initialBalance ?? 0))
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async () => {
    if (!editingId) return
    const name = editName.trim()
    if (!name) {
      toast.error('계좌 이름을 입력해 주세요.')
      return
    }
    const verr = validateAccountTypes(editTypes)
    if (verr) {
      toast.error(verr)
      return
    }
    const initRaw = editInitial.trim()
    const initialBalance = initRaw === '' ? 0 : parseInt(initRaw, 10)
    if (initRaw !== '' && !Number.isFinite(initialBalance)) {
      toast.error('초기 잔액은 숫자여야 합니다.')
      return
    }
    setEditSaving(true)
    const r = await fetch(`/api/accounts/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        bankName: editBank.trim() || null,
        types: editTypes,
        memo: editMemo.trim() || null,
        initialBalance,
      }),
    })
    setEditSaving(false)
    if (!r.ok) {
      const msg = await readApiErrorMessage(r)
      toast.error(`${r.status} · ${msg ?? '수정 실패'}`)
      return
    }
    setEditingId(null)
    await load()
    toast.success('계좌를 수정했습니다.')
  }

  const remove = async (a: AccountItem) => {
    const ok = window.confirm(
      `"${a.name}" 계좌를 삭제할까요?\n연결된 가계부 항목들은 계좌 정보만 해제되고 그대로 남습니다.`
    )
    if (!ok) return
    const r = await fetch(`/api/accounts/${a.id}`, { method: 'DELETE' })
    if (!r.ok) {
      const msg = await readApiErrorMessage(r)
      toast.error(`${r.status} · ${msg ?? '삭제 실패'}`)
      return
    }
    await load()
    toast.success('계좌를 삭제했습니다.')
  }

  return (
    <main className="w-full px-3 py-6 sm:px-4 lg:px-6">
      <div className="grid gap-6">
        {/* 헤더 */}
        <div className="surface card-pad card-hover-border-only">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">계좌 관리</h1>
              <p
                className="mt-1 text-sm"
                style={{ color: 'var(--muted)' }}
              >
                한 계좌에 여러 용도 태그를 부여할 수 있습니다. 주식/ISA/연금
                타입은 법적으로 분리된 계좌라 단독으로만 지정됩니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LedgerNavBack />
            </div>
          </div>
          {err ? (
            <div className="mt-4 card p-3" style={{ color: 'crimson' }}>
              {err}
            </div>
          ) : null}
        </div>

        {/* 생성 폼 */}
        <div className="surface card-pad card-hover-border-only">
          <div className="font-extrabold">계좌 추가</div>
          <form
            className="mt-3 grid gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              void create()
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className="input"
                placeholder="계좌 이름 (예: 신한 주거래)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={creating}
              />
              <input
                className="input"
                placeholder="은행/카드사 (선택)"
                value={newBank}
                onChange={(e) => setNewBank(e.target.value)}
                disabled={creating}
              />
            </div>
            <div className="grid gap-1">
              <span
                className="text-xs"
                style={{ color: 'var(--muted)' }}
              >
                용도 (여러 개 가능, 주식/ISA/연금은 단독만)
              </span>
              <TypeChips
                selected={newTypes}
                onChange={setNewTypes}
                disabled={creating}
              />
            </div>
            <input
              className="input"
              placeholder="메모 (선택)"
              value={newMemo}
              onChange={(e) => setNewMemo(e.target.value)}
              disabled={creating}
            />
            <div className="grid gap-1">
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                초기 잔액 (가계부 시작 시점 금액 · 수입에 잡히지 않습니다)
              </span>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                step={1}
                placeholder="0"
                value={newInitial}
                onChange={(e) => setNewInitial(e.target.value)}
                disabled={creating}
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={creating || !newName.trim() || newTypes.length === 0}
              >
                {creating ? '추가중...' : '계좌 추가'}
              </button>
            </div>
          </form>
        </div>

        {/* 계좌 목록 */}
        <div className="surface card-pad card-hover-border-only">
          <div className="flex items-center justify-between">
            <div className="font-extrabold">계좌</div>
            <span className="badge">{items.length}개</span>
          </div>

          {loading ? (
            <div className="mt-4 grid gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={`acc-skel-${i}`}
                  className="h-20 rounded-lg skeleton"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div
              className="mt-4 text-sm"
              style={{ color: 'var(--muted)' }}
            >
              아직 등록한 계좌가 없습니다.
            </div>
          ) : (
            <div className="mt-4 grid gap-2">
              {items.map((a) => {
                const editing = editingId === a.id
                return (
                  <div key={a.id} className="card p-3 card-hover-border-only">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold">
                            {a.name}
                          </span>
                          {a.bankName ? (
                            <span
                              className="text-xs"
                              style={{ color: 'var(--muted)' }}
                            >
                              {a.bankName}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {a.types.map((t) => (
                            <span
                              key={t}
                              className="badge"
                              style={
                                isStockType(t)
                                  ? {
                                      background:
                                        'color-mix(in srgb, #8b5cf6 18%, var(--card))',
                                      borderColor:
                                        'color-mix(in srgb, #8b5cf6 50%, var(--border))',
                                    }
                                  : undefined
                              }
                            >
                              {TYPE_LABEL_KR[t]}
                            </span>
                          ))}
                          <span
                            className="badge"
                            title="이 계좌에 연결된 가계부 항목 수"
                          >
                            가계부 {a.entryCount}건
                          </span>
                          {a.holdingCount > 0 ? (
                            <span
                              className="badge"
                              title="이 계좌에 연결된 보유 종목 수"
                              style={{
                                background:
                                  'color-mix(in srgb, #8b5cf6 12%, var(--card))',
                                borderColor:
                                  'color-mix(in srgb, #8b5cf6 45%, var(--border))',
                              }}
                            >
                              종목 {a.holdingCount}개
                            </span>
                          ) : null}
                          {a.initialBalance !== 0 ? (
                            <span
                              className="badge"
                              title="가계부 시작 시점 금액 (수입 통계에 포함되지 않음)"
                              style={{
                                background:
                                  'color-mix(in srgb, #0ea5e9 12%, var(--card))',
                                borderColor:
                                  'color-mix(in srgb, #0ea5e9 50%, var(--border))',
                              }}
                            >
                              초기 ₩{a.initialBalance.toLocaleString('ko-KR')}
                            </span>
                          ) : null}
                        </div>
                        {a.memo ? (
                          <div
                            className="mt-1 text-sm"
                            style={{ color: 'var(--muted)' }}
                          >
                            {a.memo}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1">
                        <button
                          type="button"
                          className={
                            'btn text-xs ' +
                            (editing ? 'btn-primary' : 'btn-outline')
                          }
                          onClick={() =>
                            editing ? cancelEdit() : startEdit(a)
                          }
                        >
                          {editing ? '닫기' : '수정'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline text-xs"
                          onClick={() => void remove(a)}
                        >
                          삭제
                        </button>
                      </div>
                    </div>

                    {editing ? (
                      <div
                        className="mt-3 grid gap-3 rounded-md border-t p-3"
                        style={{
                          background:
                            'color-mix(in srgb, var(--foreground) 4%, transparent)',
                        }}
                      >
                        <div className="grid gap-3 sm:grid-cols-2">
                          <input
                            className="input"
                            placeholder="계좌 이름"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            disabled={editSaving}
                          />
                          <input
                            className="input"
                            placeholder="은행/카드사 (선택)"
                            value={editBank}
                            onChange={(e) => setEditBank(e.target.value)}
                            disabled={editSaving}
                          />
                        </div>
                        <div className="grid gap-1">
                          <span
                            className="text-xs"
                            style={{ color: 'var(--muted)' }}
                          >
                            용도
                          </span>
                          <TypeChips
                            selected={editTypes}
                            onChange={setEditTypes}
                            disabled={editSaving}
                          />
                        </div>
                        <input
                          className="input"
                          placeholder="메모 (선택)"
                          value={editMemo}
                          onChange={(e) => setEditMemo(e.target.value)}
                          disabled={editSaving}
                        />
                        <div className="grid gap-1">
                          <span
                            className="text-xs"
                            style={{ color: 'var(--muted)' }}
                          >
                            초기 잔액 (시작 시점 금액)
                          </span>
                          <input
                            className="input"
                            type="number"
                            inputMode="numeric"
                            step={1}
                            placeholder="0"
                            value={editInitial}
                            onChange={(e) => setEditInitial(e.target.value)}
                            disabled={editSaving}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={saveEdit}
                            disabled={editSaving || editTypes.length === 0}
                          >
                            {editSaving ? '저장중...' : '저장'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline"
                            onClick={cancelEdit}
                            disabled={editSaving}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : null}
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
