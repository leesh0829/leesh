'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LedgerNavBack,
  LedgerNavKisSettings,
  LedgerNavMarket,
  LedgerNavPortfolio,
} from '../LedgerNavIcons'
import {
  OwnerStackBar,
  ViewModeToggle,
  type OwnerSegment,
} from '../OwnerBreakdown'
import { useToast } from '@/app/components/ToastProvider'
import { useAsyncLock } from '@/app/lib/useAsyncLock'
import { toHumanHttpError } from '@/app/lib/httpErrorText'
import type { HoldingAggregate } from '@/app/lib/holdingAggregate'
import MarketStatus from './MarketStatus'
import StockDetailModal, {
  type StockDetailTarget,
} from '../market/StockDetailModal'
import OverseasDetailModal, {
  type OverseasDetailTarget,
} from '../market/OverseasDetailModal'

function toKrCode(symbol: string | null | undefined): string | null {
  if (!symbol) return null
  const cleaned = symbol.trim().replace(/\.KS$/i, '').replace(/\.KQ$/i, '')
  return /^\d{6}$/.test(cleaned) ? cleaned : null
}

function toOverseasTarget(
  symbol: string | null | undefined,
  name: string
): OverseasDetailTarget | null {
  if (!symbol) return null
  const trimmed = symbol.trim()
  const m = trimmed.match(/^(.+)\.([A-Z]+)$/i)
  if (!m) return null
  const sym = m[1].toUpperCase()
  const suffix = m[2].toUpperCase()
  const map: Record<string, string> = {
    O: 'NAS',
    N: 'NYS',
    A: 'AMS',
    T: 'TYO',
    HK: 'HKS',
    HKS: 'HKS',
    L: 'LON',
    SS: 'SHS',
    SZ: 'SZS',
  }
  const exchange = map[suffix]
  if (!exchange) return null
  return { exchange, symbol: sym, name }
}

type HoldingListItem = {
  id: string
  ownerId: string
  ownerLabel: string
  shared: boolean
  canEdit: boolean
  accountId: string | null
  accountName: string | null
  accountBank: string | null
  accountTypes: string[]
  name: string
  symbol: string | null
  exchange: string | null
  currency: string
  memo: string | null
  currentPrice: number | null
  priceUpdatedAt: string | null
  createdAt: string
  updatedAt: string
  aggregate: HoldingAggregate
  txCount: number
}

type AccountOption = {
  id: string
  name: string
  bankName: string | null
  types: string[]
}

type SymbolSearchItem = {
  symbol: string
  name: string
  exchange: string | null
  type: string | null
  currency: string
}

type SharePeer = {
  id: string
  name: string | null
  email: string | null
  label: string
}

type OutgoingShare = {
  id: string
  scope: 'CALENDAR' | 'TODO' | 'LEDGER' | 'STOCK'
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED'
  owner: SharePeer
  createdAt: string
  updatedAt: string
  respondedAt: string | null
}

