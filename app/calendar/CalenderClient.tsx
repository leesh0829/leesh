'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toHumanHttpError } from '@/app/lib/httpErrorText'
import { useToast } from '@/app/components/ToastProvider'

type CalItem = {
  kind: 'POST' | 'BOARD'
  id: string
  slug: string | null
  boardId: string
  boardName: string
  boardType: 'GENERAL' | 'BLOG' | 'PORTFOLIO' | 'TODO' | 'CALENDAR' | 'HELP'
  ownerId: string
  ownerLabel: string
  shared: boolean
  canEdit: boolean
  title: string
  displayTitle: string
  status: 'TODO' | 'DOING' | 'DONE'
  isSecret: boolean
  startAt: string | null
  endAt: string | null
  allDay: boolean
  createdAt?: string | null
}

type SharePeer = {
  id: string
  name: string | null
  email: string | null
  label: string
}

type OutgoingShare = {
  id: string
  scope: 'CALENDAR' | 'TODO'
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED'
  owner: SharePeer
  createdAt: string
  updatedAt: string
  respondedAt: string | null
}

type IncomingShare = {
  id: string
  scope: 'CALENDAR' | 'TODO'
  status: 'PENDING'
  requester: SharePeer
  createdAt: string
  updatedAt: string
}

type ShareAccount = {
  id: string
  label: string
  color: string
  isSelf: boolean
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

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

function shiftIsoByDays(iso: string | null, days: number): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}
function toYM(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

type SpanSeg = {
  it: CalItem
  start: Date
  end: Date
}

type WeekBar = {
  it: CalItem
  colStart: number // 0~6
  colEnd: number // 0~6 (inclusive)
  lane: number // 0,1,2...
  isStart: boolean
  isEnd: boolean
}

function startOfDayLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, days: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function hashString(input: string) {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const boardColorCache = new Map<string, string>()

function getBoardColor(boardId: string) {
  const cached = boardColorCache.get(boardId)
  if (cached) return cached

  const hash = hashString(boardId || 'default')
  const hue = hash % 360
  const saturation = 62 + ((hash >>> 9) % 14) // 62~75
  const lightness = 46 + ((hash >>> 17) % 10) // 46~55
  const color = `hsl(${hue} ${saturation}% ${lightness}%)`
  boardColorCache.set(boardId, color)
  return color
}

const ownerColorCache = new Map<string, string>()

function getOwnerColor(ownerId: string) {
  const cached = ownerColorCache.get(ownerId)
  if (cached) return cached

  const hash = hashString(ownerId || 'owner')
  const hue = hash % 360
  const saturation = 63 + ((hash >>> 8) % 8) // 63~70
  const lightness = 82 + ((hash >>> 16) % 6) // 82~87
  const color = `hsl(${hue} ${saturation}% ${lightness}%)`
  ownerColorCache.set(ownerId, color)
  return color
}

/**
 * endAt 보정:
 * - endAt이 null이면 startAt 하루짜리로
 * - allDay 일정에서 endAt이 자정(00:00:00.000)으로 저장되는 케이스는
 *   "마지막 날이 하루 밀려 보이는" 문제가 생겨서 하루 빼줌
 */
function normalizeSpanEnd(it: CalItem, start: Date) {
  if (!it.endAt) return startOfDayLocal(start)

  const end = new Date(it.endAt)
  if (Number.isNaN(end.getTime())) return startOfDayLocal(start)

  if (it.allDay) {
    const isMidnight =
      end.getHours() === 0 &&
      end.getMinutes() === 0 &&
      end.getSeconds() === 0 &&
      end.getMilliseconds() === 0

    if (isMidnight) {
      // end가 다음날 00:00로 들어오는 케이스를 "전날"로 보정
      const e = addDays(end, -1)
      return startOfDayLocal(e)
    }
  }

  return startOfDayLocal(end)
}

export default function CalendarClient() {
  const toast = useToast()
  const [cursor, setCursor] = useState(() => new Date())
  const [items, setItems] = useState<CalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [boardFilter, setBoardFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | CalItem['status']>(
    'ALL'
  )
  const [editing, setEditing] = useState<CalItem | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editStatus, setEditStatus] = useState<CalItem['status']>('TODO')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editAllDay, setEditAllDay] = useState(false)
  const [saving, setSaving] = useState(false)
  const [shareEmail, setShareEmail] = useState('')
  const [outgoingShares, setOutgoingShares] = useState<OutgoingShare[]>([])
  const [incomingShares, setIncomingShares] = useState<IncomingShare[]>([])
  const [meShare, setMeShare] = useState<SharePeer | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareBusyId, setShareBusyId] = useState<string | null>(null)
  const [visibleOwners, setVisibleOwners] = useState<Record<string, boolean>>(
    {}
  )
  const MAX_VISIBLE_BARS = 5
  const [moreDay, setMoreDay] = useState<{
    dateKey: string
    items: CalItem[]
  } | null>(null)

  const openMore = (dateKey: string, list: CalItem[]) => {
    setMoreDay({ dateKey, items: list })
  }

  const closeMore = () => setMoreDay(null)

  const ym = useMemo(() => toYM(cursor), [cursor])

  const boardOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const it of items) map.set(it.boardId, it.boardName)
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [items])

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
      color: '#ffffff',
      isSelf: true,
    })

    for (const owner of acceptedOwners) {
      if (owner.id === selfAccountId) continue
      if (map.has(owner.id)) continue
      map.set(owner.id, {
        id: owner.id,
        label: owner.label,
        color: getOwnerColor(owner.id),
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

  const visibleOwnerIds = useMemo(
    () =>
      new Set(
        shareAccounts
          .filter((row) => visibleOwners[row.id] !== false)
          .map((row) => row.id)
      ),
    [shareAccounts, visibleOwners]
  )

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (boardFilter !== 'ALL' && it.boardId !== boardFilter) return false
      if (statusFilter !== 'ALL' && it.status !== statusFilter) return false
      if (visibleOwnerIds.size > 0 && !visibleOwnerIds.has(it.ownerId))
        return false
      return true
    })
  }, [items, boardFilter, statusFilter, visibleOwnerIds])

  const barAnimSeed = useMemo(() => {
    const ownerKey = Object.entries(visibleOwners)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v ? 1 : 0}`)
      .join('|')
    return `${ym}|${boardFilter}|${statusFilter}|${ownerKey}`
  }, [ym, boardFilter, statusFilter, visibleOwners])

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    const res = await fetch(`/api/calendar?month=${ym}`)
    if (res.ok) {
      setItems(await res.json())
      setLoading(false)
      return
    }
    const payload = await readJsonSafely(res)
    const msg = extractApiMessage(payload) ?? '캘린더 불러오기 실패'
    const human = toHumanHttpError(res.status, msg)
    const message = human ?? `${res.status} · ${msg}`
    setErr(message)
    toast.error(message)
    setLoading(false)
  }, [ym, toast])

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
      (payload.outgoing ?? []).filter((row) => row.scope === 'CALENDAR')
    )
    setIncomingShares(
      (payload.incoming ?? []).filter((row) => row.scope === 'CALENDAR')
    )
    setShareLoading(false)
  }, [toast])

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
      body: JSON.stringify({ targetEmail, scope: 'CALENDAR' }),
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
    toast.success('캘린더 공유 요청을 보냈습니다.')
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

  const openEdit = (it: CalItem) => {
    setEditing(it)
    setEditTitle(it.title)
    setEditStatus(it.status)
    setEditStart(toDatetimeLocalValue(it.startAt))
    setEditEnd(toDatetimeLocalValue(it.endAt))
    setEditAllDay(!!it.allDay)
  }

  const closeEdit = () => setEditing(null)

  const getDetailHref = (it: CalItem) => {
    if (it.kind === 'BOARD') {
      if (it.boardType === 'TODO') return `/todos/${it.boardId}`
      if (it.boardType === 'CALENDAR') return '/calendar'
      return `/boards/${it.boardId}`
    }
    const key = encodeURIComponent(it.slug ?? it.id)
    switch (it.boardType) {
      case 'BLOG':
        return `/blog/${key}`
      case 'TODO':
        return `/todos`
      case 'CALENDAR':
        return `/calendar`
      case 'GENERAL':
        return `/boards/${it.boardId}/${key}`
      default:
        return `/calendar`
    }
  }

  const saveEdit = async () => {
    if (!editing) return
    if (!editing.canEdit) {
      const message = '공유받은 일정은 수정할 수 없습니다.'
      setErr(message)
      toast.error(message)
      return
    }
    setSaving(true)
    setErr(null)

    const startAt = editStart ? new Date(editStart).toISOString() : null
    const endAt = editEnd ? new Date(editEnd).toISOString() : null

    const url =
      editing.kind === 'BOARD'
        ? `/api/boards/${editing.boardId}/schedule`
        : `/api/boards/${editing.boardId}/posts/${editing.id}`

    const r = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(editing.kind === 'POST'
          ? { title: editTitle, status: editStatus }
          : { status: editStatus }),
        startAt,
        endAt,
        allDay: editAllDay,
      }),
    })

    if (!r.ok) {
      const payload = await readJsonSafely(r)
      const msg = extractApiMessage(payload) ?? '일정 수정 저장 실패'
      const human = toHumanHttpError(r.status, msg)
      const message = human ?? `${r.status} · ${msg}`
      setErr(message)
      toast.error(message)
      setSaving(false)
      return
    }

    await load()
    toast.success('일정이 저장되었습니다.')
    setSaving(false)
    closeEdit()
  }

  const deleteEdit = async () => {
    if (!editing) return
    if (!editing.canEdit) {
      const message = '공유받은 일정은 삭제할 수 없습니다.'
      setErr(message)
      toast.error(message)
      return
    }
    const ok = window.confirm('이 일정을 삭제할까요?')
    if (!ok) return

    setSaving(true)
    setErr(null)

    const url =
      editing.kind === 'BOARD'
        ? `/api/boards/${editing.boardId}/schedule`
        : `/api/boards/${editing.boardId}/posts/${editing.id}`

    const res = await fetch(url, { method: 'DELETE' })

    if (!res.ok) {
      const payload = await readJsonSafely(res)
      const msg = extractApiMessage(payload) ?? '삭제 실패'
      const human = toHumanHttpError(res.status, msg)
      const message = human ?? `${res.status} · ${msg}`
      setErr(message)
      toast.error(message)
      setSaving(false)
      return
    }

    await load()
    toast.success('일정이 삭제되었습니다.')
    setSaving(false)
    closeEdit()
  }

  const shiftItemDays = async (it: CalItem, days: number) => {
    if (!it.canEdit) {
      const message = '공유받은 일정은 날짜 이동할 수 없습니다.'
      setErr(message)
      toast.error(message)
      return
    }
    setErr(null)

    const startAt = shiftIsoByDays(it.startAt ?? null, days)
    const endAt = shiftIsoByDays(it.endAt ?? null, days)

    if (!startAt) {
      const message = '400 Bad Request · startAt이 없는 일정은 이동할 수 없음'
      setErr(message)
      toast.error(message)
      return
    }

    const url =
      it.kind === 'BOARD'
        ? `/api/boards/${it.boardId}/schedule`
        : `/api/boards/${it.boardId}/posts/${it.id}`

    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startAt, endAt, allDay: !!it.allDay }),
    })

    if (!res.ok) {
      const payload = await readJsonSafely(res)
      const msg = extractApiMessage(payload) ?? '날짜 이동 실패'
      const human = toHumanHttpError(res.status, msg)
      const message = human ?? `${res.status} · ${msg}`
      setErr(message)
      toast.error(message)
      return
    }

    await load()
    toast.success(
      days > 0
        ? '일정을 하루 뒤로 이동했습니다.'
        : '일정을 하루 앞으로 이동했습니다.'
    )
  }

  useEffect(() => {
    Promise.resolve().then(() => {
      void load()
    })
  }, [load])

  useEffect(() => {
    Promise.resolve().then(() => {
      void loadShares()
    })
  }, [loadShares])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  const totalDays = useMemo(() => {
    return new Date(year, month + 1, 0).getDate()
  }, [year, month])

  const startDay = useMemo(() => {
    return new Date(year, month, 1).getDay()
  }, [year, month])

  const todayKey = useMemo(() => {
    const t = new Date()
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
  }, [])

  const spans = useMemo(() => {
    const list: SpanSeg[] = []
    for (const it of filteredItems) {
      if (!it.startAt) continue
      const s0 = new Date(it.startAt)
      if (Number.isNaN(s0.getTime())) continue
      const s = startOfDayLocal(s0)
      const e = normalizeSpanEnd(it, s0)
      list.push({ it, start: s, end: e })
    }

    list.sort((a, b) => {
      const at = a.start.getTime()
      const bt = b.start.getTime()
      if (at !== bt) return at - bt
      return a.it.title.localeCompare(b.it.title)
    })

    return list
  }, [filteredItems])

  const gridStart = useMemo(() => {
    const d = new Date(year, month, 1)
    d.setDate(d.getDate() - startDay)
    return startOfDayLocal(d)
  }, [year, month, startDay])

  const weeks = useMemo(() => {
    const result: {
      weekStart: Date
      weekEnd: Date
      bars: WeekBar[]
      laneCount: number
    }[] = []

    for (let w = 0; w < 6; w++) {
      const ws = addDays(gridStart, w * 7)
      const we = addDays(ws, 6)

      // 이 주에 걸치는 일정만 잘라서 segment 만든다
      const segs: {
        it: CalItem
        segStart: Date
        segEnd: Date
        colStart: number
        colEnd: number
        isStart: boolean
        isEnd: boolean
      }[] = []

      for (const sp of spans) {
        if (sp.end < ws || sp.start > we) continue // 겹침 없음

        const segStart = sp.start < ws ? ws : sp.start
        const segEnd = sp.end > we ? we : sp.end

        const colStart = Math.max(
          0,
          Math.min(
            6,
            Math.floor((segStart.getTime() - ws.getTime()) / 86400000)
          )
        )
        const colEnd = Math.max(
          0,
          Math.min(6, Math.floor((segEnd.getTime() - ws.getTime()) / 86400000))
        )

        segs.push({
          it: sp.it,
          segStart,
          segEnd,
          colStart,
          colEnd,
          isStart: dayKey(sp.start) === dayKey(segStart),
          isEnd: dayKey(sp.end) === dayKey(segEnd),
        })
      }

      // lane 배치(겹치면 아래줄로)
      const lanesLastEnd: number[] = []
      const bars: WeekBar[] = []

      segs.sort((a, b) => {
        const at = a.colStart - b.colStart
        if (at !== 0) return at
        return a.it.title.localeCompare(b.it.title)
      })

      for (const s of segs) {
        let lane = 0
        while (lane < lanesLastEnd.length) {
          if (s.colStart > lanesLastEnd[lane]) break
          lane++
        }
        if (lane === lanesLastEnd.length) lanesLastEnd.push(-1)
        lanesLastEnd[lane] = Math.max(lanesLastEnd[lane], s.colEnd)

        bars.push({
          it: s.it,
          colStart: s.colStart,
          colEnd: s.colEnd,
          lane,
          isStart: s.isStart,
          isEnd: s.isEnd,
        })
      }

      result.push({
        weekStart: ws,
        weekEnd: we,
        bars,
        laneCount: lanesLastEnd.length,
      })
    }

    return result
  }, [gridStart, spans])

  const goPrev = () =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
  const goNext = () =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))

  return (
    <main className="w-full px-3 py-6 sm:px-4 lg:px-6">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <div>
            <div className="text-xs opacity-60">Calendar</div>
            <h1 className="text-2xl font-semibold">달력 일정 관리</h1>
            <p className="mt-1 text-sm opacity-70">
              달력으로 일정을 관리 및 확인합니다.
            </p>
          </div>

          <section className="mt-3 card card-pad card-hover-border-only">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge">월 이동</span>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={goPrev}
                >
                  ◀
                </button>
                <div className="min-w-[96px] text-center text-sm font-semibold">
                  {ym}
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={goNext}
                >
                  ▶
                </button>
                <button type="button" className="btn btn-primary" onClick={load}>
                  일정 새로고침
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 xl:ml-auto xl:justify-end">
                <label className="flex w-full items-center gap-2 text-sm sm:w-auto">
                  <span className="badge shrink-0">보드 필터</span>
                  <select
                    className="select w-full sm:w-40"
                    value={boardFilter}
                    onChange={(e) => setBoardFilter(e.target.value)}
                  >
                    <option value="ALL">전체 보드</option>
                    {boardOptions.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex w-full items-center gap-2 text-sm sm:w-auto">
                  <span className="badge shrink-0">상태 필터</span>
                  <select
                    className="select w-full sm:w-32"
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(
                        e.target.value as 'ALL' | CalItem['status']
                      )
                    }
                  >
                    <option value="ALL">전체 상태</option>
                    <option value="TODO">TODO</option>
                    <option value="DOING">DOING</option>
                    <option value="DONE">DONE</option>
                  </select>
                </label>
              </div>
            </div>
          </section>

          {err && <p style={{ color: 'crimson', marginTop: 10 }}>{err}</p>}

          {loading ? (
            <div className="mt-4 grid gap-3">
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div
                    key={`weekday-skel-${i}`}
                    className="h-5 skeleton rounded-md"
                  />
                ))}
              </div>
              {Array.from({ length: 5 }).map((_, w) => (
                <div key={`week-skel-${w}`} className="grid grid-cols-7 gap-2">
                  {Array.from({ length: 7 }).map((__, d) => (
                    <div
                      key={`cell-skel-${w}-${d}`}
                      className="h-28 rounded-lg border border-[var(--border)] skeleton"
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              {/* 요일 헤더 */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => (
                  <div key={w} style={{ fontWeight: 700, opacity: 0.7 }}>
                    {w}
                  </div>
                ))}
              </div>

              {/* 주 단위 렌더: week 내부에 day grid + bar overlay */}
              <div className="hidden sm:block">
                <div style={{ display: 'grid', gap: 8 }}>
                  {weeks.map((wk, wIdx) => {
                    const rowStartIdx = wIdx * 7
                    const visibleBars = wk.bars.filter(
                      (b) => b.lane < MAX_VISIBLE_BARS
                    )
                    const visibleLaneIds = Array.from(
                      new Set(visibleBars.map((b) => b.lane))
                    ).sort((a, b) => a - b)
                    const laneIndexById = new Map<number, number>(
                      visibleLaneIds.map((laneId, idx) => [laneId, idx])
                    )
                    const visibleLanes = visibleLaneIds.length
                    const laneStep = 16
                    const barHeight = 15
                    const barAreaHeight =
                      visibleLanes > 0
                        ? (visibleLanes - 1) * laneStep + barHeight
                        : 0
                    // 날짜 숫자 / +n more 헤더 영역과 막대 영역을 분리
                    const overlayTop = 32
                    const cellPaddingTop = overlayTop + barAreaHeight + 6
                    const minCellHeight = Math.max(84, cellPaddingTop + 18)

                    return (
                      <div
                        key={dayKey(wk.weekStart)}
                        style={{
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                      >
                        {/* bar overlay */}
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'grid',
                            gridTemplateColumns: 'repeat(7, 1fr)',
                            gap: 8,
                            alignItems: 'start',
                            paddingTop: overlayTop,
                            zIndex: 5,
                            pointerEvents: 'none',
                          }}
                        >
                          {visibleBars.map((b) => {
                            const colFrom = b.colStart + 1
                            const colTo = b.colEnd + 2
                            const lane = laneIndexById.get(b.lane) ?? 0
                            const top = lane * laneStep
                            const ownerColor =
                              ownerColorMap[b.it.ownerId] ??
                              (b.it.shared
                                ? getOwnerColor(b.it.ownerId)
                                : '#ffffff')
                            const barTextColor = '#111827'

                            return (
                              <div
                                key={`${barAnimSeed}:${b.it.id}:${b.lane}:${b.colStart}:${b.colEnd}`}
                                className="calendar-bar-enter"
                                style={{
                                  gridColumn: `${colFrom} / ${colTo}`,
                                  gridRow: 1,
                                  transform: `translateY(${top}px)`,
                                  height: barHeight,
                                  border:
                                    ownerColor === '#ffffff'
                                      ? '1px solid var(--border)'
                                      : `1px solid color-mix(in srgb, ${ownerColor} 68%, var(--border))`,
                                  background: ownerColor,
                                  color: barTextColor,
                                  borderRadius: 999,
                                  padding: '1px 7px',
                                  overflow: 'hidden',
                                  whiteSpace: 'nowrap',
                                  textOverflow: 'ellipsis',
                                  fontSize: 11,
                                  fontWeight: 700,
                                  pointerEvents: 'auto',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                }}
                                onClick={() => openEdit(b.it)}
                                title={b.it.displayTitle || b.it.title}
                              >
                                <div
                                  style={{
                                    flex: 1,
                                    minWidth: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 5,
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 6,
                                      height: 6,
                                      borderRadius: 999,
                                      background: getBoardColor(b.it.boardId),
                                      flexShrink: 0,
                                    }}
                                  />
                                  {!b.isStart ? (
                                    <span style={{ opacity: 0.6 }}>…</span>
                                  ) : null}

                                  <span
                                    style={{
                                      flex: 1,
                                      minWidth: 0,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {b.it.displayTitle || b.it.title}
                                  </span>

                                  {!b.isEnd ? (
                                    <span style={{ opacity: 0.6 }}>…</span>
                                  ) : null}
                                </div>

                                {/* shift buttons: bar 클릭과 분리 */}
                                {b.it.canEdit ? (
                                  <div
                                    style={{
                                      display: 'flex',
                                      gap: 6,
                                      flexShrink: 0,
                                    }}
                                  >
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        shiftItemDays(b.it, -1)
                                      }}
                                      style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: barTextColor,
                                        padding: 0,
                                        width: 14,
                                        height: 14,
                                        lineHeight: '14px',
                                        fontSize: 9,
                                        flexShrink: 0,
                                        cursor: 'pointer',
                                      }}
                                      title="하루 전으로"
                                    >
                                      ◀
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        shiftItemDays(b.it, 1)
                                      }}
                                      style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: barTextColor,
                                        padding: 0,
                                        width: 14,
                                        height: 14,
                                        lineHeight: '14px',
                                        fontSize: 9,
                                        flexShrink: 0,
                                        cursor: 'pointer',
                                      }}
                                      title="하루 후로"
                                    >
                                      ▶
                                    </button>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: 11, opacity: 0.7 }}>
                                    공유
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>

                        {/* day cells */}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(7, 1fr)',
                            gap: 8,
                          }}
                        >
                          {Array.from({ length: 7 }).map((_, dIdx) => {
                            const idx = rowStartIdx + dIdx
                            const dayNum = idx - startDay + 1
                            const inMonth = dayNum >= 1 && dayNum <= totalDays

                            const d = new Date(
                              cursor.getFullYear(),
                              cursor.getMonth(),
                              dayNum
                            )
                            const key = dayKey(d)
                            const isToday = inMonth && key === todayKey
                            const col = dIdx
                            const barHit = wk.bars.filter(
                              (b) => b.colStart <= col && col <= b.colEnd
                            )

                            const uniq = new Map<string, CalItem>()
                            for (const b of barHit) {
                              uniq.set(`${b.it.kind}:${b.it.id}`, b.it)
                            }
                            const dayItems = Array.from(uniq.values()).sort(
                              (a, b) =>
                                (a.displayTitle || a.title).localeCompare(
                                  b.displayTitle || b.title
                                )
                            )

                            const hiddenUniq = new Set<string>()
                            for (const b of barHit) {
                              if (b.lane >= MAX_VISIBLE_BARS) {
                                hiddenUniq.add(`${b.it.kind}:${b.it.id}`)
                              }
                            }
                            const hiddenCount = hiddenUniq.size

                            return (
                              <div
                                key={key}
                                style={{
                                  border: '1px solid var(--border)',
                                  background: 'transparent',
                                  borderRadius: 8,
                                  position: 'relative',
                                  minHeight: minCellHeight,
                                  padding: 8,
                                  opacity: inMonth ? 1 : 0.35,
                                  paddingTop: cellPaddingTop,
                                }}
                              >
                                <div
                                  style={{
                                    fontWeight: isToday ? 1000 : 700,
                                    color: isToday
                                      ? 'var(--accent)'
                                      : 'var(--fg)',
                                    position: 'absolute',
                                    top: 6,
                                    left: 8,
                                    zIndex: 8,
                                  }}
                                >
                                  {inMonth ? dayNum : ''}
                                </div>
                                {inMonth && hiddenCount > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => openMore(key, dayItems)}
                                    style={{
                                      position: 'absolute',
                                      top: 6,
                                      right: 8,
                                      border: '1px solid var(--border)',
                                      background: 'var(--card)',
                                      color: 'var(--fg)',
                                      borderRadius: 10,
                                      padding: '2px 8px',
                                      fontSize: 12,
                                      cursor: 'pointer',
                                      zIndex: 8,
                                    }}
                                    title="해당 날짜 전체 일정 보기"
                                  >
                                    +{hiddenCount} more
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="sm:hidden surface card-pad">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">이번 달 일정</div>
                  <div className="badge">{ym}</div>
                </div>

                <div className="mt-3 grid gap-2">
                  {Array.from({ length: totalDays }).map((_, i) => {
                    const dayNum = i + 1
                    const d = new Date(
                      cursor.getFullYear(),
                      cursor.getMonth(),
                      dayNum
                    )
                    const key = dayKey(d)

                    const dayItems = filteredItems.filter((it) => {
                      if (!it.startAt) return false
                      const s = startOfDayLocal(new Date(it.startAt))
                      if (Number.isNaN(s.getTime())) return false
                      const e = normalizeSpanEnd(it, s)
                      const t = startOfDayLocal(d).getTime()
                      return s.getTime() <= t && t <= e.getTime()
                    })

                    const visible = dayItems.slice(0, 5)
                    const hidden = Math.max(0, dayItems.length - visible.length)

                    return (
                      <div key={key} className="surface card-pad">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold">
                            {dayNum}일
                          </div>
                          {hidden > 0 ? (
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => openMore(key, dayItems)}
                            >
                              +{hidden} more
                            </button>
                          ) : null}
                        </div>

                        {dayItems.length === 0 ? (
                          <div className="mt-2 text-sm opacity-70">
                            일정 없음
                          </div>
                        ) : (
                          <div className="mt-2 grid gap-2">
                            {visible.map((it) => (
                              <button
                                key={`${it.kind}:${it.id}`}
                                type="button"
                                className="surface card-pad text-left"
                                onClick={() => openEdit(it)}
                                style={
                                  it.shared
                                    ? {
                                        background: `color-mix(in srgb, ${
                                          ownerColorMap[it.ownerId] ??
                                          getOwnerColor(it.ownerId)
                                        } 44%, var(--card))`,
                                        color: '#111827',
                                      }
                                    : undefined
                                }
                                title={it.displayTitle || it.title}
                              >
                                <div className="font-semibold truncate">
                                  {it.displayTitle || it.title}
                                </div>
                                <div className="mt-1 text-xs opacity-70 truncate">
                                  {it.shared ? `공유:${it.ownerLabel} · ` : ''}
                                  {it.boardName} · {it.status}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="surface card-pad card-hover-border-only xl:sticky xl:top-6">
          <div className="text-base font-extrabold">캘린더 공유 계정 관리</div>

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
                {shareBusyId === 'new' ? '요청중...' : '캘린더 공유 요청'}
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
            {shareLoading ? (
              <div className="grid gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={`share-account-skel-${i}`}
                    className="h-10 rounded-lg skeleton"
                  />
                ))}
              </div>
            ) : (
              shareAccounts.map((account) => (
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
                    style={{ accentColor: account.color }}
                  />
                  <span
                    className="h-3 w-3 rounded-sm border"
                    style={{
                      background: account.color,
                      borderColor:
                        'color-mix(in srgb, var(--border) 70%, white)',
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate">{account.label}</span>
                  {account.isSelf ? (
                    <span className="badge ml-auto">나</span>
                  ) : null}
                </label>
              ))
            )}
          </section>

          <section className="mt-5 grid gap-2">
            <div className="text-sm font-semibold">요청한 계정</div>
            {shareLoading ? (
              <div className="grid gap-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={`outgoing-skel-${i}`}
                    className="h-20 rounded-lg skeleton"
                  />
                ))}
              </div>
            ) : outgoingShares.length === 0 ? (
              <div className="text-sm opacity-70">
                보낸 캘린더 공유 요청이 없습니다.
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
            {shareLoading ? (
              <div className="grid gap-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={`incoming-skel-${i}`}
                    className="h-20 rounded-lg skeleton"
                  />
                ))}
              </div>
            ) : incomingShares.length === 0 ? (
              <div className="text-sm opacity-70">
                대기 중인 캘린더 공유 요청이 없습니다.
              </div>
            ) : (
              incomingShares.map((row) => (
                <div key={row.id} className="card card-hover-border-only p-3">
                  <div className="font-semibold">{row.requester.label}</div>
                  <div className="mt-1 text-xs opacity-70">
                    상태: {row.status} · 요청일:{' '}
                    {new Date(row.createdAt).toLocaleString()}
                  </div>
                  <div className="mt-2 flex gap-2">
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
                </div>
              ))
            )}
          </section>
        </aside>
      </div>

      {moreDay && (
        <div
          onClick={closeMore}
          className="fixed inset-0 z-55 bg-black/40 flex items-end sm:items-center justify-center p-2 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="surface w-full sm:w130 rounded-t-2xl sm:rounded-2xl p-4 max-h-[80dvh] overflow-y-auto"
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <h3 style={{ margin: 0 }}>일정 전체 보기 · {moreDay.dateKey}</h3>
              <button onClick={closeMore}>닫기</button>
            </div>

            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              {moreDay.items.length === 0 ? (
                <div style={{ opacity: 0.7 }}>일정이 없습니다.</div>
              ) : (
                moreDay.items.map((it) => (
                  <button
                    key={`${it.kind}:${it.id}`}
                    type="button"
                    onClick={() => {
                      closeMore()
                      openEdit(it)
                    }}
                    style={{
                      display: 'grid',
                      gap: 4,
                      textAlign: 'left',
                      border: '1px solid #ddd',
                      background: 'white',
                      borderRadius: 10,
                      padding: 10,
                      cursor: 'pointer',
                    }}
                    title={it.displayTitle || it.title}
                  >
                    <div style={{ fontWeight: 800 }}>
                      {it.displayTitle || it.title}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      {it.shared ? `공유:${it.ownerLabel} · ` : ''}
                      {it.boardName} · {it.status}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div
          onClick={closeEdit}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(520px, 100%)',
              background: 'white',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <h3 style={{ margin: 0 }}>
                {editing.canEdit ? '일정 수정' : '일정 보기 (공유 읽기 전용)'}
              </h3>
              <button onClick={closeEdit}>닫기</button>
            </div>

            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                소유자: {editing.ownerLabel}
              </div>

              {editing.kind === 'BOARD' ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>보드</div>
                  <div style={{ fontWeight: 700 }}>{editing.boardName}</div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                    단일 일정 모드(singleSchedule)라서 제목은 보드 이름으로
                    고정됨
                  </div>
                </div>
              ) : (
                <label style={{ display: 'grid', gap: 6 }}>
                  제목
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    disabled={!editing.canEdit}
                  />
                </label>
              )}

              <label style={{ display: 'grid', gap: 6 }}>
                상태
                <select
                  value={editStatus}
                  onChange={(e) =>
                    setEditStatus(e.target.value as CalItem['status'])
                  }
                  disabled={!editing.canEdit}
                >
                  <option value="TODO">TODO</option>
                  <option value="DOING">DOING</option>
                  <option value="DONE">DONE</option>
                </select>
              </label>

              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={editAllDay}
                  onChange={(e) => setEditAllDay(e.target.checked)}
                  disabled={!editing.canEdit}
                />
                allDay
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                시작
                <input
                  type="datetime-local"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                  disabled={!editing.canEdit}
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                종료
                <input
                  type="datetime-local"
                  value={editEnd}
                  onChange={(e) => setEditEnd(e.target.value)}
                  disabled={!editing.canEdit}
                />
              </label>

              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'space-between',
                  marginTop: 6,
                }}
              >
                <Link href={getDetailHref(editing)}>자세히 보기</Link>

                {editing.canEdit ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={deleteEdit} disabled={saving}>
                      삭제
                    </button>
                    <button onClick={saveEdit} disabled={saving}>
                      {saving ? '저장중...' : '저장'}
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    공유받은 일정은 수정/삭제할 수 없습니다.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
