'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type Board = {
  id: string
  name: string
  description: string | null
  createdAt: string | Date
  owner?: { name: string | null; email: string | null }
}

type Status = 'TODO' | 'DOING' | 'DONE'

function toIsoOrNull(datetimeLocal: string): string | null {
  if (!datetimeLocal) return null
  const d = new Date(datetimeLocal)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export default function BoardsClient({
  initialBoards,
  canCreate,
}: {
  initialBoards: Board[]
  canCreate: boolean
}) {
  const BOARD_PAGE_SIZE = 8
  const [boards, setBoards] = useState(initialBoards)
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [page, setPage] = useState(1)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const [singleSchedule, setSingleSchedule] = useState(false)
  const [scheduleStatus, setScheduleStatus] = useState<Status>('TODO')
  const [scheduleStartAt, setScheduleStartAt] = useState('')
  const [scheduleEndAt, setScheduleEndAt] = useState('')
  const [scheduleAllDay, setScheduleAllDay] = useState(false)

  const startIso = useMemo(
    () => toIsoOrNull(scheduleStartAt),
    [scheduleStartAt]
  )
  const endIso = useMemo(() => toIsoOrNull(scheduleEndAt), [scheduleEndAt])

  const sortedBoards = useMemo(() => {
    const copied = [...boards]
    copied.sort((a, b) => {
      const at = new Date(a.createdAt).getTime()
      const bt = new Date(b.createdAt).getTime()
      return sortOrder === 'desc' ? bt - at : at - bt
    })
    return copied
  }, [boards, sortOrder])

  const totalPages = Math.max(1, Math.ceil(sortedBoards.length / BOARD_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedBoards = useMemo(() => {
    const start = (currentPage - 1) * BOARD_PAGE_SIZE
    return sortedBoards.slice(start, start + BOARD_PAGE_SIZE)
  }, [sortedBoards, currentPage])

  useEffect(() => {
    setPage(1)
  }, [sortOrder])

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages))
  }, [totalPages])

  const reload = async () => {
    const res = await fetch('/api/boards')
    if (res.ok) setBoards(await res.json())
  }

  const create = async () => {
    if (!name.trim()) {
      alert('보드 이름을 입력해줘')
      return
    }

    if (singleSchedule && !startIso) {
      alert('단일 일정 보드는 시작일시(또는 날짜)가 필수임')
      return
    }

    const res = await fetch('/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description,
        singleSchedule,
        scheduleStatus,
        scheduleStartAt: singleSchedule ? startIso : null,
        scheduleEndAt: singleSchedule ? endIso : null,
        scheduleAllDay: singleSchedule ? scheduleAllDay : false,
      }),
    })

    if (res.status === 401) {
      alert('로그인 후 보드를 만들 수 있습니다.')
      return
    }

    if (res.ok) {
      setName('')
      setDescription('')
      setSingleSchedule(false)
      setScheduleStatus('TODO')
      setScheduleStartAt('')
      setScheduleEndAt('')
      setScheduleAllDay(false)
      await reload()
      setPage(1)
      return
    }

    const err = await res.json().catch(() => ({}))
    alert(err?.message ?? '생성 실패')
  }

  return (
    <main className="container-page py-8">
      <div className="surface card-pad card-hover-border-only">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Boards</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              GENERAL 타입 보드 목록
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--muted)' }}>
              정렬
            </span>
            <select
              className="select w-auto"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
            >
              <option value="desc">최신순</option>
              <option value="asc">오래된순</option>
            </select>
            {!canCreate ? (
              <span className="badge">로그인하면 보드 생성 가능</span>
            ) : null}
          </div>
        </div>

        {canCreate ? (
          <section className="card card-pad mt-6 card-hover-border-only">
            <div className="flex flex-col gap-3">
              <div className="grid gap-2 sm:grid-cols-2">
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
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="설명"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={singleSchedule}
                    onChange={(e) => setSingleSchedule(e.target.checked)}
                  />
                  한 일정만(단일 일정 보드)
                </label>

                {singleSchedule ? (
                  <>
                    <select
                      className="select"
                      value={scheduleStatus}
                      onChange={(e) =>
                        setScheduleStatus(e.target.value as Status)
                      }
                    >
                      <option value="TODO">TODO</option>
                      <option value="DOING">DOING</option>
                      <option value="DONE">DONE</option>
                    </select>

                    <input
                      className="input"
                      type="datetime-local"
                      value={scheduleStartAt}
                      onChange={(e) => setScheduleStartAt(e.target.value)}
                      title="시작"
                    />
                    <input
                      className="input"
                      type="datetime-local"
                      value={scheduleEndAt}
                      onChange={(e) => setScheduleEndAt(e.target.value)}
                      title="종료(선택)"
                    />

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={scheduleAllDay}
                        onChange={(e) => setScheduleAllDay(e.target.checked)}
                      />
                      하루종일
                    </label>

                    <span className="badge">
                      단일 일정 보드는 postId 일정 생성 불가 / 캘린더엔 boardId
                      일정으로만 표시
                    </span>
                  </>
                ) : null}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={create}
                >
                  생성
                </button>
              </div>
            </div>
          </section>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {pagedBoards.map((b) => (
            <Link
              key={b.id}
              href={`/boards/${b.id}`}
              className="card card-pad block no-underline hover:no-underline"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{b.name}</div>
                  {b.description ? (
                    <div
                      className="mt-1 text-sm"
                      style={{ color: 'var(--muted)' }}
                    >
                      {b.description}
                    </div>
                  ) : (
                    <div
                      className="mt-1 text-sm"
                      style={{ color: 'var(--muted)' }}
                    >
                      설명 없음
                    </div>
                  )}

                  <div
                    className="mt-2 text-xs"
                    style={{ color: 'var(--muted)' }}
                  >
                    by{' '}
                    {b.owner?.name ??
                      (b.owner?.email
                        ? b.owner.email.split('@')[0]
                        : 'unknown')}
                  </div>
                </div>
                <span className="badge">열기</span>
              </div>
            </Link>
          ))}
        </div>

        {totalPages > 1 ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >
              이전
            </button>
            <span className="badge">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              다음
            </button>
          </div>
        ) : null}
      </div>
    </main>
  )
}