type IncomingShare = {
  id: string
  scope: 'CALENDAR' | 'TODO' | 'LEDGER' | 'STOCK'
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

type HoldingTxItem = {
  id: string
  type: 'BUY' | 'SELL' | 'DIVIDEND' | 'FEE' | 'TAX'
  quantity: number | null
  pricePerUnit: number | null
  amount: number
  occurredAt: string
  memo: string | null
  linked: boolean
  createdAt: string
  updatedAt: string
}

type HoldingDetail = {
  id: string
  ownerId: string
  ownerLabel: string
  shared: boolean
  canEdit: boolean
  accountId: string | null
  accountName: string | null
  accountBank: string | null
  accountTypes: string[]
  name: string
  symbol: string | null
  exchange: string | null
  currency: string
  memo: string | null
  currentPrice: number | null
  priceUpdatedAt: string | null
  createdAt: string
  updatedAt: string
  aggregate: HoldingAggregate
  transactions: HoldingTxItem[]
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

function datetimeLocalNow() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function isoFromDatetimeLocal(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function formatKRW(n: number) {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  return `${sign}₩${Math.round(abs).toLocaleString('ko-KR')}`
}

const CURRENCY_SYMBOL: Record<string, string> = {
  KRW: '₩',
  USD: '$',
  JPY: '¥',
  EUR: '€',
  GBP: '£',
  HKD: 'HK$',
  CNY: '¥',
}

function fractionDigits(currency: string): number {
  const c = currency.toUpperCase()
  if (c === 'KRW' || c === 'JPY') return 0
  return 2
}

function formatMoney(n: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency.toUpperCase()] ?? `${currency} `
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  const digits = fractionDigits(currency)
  return `${sign}${sym}${abs.toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

function relativeTimeFromIso(iso: string | null): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const diffSec = Math.round((Date.now() - t) / 1000)
  if (diffSec < 60) return '방금 전'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`
  return `${Math.floor(diffSec / 86400)}일 전`
}

function formatQty(q: number) {
  if (Number.isInteger(q)) return q.toLocaleString('ko-KR')
  return q.toLocaleString('ko-KR', { maximumFractionDigits: 4 })
}

function parseFloatInput(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, '')
  if (!cleaned) return null
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

const TX_TYPE_LABEL: Record<HoldingTxItem['type'], string> = {
  BUY: '매수',
  SELL: '매도',
  DIVIDEND: '배당',
  FEE: '수수료',
  TAX: '세금',
}

const TX_TYPE_COLOR: Record<HoldingTxItem['type'], string> = {
  BUY: '#10b981',
  SELL: '#ef4444',
  DIVIDEND: '#8b5cf6',
  FEE: '#f59e0b',
  TAX: '#f59e0b',
}

export default function StocksClient() {
  const toast = useToast()

  // 종목 목록
  const [holdings, setHoldings] = useState<HoldingListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [activeStock, setActiveStock] = useState<StockDetailTarget | null>(null)
  const [activeOverseas, setActiveOverseas] =
    useState<OverseasDetailTarget | null>(null)

  // 종목 생성 폼
  const [newName, setNewName] = useState('')
  const [newSymbol, setNewSymbol] = useState('')
  const [newExchange, setNewExchange] = useState<string | null>(null)
  const [newCurrency, setNewCurrency] = useState('KRW')
  const [newMemo, setNewMemo] = useState('')
  const [newAccountId, setNewAccountId] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SymbolSearchItem[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const { pending: creatingHolding, run: runCreateHolding } = useAsyncLock()

  // 계좌 목록 (STOCK/ISA/PENSION 타입만 dropdown에 노출)
  const [accounts, setAccounts] = useState<AccountOption[]>([])

  // 현재가 일괄 새로고침
  const [bulkRefreshing, setBulkRefreshing] = useState(false)
  // 자동 새로고침 (60초 간격, 페이지 visible일 때만)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [autoTick, setAutoTick] = useState<string | null>(null)

  // 합산/분리 표시 모드
  const [viewMode, setViewMode] = useState<'combined' | 'split'>('combined')

  // 펼친 종목 + 상세
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<HoldingDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // 현재가 인라인 편집 상태
  const [priceDraft, setPriceDraft] = useState<string>('')
  const [priceSaving, setPriceSaving] = useState(false)

  // 환율 (USD/KRW, JPY/KRW) — 표시용
  const [fx, setFx] = useState<{
    usdKrw: number | null
    jpyKrw: number | null
    updatedAt: string | null
  }>({ usdKrw: null, jpyKrw: null, updatedAt: null })
  const [fxLoading, setFxLoading] = useState(false)

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

  // 트랜잭션 추가 폼
  const [txType, setTxType] = useState<HoldingTxItem['type']>('BUY')
  const [txQty, setTxQty] = useState('')
  const [txPrice, setTxPrice] = useState('')
  const [txAmount, setTxAmount] = useState('')
  const [txOccurredAt, setTxOccurredAt] = useState(datetimeLocalNow())
  const [txMemo, setTxMemo] = useState('')
  const [txLink, setTxLink] = useState(true)
  const { pending: creatingTx, run: runCreateTx } = useAsyncLock()

  const loadHoldings = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    const excluded = Object.entries(visibleOwners)
      .filter(([, on]) => on === false)
      .map(([id]) => id)
    if (excluded.length > 0)
      params.set('excludeOwners', excluded.join(','))
    const url = params.toString()
      ? `/api/holdings?${params.toString()}`
      : '/api/holdings'
    const r = await fetch(url, { cache: 'no-store' })
    if (!r.ok) {
      const msg = await readApiErrorMessage(r)
      const message = `${r.status} ${r.statusText} · ${msg ?? '불러오기 실패'}`
      setErr(message)
      toast.error(message)
      setLoading(false)
      return
    }
    const data = (await r.json()) as { items: HoldingListItem[] }
    setHoldings(data.items)
    setErr(null)
    setLoading(false)
  }, [visibleOwners, toast])

  const loadDetail = useCallback(
    async (holdingId: string) => {
      setDetailLoading(true)
      const r = await fetch(`/api/holdings/${holdingId}`, {
        cache: 'no-store',
      })
      if (!r.ok) {
        const msg = await readApiErrorMessage(r)
        const message = `${r.status} ${r.statusText} · ${msg ?? '불러오기 실패'}`
        setErr(message)
        toast.error(message)
        setDetailLoading(false)
        return
      }
      const data = (await r.json()) as HoldingDetail
      setDetail(data)
      setPriceDraft(data.currentPrice?.toString() ?? '')
      setDetailLoading(false)
    },
    [toast]
  )

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadHoldings()
    }, 0)
    return () => window.clearTimeout(t)
  }, [loadHoldings])

  // 심볼 검색 (debounced)
  useEffect(() => {
    const q = searchQuery.trim()
    const handle = window.setTimeout(async () => {
      if (!q) {
        setSearchResults([])
        return
      }
      setSearchLoading(true)
      try {
        const r = await fetch(
          `/api/holdings/search?q=${encodeURIComponent(q)}`,
          { cache: 'no-store' }
        )
        if (r.ok) {
          const data = (await r.json()) as { items: SymbolSearchItem[] }
          setSearchResults(data.items)
        }
      } catch {
        // ignore
      }
      setSearchLoading(false)
    }, 300)
    return () => window.clearTimeout(handle)
  }, [searchQuery])

  const pickSymbol = (item: SymbolSearchItem) => {
    setNewName(item.name)
    setNewSymbol(item.symbol)
    setNewExchange(item.exchange)
    setNewCurrency(item.currency)
    setSearchQuery(item.name)
    setSearchOpen(false)
  }

  const loadAccounts = useCallback(async () => {
    const r = await fetch('/api/accounts', { cache: 'no-store' })
    if (!r.ok) return
    const data = (await r.json()) as {
      items: {
        id: string
        name: string
        bankName: string | null
        types: string[]
      }[]
    }
    // types에 STOCK/ISA/PENSION 중 하나라도 있는 계좌만 노출
    const STOCK_TYPES = ['STOCK', 'ISA', 'PENSION']
    setAccounts(
      data.items
        .filter((a) => a.types.some((t) => STOCK_TYPES.includes(t)))
        .map((a) => ({
          id: a.id,
          name: a.name,
          bankName: a.bankName,
          types: a.types,
        }))
    )
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadAccounts()
    }, 0)
    return () => window.clearTimeout(t)
  }, [loadAccounts])

  const loadFx = useCallback(async () => {
    setFxLoading(true)
    try {
      const r = await fetch('/api/exchange-rates', { cache: 'no-store' })
      if (!r.ok) {
        setFxLoading(false)
        return
      }
      const data = (await r.json()) as {
        usdKrw: number | null
        jpyKrw: number | null
        updatedAt: string
      }
      setFx({
        usdKrw: data.usdKrw,
        jpyKrw: data.jpyKrw,
        updatedAt: data.updatedAt,
      })
    } catch {
      // ignore
    }
    setFxLoading(false)
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadFx()
    }, 0)
    return () => window.clearTimeout(t)
  }, [loadFx])

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
      (payload.outgoing ?? []).filter((row) => row.scope === 'STOCK')
    )
    setIncomingShares(
      (payload.incoming ?? []).filter((row) => row.scope === 'STOCK')
    )
    setShareLoading(false)
  }, [toast])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadShares()
    }, 0)
    return () => window.clearTimeout(t)
  }, [loadShares])

  const sendShareRequest = async () => {
    const targetEmail = shareEmail.trim()
    if (!targetEmail) {
      toast.error('공유 요청 이메일을 입력해 주세요.')
      return
    }
    setShareBusyId('new')
    const res = await fetch('/api/schedule-shares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetEmail, scope: 'STOCK' }),
    })
    if (!res.ok) {
      const payload = await readJsonSafely(res)
      const msg = extractApiMessage(payload) ?? '공유 요청 실패'
      const human = toHumanHttpError(res.status, msg)
      toast.error(human ?? `${res.status} · ${msg}`)
      setShareBusyId(null)
      return
    }
    setShareEmail('')
    setShareBusyId(null)
    toast.success('주식/투자 공유 요청을 보냈습니다.')
    await Promise.all([loadShares(), loadHoldings()])
  }

  const respondShareRequest = async (
    shareId: string,
    action: 'ACCEPT' | 'REJECT'
  ) => {
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
      toast.error(msg)
      setShareBusyId(null)
      return
    }
    setShareBusyId(null)
    toast.success(
      action === 'ACCEPT'
        ? '공유 요청을 승인했습니다.'
        : '공유 요청을 거절했습니다.'
    )
    await Promise.all([loadShares(), loadHoldings()])
  }

  const removeShare = async (shareId: string) => {
    setShareBusyId(shareId)
    const res = await fetch(`/api/schedule-shares/${shareId}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const payload = await readJsonSafely(res)
      toast.error(extractApiMessage(payload) ?? '공유 해제 실패')
      setShareBusyId(null)
      return
    }
    setShareBusyId(null)
    toast.success('공유 연결을 해제했습니다.')
    await Promise.all([loadShares(), loadHoldings()])
  }

  const openHolding = async (id: string) => {
    if (openId === id) {
      setOpenId(null)
      setDetail(null)
      return
    }
    setOpenId(id)
    setDetail(null)
    await loadDetail(id)
  }

  const createHolding = async () => {
    await runCreateHolding(async () => {
      const name = newName.trim()
      if (!name) {
        toast.error('종목 이름을 입력해 주세요.')
        return
      }
      const symbol = newSymbol.trim() || null
      const r = await fetch('/api/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          symbol,
          exchange: newExchange,
          currency: newCurrency || 'KRW',
          memo: newMemo.trim() || null,
          accountId: newAccountId || null,
        }),
      })
      if (!r.ok) {
        const msg = await readApiErrorMessage(r)
        const message = `${r.status} ${r.statusText} · ${msg ?? '생성 실패'}`
        setErr(message)
        toast.error(message)
        return
      }
      const created = (await r.json()) as { id: string }

      // 심볼 있으면 즉시 시세 한 번 가져와 currentPrice 채움
      if (symbol) {
        try {
          const qr = await fetch(
            `/api/holdings/quote?symbol=${encodeURIComponent(symbol)}`,
            { cache: 'no-store' }
          )
          if (qr.ok) {
            const qd = (await qr.json()) as { price: number | null }
            if (typeof qd.price === 'number' && qd.price > 0) {
              await fetch(`/api/holdings/${created.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPrice: qd.price }),
              })
            }
          }
        } catch {
          // ignore
        }
      }

      setNewName('')
      setNewSymbol('')
      setNewExchange(null)
      setNewCurrency('KRW')
      setNewMemo('')
      setNewAccountId('')
      setSearchQuery('')
      setSearchResults([])
      await loadHoldings()
      toast.success('종목을 추가했습니다.')
    })
  }

  const deleteHolding = async (id: string) => {
    const ok = window.confirm(
      '이 종목과 모든 거래 기록을 삭제할까요? 연동된 가계부 항목도 함께 삭제됩니다.'
    )
    if (!ok) return
    const r = await fetch(`/api/holdings/${id}`, { method: 'DELETE' })
    if (!r.ok) {
      const msg = await readApiErrorMessage(r)
      const message = `${r.status} ${r.statusText} · ${msg ?? '삭제 실패'}`
      setErr(message)
      toast.error(message)
      return
    }
    if (openId === id) {
      setOpenId(null)
      setDetail(null)
    }
    await loadHoldings()
    toast.success('종목을 삭제했습니다.')
  }

  // 단일 종목 시세 새로고침 (네이버 금융 → DB 갱신)
  const refreshQuote = async (
    holdingId: string,
    symbol: string | null
  ): Promise<boolean> => {
    if (!symbol) {
      toast.error('이 종목은 심볼이 없어서 자동 조회할 수 없습니다.')
      return false
    }
    try {
      const r = await fetch(
        `/api/holdings/quote?symbol=${encodeURIComponent(symbol)}`,
        { cache: 'no-store' }
      )
      if (!r.ok) {
        toast.error(`시세 조회 실패 (${symbol})`)
        return false
      }
      const data = (await r.json()) as {
        price: number | null
        currency: string | null
      }
      if (typeof data.price !== 'number' || data.price <= 0) {
        toast.error(`시세 데이터 없음 (${symbol})`)
        return false
      }
      const pr = await fetch(`/api/holdings/${holdingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPrice: data.price }),
      })
      return pr.ok
    } catch {
      return false
    }
  }

  const refreshSingle = async (h: HoldingListItem) => {
    if (!h.canEdit) return
    const ok = await refreshQuote(h.id, h.symbol)
    if (ok) {
      await loadHoldings()
      if (detail?.id === h.id) await loadDetail(h.id)
      toast.success(`${h.name} 시세를 갱신했습니다.`)
    }
  }

  const refreshAll = async () => {
    setBulkRefreshing(true)
    const targets = holdings.filter((h) => h.canEdit && !!h.symbol)
    let okCount = 0
    for (const h of targets) {
      const ok = await refreshQuote(h.id, h.symbol)
      if (ok) okCount++
    }
    setBulkRefreshing(false)
    await loadHoldings()
    if (detail) await loadDetail(detail.id)
    if (okCount > 0)
      toast.success(`${okCount}/${targets.length}개 시세를 갱신했습니다.`)
    else if (targets.length === 0)
      toast.error('심볼이 등록된 본인 소유 종목이 없습니다.')
    else toast.error('시세 갱신에 실패했습니다.')
  }

  // 자동 새로고침용 — toast 없이 조용히
  const refreshAllSilent = async () => {
    const targets = holdings.filter((h) => h.canEdit && !!h.symbol)
    if (targets.length === 0) return
    let okCount = 0
    for (const h of targets) {
      const ok = await refreshQuote(h.id, h.symbol)
      if (ok) okCount++
    }
    if (okCount > 0) {
      await loadHoldings()
      if (detail) await loadDetail(detail.id)
      setAutoTick(new Date().toISOString())
    }
  }

  // ref로 최신 함수 캡쳐 — 인터벌이 stale closure에 묶이지 않게
  const refreshAllSilentRef = useRef(refreshAllSilent)
  useEffect(() => {
    refreshAllSilentRef.current = refreshAllSilent
  })

  useEffect(() => {
    if (!autoRefresh) return
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshAllSilentRef.current()
      }
    }, 15_000)
    return () => window.clearInterval(interval)
  }, [autoRefresh])

  // 종목 계좌 변경
  const changeHoldingAccount = async (
    holdingId: string,
    nextAccountId: string
  ) => {
    const r = await fetch(`/api/holdings/${holdingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: nextAccountId || null }),
    })
    if (!r.ok) {
      const msg = await readApiErrorMessage(r)
      toast.error(`${r.status} · ${msg ?? '계좌 변경 실패'}`)
      return
    }
    await loadHoldings()
    if (detail?.id === holdingId) await loadDetail(holdingId)
    toast.success('계좌를 변경했습니다.')
  }

  const saveCurrentPrice = async () => {
    if (!detail) return
    setPriceSaving(true)
    const value = priceDraft.trim()
    const nextPrice = value === '' ? null : parseFloatInput(value)
    const r = await fetch(`/api/holdings/${detail.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPrice: nextPrice }),
    })
    setPriceSaving(false)
    if (!r.ok) {
      const msg = await readApiErrorMessage(r)
      const message = `${r.status} ${r.statusText} · ${msg ?? '저장 실패'}`
      setErr(message)
      toast.error(message)
      return
    }
    await Promise.all([loadHoldings(), loadDetail(detail.id)])
    toast.success('현재가를 갱신했습니다.')
  }

  const createTx = async () => {
    if (!detail) return
    await runCreateTx(async () => {
      const payload: Record<string, unknown> = {
        type: txType,
        memo: txMemo.trim() || null,
        occurredAt: isoFromDatetimeLocal(txOccurredAt) ?? null,
        linkToLedger: txLink,
      }

      if (txType === 'BUY' || txType === 'SELL') {
        const qty = parseFloatInput(txQty)
        const price = parseFloatInput(txPrice)
        if (!qty || qty <= 0) {
          toast.error('수량을 입력해 주세요.')
          return
        }
        if (price === null || price < 0) {
          toast.error('단가를 입력해 주세요.')
          return
        }
        payload.quantity = qty
        payload.pricePerUnit = price
      } else {
        const amount = parseFloatInput(txAmount)
        if (amount === null || amount <= 0) {
          toast.error('금액을 입력해 주세요.')
          return
        }
        payload.amount = amount
      }

      const r = await fetch(`/api/holdings/${detail.id}/transactions`, {
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

      setTxQty('')
      setTxPrice('')
      setTxAmount('')
      setTxMemo('')
      setTxOccurredAt(datetimeLocalNow())
      await Promise.all([loadHoldings(), loadDetail(detail.id)])
      toast.success('거래를 기록했습니다.')
    })
  }

  const deleteTx = async (txId: string) => {
    if (!detail) return
    const ok = window.confirm('이 거래를 삭제할까요?')
    if (!ok) return
    const r = await fetch(
      `/api/holdings/${detail.id}/transactions/${txId}`,
      { method: 'DELETE' }
    )
    if (!r.ok) {
      const msg = await readApiErrorMessage(r)
      const message = `${r.status} ${r.statusText} · ${msg ?? '삭제 실패'}`
      setErr(message)
      toast.error(message)
      return
    }
    await Promise.all([loadHoldings(), loadDetail(detail.id)])
    toast.success('거래를 삭제했습니다.')
  }

  // 공유 계정 정보
  const selfOwnerIdFromHoldings =
    holdings.find((h) => !h.shared)?.ownerId ?? null
  const selfLabelFromHoldings =
    holdings.find((h) => !h.shared)?.ownerLabel ?? '내 계정'
  const selfAccountId = meShare?.id ?? selfOwnerIdFromHoldings ?? 'self'
  const selfAccountLabel = meShare?.label ?? selfLabelFromHoldings

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

  const portfolioTotals = useMemo(() => {
    const usdKrw = fx.usdKrw ?? 1
    const jpyKrw = fx.jpyKrw ?? 1
    let costBasis = 0 // 현재 보유분 원가
    let totalBought = 0 // 누적 매수금액 (모든 BUY 합)
    let realized = 0
    let marketValue = 0
    let unrealized = 0
    let hasMarket = false
    let nonStandardCurrency = false
    for (const h of holdings) {
      const c = h.currency.toUpperCase()
      const rate =
        c === 'KRW' ? 1 : c === 'USD' ? usdKrw : c === 'JPY' ? jpyKrw : 1
      if (c !== 'KRW' && c !== 'USD' && c !== 'JPY') {
        nonStandardCurrency = true
      }
      const a = h.aggregate
      costBasis += a.costBasis * rate
      totalBought += a.totalInvested * rate
      realized += a.realizedPnL * rate
      if (a.marketValue !== null) {
        marketValue += a.marketValue * rate
        hasMarket = true
      }
      if (a.unrealizedPnL !== null) {
        unrealized += a.unrealizedPnL * rate
      }
    }
    // 총 수익률 = (실현손익 + 평가손익) / 총매수금액 * 100
    const totalPnl = realized + (hasMarket ? unrealized : 0)
    const returnRate =
      totalBought > 0 ? (totalPnl / totalBought) * 100 : null
    return {
      costBasis: Math.round(costBasis),
      totalBought: Math.round(totalBought),
      realized: Math.round(realized),
      marketValue: hasMarket ? Math.round(marketValue) : null,
      unrealized: hasMarket ? Math.round(unrealized) : null,
      totalPnl: hasMarket ? Math.round(totalPnl) : Math.round(realized),
      returnRate,
      nonStandardCurrency,
    }
  }, [holdings, fx.usdKrw, fx.jpyKrw])

  // owner별 포트폴리오 (분리 모드 + stack bar용)
  const portfolioByOwner = useMemo(() => {
    const usdKrw = fx.usdKrw ?? 1
    const jpyKrw = fx.jpyKrw ?? 1
    const map = new Map<
      string,
      { invested: number; realized: number; unrealized: number; marketValue: number; totalPnl: number }
    >()
    for (const h of holdings) {
      const c = h.currency.toUpperCase()
      const rate =
        c === 'KRW' ? 1 : c === 'USD' ? usdKrw : c === 'JPY' ? jpyKrw : 1
      const a = h.aggregate
      const entry = map.get(h.ownerId) ?? {
        invested: 0,
        realized: 0,
        unrealized: 0,
        marketValue: 0,
        totalPnl: 0,
      }
      entry.invested += a.totalInvested * rate
      entry.realized += a.realizedPnL * rate
      if (a.unrealizedPnL !== null) entry.unrealized += a.unrealizedPnL * rate
      if (a.marketValue !== null) entry.marketValue += a.marketValue * rate
      entry.totalPnl = entry.realized + entry.unrealized
      map.set(h.ownerId, entry)
    }
    return map
  }, [holdings, fx.usdKrw, fx.jpyKrw])

  // owner segment 빌더
  const buildOwnerSegments = (
    fn: (ownerId: string) => { value: number; displayValue: string }
  ): OwnerSegment[] => {
    const visibleSet = new Set(
      shareAccounts
        .filter((a) => visibleOwners[a.id] !== false)
        .map((a) => a.id)
    )
    return shareAccounts
      .filter((a) => visibleSet.has(a.id))
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
  }

  return (
    <main className="w-full px-3 py-6 sm:px-4 lg:px-6">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-6">
        {/* 헤더 */}
        <div className="surface card-pad card-hover-border-only">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">주식 & 투자</h1>
              <p
                className="mt-1 text-sm"
                style={{ color: 'var(--muted)' }}
              >
                보유 종목과 거래를 기록하고 평단·실현 손익을 확인하세요.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LedgerNavPortfolio />
              <LedgerNavMarket />
              <LedgerNavKisSettings />
              <LedgerNavBack />
            </div>
          </div>

          {/* 시장 운영 상태 (국장 / 미장) */}
          <MarketStatus />

          {/* 환율 표시 (참고용, 거래/가계부 연동과는 무관) */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span style={{ color: 'var(--muted)' }}>환율 (참고용):</span>
            <span>
              <span style={{ color: 'var(--muted)' }}>USD/KRW</span>{' '}
              <span className="font-semibold">
                {fx.usdKrw !== null
                  ? `₩${fx.usdKrw.toLocaleString('ko-KR', {
                      maximumFractionDigits: 2,
                    })}`
                  : fxLoading
                    ? '로딩...'
                    : '—'}
              </span>
            </span>
            <span>
              <span style={{ color: 'var(--muted)' }}>JPY/KRW</span>{' '}
              <span className="font-semibold">
                {fx.jpyKrw !== null
                  ? `₩${fx.jpyKrw.toLocaleString('ko-KR', {
                      maximumFractionDigits: 4,
                    })}`
                  : fxLoading
                    ? '로딩...'
                    : '—'}
              </span>
            </span>
            {fx.updatedAt ? (
              <span style={{ color: 'var(--muted)' }}>
                · 조회 {new Date(fx.updatedAt).toLocaleString('ko-KR')}
              </span>
            ) : null}
            <button
              type="button"
              className="btn btn-outline text-xs"
              onClick={() => void loadFx()}
              disabled={fxLoading}
            >
              새로고침
            </button>
          </div>

          {err ? (
            <div className="mt-4 card p-3" style={{ color: 'crimson' }}>
              {err}
            </div>
          ) : null}
        </div>

        {/* 포트폴리오 합계 */}
        {holdings.length > 0 ? (
          <div className="surface card-pad card-hover-border-only">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-extrabold">포트폴리오 요약 (KRW 환산)</div>
              <div className="flex items-center gap-2">
                <span
                  className="text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  현재 환율 적용
                </span>
                {portfolioByOwner.size > 1 ? (
                  <ViewModeToggle
                    mode={viewMode}
                    onChange={setViewMode}
                  />
                ) : null}
              </div>
            </div>

            {viewMode === 'combined' ? (
            <>
            {/* Hero: 총 수익률 + 평가액 */}
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="card p-3 card-hover-border-only">
                <div
                  className="text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  총 수익률
                </div>
                <div
                  className={
                    'mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl ' +
                    (portfolioTotals.returnRate === null
                      ? ''
                      : portfolioTotals.returnRate >= 0
                        ? 'text-emerald-500'
                        : 'text-red-500')
                  }
                >
                  {portfolioTotals.returnRate === null
                    ? '—'
                    : `${portfolioTotals.returnRate >= 0 ? '+' : ''}${portfolioTotals.returnRate.toFixed(2)}%`}
                </div>
                <div
                  className="mt-1 text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  총 손익{' '}
                  <span
                    className={
                      portfolioTotals.totalPnl >= 0
                        ? 'text-emerald-500'
                        : 'text-red-500'
                    }
                  >
                    {(portfolioTotals.totalPnl >= 0 ? '+' : '') +
                      formatKRW(portfolioTotals.totalPnl)}
                  </span>
                </div>
              </div>

              <div className="card p-3 card-hover-border-only">
                <div
                  className="text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  추정 자산 (현재가 기준)
                </div>
                <div className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
                  {portfolioTotals.marketValue !== null
                    ? formatKRW(portfolioTotals.marketValue)
                    : '—'}
                </div>
                <div
                  className="mt-1 text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  평가 손익{' '}
                  {portfolioTotals.unrealized !== null ? (
                    <span
                      className={
                        portfolioTotals.unrealized >= 0
                          ? 'text-emerald-500'
                          : 'text-red-500'
                      }
                    >
                      {(portfolioTotals.unrealized >= 0 ? '+' : '') +
                        formatKRW(portfolioTotals.unrealized)}
                    </span>
                  ) : (
                    '—'
                  )}
                </div>
              </div>
            </div>

            {/* 보조 카드: 총매수, 현재 보유 원가, 실현 손익 */}
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <SummaryCard
                label="총매수금액"
                value={formatKRW(portfolioTotals.totalBought)}
              />
              <SummaryCard
                label="현재 보유 원가"
                value={formatKRW(portfolioTotals.costBasis)}
              />
              <SummaryCard
                label="실현 손익"
                value={
                  (portfolioTotals.realized >= 0 ? '+' : '') +
                  formatKRW(portfolioTotals.realized)
                }
                tone={portfolioTotals.realized >= 0 ? 'good' : 'bad'}
              />
            </div>

            {/* 추정 자산 owner별 stack bar */}
            {portfolioByOwner.size > 1 ? (
              <div className="mt-3">
                <div
                  className="text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  계정별 추정 자산 분포
                </div>
                <OwnerStackBar
                  segments={buildOwnerSegments((ownerId) => {
                    const p = portfolioByOwner.get(ownerId)
                    const mv = p?.marketValue ?? 0
                    return {
                      value: mv,
                      displayValue: formatKRW(mv),
                    }
                  })}
                />
              </div>
            ) : null}
            </>
            ) : (
              /* 분리 모드: owner별 breakdown */
              <div className="mt-3 grid gap-2">
                {Array.from(portfolioByOwner.entries())
                  .filter(([ownerId]) =>
                    shareAccounts.some(
                      (a) => a.id === ownerId && visibleOwners[a.id] !== false
                    )
                  )
                  .map(([ownerId, p]) => {
                    const account = shareAccounts.find((a) => a.id === ownerId)
                    if (!account) return null
                    const returnRate =
                      p.invested > 0 ? (p.totalPnl / p.invested) * 100 : null
                    return (
                      <div
                        key={ownerId}
                        className="card p-3 card-hover-border-only"
                        style={{
                          background: `color-mix(in srgb, ${account.color} 25%, var(--card))`,
                          borderColor: `color-mix(in srgb, ${account.color} 50%, var(--border))`,
                        }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-sm border"
                              style={{
                                background: account.color,
                                borderColor:
                                  'color-mix(in srgb, var(--border) 70%, white)',
                              }}
                            />
                            <span className="font-semibold">
                              {account.label}
                            </span>
                            {account.isSelf ? (
                              <span className="badge">나</span>
                            ) : null}
                          </div>
                          <div
                            className={
                              'font-extrabold ' +
                              (returnRate === null
                                ? ''
                                : returnRate >= 0
                                  ? 'text-emerald-500'
                                  : 'text-red-500')
                            }
                          >
                            {returnRate === null
                              ? '—'
                              : `${returnRate >= 0 ? '+' : ''}${returnRate.toFixed(2)}%`}
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
                          <SummaryCard
                            label="추정 자산"
                            value={formatKRW(Math.round(p.marketValue))}
                          />
                          <SummaryCard
                            label="총 손익"
                            value={
                              (p.totalPnl >= 0 ? '+' : '') +
                              formatKRW(Math.round(p.totalPnl))
                            }
                            tone={p.totalPnl >= 0 ? 'good' : 'bad'}
                          />
                          <SummaryCard
                            label="실현"
                            value={
                              (p.realized >= 0 ? '+' : '') +
                              formatKRW(Math.round(p.realized))
                            }
                            tone={p.realized >= 0 ? 'good' : 'bad'}
                          />
                          <SummaryCard
                            label="총매수"
                            value={formatKRW(Math.round(p.invested))}
                          />
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}

            <p
              className="mt-3 text-xs"
              style={{ color: 'var(--muted)' }}
            >
              총 수익률 = (실현 + 평가) ÷ 총매수금액. 추정 자산·평가 손익은
              종목별 현재가 입력/갱신 시에만 계산됩니다. USD/JPY 종목은 상단
              환율로 KRW 환산됩니다.
            </p>
            {portfolioTotals.nonStandardCurrency ? (
              <p className="mt-1 text-xs text-amber-500">
                ⚠ KRW/USD/JPY가 아닌 통화의 종목은 환율 환산이 적용되지 않아
                정확하지 않을 수 있습니다.
              </p>
            ) : null}
          </div>
        ) : null}

        {/* 종목 추가 */}
        <div className="surface card-pad card-hover-border-only">
          <div className="font-extrabold">종목 추가</div>
          <p
            className="mt-1 text-xs"
            style={{ color: 'var(--muted)' }}
          >
            종목명 또는 심볼로 검색하면 자동으로 채워집니다 (네이버 금융).
          </p>
          <form
            className="mt-3 grid gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              void createHolding()
            }}
          >
            {/* 검색 박스 */}
            <div className="relative">
              <input
                className="input w-full"
                placeholder="검색 (예: 삼성전자, AAPL, Toyota)"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setSearchOpen(true)
                }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => {
                  // dropdown 클릭이 동작하도록 약간 지연
                  window.setTimeout(() => setSearchOpen(false), 150)
                }}
                disabled={creatingHolding}
              />
              {searchOpen && searchQuery.trim() && (
                <div
                  className="surface absolute z-20 mt-1 max-h-72 w-full overflow-y-auto p-1 shadow-lg"
                  style={{ borderRadius: 'var(--radius)' }}
                >
                  {searchLoading ? (
                    <div
                      className="p-3 text-sm"
                      style={{ color: 'var(--muted)' }}
                    >
                      검색중...
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div
                      className="p-3 text-sm"
                      style={{ color: 'var(--muted)' }}
                    >
                      결과 없음
                    </div>
                  ) : (
                    searchResults.map((r) => (
                      <button
                        type="button"
                        key={`${r.symbol}-${r.exchange ?? ''}`}
                        className="card-hover-border-only block w-full rounded-md p-2 text-left text-sm"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          pickSymbol(r)
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-semibold">
                              {r.name}
                            </div>
                            <div
                              className="text-xs"
                              style={{ color: 'var(--muted)' }}
                            >
                              {r.symbol}
                              {r.exchange ? ` · ${r.exchange}` : ''}
                              {r.type ? ` · ${r.type}` : ''}
                            </div>
                          </div>
                          <span className="badge shrink-0">
                            {r.currency}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* 선택된 결과 미리보기 */}
            {newSymbol ? (
              <div className="card p-2 text-sm card-hover-border-only">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{newName}</span>
                  <span
                    className="text-xs"
                    style={{ color: 'var(--muted)' }}
                  >
                    {newSymbol}
                  </span>
                  {newExchange ? (
                    <span
                      className="text-xs"
                      style={{ color: 'var(--muted)' }}
                    >
                      · {newExchange}
                    </span>
                  ) : null}
                  <span className="badge">{newCurrency}</span>
                  <button
                    type="button"
                    className="btn btn-outline ml-auto text-xs"
                    onClick={() => {
                      setNewName('')
                      setNewSymbol('')
                      setNewExchange(null)
                      setNewCurrency('KRW')
                      setSearchQuery('')
                    }}
                  >
                    초기화
                  </button>
                </div>
              </div>
            ) : null}

            {/* 수동 입력 fallback */}
            <details className="text-sm">
              <summary
                className="cursor-pointer text-xs"
                style={{ color: 'var(--muted)' }}
              >
                수동 입력 (검색에 안 잡힐 때)
              </summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_100px]">
                <input
                  className="input"
                  placeholder="종목명"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={creatingHolding}
                />
                <input
                  className="input"
                  placeholder="심볼 (선택)"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                  disabled={creatingHolding}
                />
                <select
                  className="input"
                  value={newCurrency}
                  onChange={(e) => setNewCurrency(e.target.value)}
                  disabled={creatingHolding}
                  aria-label="통화"
                >
                  <option value="KRW">KRW</option>
                  <option value="USD">USD</option>
                  <option value="JPY">JPY</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="HKD">HKD</option>
                  <option value="CNY">CNY</option>
                </select>
              </div>
            </details>

            <select
              className="input"
              value={newAccountId}
              onChange={(e) => setNewAccountId(e.target.value)}
              disabled={creatingHolding}
              aria-label="이 종목을 보유 중인 계좌"
            >
              <option value="">
                {accounts.length === 0
                  ? '계좌 선택 (먼저 /ledger/accounts에서 주식/ISA/연금 계좌 추가)'
                  : '계좌 선택 (선택사항)'}
              </option>
              {accounts.map((a) => {
                const stockType = a.types.find((t) =>
                  ['STOCK', 'ISA', 'PENSION'].includes(t)
                )
                const label =
                  stockType === 'STOCK'
                    ? '주식/종합'
                    : stockType === 'ISA'
                      ? 'ISA'
                      : stockType === 'PENSION'
                        ? '연금'
                        : ''
                return (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.bankName ? ` · ${a.bankName}` : ''}
                    {label ? ` · ${label}` : ''}
                  </option>
                )
              })}
            </select>

            <input
              className="input"
              placeholder="메모 (선택)"
              value={newMemo}
              onChange={(e) => setNewMemo(e.target.value)}
              disabled={creatingHolding}
            />
            <div className="flex justify-end">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={creatingHolding || !newName.trim()}
              >
                {creatingHolding ? '추가중...' : '종목 추가'}
              </button>
            </div>
          </form>
        </div>

        {/* 종목 목록 */}
        <div className="surface card-pad card-hover-border-only">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="font-extrabold">보유 종목</div>
              <span className="badge">{holdings.length}개</span>
            </div>
            {holdings.some((h) => h.canEdit && !!h.symbol) ? (
              <div className="flex flex-wrap items-center gap-2">
                <label
                  className="flex items-center gap-1 text-xs"
                  title="15초마다 자동으로 시세를 갱신합니다 (탭이 활성 상태일 때만)."
                >
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                  />
                  자동 갱신 (15초)
                  {autoTick ? (
                    <span style={{ color: 'var(--muted)' }}>
                      · {relativeTimeFromIso(autoTick)}
                    </span>
                  ) : null}
                </label>
                <button
                  type="button"
                  className="btn btn-outline text-xs"
                  onClick={() => void refreshAll()}
                  disabled={bulkRefreshing}
                  title="모든 본인 소유 종목의 시세를 네이버 금융에서 갱신"
                >
                  {bulkRefreshing ? '갱신중...' : '↻ 전체 시세 갱신'}
                </button>
              </div>
            ) : null}
          </div>

          {loading ? (
            <div className="mt-4 grid gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={`hold-skel-${i}`}
                  className="h-24 rounded-lg skeleton"
                />
              ))}
            </div>
          ) : holdings.length === 0 ? (
            <div
              className="mt-4 text-sm"
              style={{ color: 'var(--muted)' }}
            >
              아직 등록한 종목이 없습니다.
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {holdings.map((h) => {
                const isOpen = openId === h.id
                const realized = h.aggregate.realizedPnL
                const unrealized = h.aggregate.unrealizedPnL
                // 평가 손익률 (보유분 기준) = 평가손익 / 평단가 원가
                const returnRate =
                  unrealized !== null && h.aggregate.costBasis > 0
                    ? (unrealized / h.aggregate.costBasis) * 100
                    : null
                return (
                  <div
                    key={h.id}
                    className="card p-4 card-hover-border-only"
                    style={
                      h.shared
                        ? {
                            background: `color-mix(in srgb, ${
                              ownerColorMap[h.ownerId] ??
                              getPastelColor(h.ownerId)
                            } 38%, var(--card))`,
                            borderColor: `color-mix(in srgb, ${
                              ownerColorMap[h.ownerId] ??
                              getPastelColor(h.ownerId)
                            } 55%, var(--border))`,
                          }
                        : undefined
                    }
                  >
                    {/* 헤더: 종목명 + 배지 + 액션 */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {(() => {
                            const kr = toKrCode(h.symbol)
                            const ovr = !kr ? toOverseasTarget(h.symbol, h.name) : null
                            if (kr) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => setActiveStock({ code: kr, name: h.name })}
                                  className="text-base font-bold hover:underline"
                                  title="종목 상세 보기"
                                >
                                  {h.name}
                                </button>
                              )
                            }
                            if (ovr) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => setActiveOverseas(ovr)}
                                  className="text-base font-bold hover:underline"
                                  title="해외 종목 상세 보기"
                                >
                                  {h.name}
                                </button>
                              )
                            }
                            return <div className="text-base font-bold">{h.name}</div>
                          })()}
                          {h.symbol ? (
                            <span
                              className="text-xs"
                              style={{ color: 'var(--muted)' }}
                            >
                              {h.symbol}
                            </span>
                          ) : null}
                          <span className="badge">{h.currency}</span>
                          {h.accountName ? (
                            <span
                              className="badge"
                              title={
                                h.accountBank
                                  ? `${h.accountBank} · ${h.accountName}`
                                  : h.accountName
                              }
                              style={{
                                background:
                                  'color-mix(in srgb, #0ea5e9 12%, var(--card))',
                                borderColor:
                                  'color-mix(in srgb, #0ea5e9 45%, var(--border))',
                              }}
                            >
                              {h.accountName}
                            </span>
                          ) : null}
                          {h.shared ? (
                            <span className="badge">
                              공유 · {h.ownerLabel}
                            </span>
                          ) : null}
                          <span className="badge">{h.txCount}건</span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {h.canEdit && h.symbol ? (
                          <button
                            type="button"
                            className="btn btn-outline text-xs"
                            onClick={() => void refreshSingle(h)}
                            title="네이버 금융에서 현재가 갱신"
                          >
                            ↻
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={
                            'btn text-xs ' +
                            (isOpen ? 'btn-primary' : 'btn-outline')
                          }
                          onClick={() => void openHolding(h.id)}
                        >
                          {isOpen ? '닫기' : '거래 보기'}
                        </button>
                        {h.canEdit ? (
                          <button
                            type="button"
                            className="btn btn-outline text-xs"
                            onClick={() => void deleteHolding(h.id)}
                          >
                            삭제
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {/* 강조 영역: 현재가 (가장 큼) + 수익률 + 평가손익 */}
                    <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                      <div>
                        <div
                          className="text-xs"
                          style={{ color: 'var(--muted)' }}
                        >
                          현재가
                          {h.priceUpdatedAt
                            ? ` · ${relativeTimeFromIso(h.priceUpdatedAt)}`
                            : ''}
                        </div>
                        <div className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
                          {h.currentPrice !== null
                            ? formatMoney(h.currentPrice, h.currency)
                            : '—'}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
                        <div>
                          <div
                            className="text-xs"
                            style={{ color: 'var(--muted)' }}
                          >
                            수익률 (평가)
                          </div>
                          <div
                            className={
                              'text-xl font-extrabold ' +
                              (returnRate === null
                                ? ''
                                : returnRate >= 0
                                  ? 'text-emerald-500'
                                  : 'text-red-500')
                            }
                          >
                            {returnRate === null
                              ? '—'
                              : `${returnRate >= 0 ? '+' : ''}${returnRate.toFixed(2)}%`}
                          </div>
                        </div>
                        <div>
                          <div
                            className="text-xs"
                            style={{ color: 'var(--muted)' }}
                          >
                            평가 손익
                          </div>
                          <div
                            className={
                              'text-xl font-extrabold ' +
                              (unrealized === null
                                ? ''
                                : unrealized >= 0
                                  ? 'text-emerald-500'
                                  : 'text-red-500')
                            }
                          >
                            {unrealized !== null
                              ? (unrealized >= 0 ? '+' : '') +
                                formatMoney(unrealized, h.currency)
                              : '—'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 보조 메타 */}
                    <div
                      className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs"
                      style={{ color: 'var(--muted)' }}
                    >
                      <span>
                        보유{' '}
                        <span style={{ color: 'var(--foreground)' }}>
                          {formatQty(h.aggregate.quantity)}
                        </span>
                      </span>
                      <span>
                        평단{' '}
                        <span style={{ color: 'var(--foreground)' }}>
                          {h.aggregate.quantity > 0
                            ? formatMoney(h.aggregate.avgCost, h.currency)
                            : '—'}
                        </span>
                      </span>
                      <span>
                        원금{' '}
                        <span style={{ color: 'var(--foreground)' }}>
                          {formatMoney(h.aggregate.costBasis, h.currency)}
                        </span>
                      </span>
                      <span>
                        실현{' '}
                        <span
                          className={
                            realized > 0
                              ? 'text-emerald-500'
                              : realized < 0
                                ? 'text-red-500'
                                : ''
                          }
                        >
                          {(realized >= 0 ? '+' : '') +
                            formatMoney(realized, h.currency)}
                        </span>
                      </span>
                    </div>

                    {isOpen ? (
                      <div
                        className="mt-3 grid gap-3 rounded-md border-t p-3"
                        style={{
                          background:
                            'color-mix(in srgb, var(--foreground) 4%, transparent)',
                        }}
                      >
                        {!h.canEdit ? (
                          <div
                            className="text-xs"
                            style={{ color: 'var(--muted)' }}
                          >
                            공유받은 종목입니다. 거래 기록은 보기 전용입니다.
                          </div>
                        ) : null}

                        {/* 계좌 변경 */}
                        {h.canEdit ? (
                          <div className="flex flex-wrap items-end gap-2">
                            <div className="grid gap-1">
                              <span
                                className="text-xs"
                                style={{ color: 'var(--muted)' }}
                              >
                                계좌
                              </span>
                              <select
                                className="input"
                                value={h.accountId ?? ''}
                                onChange={(e) =>
                                  void changeHoldingAccount(
                                    h.id,
                                    e.target.value
                                  )
                                }
                              >
                                <option value="">
                                  {accounts.length === 0
                                    ? '계좌 없음 (먼저 /ledger/accounts에서 추가)'
                                    : '계좌 미지정'}
                                </option>
                                {accounts.map((a) => {
                                  const st = a.types.find((t) =>
                                    ['STOCK', 'ISA', 'PENSION'].includes(t)
                                  )
                                  const label =
                                    st === 'STOCK'
                                      ? '주식/종합'
                                      : st === 'ISA'
                                        ? 'ISA'
                                        : st === 'PENSION'
                                          ? '연금'
                                          : ''
                                  return (
                                    <option key={a.id} value={a.id}>
                                      {a.name}
                                      {a.bankName ? ` · ${a.bankName}` : ''}
                                      {label ? ` · ${label}` : ''}
                                    </option>
                                  )
                                })}
                              </select>
                            </div>
                            <span
                              className="text-xs"
                              style={{ color: 'var(--muted)' }}
                            >
                              가계부 연동 시 이 계좌로 기록됩니다
                            </span>
                          </div>
                        ) : null}

                        {/* 현재가 인라인 편집 (본인 소유만) */}
                        {h.canEdit ? (
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="grid gap-1">
                            <span
                              className="text-xs"
                              style={{ color: 'var(--muted)' }}
                            >
                              현재가 (
                              {CURRENCY_SYMBOL[h.currency.toUpperCase()] ??
                                h.currency}
                              )
                            </span>
                            <input
                              className="input"
                              inputMode={
                                fractionDigits(h.currency) > 0
                                  ? 'decimal'
                                  : 'numeric'
                              }
                              value={priceDraft}
                              onChange={(e) => {
                                const pattern =
                                  fractionDigits(h.currency) > 0
                                    ? /[^0-9.]/g
                                    : /[^0-9]/g
                                setPriceDraft(e.target.value.replace(pattern, ''))
                              }}
                              placeholder="현재가 (수동)"
                              disabled={priceSaving}
                            />
                          </div>
                          <button
                            type="button"
                            className="btn btn-primary text-xs"
                            onClick={() => void saveCurrentPrice()}
                            disabled={priceSaving}
                          >
                            {priceSaving ? '저장중...' : '수동 저장'}
                          </button>
                          {h.symbol ? (
                            <button
                              type="button"
                              className="btn btn-outline text-xs"
                              onClick={() => void refreshSingle(h)}
                              disabled={priceSaving}
                              title="네이버 금융에서 현재가 갱신"
                            >
                              ↻ 네이버에서 가져오기
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn-outline text-xs"
                            onClick={() => {
                              setPriceDraft('')
                            }}
                            disabled={priceSaving}
                            title="빈 값 + 저장하면 현재가 제거"
                          >
                            지우기
                          </button>
                        </div>
                        ) : null}

                        {/* 거래 추가 폼 (본인 소유만) */}
                        {h.canEdit ? (
                        <TransactionForm
                          currency={h.currency}
                          txType={txType}
                          setTxType={setTxType}
                          txQty={txQty}
                          setTxQty={setTxQty}
                          txPrice={txPrice}
                          setTxPrice={setTxPrice}
                          txAmount={txAmount}
                          setTxAmount={setTxAmount}
                          txOccurredAt={txOccurredAt}
                          setTxOccurredAt={setTxOccurredAt}
                          txMemo={txMemo}
                          setTxMemo={setTxMemo}
                          txLink={txLink}
                          setTxLink={setTxLink}
                          onSubmit={createTx}
                          creating={creatingTx}
                        />
                        ) : null}

                        {/* 거래 리스트 */}
                        {detailLoading ? (
                          <div className="grid gap-2">
                            {Array.from({ length: 3 }).map((_, i) => (
                              <div
                                key={`tx-skel-${i}`}
                                className="h-12 rounded-md skeleton"
                              />
                            ))}
                          </div>
                        ) : detail && detail.id === h.id ? (
                          detail.transactions.length === 0 ? (
                            <div
                              className="text-sm"
                              style={{ color: 'var(--muted)' }}
                            >
                              아직 거래 기록이 없습니다.
                            </div>
                          ) : (
                            <div className="grid gap-1.5">
                              {detail.transactions.map((tx) => (
                                <TransactionRow
                                  key={tx.id}
                                  tx={tx}
                                  currency={h.currency}
                                  canDelete={h.canEdit}
                                  onDelete={() => void deleteTx(tx.id)}
                                />
                              ))}
                            </div>
                          )
                        ) : null}
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
          <div className="text-base font-extrabold">주식/투자 공유 관리</div>
          <p className="mt-2 text-xs opacity-70 leading-5">
            공유 요청을 보낸 계정이 승인하면, 상대의 종목과 거래 기록을 볼 수
            있습니다 (읽기 전용).
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
                {shareBusyId === 'new' ? '요청중...' : '공유 요청'}
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
                    borderColor:
                      'color-mix(in srgb, var(--border) 70%, white)',
                  }}
                />
                <span className="min-w-0 flex-1 truncate">
                  {account.label}
                </span>
                {account.isSelf ? (
                  <span className="badge ml-auto">나</span>
                ) : null}
              </label>
            ))}
          </section>

          <section className="mt-5 grid gap-2">
            <div className="text-sm font-semibold">요청한 계정</div>
            {outgoingShares.length === 0 ? (
              <div className="text-sm opacity-70">
                보낸 주식/투자 공유 요청이 없습니다.
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
            {incomingShares.length === 0 ? (
              <div className="text-sm opacity-70">
                받은 주식/투자 공유 요청이 없습니다.
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
      {activeStock && (
        <StockDetailModal
          target={activeStock}
          onClose={() => setActiveStock(null)}
        />
      )}
      {activeOverseas && (
        <OverseasDetailModal
          target={activeOverseas}
          onClose={() => setActiveOverseas(null)}
        />
      )}
    </main>
  )
}

function SummaryCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'good' | 'bad' | 'neutral'
}) {
  const color =
    tone === 'good'
      ? 'text-emerald-500'
      : tone === 'bad'
        ? 'text-red-500'
        : ''
  return (
    <div className="card p-2 card-hover-border-only">
      <div className="text-xs" style={{ color: 'var(--muted)' }}>
        {label}
      </div>
      <div className={'mt-1 font-bold ' + color}>{value}</div>
    </div>
  )
}

function TransactionRow({
  tx,
  currency,
  canDelete,
  onDelete,
}: {
  tx: HoldingTxItem
  currency: string
  canDelete: boolean
  onDelete: () => void
}) {
  const color = TX_TYPE_COLOR[tx.type]
  const label = TX_TYPE_LABEL[tx.type]
  return (
    <div
      className="card p-2 card-hover-border-only"
      style={{
        background: `color-mix(in srgb, ${color} 8%, var(--card))`,
        borderColor: `color-mix(in srgb, ${color} 35%, var(--border))`,
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            className="badge"
            style={{
              background: `color-mix(in srgb, ${color} 25%, var(--card))`,
              borderColor: `color-mix(in srgb, ${color} 55%, var(--border))`,
              fontWeight: 700,
            }}
          >
            {label}
          </span>
          {tx.type === 'BUY' || tx.type === 'SELL' ? (
            <span className="font-medium">
              {formatQty(tx.quantity ?? 0)}주 ×{' '}
              {formatMoney(tx.pricePerUnit ?? 0, currency)}
            </span>
          ) : null}
          <span className="font-bold">
            {formatMoney(tx.amount, currency)}
          </span>
          {tx.memo ? (
            <span
              className="truncate text-xs"
              style={{ color: 'var(--muted)' }}
            >
              · {tx.memo}
            </span>
          ) : null}
          {tx.linked ? (
            <span
              className="badge text-xs"
              title="가계부에 연동된 항목"
            >
              가계부 연동
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs whitespace-nowrap"
            style={{ color: 'var(--muted)' }}
          >
            {new Date(tx.occurredAt).toLocaleString('ko-KR', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          {canDelete ? (
            <button
              type="button"
              className="btn btn-outline text-xs"
              onClick={onDelete}
            >
              삭제
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function TransactionForm({
  currency,
  txType,
  setTxType,
  txQty,
  setTxQty,
  txPrice,
  setTxPrice,
  txAmount,
  setTxAmount,
  txOccurredAt,
  setTxOccurredAt,
  txMemo,
  setTxMemo,
  txLink,
  setTxLink,
  onSubmit,
  creating,
}: {
  currency: string
  txType: HoldingTxItem['type']
  setTxType: (t: HoldingTxItem['type']) => void
  txQty: string
  setTxQty: (v: string) => void
  txPrice: string
  setTxPrice: (v: string) => void
  txAmount: string
  setTxAmount: (v: string) => void
  txOccurredAt: string
  setTxOccurredAt: (v: string) => void
  txMemo: string
  setTxMemo: (v: string) => void
  txLink: boolean
  setTxLink: (v: boolean) => void
  onSubmit: () => void
  creating: boolean
}) {
  const isQtyMode = txType === 'BUY' || txType === 'SELL'
  const curSym =
    CURRENCY_SYMBOL[currency.toUpperCase()] ?? `${currency} `
  const allowDecimal = fractionDigits(currency) > 0
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <div className="flex flex-wrap gap-1">
        {(['BUY', 'SELL', 'DIVIDEND', 'FEE', 'TAX'] as const).map((t) => (
          <button
            type="button"
            key={t}
            className={
              'btn text-xs ' + (txType === t ? 'btn-primary' : 'btn-outline')
            }
            onClick={() => setTxType(t)}
          >
            {TX_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {isQtyMode ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="input"
            inputMode="decimal"
            placeholder="수량"
            value={txQty}
            onChange={(e) => setTxQty(e.target.value)}
            disabled={creating}
          />
          <input
            className="input"
            inputMode={allowDecimal ? 'decimal' : 'numeric'}
            placeholder={`단가 (${curSym})`}
            value={txPrice}
            onChange={(e) => {
              const pattern = allowDecimal ? /[^0-9.]/g : /[^0-9]/g
              setTxPrice(e.target.value.replace(pattern, ''))
            }}
            disabled={creating}
          />
        </div>
      ) : (
        <input
          className="input"
          inputMode={allowDecimal ? 'decimal' : 'numeric'}
          placeholder={`금액 (${curSym})`}
          value={txAmount}
          onChange={(e) => {
            const pattern = allowDecimal ? /[^0-9.]/g : /[^0-9]/g
            setTxAmount(e.target.value.replace(pattern, ''))
          }}
          disabled={creating}
        />
      )}

      <input
        className="input"
        placeholder="메모 (선택)"
        value={txMemo}
        onChange={(e) => setTxMemo(e.target.value)}
        disabled={creating}
      />

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          className="input"
          type="datetime-local"
          value={txOccurredAt}
          onChange={(e) => setTxOccurredAt(e.target.value)}
          disabled={creating}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={creating}
        >
          {creating ? '저장중...' : '거래 추가'}
        </button>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={txLink}
            onChange={(e) => setTxLink(e.target.checked)}
            disabled={creating || txType === 'BUY'}
          />
          <span className="font-medium">가계부 연동</span>
        </span>
        <span
          className="pl-6 text-xs leading-5"
          style={{ color: 'var(--muted)' }}
        >
          {txType === 'BUY'
            ? '매수는 자산 이동이라 가계부에 기록되지 않습니다.'
            : txType === 'SELL'
              ? '매도 시 실현 손익(매도가 − 평단가)을 가계부 주식/이자 카테고리에 자동 기록합니다.'
              : '배당/수수료/세금 금액을 가계부 주식/이자 카테고리에 자동 기록합니다.'}
        </span>
      </label>
    </form>
  )
}
