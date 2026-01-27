'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

type ScheduleStatus = 'TODO' | 'DOING' | 'DONE'

type BoardCard = {
  id: string
  name: string
  description: string | null
  scheduleStatus: ScheduleStatus
  singleSchedule: boolean
  scheduleStartAt: string | null
  scheduleEndAt: string | null
  scheduleAllDay: boolean
  createdAt: string
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
}

function BoardItem({
  board,
  onMove,
  onDelete,
  onToggleSingle,
  onSaveSchedule,
}: BoardItemProps) {
  const [startLocal, setStartLocal] = useState<string>(
    toDatetimeLocalValue(board.scheduleStartAt)
  )
  const [endLocal, setEndLocal] = useState<string>(
    toDatetimeLocalValue(board.scheduleEndAt)
  )
  const [allDay, setAllDay] = useState<boolean>(!!board.scheduleAllDay)

  return (
    <div className="card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold truncate">{board.name}</div>
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
          <button
            type="button"
            onClick={() => onDelete(board.id)}
            className="btn"
          >
            삭제
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onMove(board.id, 'TODO')}
          className={
            board.scheduleStatus === 'TODO' ? 'btn btn-primary' : 'btn'
          }
          disabled={board.scheduleStatus === 'TODO'}
        >
          TODO
        </button>
        <button
          type="button"
          onClick={() => onMove(board.id, 'DOING')}
          className={
            board.scheduleStatus === 'DOING' ? 'btn btn-primary' : 'btn'
          }
          disabled={board.scheduleStatus === 'DOING'}
        >
          DOING
        </button>
        <button
          type="button"
          onClick={() => onMove(board.id, 'DONE')}
          className={
            board.scheduleStatus === 'DONE' ? 'btn btn-primary' : 'btn'
          }
          disabled={board.scheduleStatus === 'DONE'}
        >
          DONE
        </button>

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={board.singleSchedule}
              onChange={(e) => onToggleSingle(board.id, e.target.checked)}
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
              disabled={allDay}
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
              disabled={allDay}
            />
          </div>

          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            하루종일
          </label>

          <div className="flex flex-wrap gap-2 md:col-span-2">
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
          </div>
        </div>
      ) : null}
    </div>
  )
}

function BoardColumn({
  title,
  list,
  onMove,
  onDelete,
  onToggleSingle,
  onSaveSchedule,
}: {
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
}) {
  return (
    <div className="card card-pad">
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

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load()
    }, 0)

    return () => {
      window.clearTimeout(t)
    }
  }, [load])

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
              보드 기반 TODO 관리
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
            title="TODO"
            list={todos}
            onMove={move}
            onDelete={del}
            onToggleSingle={toggleSingle}
            onSaveSchedule={saveSchedule}
          />
          <BoardColumn
            title="DOING"
            list={doing}
            onMove={move}
            onDelete={del}
            onToggleSingle={toggleSingle}
            onSaveSchedule={saveSchedule}
          />
          <BoardColumn
            title="DONE"
            list={done}
            onMove={move}
            onDelete={del}
            onToggleSingle={toggleSingle}
            onSaveSchedule={saveSchedule}
          />
        </div>
      </div>
    </main>
  )
}
