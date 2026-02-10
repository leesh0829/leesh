'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import { toHumanHttpError } from '@/app/lib/httpErrorText'

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
        'card p-3 transition ' +
        (dndEnabled && board.canEdit
          ? 'cursor-grab active:cursor-grabbing'
          : '') +
        (isDragging ? ' opacity-60 scale-[0.99]' : '')
      }
      draggable={dndEnabled && board.canEdit}
      onDragStart={(event) => onDragStart(board, event)}
      onDragEnd={onDragEnd}
      title={dndEnabled && board.canEdit ? '드래그해서 상태 이동' : undefined}
    >
      <div className="flex items-start justify-between gap-3">
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

        <div className="flex shrink-0 items-center gap-2">
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

        <div className="ml-auto flex items-center gap-2">
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
}) {
  return (
    <div
      className={
        'card card-pad transition ' +
        (isDragOver
          ? 'ring-2 ring-[var(--accent)] bg-[color:var(--ring)]'
          : '')
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
  const [boards, setBoards] = useState<BoardCard[]>([])
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
  const [shareLoading, setShareLoading] = useState(false)
  const [shareBusyId, setShareBusyId] = useState<string | null>(null)
  const [dndEnabled, setDndEnabled] = useState(false)
  const [draggingBoardId, setDraggingBoardId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<ScheduleStatus | null>(
    null
  )

  const load = useCallback(async () => {
    const r = await fetch('/api/todos/boards', { cache: 'no-store' })
    if (!r.ok) {
      const msg = await readApiErrorMessage(r)
      setErr(`${r.status} ${r.statusText} · ${msg ?? 'load failed'}`)
      return
    }
    const data = (await r.json()) as BoardCard[]
    setBoards(data)
    setErr(null)
  }, [])

  const loadShares = useCallback(async () => {
    setShareLoading(true)
    const res = await fetch('/api/schedule-shares', { cache: 'no-store' })
    if (!res.ok) {
      const payload = await readJsonSafely(res)
      const msg = extractApiMessage(payload) ?? '공유 정보 불러오기 실패'
      const human = toHumanHttpError(res.status, msg)
      setErr(human ?? `${res.status} · ${msg}`)
      setShareLoading(false)
      return
    }

    const payload = (await res.json()) as {
      outgoing?: OutgoingShare[]
      incoming?: IncomingShare[]
    }
    setOutgoingShares(
      (payload.outgoing ?? []).filter((row) => row.scope === 'TODO')
    )
    setIncomingShares(
      (payload.incoming ?? []).filter((row) => row.scope === 'TODO')
    )
    setShareLoading(false)
  }, [])

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
      setErr('공유 요청 이메일을 입력해 주세요.')
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
      setErr(human ?? `${res.status} · ${msg}`)
      setShareBusyId(null)
      return
    }

    setShareEmail('')
    setShareBusyId(null)
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
      setErr(human ?? `${res.status} · ${msg}`)
      setShareBusyId(null)
      return
    }

    setShareBusyId(null)
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
      setErr(human ?? `${res.status} · ${msg}`)
      setShareBusyId(null)
      return
    }

    setShareBusyId(null)
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
      setErr(`${r.status} ${r.statusText} · ${msg ?? 'create failed'}`)
      return
    }

    setName('')
    setDesc('')
    setSingleSchedule(false)
    setScheduleAllDay(false)
    setScheduleStartLocal('')
    setScheduleEndLocal('')
    await load()
  }

  const move = async (id: string, next: ScheduleStatus) => {
    const r = await fetch(`/api/todos/boards/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleStatus: next }),
    })

    if (!r.ok) {
      const msg = await readApiErrorMessage(r)
      setErr(`${r.status} ${r.statusText} · ${msg ?? 'move failed'}`)
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

  const handleDropToStatus = useCallback(
    async (next: ScheduleStatus) => {
      if (!dndEnabled || !draggingBoardId) return
      const source = boards.find((b) => b.id === draggingBoardId)
      if (!source || !source.canEdit || source.scheduleStatus === next) {
        clearDragState()
        return
      }

      await move(draggingBoardId, next)
      clearDragState()
    },
    [boards, clearDragState, dndEnabled, draggingBoardId]
  )

  const del = async (id: string) => {
    const ok = window.confirm('보드를 삭제할까요?')
    if (!ok) return

    const r = await fetch(`/api/boards/${id}`, { method: 'DELETE' })

    if (!r.ok) {
      const msg = await readApiErrorMessage(r)
      setErr(`${r.status} ${r.statusText} · ${msg ?? 'delete failed'}`)
      return
    }
    await load()
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
      setErr(`${r.status} ${r.statusText} · ${msg ?? 'update failed'}`)
      return
    }
    await load()
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
      setErr(`${r.status} ${r.statusText} · ${msg ?? 'save failed'}`)
      return
    }
    await load()
  }

  const normalizedBoards = useMemo(() => boards ?? [], [boards])
  const todos = normalizedBoards.filter((b) => b.scheduleStatus === 'TODO')
  const doing = normalizedBoards.filter((b) => b.scheduleStatus === 'DOING')
  const done = normalizedBoards.filter((b) => b.scheduleStatus === 'DONE')

  return (
    <main className="container-page py-8">
      <div className="surface card-pad">
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

        <section className="mt-6 card card-pad">
          <div className="font-extrabold">TODO 공유 권한 관리</div>

          <div className="mt-4 flex flex-wrap gap-2">
            <input
              className="input"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              placeholder="상대 계정 이메일"
            />
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

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <div className="text-sm font-semibold">받은 TODO 요청</div>
              {incomingShares.length === 0 ? (
                <div className="text-sm opacity-70">
                  대기 중인 TODO 공유 요청이 없습니다.
                </div>
              ) : (
                incomingShares.map((row) => (
                  <div key={row.id} className="card p-3">
                    <div className="font-semibold">{row.requester.label}</div>
                    <div className="mt-1 text-xs opacity-70">
                      요청일: {new Date(row.createdAt).toLocaleString()}
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
            </div>

            <div className="grid gap-2">
              <div className="text-sm font-semibold">보낸 TODO 요청</div>
              {outgoingShares.length === 0 ? (
                <div className="text-sm opacity-70">
                  보낸 TODO 공유 요청이 없습니다.
                </div>
              ) : (
                outgoingShares.map((row) => (
                  <div key={row.id} className="card p-3">
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
            </div>
          </div>
        </section>

        <div className="mt-6 card card-pad">
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

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
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
          />
        </div>
      </div>
    </main>
  )
}
