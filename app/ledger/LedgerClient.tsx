'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  LedgerNavAccounts,
  LedgerNavBudgets,
  LedgerNavCalendar,
  LedgerNavMarket,
  LedgerNavStats,
  LedgerNavStocks,
} from './LedgerNavIcons'
import {
  OwnerStackBar,
  OwnerBreakdownList,
  ViewModeToggle,
  type OwnerSegment,
} from './OwnerBreakdown'
import { toHumanHttpError } from '@/app/lib/httpErrorText'
import { useToast } from '@/app/components/ToastProvider'
import { useAsyncLock } from '@/app/lib/useAsyncLock'
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  getCategoriesByType,
  type LedgerEntryType,
} from '@/app/lib/ledgerCategories'

type LedgerItem = {
  id: string
  ownerId: string
  ownerLabel: string
  shared: boolean
  canEdit: boolean
  accountId: string | null
  accountName: string | null
  accountBank: string | null
  type: LedgerEntryType
  amount: number
  description: string
  category: string
  subcategory: string | null
  excludeFromTotals: boolean
  linkedToHolding?: boolean
  runningBalance: number | null // 등록 계좌의 이 시점 누적 잔액 (계좌 미연결이면 null)
  occurredAt: string
  createdAt: string
  updatedAt: string
}

type AccountItem = {
  id: string
  name: string
  bankName: string | null
  types: string[]
  memo: string | null
  entryCount: number
}

type Totals = {
  income: number
  expense: number
  balance: number
}

type OwnerTotals = {
  ownerId: string
  income: number
  expense: number
  balance: number
}

type SharePeer = {
  id: string
  name: string | null
  email: string | null
  label: string
}

type OutgoingShare = {
  id: string
  scope: 'CALENDAR' | 'TODO' | 'LEDGER'
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED'
  owner: SharePeer
  createdAt: string
  updatedAt: string
  respondedAt: string | null
}

type IncomingShare = {
  id: string
  scope: 'CALENDAR' | 'TODO' | 'LEDGER'
  status: 'PENDING' | 'ACCEPTED'
  requester: SharePeer
  createdAt: string
  updatedAt: string
  respondedAt: string | null
}

type ShareAccount = {
  id: string
  label: string
  color: string
  isSelf: boolean
}

