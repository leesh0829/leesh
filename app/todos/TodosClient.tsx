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
    <div
      style={{
        border: '1px solid #ddd',
        borderRadius: 10,
        padding: 10,
        background: 'white',
      }}
    >
      <div style={{ fontWeight: 800 }}>{board.name}</div>
      {board.description ? (
        <div style={{ opacity: 0.75, marginTop: 4 }}>{board.description}</div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => onMove(board.id, 'TODO')}
          disabled={board.scheduleStatus === 'TODO'}
        >
          TODO
        </button>
        <button
          type="button"
          onClick={() => onMove(board.id, 'DOING')}
          disabled={board.scheduleStatus === 'DOING'}
        >
          DOING
        </button>
        <button
          type="button"
          onClick={() => onMove(board.id, 'DONE')}
          disabled={board.scheduleStatus === 'DONE'}
        >
          DONE
        </button>

        <Link href={`/todos/${board.id}`} style={{ marginLeft: 6 }}>
          상세
        </Link>

        <button
          type="button"
          onClick={() => onDelete(board.id)}
          style={{ marginLeft: 'auto' }}
        >
          삭제
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={board.singleSchedule}
            onChange={(e) => onToggleSingle(board.id, e.target.checked)}
          />
          단일 일정 모드
        </label>
      </div>

      {board.singleSchedule ? (
        <div
          style={{
            marginTop: 10,
            display: 'grid',
            gap: 8,
            gridTemplateColumns: '1fr 1fr',
          }}
        >
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>시작</div>
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              style={{ width: '100%' }}
              disabled={allDay}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>종료</div>
            <input
              type="datetime-local"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
              style={{ width: '100%' }}
              disabled={allDay}
            />
          </div>

          <label
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              gridColumn: '1 / -1',
            }}
          >
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            하루종일
          </label>

          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
            <button
              type="button"
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
    <div
      style={{
        border: '1px solid #ddd',
        borderRadius: 12,
        padding: 12,
        minHeight: 280,
        background: '#fafafa',
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'grid', gap: 10 }}>
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
    <main style={{ padding: 24, maxWidth: 1200 }}>
      <h1 style={{ marginBottom: 10 }}>/todos</h1>
      {err ? <p style={{ color: 'crimson' }}>{err}</p> : null}

      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: 12,
          padding: 12,
          marginTop: 12,
          background: 'white',
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 10 }}>보드 생성</div>

        <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="보드 이름"
          />
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="설명 (선택)"
          />

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={singleSchedule}
              onChange={(e) => setSingleSchedule(e.target.checked)}
            />
            단일 일정 모드
          </label>

          {singleSchedule ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
              }}
            >
              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>시작</div>
                <input
                  type="datetime-local"
                  value={scheduleStartLocal}
                  onChange={(e) => setScheduleStartLocal(e.target.value)}
                  style={{ width: '100%' }}
                  disabled={scheduleAllDay}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>종료</div>
                <input
                  type="datetime-local"
                  value={scheduleEndLocal}
                  onChange={(e) => setScheduleEndLocal(e.target.value)}
                  style={{ width: '100%' }}
                  disabled={scheduleAllDay}
                />
              </div>

              <label
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  gridColumn: '1 / -1',
                }}
              >
                <input
                  type="checkbox"
                  checked={scheduleAllDay}
                  onChange={(e) => setScheduleAllDay(e.target.checked)}
                />
                하루종일
              </label>
            </div>
          ) : null}

          <button type="button" onClick={create} disabled={!name.trim()}>
            생성
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 12,
          marginTop: 16,
        }}
      >
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
    </main>
  )
}
