'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import { toHumanHttpError } from '@/app/lib/httpErrorText'
import { useToast } from '@/app/components/ToastProvider'

type ScheduleStatus = 'TODO' | 'DOING' | 'DONE'

type BoardCard = {
  id: string
  name: string
  description: string | null
  ownerId: string
  ownerLabel: string
  shared: boolean
  canEdit: boolean
  scheduleStatus: ScheduleStatus
  singleSchedule: boolean
  scheduleStartAt: string | null
  scheduleEndAt: string | null
  scheduleAllDay: boolean
  createdAt: string
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
  const saturation = 62 + ((hash >>> 7) % 8) // 62~69
  const lightness = 82 + ((hash >>> 15) % 6) // 82~87
  return `hsl(${hue} ${saturation}% ${lightness}%)`
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

function isoFromDatetimeLocal(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
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

type BoardItemProps = {
  board: BoardCard
  ownerColor: string | null
  onMove: (id: string, next: ScheduleStatus) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onToggleSingle: (id: string, next: boolean) => Promise<void>
  onSaveSchedule: (
    id: string,
    startAt: string | null,
    endAt: string | null,
    allDay: boolean
  ) => Promise<void>
  dndEnabled: boolean
  isDragging: boolean
  onDragStart: (board: BoardCard, event: DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
}

function BoardItem({
  board,
  ownerColor,
  onMove,
  onDelete,
  onToggleSingle,
  onSaveSchedule,
  dndEnabled,
  isDragging,
  onDragStart,
  onDragEnd,
}: BoardItemProps) {
  const [startLocal, setStartLocal] = useState<string>(
    toDatetimeLocalValue(board.scheduleStartAt)
  )
  const [endLocal, setEndLocal] = useState<string>(
    toDatetimeLocalValue(board.scheduleEndAt)
  )
  const [allDay, setAllDay] = useState<boolean>(!!board.scheduleAllDay)

  return (
    <div
      className={
        'card p-3 card-hover-border-only transition ' +
        (dndEnabled && board.canEdit
          ? 'cursor-grab active:cursor-grabbing'
          : '') +
        (isDragging ? ' opacity-60 scale-[0.99]' : '')
      }
      draggable={dndEnabled && board.canEdit}
      style={
        board.shared && ownerColor
          ? {
              background: `color-mix(in srgb, ${ownerColor} 38%, var(--card))`,
              borderColor: `color-mix(in srgb, ${ownerColor} 55%, var(--border))`,
            }
          : undefined
      }
      onDragStart={(event) => onDragStart(board, event)}
      onDragEnd={onDragEnd}
      title={dndEnabled && board.canEdit ? '드래그해서 상태 이동' : undefined}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-semibold truncate">{board.name}</div>
            {board.shared ? <span className="badge">공유</span> : null}
          </div>
          {board.shared ? (
            <div className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
              공유자: {board.ownerLabel}
            </div>
          ) : null}
          {board.description ? (
            <div className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              {board.description}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <Link href={`/todos/${board.id}`} className="btn btn-outline">
            상세
          </Link>
          {board.canEdit ? (
            <button
              type="button"
              onClick={() => onDelete(board.id)}
              className="btn"
            >
              삭제
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onMove(board.id, 'TODO')}
          className={
            board.scheduleStatus === 'TODO' ? 'btn btn-primary' : 'btn'
          }
          disabled={!board.canEdit || board.scheduleStatus === 'TODO'}
        >
          TODO
        </button>
        <button
          type="button"
          onClick={() => onMove(board.id, 'DOING')}
          className={
            board.scheduleStatus === 'DOING' ? 'btn btn-primary' : 'btn'
          }
          disabled={!board.canEdit || board.scheduleStatus === 'DOING'}
        >
          DOING
        </button>
        <button
          type="button"
          onClick={() => onMove(board.id, 'DONE')}
          className={
            board.scheduleStatus === 'DONE' ? 'btn btn-primary' : 'btn'
          }
          disabled={!board.canEdit || board.scheduleStatus === 'DONE'}
        >
          DONE
        </button>

        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={board.singleSchedule}
              onChange={(e) => onToggleSingle(board.id, e.target.checked)}
              disabled={!board.canEdit}
            />
            단일 일정
          </label>
          {board.singleSchedule ? (
            <span className="badge">캘린더 연동</span>
          ) : null}
        </div>
      </div>

      {board.singleSchedule ? (
        <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
          <div className="grid min-w-0 gap-2">
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              시작
            </div>
            <input
              className="input min-w-0"
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              disabled={!board.canEdit || allDay}
            />
          </div>

          <div className="grid min-w-0 gap-2">
            <div className="text-xs" style={{ color: 'var(--muted)' }}>
              종료
            </div>
            <input
              className="input min-w-0"
              type="datetime-local"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
              disabled={!board.canEdit || allDay}
            />
          </div>

          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              disabled={!board.canEdit}
            />
            하루종일
          </label>

          <div className="flex flex-wrap gap-2 md:col-span-2">
            {board.canEdit ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() =>
                    onSaveSchedule(
                      board.id,
                      isoFromDatetimeLocal(startLocal),
                      isoFromDatetimeLocal(endLocal),
                      allDay
                    )
                  }
                >
                  일정 저장
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setStartLocal(toDatetimeLocalValue(board.scheduleStartAt))
                    setEndLocal(toDatetimeLocalValue(board.scheduleEndAt))
                    setAllDay(!!board.scheduleAllDay)
                  }}
                >
                  되돌리기
                </button>
              </>
            ) : (
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                공유 보드는 읽기 전용입니다.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function BoardColumn({
  status,
  title,
  list,
  onMove,
  onDelete,
  onToggleSingle,
  onSaveSchedule,
  dndEnabled,
  draggingBoardId,
  isDragOver,
  onDragOverStatus,
  onDropStatus,
  onDragEndAll,
  onDragStart,
  ownerColors,
}: {
  status: ScheduleStatus
  title: string
  list: BoardCard[]
  onMove: (id: string, next: ScheduleStatus) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onToggleSingle: (id: string, next: boolean) => Promise<void>
  onSaveSchedule: (
    id: string,
    startAt: string | null,
    endAt: string | null,
    allDay: boolean
  ) => Promise<void>
  dndEnabled: boolean
  draggingBoardId: string | null
  isDragOver: boolean
  onDragOverStatus: (status: ScheduleStatus) => void
  onDropStatus: (status: ScheduleStatus) => Promise<void>
  onDragEndAll: () => void
  onDragStart: (board: BoardCard, event: DragEvent<HTMLDivElement>) => void
  ownerColors: Record<string, string>
}) {
  return (
    <div
      className={
        'card card-pad card-hover-border-only transition ' +
        (isDragOver ? 'ring-2 ring-[var(--accent)] bg-[color:var(--ring)]' : '')
      }
      onDragOver={(event) => {
        if (!dndEnabled || !draggingBoardId) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        onDragOverStatus(status)
      }}
      onDrop={(event) => {
        if (!dndEnabled || !draggingBoardId) return
        event.preventDefault()
        void onDropStatus(status)
      }}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-extrabold">{title}</div>
        <span className="badge">{list.length}</span>
      </div>

      <div className="mt-4 grid gap-3">
        {list.map((b) => (
          <BoardItem
            key={`${b.id}:${b.singleSchedule ? 1 : 0}:${b.scheduleStartAt ?? ''}:${b.scheduleEndAt ?? ''}:${b.scheduleAllDay ? 1 : 0}`}
            board={b}
            ownerColor={
              b.shared
                ? (ownerColors[b.ownerId] ?? getPastelColor(b.ownerId))
                : null
            }
            onMove={onMove}
            onDelete={onDelete}
            onToggleSingle={onToggleSingle}
            onSaveSchedule={onSaveSchedule}
            dndEnabled={dndEnabled}
            isDragging={draggingBoardId === b.id}
            onDragStart={onDragStart}
            onDragEnd={onDragEndAll}
          />
        ))}
      </div>
    </div>
  )
}

export default function TodosClient() {
  const toast = useToast()
  const [boards, setBoards] = useState<BoardCard[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')

  const [singleSchedule, setSingleSchedule] = useState(false)
  const [scheduleAllDay, setScheduleAllDay] = useState(false)
  const [scheduleStartLocal, setScheduleStartLocal] = useState('')
  const [scheduleEndLocal, setScheduleEndLocal] = useState('')
  const [shareEmail, setShareEmail] = useState('')
  const [outgoingShares, setOutgoingShares] = useState<OutgoingShare[]>([])
  const [incomingShares, setIncomingShares] = useState<IncomingShare[]>([])
  const [meShare, setMeShare] = useState<SharePeer | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareBusyId, setShareBusyId] = useState<string | null>(null)
  const [visibleOwners, setVisibleOwners] = useState<Record<string, boolean>>(
    {}
  )
  const [dndEnabled, setDndEnabled] = useState(false)
  const [draggingBoardId, setDraggingBoardId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<ScheduleStatus | null>(
    null
  )

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/todos/boards', { cache: 'no-store' })
    if (!r.ok) {
      const msg = await readApiErrorMessage(r)
      const message = `${r.status} ${r.statusText} · ${msg ?? 'load failed'}`
      setErr(message)
      toast.error(message)
      setLoading(false)
      return
    }
    const data = (await r.json()) as BoardCard[]
    setBoards(data)
    setErr(null)
    setLoading(false)
  }, [toast])

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
      (payload.outgoing ?? []).filter((row) => row.scope === 'TODO')
    )
    setIncomingShares(
      (payload.incoming ?? []).filter((row) => row.scope === 'TODO')
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
    const media = window.matchMedia('(hover: hover) and (pointer: fine)')
    const apply = () => setDndEnabled(media.matches)
    apply()

    const onChange = () => apply()

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    }

    media.addListener(onChange)
    return () => media.removeListener(onChange)
  }, [])

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
      body: JSON.stringify({ targetEmail, scope: 'TODO' }),
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
    toast.success('TODO 공유 요청을 보냈습니다.')
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
    const payload = {
      name,
      description: desc || null,
      singleSchedule,
      scheduleAllDay,
      scheduleStartAt: singleSchedule
        ? isoFromDatetimeLocal(scheduleStartLocal)
        : null,
      scheduleEndAt: singleSchedule
        ? isoFromDatetimeLocal(scheduleEndLocal)
        : null,
    }

    const r = await fetch('/api/todos/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!r.ok) {
      const msg = await readApiErrorMessage(r)
      const message = `${r.status} ${r.statusText} · ${msg ?? 'create failed'}`
      setErr(message)
      toast.error(message)
      return
    }

    setName('')
    setDesc('')
    setSingleSchedule(false)
    setScheduleAllDay(false)
    setScheduleStartLocal('')
    setScheduleEndLocal('')
    await load()
    toast.success('TODO 보드를 생성했습니다.')
  }

  const move = async (id: string, next: ScheduleStatus) => {
    const r = await fetch(`/api/todos/boards/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleStatus: next }),
    })

    if (!r.ok) {
      const msg = await readApiErrorMessage(r)
      const message = `${r.status} ${r.statusText} · ${msg ?? 'move failed'}`
      setErr(message)
      toast.error(message)
      return
    }
    await load()
  }

  const clearDragState = useCallback(() => {
    setDraggingBoardId(null)
    setDragOverStatus(null)
  }, [])

  const handleDragStart = useCallback(
    (board: BoardCard, event: DragEvent<HTMLDivElement>) => {
      if (!dndEnabled || !board.canEdit) return
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', board.id)
      setDraggingBoardId(board.id)
      setDragOverStatus(board.scheduleStatus)
    },
    [dndEnabled]
  )

  const handleDropToStatus = async (next: ScheduleStatus) => {
    if (!dndEnabled || !draggingBoardId) return
    const source = boards.find((b) => b.id === draggingBoardId)
    if (!source || !source.canEdit || source.scheduleStatus === next) {
      clearDragState()
      return
    }

    await move(draggingBoardId, next)
    clearDragState()
  }

  const del = async (id: string) => {
    const ok = window.confirm('보드를 삭제할까요?')
    if (!ok) return

    const r = await fetch(`/api/boards/${id}`, { method: 'DELETE' })

    if (!r.ok) {
      const msg = await readApiErrorMessage(r)
      const message = `${r.status} ${r.statusText} · ${msg ?? 'delete failed'}`
      setErr(message)
      toast.error(message)
      return
    }
    await load()
    toast.success('보드를 삭제했습니다.')
  }

  const toggleSingle = async (id: string, next: boolean) => {
    const r = await fetch(`/api/todos/boards/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        next
          ? { singleSchedule: true }
          : {
              singleSchedule: false,
              scheduleStartAt: null,
              scheduleEndAt: null,
              scheduleAllDay: false,
            }
      ),
    })

    if (!r.ok) {
      const msg = await readApiErrorMessage(r)
      const message = `${r.status} ${r.statusText} · ${msg ?? 'update failed'}`
      setErr(message)
      toast.error(message)
      return
    }
    await load()
    toast.success(
      next ? '단일 일정 모드를 켰습니다.' : '단일 일정 모드를 껐습니다.'
    )
  }

  const saveSchedule = async (
    id: string,
    startAt: string | null,
    endAt: string | null,
    allDay: boolean
  ) => {
    const r = await fetch(`/api/todos/boards/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scheduleStartAt: startAt,
        scheduleEndAt: endAt,
        scheduleAllDay: allDay,
      }),
    })

    if (!r.ok) {
      const msg = await readApiErrorMessage(r)
      const message = `${r.status} ${r.statusText} · ${msg ?? 'save failed'}`
      setErr(message)
      toast.error(message)
      return
    }
    await load()
    toast.success('일정을 저장했습니다.')
  }

  const normalizedBoards = useMemo(() => boards ?? [], [boards])
  const selfOwnerIdFromBoards =
    normalizedBoards.find((b) => !b.shared)?.ownerId ?? null
  const selfLabelFromBoards =
    normalizedBoards.find((b) => !b.shared)?.ownerLabel ?? '내 계정'
  const selfAccountId = meShare?.id ?? selfOwnerIdFromBoards ?? 'self'
  const selfAccountLabel = meShare?.label ?? selfLabelFromBoards

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

  const ownerVisible = (ownerId: string) => {
    if (visibleOwnerIds.size === 0) return true
    return visibleOwnerIds.has(ownerId)
  }

  const visibleBoards = normalizedBoards.filter((b) => ownerVisible(b.ownerId))
  const todos = visibleBoards.filter((b) => b.scheduleStatus === 'TODO')
  const doing = visibleBoards.filter((b) => b.scheduleStatus === 'DOING')
  const done = visibleBoards.filter((b) => b.scheduleStatus === 'DONE')

  return (
    <main className="w-full px-3 py-6 sm:px-4 lg:px-6">
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="surface card-pad card-hover-border-only">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold">/todos</h1>
              <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                보드 기반 TODO 관리 (공유받은 보드는 읽기 전용)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/calendar" className="btn btn-outline">
                캘린더
              </Link>
            </div>
          </div>

          {err ? (
            <div className="mt-4 card p-3" style={{ color: 'crimson' }}>
              {err}
            </div>
          ) : null}

          <div className="mt-6 card card-pad card-hover-border-only">
            <div className="flex items-center justify-between gap-3">
              <div className="font-extrabold">보드 생성</div>
              <span className="badge">단일 일정은 캘린더 연동</span>
            </div>

            <form
              className="mt-4 grid gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                void create()
              }}
            >
              <div className="grid gap-2">
                <label className="text-sm font-medium">보드 이름</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="보드 이름"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">설명 (선택)</label>
                <input
                  className="input"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="설명 (선택)"
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={singleSchedule}
                  onChange={(e) => setSingleSchedule(e.target.checked)}
                />
                단일 일정 모드
              </label>

              {singleSchedule ? (
                <div className="grid min-w-0 gap-3 md:grid-cols-2">
                  <div className="grid gap-2">
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>
                      시작
                    </div>
                    <input
                      className="input"
                      type="datetime-local"
                      value={scheduleStartLocal}
                      onChange={(e) => setScheduleStartLocal(e.target.value)}
                      disabled={scheduleAllDay}
                    />
                  </div>

                  <div className="grid gap-2">
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>
                      종료
                    </div>
                    <input
                      className="input"
                      type="datetime-local"
                      value={scheduleEndLocal}
                      onChange={(e) => setScheduleEndLocal(e.target.value)}
                      disabled={scheduleAllDay}
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={scheduleAllDay}
                      onChange={(e) => setScheduleAllDay(e.target.checked)}
                    />
                    하루종일
                  </label>
                </div>
              ) : null}

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!name.trim()}
                >
                  생성
                </button>
              </div>
            </form>
          </div>

          {loading ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, cIdx) => (
                <div key={`todo-col-skel-${cIdx}`} className="card card-pad">
                  <div className="h-5 w-24 rounded-md skeleton" />
                  <div className="mt-4 grid gap-3">
                    {Array.from({ length: 3 }).map((__, i) => (
                      <div
                        key={`todo-card-skel-${cIdx}-${i}`}
                        className="h-28 rounded-lg skeleton"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              <BoardColumn
                status="TODO"
                title="TODO"
                list={todos}
                onMove={move}
                onDelete={del}
                onToggleSingle={toggleSingle}
                onSaveSchedule={saveSchedule}
                dndEnabled={dndEnabled}
                draggingBoardId={draggingBoardId}
                isDragOver={dragOverStatus === 'TODO'}
                onDragOverStatus={setDragOverStatus}
                onDropStatus={handleDropToStatus}
                onDragEndAll={clearDragState}
                onDragStart={handleDragStart}
                ownerColors={ownerColorMap}
              />
              <BoardColumn
                status="DOING"
                title="DOING"
                list={doing}
                onMove={move}
                onDelete={del}
                onToggleSingle={toggleSingle}
                onSaveSchedule={saveSchedule}
                dndEnabled={dndEnabled}
                draggingBoardId={draggingBoardId}
                isDragOver={dragOverStatus === 'DOING'}
                onDragOverStatus={setDragOverStatus}
                onDropStatus={handleDropToStatus}
                onDragEndAll={clearDragState}
                onDragStart={handleDragStart}
                ownerColors={ownerColorMap}
              />
              <BoardColumn
                status="DONE"
                title="DONE"
                list={done}
                onMove={move}
                onDelete={del}
                onToggleSingle={toggleSingle}
                onSaveSchedule={saveSchedule}
                dndEnabled={dndEnabled}
                draggingBoardId={draggingBoardId}
                isDragOver={dragOverStatus === 'DONE'}
                onDragOverStatus={setDragOverStatus}
                onDropStatus={handleDropToStatus}
                onDragEndAll={clearDragState}
                onDragStart={handleDragStart}
                ownerColors={ownerColorMap}
              />
            </div>
          )}
        </div>

        <aside className="surface card-pad card-hover-border-only xl:sticky xl:top-6">
          <div className="text-base font-extrabold">TODO 공유 계정 관리</div>

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
                {shareBusyId === 'new' ? '요청중...' : 'TODO 공유 요청'}
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
            {outgoingShares.length === 0 ? (
              <div className="text-sm opacity-70">
                보낸 TODO 공유 요청이 없습니다.
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
                대기 중인 TODO 공유 요청이 없습니다.
              </div>
            ) : (
              incomingShares.map((row) => (
                <div key={row.id} className="card card-hover-border-only p-3">
                  <div className="font-semibold">{row.requester.label}</div>
                  <div className="mt-1 text-xs opacity-70">
                    상태: {row.status} · 요청일:{' '}
                    {new Date(row.createdAt).toLocaleString()}
                  </div>
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
                </div>
              ))
            )}
          </section>
        </aside>
      </div>
    </main>
  )
}