function hashString(input: string) {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function getPastelColor(seed: string) {
  const hash = hashString(seed || 'account')
  const hue = hash % 360
  const saturation = 62 + ((hash >>> 7) % 8)
  const lightness = 82 + ((hash >>> 15) % 6)
  return `hsl(${hue} ${saturation}% ${lightness}%)`
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

function extractApiMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const message = record['message']
  if (typeof message !== 'string') return null
  const trimmed = message.trim()
  return trimmed ? trimmed : null
}

async function readJsonSafely(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`
}

function toDateInputValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function startOfMonth(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

function endOfMonth(now: Date) {
  return new Date(now.getFullYear(), now.getMonth() + 1, 0)
}

function formatKRW(n: number) {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  return `${sign}₩${abs.toLocaleString('ko-KR')}`
}

function dateInputToStartIso(value: string): string | null {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString()
}

function dateInputToEndIso(value: string): string | null {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  const dt = new Date(y, m - 1, d + 1, 0, 0, 0, 0) // 다음날 00:00 (exclusive)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString()
}

function dateTimeLocalNow() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function datetimeLocalFromIso(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function isoFromDatetimeLocal(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export default function LedgerClient() {
  const toast = useToast()

  const today = useMemo(() => new Date(), [])
  const [periodStart, setPeriodStart] = useState<string>(() =>
    toDateInputValue(startOfMonth(new Date()))
  )
  const [periodEnd, setPeriodEnd] = useState<string>(() =>
    toDateInputValue(endOfMonth(new Date()))
  )

  const [items, setItems] = useState<LedgerItem[]>([])
  const [totalsAll, setTotalsAll] = useState<Totals>({
    income: 0,
    expense: 0,
    balance: 0,
  })
  const [totalsByOwner, setTotalsByOwner] = useState<OwnerTotals[]>([])
  const [viewMode, setViewMode] = useState<'combined' | 'split'>('combined')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // 입력 폼 상태
  const [formMode, setFormMode] = useState<'entry' | 'transfer'>('entry')
  const [transferFromId, setTransferFromId] = useState<string>('')
  const [transferToId, setTransferToId] = useState<string>('')
  const [hoTotalsAccountId, setHoTotalsAccountId] = useState<string>('ALL') // 'ALL' or accountId
  const [formType, setFormType] = useState<LedgerEntryType>('EXPENSE')
  const [formAmount, setFormAmount] = useState<string>('')
  const [formDesc, setFormDesc] = useState<string>('')
  const [formCategory, setFormCategory] = useState<string>(
    EXPENSE_CATEGORIES[0]?.key ?? ''
  )
  const [formSubcategory, setFormSubcategory] = useState<string>('')
  const [formOccurredAt, setFormOccurredAt] =
    useState<string>(dateTimeLocalNow())
  const [formExcludeFromTotals, setFormExcludeFromTotals] =
    useState<boolean>(false)
  const [formAccountId, setFormAccountId] = useState<string>('')
  const { pending: creating, run: runCreate } = useAsyncLock()

  // 계좌 목록
  const [accounts, setAccounts] = useState<AccountItem[]>([])

  // 인라인 수정
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editType, setEditType] = useState<LedgerEntryType>('EXPENSE')
  const [editAmount, setEditAmount] = useState<string>('')
  const [editDesc, setEditDesc] = useState<string>('')
  const [editCategory, setEditCategory] = useState<string>('')
  const [editSubcategory, setEditSubcategory] = useState<string>('')
  const [editOccurredAt, setEditOccurredAt] = useState<string>('')
  const [editExcludeFromTotals, setEditExcludeFromTotals] =
    useState<boolean>(false)
  const [editAccountId, setEditAccountId] = useState<string>('')
  const [editSaving, setEditSaving] = useState<boolean>(false)

  // 정렬/필터/검색
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterType, setFilterType] = useState<'ALL' | LedgerEntryType>('ALL')
  const [filterCategory, setFilterCategory] = useState<string>('ALL')
  const [filterSubcategory, setFilterSubcategory] = useState<string>('ALL')
  const [filterAccount, setFilterAccount] = useState<string>('ALL') // 'ALL' | 'NONE' | accountId
  // 필터용 날짜 범위 — 상단 기간(periodStart/End)와 별개로, 가져온 데이터를 클라이언트에서 추가 좁히기
  const [filterDateStart, setFilterDateStart] = useState<string>('')
  const [filterDateEnd, setFilterDateEnd] = useState<string>('')
  const [searchText, setSearchText] = useState<string>('')

  // 공유
  const [shareEmail, setShareEmail] = useState('')
  const [outgoingShares, setOutgoingShares] = useState<OutgoingShare[]>([])
  const [incomingShares, setIncomingShares] = useState<IncomingShare[]>([])
  const [meShare, setMeShare] = useState<SharePeer | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareBusyId, setShareBusyId] = useState<string | null>(null)
  const [visibleOwners, setVisibleOwners] = useState<Record<string, boolean>>(
    {}
  )

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    const startIso = dateInputToStartIso(periodStart)
    const endIso = dateInputToEndIso(periodEnd)
    if (startIso) params.set('start', startIso)
    if (endIso) params.set('end', endIso)

    // visibleOwners 중 false인 ownerId 들을 exclude로 전달
    const excluded = Object.entries(visibleOwners)
      .filter(([, on]) => on === false)
      .map(([id]) => id)
    if (excluded.length > 0)
      params.set('excludeOwners', excluded.join(','))

    const r = await fetch(`/api/ledger?${params.toString()}`, {
      cache: 'no-store',
    })
    if (!r.ok) {
      const msg = await readApiErrorMessage(r)
      const message = `${r.status} ${r.statusText} · ${msg ?? '불러오기 실패'}`
      setErr(message)
      toast.error(message)
      setLoading(false)
      return
    }
    const data = (await r.json()) as {
      items: LedgerItem[]
      totals: Totals
      totalsByOwner?: OwnerTotals[]
    }
    setItems(data.items)
    setTotalsAll(data.totals)
    setTotalsByOwner(data.totalsByOwner ?? [])
    setErr(null)
    setLoading(false)
  }, [periodStart, periodEnd, visibleOwners, toast])

  const loadAccounts = useCallback(async () => {
    const r = await fetch('/api/accounts', { cache: 'no-store' })
    if (!r.ok) return
    const data = (await r.json()) as { items: AccountItem[] }
    setAccounts(data.items)
  }, [])

  const loadShares = useCallback(async () => {
    setShareLoading(true)
    const res = await fetch('/api/schedule-shares', { cache: 'no-store' })
    if (!res.ok) {
      const payload = await readJsonSafely(res)
      const msg = extractApiMessage(payload) ?? '공유 정보 불러오기 실패'
      const human = toHumanHttpError(res.status, msg)
      const message = human ?? `${res.status} · ${msg}`
      setErr(message)
      toast.error(message)
      setShareLoading(false)
      return
    }

    const payload = (await res.json()) as {
      me?: SharePeer
      outgoing?: OutgoingShare[]
      incoming?: IncomingShare[]
    }
    setMeShare(payload.me ?? null)
    setOutgoingShares(
      (payload.outgoing ?? []).filter((row) => row.scope === 'LEDGER')
    )
    setIncomingShares(
      (payload.incoming ?? []).filter((row) => row.scope === 'LEDGER')
    )
    setShareLoading(false)
  }, [toast])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load()
    }, 0)
    return () => {
      window.clearTimeout(t)
    }
  }, [load])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadShares()
    }, 0)
    return () => {
      window.clearTimeout(t)
    }
  }, [loadShares])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadAccounts()
    }, 0)
    return () => {
      window.clearTimeout(t)
    }
  }, [loadAccounts])

  const toggleFormType = () => {
    const next: LedgerEntryType = formType === 'INCOME' ? 'EXPENSE' : 'INCOME'
    const list = getCategoriesByType(next)
    setFormType(next)
    setFormCategory(list[0]?.key ?? '')
    setFormSubcategory('')
  }

  const changeFormCategory = (nextKey: string) => {
    setFormCategory(nextKey)
    setFormSubcategory('')
  }

  const changeFilterType = (next: 'ALL' | LedgerEntryType) => {
    setFilterType(next)
    setFilterCategory('ALL')
    setFilterSubcategory('ALL')
  }

  const changeFilterCategory = (next: string) => {
    setFilterCategory(next)
    setFilterSubcategory('ALL')
  }

  const sendShareRequest = async () => {
    const targetEmail = shareEmail.trim()
    if (!targetEmail) {
      const message = '공유 요청 이메일을 입력해 주세요.'
      setErr(message)
      toast.error(message)
      return
    }
    setErr(null)
    setShareBusyId('new')

    const res = await fetch('/api/schedule-shares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetEmail, scope: 'LEDGER' }),
    })
    if (!res.ok) {
      const payload = await readJsonSafely(res)
      const msg = extractApiMessage(payload) ?? '공유 요청 실패'
      const human = toHumanHttpError(res.status, msg)
      const message = human ?? `${res.status} · ${msg}`
      setErr(message)
      toast.error(message)
      setShareBusyId(null)
      return
    }

    setShareEmail('')
    setShareBusyId(null)
    toast.success('가계부 공유 요청을 보냈습니다.')
    await Promise.all([loadShares(), load()])
  }

  const respondShareRequest = async (
    shareId: string,
    action: 'ACCEPT' | 'REJECT'
  ) => {
    setErr(null)
    setShareBusyId(shareId)

    const res = await fetch(`/api/schedule-shares/${shareId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (!res.ok) {
      const payload = await readJsonSafely(res)
      const msg =
        extractApiMessage(payload) ??
        (action === 'ACCEPT' ? '승인 실패' : '거절 실패')
      const human = toHumanHttpError(res.status, msg)
      const message = human ?? `${res.status} · ${msg}`
      setErr(message)
      toast.error(message)
      setShareBusyId(null)
      return
    }

    setShareBusyId(null)
    toast.success(
      action === 'ACCEPT'
        ? '공유 요청을 승인했습니다.'
        : '공유 요청을 거절했습니다.'
    )
    await Promise.all([loadShares(), load()])
  }

  const removeShare = async (shareId: string) => {
    setErr(null)
    setShareBusyId(shareId)

    const res = await fetch(`/api/schedule-shares/${shareId}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const payload = await readJsonSafely(res)
      const msg = extractApiMessage(payload) ?? '공유 해제 실패'
      const human = toHumanHttpError(res.status, msg)
      const message = human ?? `${res.status} · ${msg}`
      setErr(message)
      toast.error(message)
      setShareBusyId(null)
      return
    }

    setShareBusyId(null)
    toast.success('공유 연결을 해제했습니다.')
    await Promise.all([loadShares(), load()])
  }

  const create = async () => {
    await runCreate(async () => {
      const amountInt = parseInt(formAmount.replace(/[^0-9]/g, ''), 10)
      if (!Number.isFinite(amountInt) || amountInt <= 0) {
        const message = '금액을 올바르게 입력해 주세요.'
        setErr(message)
        toast.error(message)
        return
      }
      if (!formDesc.trim()) {
        const message = '항목 설명을 입력해 주세요.'
        setErr(message)
        toast.error(message)
        return
      }
      if (!formCategory) {
        const message = '대분류를 선택해 주세요.'
        setErr(message)
        toast.error(message)
        return
      }

      const payload = {
        type: formType,
        amount: amountInt,
        description: formDesc.trim(),
        category: formCategory,
        subcategory: formSubcategory || null,
        accountId: formAccountId || null,
        excludeFromTotals: formExcludeFromTotals,
        occurredAt: isoFromDatetimeLocal(formOccurredAt) ?? null,
      }

      const r = await fetch('/api/ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!r.ok) {
        const msg = await readApiErrorMessage(r)
        const message = `${r.status} ${r.statusText} · ${msg ?? '저장 실패'}`
        setErr(message)
        toast.error(message)
        return
      }

      setFormAmount('')
      setFormDesc('')
      setFormOccurredAt(dateTimeLocalNow())
      setFormExcludeFromTotals(false)
      await load()
      toast.success('항목을 저장했습니다.')
    })
  }

  const createTransfer = async () => {
    if (creating) return
    if (!transferFromId || !transferToId) {
      const message = '출발 계좌와 도착 계좌를 모두 선택해주세요.'
      setErr(message)
      toast.error(message)
      return
    }
    if (transferFromId === transferToId) {
      const message = '서로 다른 계좌를 선택해주세요.'
      setErr(message)
      toast.error(message)
      return
    }
    const amountInt = parseInt(formAmount.replace(/,/g, ''), 10)
    if (!Number.isFinite(amountInt) || amountInt <= 0) {
      const message = '금액을 입력해주세요.'
      setErr(message)
      toast.error(message)
      return
    }
    await runCreate(async () => {
      const r = await fetch('/api/ledger/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAccountId: transferFromId,
          toAccountId: transferToId,
          amount: amountInt,
          description: formDesc.trim(),
          occurredAt: isoFromDatetimeLocal(formOccurredAt) ?? null,
        }),
      })
      if (!r.ok) {
        const msg = await readApiErrorMessage(r)
        const message = `${r.status} ${r.statusText} · ${msg ?? '이체 실패'}`
        setErr(message)
        toast.error(message)
        return
      }
      setFormAmount('')
      setFormDesc('')
      setFormOccurredAt(dateTimeLocalNow())
      await load()
      toast.success('이체를 등록했습니다.')
    })
  }

  const remove = async (id: string) => {
    const target = items.find((it) => it.id === id)
    const confirmMsg = target?.linkedToHolding
      ? '이 항목은 주식/투자 거래에서 자동 생성된 항목입니다.\n여기서 삭제해도 원 거래 기록에는 영향이 없습니다.\n그래도 삭제할까요?'
      : '이 항목을 삭제할까요?'
    const ok = window.confirm(confirmMsg)
    if (!ok) return
    const r = await fetch(`/api/ledger/${id}`, { method: 'DELETE' })
    if (!r.ok) {
      const msg = await readApiErrorMessage(r)
      const message = `${r.status} ${r.statusText} · ${msg ?? '삭제 실패'}`
      setErr(message)
      toast.error(message)
      return
    }
    await load()
    toast.success('항목을 삭제했습니다.')
  }

  const startEdit = (it: LedgerItem) => {
    setEditingId(it.id)
    setEditType(it.type)
    setEditAmount(it.amount.toLocaleString('ko-KR'))
    setEditDesc(it.description)
    setEditCategory(it.category)
    setEditSubcategory(it.subcategory ?? '')
    setEditOccurredAt(datetimeLocalFromIso(it.occurredAt))
    setEditExcludeFromTotals(it.excludeFromTotals)
    setEditAccountId(it.accountId ?? '')
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const toggleEditType = () => {
    const next: LedgerEntryType = editType === 'INCOME' ? 'EXPENSE' : 'INCOME'
    const list = getCategoriesByType(next)
    setEditType(next)
    setEditCategory(list[0]?.key ?? '')
    setEditSubcategory('')
  }

  const changeEditCategory = (nextKey: string) => {
    setEditCategory(nextKey)
    setEditSubcategory('')
  }

  const saveEdit = async () => {
    if (!editingId) return
    const amountInt = parseInt(editAmount.replace(/[^0-9]/g, ''), 10)
    if (!Number.isFinite(amountInt) || amountInt <= 0) {
      const message = '금액을 올바르게 입력해 주세요.'
      setErr(message)
      toast.error(message)
      return
    }
    if (!editDesc.trim()) {
      const message = '항목 설명을 입력해 주세요.'
      setErr(message)
      toast.error(message)
      return
    }
    if (!editCategory) {
      const message = '대분류를 선택해 주세요.'
      setErr(message)
      toast.error(message)
      return
    }

    setEditSaving(true)
    const payload = {
      type: editType,
      amount: amountInt,
      description: editDesc.trim(),
      category: editCategory,
      subcategory: editSubcategory || null,
      accountId: editAccountId || null,
      excludeFromTotals: editExcludeFromTotals,
      occurredAt: isoFromDatetimeLocal(editOccurredAt) ?? null,
    }

    const r = await fetch(`/api/ledger/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setEditSaving(false)

    if (!r.ok) {
      const msg = await readApiErrorMessage(r)
      const message = `${r.status} ${r.statusText} · ${msg ?? '수정 실패'}`
      setErr(message)
      toast.error(message)
      return
    }

    setEditingId(null)
    await load()
    toast.success('항목을 수정했습니다.')
  }

  const toggleExclude = async (id: string, next: boolean) => {
    const r = await fetch(`/api/ledger/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ excludeFromTotals: next }),
    })
    if (!r.ok) {
      const msg = await readApiErrorMessage(r)
      const message = `${r.status} ${r.statusText} · ${msg ?? '변경 실패'}`
      setErr(message)
      toast.error(message)
      return
    }
    await load()
  }

  // 공유 계정 색상 / 표시 관리
  const selfOwnerIdFromItems = items.find((it) => !it.shared)?.ownerId ?? null
  const selfLabelFromItems =
    items.find((it) => !it.shared)?.ownerLabel ?? '내 계정'
  const selfAccountId = meShare?.id ?? selfOwnerIdFromItems ?? 'self'
  const selfAccountLabel = meShare?.label ?? selfLabelFromItems

  const shareAccounts = useMemo<ShareAccount[]>(() => {
    const acceptedOwners = outgoingShares
      .filter((row) => row.status === 'ACCEPTED')
      .map((row) => row.owner)

    const map = new Map<string, ShareAccount>()
    map.set(selfAccountId, {
      id: selfAccountId,
      label: selfAccountLabel,
      color: getPastelColor(selfAccountId),
      isSelf: true,
    })

    for (const owner of acceptedOwners) {
      if (owner.id === selfAccountId) continue
      if (map.has(owner.id)) continue
      map.set(owner.id, {
        id: owner.id,
        label: owner.label,
        color: getPastelColor(owner.id),
        isSelf: false,
      })
    }

    return [
      map.get(selfAccountId)!,
      ...Array.from(map.values())
        .filter((row) => row.id !== selfAccountId)
        .sort((a, b) => a.label.localeCompare(b.label)),
    ]
  }, [outgoingShares, selfAccountId, selfAccountLabel])

  const ownerColorMap = useMemo<Record<string, string>>(() => {
    return shareAccounts.reduce<Record<string, string>>((acc, row) => {
      acc[row.id] = row.color
      return acc
    }, {})
  }, [shareAccounts])

  const visibleOwnerIds = useMemo(() => {
    return new Set(
      shareAccounts
        .filter((row) => visibleOwners[row.id] !== false)
        .map((row) => row.id)
    )
  }, [shareAccounts, visibleOwners])

  // 기간 합계 (보이는 계정 + 합계 제외가 아닌 항목만 계산)
  const periodTotals = useMemo<Totals>(() => {
    let income = 0
    let expense = 0
    for (const it of items) {
      if (visibleOwnerIds.size > 0 && !visibleOwnerIds.has(it.ownerId)) continue
      if (it.excludeFromTotals) continue
      if (it.type === 'INCOME') income += it.amount
      else expense += it.amount
    }
    return { income, expense, balance: income - expense }
  }, [items, visibleOwnerIds])

  // 기간 합계 owner별 분리 (분리 모드 + stack bar용)
  const periodTotalsByOwner = useMemo(() => {
    const map = new Map<
      string,
      { income: number; expense: number; balance: number }
    >()
    for (const it of items) {
      if (visibleOwnerIds.size > 0 && !visibleOwnerIds.has(it.ownerId)) continue
      if (it.excludeFromTotals) continue
      const entry =
        map.get(it.ownerId) ?? { income: 0, expense: 0, balance: 0 }
      if (it.type === 'INCOME') entry.income += it.amount
      else entry.expense += it.amount
      entry.balance = entry.income - entry.expense
      map.set(it.ownerId, entry)
    }
    return map
  }, [items, visibleOwnerIds])

  // 전체 잔액 owner별 (서버 응답 totalsByOwner를 visible로 필터링)
  const totalsByOwnerVisible = useMemo(() => {
    return totalsByOwner.filter(
      (t) => visibleOwnerIds.size === 0 || visibleOwnerIds.has(t.ownerId)
    )
  }, [totalsByOwner, visibleOwnerIds])

  // 계좌별 합계 — items에서 직접 계산
  // 주의: 계좌별 잔액은 합계 제외 항목(이체 등)도 포함해야 함 (실제 cash 이동)
  // 전체(ALL) 합계는 totalsAll/periodTotals 그대로 사용 — 합계 제외 제외
  // 표시되는 "계좌 잔액"은 마지막 내역의 runningBalance를 사용 (전체 누적 + initialBalance 반영)
  const accountTotalsMap = useMemo(() => {
    const map = new Map<
      string,
      { income: number; expense: number; balance: number }
    >()
    // 1) 기간 income/expense 합산
    for (const it of items) {
      if (visibleOwnerIds.size > 0 && !visibleOwnerIds.has(it.ownerId)) continue
      if (!it.accountId) continue
      const entry =
        map.get(it.accountId) ?? { income: 0, expense: 0, balance: 0 }
      if (it.type === 'INCOME') entry.income += it.amount
      else entry.expense += it.amount
      map.set(it.accountId, entry)
    }
    // 2) 계좌별 마지막 internal runningBalance를 잔액으로 (initialBalance + 전체 누적 반영됨)
    const lastBalance = new Map<string, { time: number; bal: number }>()
    for (const it of items) {
      if (!it.accountId) continue
      if (it.runningBalance === null) continue
      const t = new Date(it.occurredAt).getTime()
      const prev = lastBalance.get(it.accountId)
      if (!prev || t > prev.time) {
        lastBalance.set(it.accountId, { time: t, bal: it.runningBalance })
      }
    }
    for (const [accId, v] of lastBalance) {
      const entry = map.get(accId) ?? { income: 0, expense: 0, balance: 0 }
      entry.balance = v.bal
      map.set(accId, entry)
    }
    // 3) 기간 내 내역이 전혀 없는 계좌는 잔액 0으로 유지 (initialBalance 별도 조회는 추후)
    return map
  }, [items, visibleOwnerIds])

  // 선택된 hero 보기 — 전체 또는 특정 계좌
  const heroTotals = useMemo<Totals>(() => {
    if (hoTotalsAccountId === 'ALL') return totalsAll
    return (
      accountTotalsMap.get(hoTotalsAccountId) ?? {
        income: 0,
        expense: 0,
        balance: 0,
      }
    )
  }, [hoTotalsAccountId, totalsAll, accountTotalsMap])

  // segments 빌더 — 화면에 표시 가능한 owner 순서대로
  const buildSegments = (
    fn: (ownerId: string) => { value: number; displayValue: string }
  ): OwnerSegment[] => {
    return shareAccounts
      .filter((a) =>
        visibleOwnerIds.size === 0 ? true : visibleOwnerIds.has(a.id)
      )
      .map((a) => {
        const { value, displayValue } = fn(a.id)
        return {
          ownerId: a.id,
          label: a.label,
          color: a.color,
          isSelf: a.isSelf,
          value,
          displayValue,
        }
      })
      .filter((s) => s.value !== 0 || true) // 0 인 것도 표시 (빈 stack 안 보임)
  }

  // 정렬/필터/검색 결과
  const displayedItems = useMemo(() => {
    const search = searchText.trim().toLowerCase()
    let arr = items.filter(
      (it) => visibleOwnerIds.size === 0 || visibleOwnerIds.has(it.ownerId)
    )
    if (filterType !== 'ALL') arr = arr.filter((it) => it.type === filterType)
    if (filterCategory !== 'ALL')
      arr = arr.filter((it) => it.category === filterCategory)
    if (filterSubcategory !== 'ALL')
      arr = arr.filter((it) => (it.subcategory ?? '') === filterSubcategory)
    if (filterAccount !== 'ALL') {
      if (filterAccount === 'NONE') {
        arr = arr.filter((it) => !it.accountId)
      } else {
        arr = arr.filter((it) => it.accountId === filterAccount)
      }
    }
    if (filterDateStart) {
      const [y, m, d] = filterDateStart.split('-').map(Number)
      if (y && m && d) {
        const startMs = new Date(y, m - 1, d, 0, 0, 0, 0).getTime()
        arr = arr.filter((it) => new Date(it.occurredAt).getTime() >= startMs)
      }
    }
    if (filterDateEnd) {
      const [y, m, d] = filterDateEnd.split('-').map(Number)
      if (y && m && d) {
        const endMs = new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
        arr = arr.filter((it) => new Date(it.occurredAt).getTime() <= endMs)
      }
    }
    if (search)
      arr = arr.filter((it) => it.description.toLowerCase().includes(search))
    arr = [...arr].sort((a, b) => {
      const da = new Date(a.occurredAt).getTime()
      const db = new Date(b.occurredAt).getTime()
      return sortDir === 'desc' ? db - da : da - db
    })
    return arr
  }, [
    items,
    visibleOwnerIds,
    sortDir,
    filterType,
    filterCategory,
    filterSubcategory,
    filterAccount,
    filterDateStart,
    filterDateEnd,
    searchText,
  ])

  const currentCategoryList = getCategoriesByType(formType)
  const currentCategorySpec = currentCategoryList.find(
    (c) => c.key === formCategory
  )

  // 현재 선택된 기간의 앵커 (periodStart 우선, 비어있으면 오늘)
  const parsePeriodAnchor = (): Date => {
    if (!periodStart) return today
    const [y, m, d] = periodStart.split('-').map(Number)
    if (!y || !m || !d) return today
    const dt = new Date(y, m - 1, d)
    if (Number.isNaN(dt.getTime())) return today
    return dt
  }

  const setAllPeriod = () => {
    setPeriodStart('')
    setPeriodEnd('')
  }

  // 년: 이전/다음은 현재 선택 기준 ±1년, 올해는 오늘로 리셋
  const shiftYear = (offset: number) => {
    const anchor = parsePeriodAnchor()
    const y = anchor.getFullYear() + offset
    setPeriodStart(toDateInputValue(new Date(y, 0, 1)))
    setPeriodEnd(toDateInputValue(new Date(y, 11, 31)))
  }

  const goThisYear = () => {
    const y = today.getFullYear()
    setPeriodStart(toDateInputValue(new Date(y, 0, 1)))
    setPeriodEnd(toDateInputValue(new Date(y, 11, 31)))
  }

  // 월: 이전/다음은 현재 선택 기준 ±1개월, 이번은 오늘로 리셋
  const shiftMonth = (offset: number) => {
    const anchor = parsePeriodAnchor()
    const m = new Date(anchor.getFullYear(), anchor.getMonth() + offset, 1)
    setPeriodStart(toDateInputValue(startOfMonth(m)))
    setPeriodEnd(toDateInputValue(endOfMonth(m)))
  }

  const goThisMonth = () => {
    setPeriodStart(toDateInputValue(startOfMonth(today)))
    setPeriodEnd(toDateInputValue(endOfMonth(today)))
  }

  // 일: 이전/다음은 현재 선택 기준 ±1일, 오늘은 오늘로 리셋
  const shiftDay = (offset: number) => {
    const anchor = parsePeriodAnchor()
    const d = new Date(
      anchor.getFullYear(),
      anchor.getMonth(),
      anchor.getDate() + offset
    )
    const v = toDateInputValue(d)
    setPeriodStart(v)
    setPeriodEnd(v)
  }

  const goToday = () => {
    const v = toDateInputValue(today)
    setPeriodStart(v)
    setPeriodEnd(v)
  }

  // 필터용 카테고리 옵션 — 전체 모드일 때 INCOME/EXPENSE 양쪽에 동명 카테고리가
  // 있으면 (예: "기타") key 기준으로 dedupe (합집합으로 같은 카테고리명 항목 모두 필터)
  const filterCategoryList: { key: string; subcategories: string[] }[] =
    filterType === 'ALL'
      ? Array.from(
          new Map(
            [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].map((c) => [c.key, c])
          ).values()
        )
      : getCategoriesByType(filterType)

  const filterSubcategoryList =
    filterCategory === 'ALL'
      ? []
      : (filterCategoryList.find((c) => c.key === filterCategory)
          ?.subcategories ?? [])

  return (
    <main className="w-full px-3 py-6 sm:px-4 lg:px-6">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-6">
          {/* 헤더 + 현재 잔액 (Hero) */}
          <div className="surface card-pad card-hover-border-only">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold sm:text-2xl">가계부</h1>
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    수입·지출 기록
                  </span>
                </div>
                <div className="mt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div
                      className="flex flex-wrap items-center gap-2 text-xs"
                      style={{ color: 'var(--muted)' }}
                    >
                      <span>
                        {hoTotalsAccountId === 'ALL'
                          ? '현재 남은 금액 (전체 누적)'
                          : '계좌 잔액 (해당 기간)'}
                      </span>
                      <select
                        className="input"
                        style={{ height: 'auto', padding: '2px 8px', fontSize: '11px' }}
                        value={hoTotalsAccountId}
                        onChange={(e) => setHoTotalsAccountId(e.target.value)}
                        aria-label="계좌 필터"
                      >
                        <option value="ALL">전체</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                            {a.bankName ? ` · ${a.bankName}` : ''}
                          </option>
                        ))}
                      </select>
                      {/* 내역 필터 동기화 / 해제 토글
                          - 상단=특정 계좌: 🔗 (그 계좌로 필터 동기화)
                          - 상단=전체이지만 필터=특정 계좌: ✕ (필터 전체로 해제)
                          - 둘 다 전체: 버튼 숨김 */}
                      {(hoTotalsAccountId !== 'ALL' ||
                        filterAccount !== 'ALL') ? (
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ padding: '2px 6px', fontSize: '11px', lineHeight: 1.2 }}
                          onClick={() => {
                            if (hoTotalsAccountId === 'ALL') {
                              // 상단 전체 → 필터 해제
                              setFilterAccount('ALL')
                            } else {
                              // 상단 특정 계좌 → 그 계좌로 필터 동기화
                              setFilterAccount(hoTotalsAccountId)
                              setFilterOpen(true)
                              // 내역 영역으로 부드럽게 스크롤
                              window.requestAnimationFrame(() => {
                                const el = document.getElementById(
                                  'ledger-entries-list'
                                )
                                el?.scrollIntoView({
                                  behavior: 'smooth',
                                  block: 'start',
                                })
                              })
                            }
                          }}
                          title={
                            hoTotalsAccountId === 'ALL'
                              ? '내역 필터를 전체 계좌로 초기화'
                              : '이 계좌로 아래 내역 필터를 동기화'
                          }
                          aria-label={
                            hoTotalsAccountId === 'ALL'
                              ? '내역 필터 전체로 초기화'
                              : '이 계좌로 내역 필터 동기화'
                          }
                        >
                          {hoTotalsAccountId === 'ALL' ? '✕' : '🔗'}
                        </button>
                      ) : null}
                    </div>
                    {hoTotalsAccountId === 'ALL' &&
                    totalsByOwnerVisible.length > 1 ? (
                      <ViewModeToggle mode={viewMode} onChange={setViewMode} />
                    ) : null}
                  </div>

                  {hoTotalsAccountId !== 'ALL' || viewMode === 'combined' ? (
                    <>
                      <div
                        className={
                          'mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl ' +
                          (heroTotals.balance < 0
                            ? 'text-red-500'
                            : 'text-emerald-500')
                        }
                      >
                        {formatKRW(heroTotals.balance)}
                      </div>
                      <div
                        className="mt-1 text-xs"
                        style={{ color: 'var(--muted)' }}
                      >
                        {hoTotalsAccountId === 'ALL' ? '누적 ' : ''}수입{' '}
                        {formatKRW(heroTotals.income)} · 지출{' '}
                        {formatKRW(heroTotals.expense)}
                        {hoTotalsAccountId !== 'ALL' && (
                          <span className="ml-2" style={{ opacity: 0.7 }}>
                            (이체 포함)
                          </span>
                        )}
                      </div>
                      {hoTotalsAccountId === 'ALL' &&
                      totalsByOwnerVisible.length > 1 ? (
                        <OwnerStackBar
                          segments={buildSegments((ownerId) => {
                            const ot = totalsByOwnerVisible.find(
                              (t) => t.ownerId === ownerId
                            )
                            const bal = ot?.balance ?? 0
                            return {
                              value: bal,
                              displayValue: formatKRW(bal),
                            }
                          })}
                        />
                      ) : null}
                    </>
                  ) : (
                    <OwnerBreakdownList
                      className="mt-2"
                      segments={buildSegments((ownerId) => {
                        const ot = totalsByOwnerVisible.find(
                          (t) => t.ownerId === ownerId
                        )
                        const bal = ot?.balance ?? 0
                        return {
                          value: bal,
                          displayValue:
                            (bal >= 0 ? '+' : '') + formatKRW(bal),
                        }
                      })}
                    />
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <LedgerNavCalendar />
                <LedgerNavStats />
                <LedgerNavBudgets />
                <LedgerNavAccounts />
                <LedgerNavMarket />
                <LedgerNavStocks />
              </div>
            </div>

            {err ? (
              <div className="mt-4 card p-3" style={{ color: 'crimson' }}>
                {err}
              </div>
            ) : null}
          </div>

          {/* 기간 설정 + 기간 합계 */}
          <div className="surface card-pad card-hover-border-only">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-extrabold">기간별 통계</div>
              <button
                type="button"
                className="btn btn-outline text-xs"
                onClick={setAllPeriod}
                title="기간 제한 없이 전체 표시"
              >
                전체 기간
              </button>
            </div>

            {/* 빠른 기간 선택 — chip 1줄 */}
            <div className="mt-3 flex flex-wrap items-center gap-1 text-xs">
              <span className="mr-1 shrink-0" style={{ color: 'var(--muted)' }}>
                년
              </span>
              <button
                type="button"
                className="btn btn-outline text-xs"
                onClick={() => shiftYear(-1)}
                title="현재 선택 기준 이전 년도"
              >
                이전
              </button>
              <button
                type="button"
                className="btn btn-outline text-xs"
                onClick={goThisYear}
                title="올해로 이동"
              >
                올해
              </button>
              <button
                type="button"
                className="btn btn-outline text-xs"
                onClick={() => shiftYear(1)}
                title="현재 선택 기준 다음 년도"
              >
                다음
              </button>

              <span className="mx-1 opacity-30" aria-hidden="true">
                |
              </span>

              <span className="mr-1 shrink-0" style={{ color: 'var(--muted)' }}>
                월
              </span>
              <button
                type="button"
                className="btn btn-outline text-xs"
                onClick={() => shiftMonth(-1)}
                title="현재 선택 기준 이전 달"
              >
                이전
              </button>
              <button
                type="button"
                className="btn btn-outline text-xs"
                onClick={goThisMonth}
                title="이번 달로 이동"
              >
                이번
              </button>
              <button
                type="button"
                className="btn btn-outline text-xs"
                onClick={() => shiftMonth(1)}
                title="현재 선택 기준 다음 달"
              >
                다음
              </button>

              <span className="mx-1 opacity-30" aria-hidden="true">
                |
              </span>

              <span className="mr-1 shrink-0" style={{ color: 'var(--muted)' }}>
                일
              </span>
              <button
                type="button"
                className="btn btn-outline text-xs"
                onClick={() => shiftDay(-1)}
                title="현재 선택 기준 이전 일"
              >
                이전
              </button>
              <button
                type="button"
                className="btn btn-outline text-xs"
                onClick={goToday}
                title="오늘로 이동"
              >
                오늘
              </button>
              <button
                type="button"
                className="btn btn-outline text-xs"
                onClick={() => shiftDay(1)}
                title="현재 선택 기준 다음 일"
              >
                다음
              </button>
            </div>

            {/* 시작 ~ 종료 */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="date"
                className="input"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                aria-label="기간 시작"
              />
              <span style={{ color: 'var(--muted)' }}>~</span>
              <input
                type="date"
                className="input"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                aria-label="기간 종료"
              />
            </div>

            {/* 기간 합계 카드 3개 */}
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div
                className="card p-3 card-hover-border-only"
                style={{
                  background: 'color-mix(in srgb, #10b981 12%, var(--card))',
                  borderColor: 'color-mix(in srgb, #10b981 35%, var(--border))',
                }}
              >
                <div className="text-xs" style={{ color: 'var(--muted)' }}>
                  수입 (+)
                </div>
                <div className="mt-1 font-extrabold text-emerald-500">
                  {formatKRW(periodTotals.income)}
                </div>
              </div>
              <div
                className="card p-3 card-hover-border-only"
                style={{
                  background: 'color-mix(in srgb, #ef4444 12%, var(--card))',
                  borderColor: 'color-mix(in srgb, #ef4444 35%, var(--border))',
                }}
              >
                <div className="text-xs" style={{ color: 'var(--muted)' }}>
                  지출 (−)
                </div>
                <div className="mt-1 font-extrabold text-red-500">
                  −{formatKRW(periodTotals.expense).replace('-', '')}
                </div>
              </div>
              <div className="card p-3 card-hover-border-only">
                <div className="text-xs" style={{ color: 'var(--muted)' }}>
                  잔액
                </div>
                <div
                  className={
                    'mt-1 font-extrabold ' +
                    (periodTotals.balance < 0
                      ? 'text-red-500'
                      : 'text-emerald-500')
                  }
                >
                  {formatKRW(periodTotals.balance)}
                </div>
              </div>
            </div>

            {/* 기간 합계 owner별 분리 / stack */}
            {periodTotalsByOwner.size > 1 ? (
              viewMode === 'combined' ? (
                <div className="mt-2">
                  <OwnerStackBar
                    segments={buildSegments((ownerId) => {
                      const o = periodTotalsByOwner.get(ownerId)
                      const bal = o?.balance ?? 0
                      return {
                        value: bal,
                        displayValue:
                          (bal >= 0 ? '+' : '') + formatKRW(bal),
                      }
                    })}
                  />
                </div>
              ) : (
                <OwnerBreakdownList
                  className="mt-3"
                  segments={buildSegments((ownerId) => {
                    const o = periodTotalsByOwner.get(ownerId)
                    const bal = o?.balance ?? 0
                    return {
                      value: bal,
                      displayValue:
                        (bal >= 0 ? '+' : '') + formatKRW(bal),
                    }
                  })}
                />
              )
            ) : null}
          </div>

          {/* 입력 폼 */}
          <div className="surface card-pad card-hover-border-only">
            <div className="flex items-center justify-between gap-2">
              <div className="font-extrabold">
                {formMode === 'transfer' ? '계좌간 이체' : '항목 추가'}
              </div>
              <div className="flex gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => setFormMode('entry')}
                  className={
                    'btn ' +
                    (formMode === 'entry' ? 'btn-primary' : 'btn-outline')
                  }
                >
                  수입/지출
                </button>
                <button
                  type="button"
                  onClick={() => setFormMode('transfer')}
                  className={
                    'btn ' +
                    (formMode === 'transfer' ? 'btn-primary' : 'btn-outline')
                  }
                >
                  이체
                </button>
              </div>
            </div>
            <form
              className="mt-4 grid gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (formMode === 'transfer') void createTransfer()
                else void create()
              }}
            >
              {/* +/- 토글 (entry 모드만) + 금액 */}
              <div
                className={
                  formMode === 'entry'
                    ? 'grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]'
                    : 'grid gap-3'
                }
              >
                {formMode === 'entry' && (
                  <button
                    type="button"
                    className="btn"
                    onClick={toggleFormType}
                    aria-label="수입/지출 전환"
                    title="클릭해서 수입/지출 전환"
                    style={{
                      background:
                        formType === 'INCOME'
                          ? 'color-mix(in srgb, #10b981 18%, var(--card))'
                          : 'color-mix(in srgb, #ef4444 18%, var(--card))',
                      borderColor:
                        formType === 'INCOME'
                          ? 'color-mix(in srgb, #10b981 55%, var(--border))'
                          : 'color-mix(in srgb, #ef4444 55%, var(--border))',
                      color: formType === 'INCOME' ? '#059669' : '#dc2626',
                      fontWeight: 700,
                    }}
                  >
                    {formType === 'INCOME' ? '＋  수입' : '−  지출'}
                  </button>
                )}

                <input
                  className="input"
                  inputMode="numeric"
                  placeholder="금액 (원)"
                  value={formAmount}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '')
                    if (!raw) {
                      setFormAmount('')
                      return
                    }
                    setFormAmount(Number(raw).toLocaleString('ko-KR'))
                  }}
                  disabled={creating}
                  style={{ fontSize: '1.05rem', fontWeight: 600 }}
                />
              </div>

              <input
                className="input"
                placeholder={
                  formMode === 'transfer'
                    ? '메모 (예: 월급통장에서 한투로)'
                    : '항목 설명 (예: 점심 식사, 5월 월급)'
                }
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                disabled={creating}
              />

              {formMode === 'entry' && (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      className="input"
                      value={formCategory}
                      onChange={(e) => changeFormCategory(e.target.value)}
                      disabled={creating}
                      aria-label="대분류"
                    >
                      {currentCategoryList.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>

                    <select
                      className="input"
                      value={formSubcategory}
                      onChange={(e) => setFormSubcategory(e.target.value)}
                      disabled={
                        creating ||
                        !currentCategorySpec ||
                        currentCategorySpec.subcategories.length === 0
                      }
                      aria-label="소분류"
                    >
                      <option value="">
                        {currentCategorySpec &&
                        currentCategorySpec.subcategories.length === 0
                          ? '(소분류 없음)'
                          : '소분류 선택'}
                      </option>
                      {currentCategorySpec?.subcategories.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <select
                    className="input"
                    value={formAccountId}
                    onChange={(e) => setFormAccountId(e.target.value)}
                    disabled={creating}
                    aria-label="계좌"
                  >
                    <option value="">계좌 선택 (선택사항)</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {a.bankName ? ` · ${a.bankName}` : ''}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {formMode === 'transfer' && (
                <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
                  <select
                    className="input"
                    value={transferFromId}
                    onChange={(e) => setTransferFromId(e.target.value)}
                    disabled={creating}
                    aria-label="출발 계좌"
                  >
                    <option value="">출발 계좌</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {a.bankName ? ` · ${a.bankName}` : ''}
                      </option>
                    ))}
                  </select>
                  <div
                    className="text-center text-lg"
                    style={{ color: 'var(--muted)' }}
                  >
                    →
                  </div>
                  <select
                    className="input"
                    value={transferToId}
                    onChange={(e) => setTransferToId(e.target.value)}
                    disabled={creating}
                    aria-label="도착 계좌"
                  >
                    <option value="">도착 계좌</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                        {a.bankName ? ` · ${a.bankName}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input
                  className="input"
                  type="datetime-local"
                  value={formOccurredAt}
                  onChange={(e) => setFormOccurredAt(e.target.value)}
                  disabled={creating}
                  aria-label="발생 일시"
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={creating}
                >
                  {creating
                    ? '저장중...'
                    : formMode === 'transfer'
                      ? '이체'
                      : '저장'}
                </button>
              </div>

              {formMode === 'entry' && (
                <label className="grid gap-1 text-sm">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formExcludeFromTotals}
                      onChange={(e) =>
                        setFormExcludeFromTotals(e.target.checked)
                      }
                      disabled={creating}
                    />
                    <span className="font-medium">합계 제외</span>
                  </span>
                  <span
                    className="pl-6 text-xs leading-5"
                    style={{ color: 'var(--muted)' }}
                  >
                    카드 대금 선결제 · 통장간 이체 등 자산 변동 없는 항목
                  </span>
                </label>
              )}
              {formMode === 'transfer' && (
                <p
                  className="text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  이체는 자동으로 합계 제외 처리됩니다 — 두 계좌 사이에 출금·입금 항목이
                  한 번에 생성돼서 전체 자산엔 영향 없고 계좌별 잔액에만 반영돼요.
                </p>
              )}
            </form>
          </div>

          {/* 정렬/필터/검색 */}
          <div className="surface card-pad card-hover-border-only">
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="input w-auto"
                value={sortDir}
                onChange={(e) =>
                  setSortDir(e.target.value === 'asc' ? 'asc' : 'desc')
                }
                aria-label="정렬"
              >
                <option value="desc">최근순</option>
                <option value="asc">오래된순</option>
              </select>

              <button
                type="button"
                className={
                  'btn ' + (filterOpen ? 'btn-primary' : 'btn-outline')
                }
                onClick={() => setFilterOpen((v) => !v)}
                aria-expanded={filterOpen}
              >
                필터 {filterOpen ? '▲' : '▼'}
              </button>

              <input
                className="input min-w-0 flex-1"
                placeholder="🔎 설명 검색"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>

            {filterOpen ? (
              <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                <select
                  className="input"
                  value={filterType}
                  onChange={(e) =>
                    changeFilterType(
                      e.target.value === 'INCOME'
                        ? 'INCOME'
                        : e.target.value === 'EXPENSE'
                          ? 'EXPENSE'
                          : 'ALL'
                    )
                  }
                >
                  <option value="ALL">전체 유형</option>
                  <option value="INCOME">수입(+)</option>
                  <option value="EXPENSE">지출(-)</option>
                </select>

                <select
                  className="input"
                  value={filterCategory}
                  onChange={(e) => changeFilterCategory(e.target.value)}
                >
                  <option value="ALL">전체 대분류</option>
                  {filterCategoryList.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.key}
                    </option>
                  ))}
                </select>

                <select
                  className="input"
                  value={filterSubcategory}
                  onChange={(e) => setFilterSubcategory(e.target.value)}
                  disabled={
                    filterCategory === 'ALL' ||
                    filterSubcategoryList.length === 0
                  }
                >
                  <option value="ALL">전체 소분류</option>
                  {filterSubcategoryList.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>

                <select
                  className="input"
                  value={filterAccount}
                  onChange={(e) => setFilterAccount(e.target.value)}
                  aria-label="계좌 필터"
                >
                  <option value="ALL">전체 계좌</option>
                  <option value="NONE">(계좌 미연결)</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.bankName ? `${a.bankName} · ` : ''}
                      {a.name}
                    </option>
                  ))}
                </select>

                <div className="md:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-2">
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    날짜
                  </span>
                  <input
                    type="date"
                    className="input"
                    style={{ minWidth: 0, flex: '1 1 140px' }}
                    value={filterDateStart}
                    onChange={(e) => setFilterDateStart(e.target.value)}
                    aria-label="시작 날짜"
                  />
                  <span style={{ color: 'var(--muted)' }}>~</span>
                  <input
                    type="date"
                    className="input"
                    style={{ minWidth: 0, flex: '1 1 140px' }}
                    value={filterDateEnd}
                    onChange={(e) => setFilterDateEnd(e.target.value)}
                    aria-label="종료 날짜"
                  />
                  {(filterDateStart || filterDateEnd) && (
                    <button
                      type="button"
                      className="btn btn-outline text-xs"
                      onClick={() => {
                        setFilterDateStart('')
                        setFilterDateEnd('')
                      }}
                      title="날짜 전체로 초기화"
                    >
                      전체
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {/* 목록 */}
          <div
            id="ledger-entries-list"
            className="surface card-pad card-hover-border-only scroll-mt-20"
          >
            <div className="flex items-center justify-between">
              <div className="font-extrabold">내역</div>
              <span className="badge">{displayedItems.length}건</span>
            </div>

            {loading ? (
              <div className="mt-4 grid gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={`ledger-skel-${i}`}
                    className="h-16 rounded-lg skeleton"
                  />
                ))}
              </div>
            ) : displayedItems.length === 0 ? (
              <div className="mt-4 text-sm" style={{ color: 'var(--muted)' }}>
                표시할 내역이 없습니다.
              </div>
            ) : (
              <div className="mt-4 grid gap-2">
                {displayedItems.map((it) => {
                  const ownerColor = it.shared
                    ? (ownerColorMap[it.ownerId] ?? getPastelColor(it.ownerId))
                    : null
                  const sign = it.type === 'INCOME' ? '+' : '-'
                  const amountColor =
                    it.type === 'INCOME' ? 'text-emerald-500' : 'text-red-500'
                  return (
                    <div
                      key={it.id}
                      className="card p-3 card-hover-border-only"
                      style={
                        it.shared && ownerColor
                          ? {
                              background: `color-mix(in srgb, ${ownerColor} 38%, var(--card))`,
                              borderColor: `color-mix(in srgb, ${ownerColor} 55%, var(--border))`,
                            }
                          : undefined
                      }
                    >
                      <div className="flex items-start gap-3">
                        {/* 좌측: 카테고리/설명/메타 */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className="badge"
                              style={{
                                background:
                                  it.type === 'INCOME'
                                    ? 'color-mix(in srgb, #10b981 15%, var(--card))'
                                    : 'color-mix(in srgb, #ef4444 15%, var(--card))',
                                borderColor:
                                  it.type === 'INCOME'
                                    ? 'color-mix(in srgb, #10b981 45%, var(--border))'
                                    : 'color-mix(in srgb, #ef4444 45%, var(--border))',
                              }}
                            >
                              {it.category}
                              {it.subcategory ? ` · ${it.subcategory}` : ''}
                            </span>
                            {it.shared ? (
                              <span className="badge">
                                공유 · {it.ownerLabel}
                              </span>
                            ) : null}
                            {it.excludeFromTotals ? (
                              <span
                                className="badge"
                                title="합계에서 제외된 항목"
                                style={{ opacity: 0.7 }}
                              >
                                합계 제외
                              </span>
                            ) : null}
                            {it.linkedToHolding ? (
                              <span
                                className="badge"
                                title="주식/투자 거래에서 자동 생성된 항목 (여기서 직접 수정해도 원 거래에 반영되지 않습니다)"
                                style={{
                                  background:
                                    'color-mix(in srgb, #8b5cf6 18%, var(--card))',
                                  borderColor:
                                    'color-mix(in srgb, #8b5cf6 50%, var(--border))',
                                }}
                              >
                                주식/투자 연동
                              </span>
                            ) : null}
                            {it.accountName ? (
                              <span
                                className="badge"
                                title={
                                  it.accountBank
                                    ? `${it.accountBank} · ${it.accountName}`
                                    : it.accountName
                                }
                                style={{
                                  background:
                                    'color-mix(in srgb, #0ea5e9 12%, var(--card))',
                                  borderColor:
                                    'color-mix(in srgb, #0ea5e9 45%, var(--border))',
                                }}
                              >
                                {it.accountName}
                              </span>
                            ) : null}
                          </div>
                          <div
                            className={
                              'mt-1.5 truncate text-base font-semibold ' +
                              (it.excludeFromTotals ? 'opacity-60' : '')
                            }
                          >
                            {it.description}
                          </div>
                          <div
                            className="mt-0.5 text-xs"
                            style={{ color: 'var(--muted)' }}
                          >
                            {new Date(it.occurredAt).toLocaleString('ko-KR', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>

                        {/* 우측: 금액 + 액션 */}
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <div
                            className={
                              'whitespace-nowrap text-lg font-extrabold sm:text-xl ' +
                              amountColor +
                              (it.excludeFromTotals
                                ? ' line-through opacity-60'
                                : '')
                            }
                          >
                            {sign}
                            {formatKRW(it.amount).replace('-', '')}
                          </div>
                          {it.runningBalance !== null && (
                            <div
                              className="text-[10px] whitespace-nowrap font-mono"
                              style={{ color: 'var(--muted)' }}
                              title={`${it.accountName ?? '계좌'} 잔액 (이 거래 적용 후)`}
                            >
                              잔액 {formatKRW(it.runningBalance)}
                            </div>
                          )}
                          {it.canEdit ? (
                            <div className="flex flex-wrap items-center justify-end gap-1">
                              <button
                                type="button"
                                className={
                                  'btn text-xs ' +
                                  (editingId === it.id
                                    ? 'btn-primary'
                                    : 'btn-outline')
                                }
                                onClick={() => {
                                  if (editingId === it.id) {
                                    cancelEdit()
                                    return
                                  }
                                  if (it.linkedToHolding) {
                                    const ok = window.confirm(
                                      '이 항목은 주식/투자 거래에서 자동 생성된 항목입니다.\n여기서 수정해도 원 거래 기록에 반영되지 않으며, 거래를 수정하면 다시 덮어쓰여 집니다.\n그래도 수정할까요?'
                                    )
                                    if (!ok) return
                                  }
                                  startEdit(it)
                                }}
                                title={
                                  editingId === it.id ? '수정 취소' : '수정'
                                }
                              >
                                {editingId === it.id ? '닫기' : '수정'}
                              </button>
                              <button
                                type="button"
                                className={
                                  'btn text-xs ' +
                                  (it.excludeFromTotals
                                    ? 'btn-primary'
                                    : 'btn-outline')
                                }
                                onClick={() =>
                                  toggleExclude(it.id, !it.excludeFromTotals)
                                }
                                title={
                                  it.excludeFromTotals
                                    ? '합계에 다시 포함시키기'
                                    : '합계에서 제외하기'
                                }
                              >
                                {it.excludeFromTotals ? '포함' : '제외'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline text-xs"
                                onClick={() => remove(it.id)}
                                title="삭제"
                              >
                                삭제
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {it.canEdit && editingId === it.id ? (
                        <div
                          className="mt-3 grid gap-3 rounded-md border-t p-3"
                          style={{
                            background:
                              'color-mix(in srgb, var(--foreground) 4%, transparent)',
                          }}
                        >
                          <div className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)]">
                            <button
                              type="button"
                              className={
                                'btn ' +
                                (editType === 'INCOME'
                                  ? 'btn-primary'
                                  : 'btn-outline')
                              }
                              onClick={toggleEditType}
                              aria-label="수입/지출 전환"
                            >
                              {editType === 'INCOME' ? '+ 수입' : '− 지출'}
                            </button>

                            <input
                              className="input"
                              inputMode="numeric"
                              placeholder="금액 (원)"
                              value={editAmount}
                              onChange={(e) => {
                                const raw = e.target.value.replace(
                                  /[^0-9]/g,
                                  ''
                                )
                                if (!raw) {
                                  setEditAmount('')
                                  return
                                }
                                setEditAmount(
                                  Number(raw).toLocaleString('ko-KR')
                                )
                              }}
                              disabled={editSaving}
                            />
                          </div>

                          <input
                            className="input"
                            placeholder="항목 설명"
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            disabled={editSaving}
                          />

                          <div className="grid gap-3 md:grid-cols-2">
                            <select
                              className="input"
                              value={editCategory}
                              onChange={(e) =>
                                changeEditCategory(e.target.value)
                              }
                              disabled={editSaving}
                            >
                              {getCategoriesByType(editType).map((c) => (
                                <option key={c.key} value={c.key}>
                                  {c.label}
                                </option>
                              ))}
                            </select>

                            {(() => {
                              const spec = getCategoriesByType(editType).find(
                                (c) => c.key === editCategory
                              )
                              const hasSub =
                                !!spec && spec.subcategories.length > 0
                              return (
                                <select
                                  className="input"
                                  value={editSubcategory}
                                  onChange={(e) =>
                                    setEditSubcategory(e.target.value)
                                  }
                                  disabled={editSaving || !hasSub}
                                >
                                  <option value="">
                                    {hasSub ? '소분류 선택' : '(소분류 없음)'}
                                  </option>
                                  {spec?.subcategories.map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>
                              )
                            })()}
                          </div>

                          <select
                            className="input"
                            value={editAccountId}
                            onChange={(e) => setEditAccountId(e.target.value)}
                            disabled={editSaving}
                            aria-label="계좌"
                          >
                            <option value="">계좌 선택 (선택사항)</option>
                            {accounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                                {a.bankName ? ` · ${a.bankName}` : ''}
                                
                              </option>
                            ))}
                          </select>

                          <input
                            className="input"
                            type="datetime-local"
                            value={editOccurredAt}
                            onChange={(e) => setEditOccurredAt(e.target.value)}
                            disabled={editSaving}
                          />

                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={editExcludeFromTotals}
                              onChange={(e) =>
                                setEditExcludeFromTotals(e.target.checked)
                              }
                              disabled={editSaving}
                            />
                            <span>합계 제외</span>
                          </label>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={saveEdit}
                              disabled={editSaving}
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

        {/* 공유 패널 */}
        <aside className="surface card-pad card-hover-border-only xl:sticky xl:top-6">
          <div className="text-base font-extrabold">가계부 공유 계정 관리</div>
          <p className="mt-2 text-xs opacity-70 leading-5">
            공유 요청을 보낸 계정은, 상대가 승인하면 상대의 가계부 항목을 함께
            볼 수 있습니다.
          </p>

          <div className="mt-4 grid gap-2">
            <input
              className="input"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              placeholder="상대 계정 이메일 또는 ID"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={sendShareRequest}
                disabled={shareBusyId === 'new' || shareLoading}
              >
                {shareBusyId === 'new' ? '요청중...' : '가계부 공유 요청'}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={loadShares}
                disabled={shareLoading}
              >
                목록 새로고침
              </button>
            </div>
          </div>

          <section className="mt-5 grid gap-2">
            <div className="text-sm font-semibold">계정 리스트</div>
            {shareAccounts.map((account) => (
              <label
                key={account.id}
                className="card card-hover-border-only flex min-w-0 items-center gap-2 px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={visibleOwners[account.id] !== false}
                  onChange={(e) =>
                    setVisibleOwners((prev) => ({
                      ...prev,
                      [account.id]: e.target.checked,
                    }))
                  }
                  style={{
                    accentColor: account.isSelf ? '#ffffff' : account.color,
                  }}
                />
                <span
                  className="h-3 w-3 rounded-sm border"
                  style={{
                    background: account.isSelf ? '#ffffff' : account.color,
                    borderColor: 'color-mix(in srgb, var(--border) 70%, white)',
                  }}
                />
                <span className="min-w-0 flex-1 truncate">{account.label}</span>
                {account.isSelf ? (
                  <span className="badge ml-auto">나</span>
                ) : null}
              </label>
            ))}
          </section>

          <section className="mt-5 grid gap-2">
            <div className="text-sm font-semibold">요청한 계정</div>
            <p className="mt-2 text-xs opacity-70 leading-5">
              당신이 공유를 요청한 계정입니다. 상대가 승인 시, 상대의 가계부를
              확인할 수 있습니다.
            </p>
            {outgoingShares.length === 0 ? (
              <div className="text-sm opacity-70">
                보낸 가계부 공유 요청이 없습니다.
              </div>
            ) : (
              outgoingShares.map((row) => (
                <div key={row.id} className="card card-hover-border-only p-3">
                  <div className="font-semibold">{row.owner.label}</div>
                  <div className="mt-1 text-xs opacity-70">
                    상태: {row.status}
                    {row.respondedAt
                      ? ` · 처리일: ${new Date(row.respondedAt).toLocaleString()}`
                      : ''}
                  </div>
                  <div className="mt-2">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => removeShare(row.id)}
                      disabled={shareBusyId === row.id}
                    >
                      {row.status === 'ACCEPTED' ? '공유 해제' : '요청 취소'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>

          <section className="mt-5 grid gap-2">
            <div className="text-sm font-semibold">요청 받은 계정</div>
            <p className="mt-2 text-xs opacity-70 leading-5">
              공유 요청을 받은 계정입니다. 승인 시, 상대가 당신의 가계부를
              확인할 수 있습니다.
            </p>
            {incomingShares.length === 0 ? (
              <div className="text-sm opacity-70">
                받은 가계부 공유 요청이 없습니다.
              </div>
            ) : (
              incomingShares.map((row) => (
                <div key={row.id} className="card card-hover-border-only p-3">
                  <div className="font-semibold">{row.requester.label}</div>
                  <div className="mt-1 text-xs opacity-70">
                    상태: {row.status} · 요청일:{' '}
                    {new Date(row.createdAt).toLocaleString()}
                    {row.respondedAt
                      ? ` · 처리일: ${new Date(row.respondedAt).toLocaleString()}`
                      : ''}
                  </div>
                  {row.status === 'PENDING' ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => respondShareRequest(row.id, 'ACCEPT')}
                        disabled={shareBusyId === row.id}
                      >
                        승인
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => respondShareRequest(row.id, 'REJECT')}
                        disabled={shareBusyId === row.id}
                      >
                        거절
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => removeShare(row.id)}
                        disabled={shareBusyId === row.id}
                      >
                        공유 해제
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </section>
        </aside>
      </div>
    </main>
  )
}
