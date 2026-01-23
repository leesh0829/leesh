'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

type Board = {
  id: string
  name: string
  description: string | null
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
  const [boards, setBoards] = useState(initialBoards)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  // ✅ 단일 일정 보드 옵션
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

  const reload = async () => {
    const res = await fetch('/api/boards')
    if (res.ok) setBoards(await res.json())
  }

  const create = async () => {
    if (!name.trim()) {
      alert('보드 이름을 입력해줘')
      return
    }

    // ✅ 단일 일정 모드면 startAt 필수(백엔드도 이렇게 요구하는게 맞음)
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
      return
    }

    const err = await res.json().catch(() => ({}))
    alert(err?.message ?? '생성 실패')
  }

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <h1>Boards</h1>

      {canCreate ? (
        <section
          style={{
            marginTop: 12,
            padding: 12,
            border: '1px solid #eee',
            borderRadius: 10,
          }}
        >
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="보드 이름"
              />
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="설명"
              />
              <button onClick={create}>생성</button>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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
                    type="datetime-local"
                    value={scheduleStartAt}
                    onChange={(e) => setScheduleStartAt(e.target.value)}
                    title="시작"
                  />
                  <input
                    type="datetime-local"
                    value={scheduleEndAt}
                    onChange={(e) => setScheduleEndAt(e.target.value)}
                    title="종료(선택)"
                  />

                  <label
                    style={{ display: 'flex', gap: 6, alignItems: 'center' }}
                  >
                    <input
                      type="checkbox"
                      checked={scheduleAllDay}
                      onChange={(e) => setScheduleAllDay(e.target.checked)}
                    />
                    하루종일
                  </label>

                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    단일 일정 보드는 <b>postId 일정 생성 불가</b> / 캘린더엔{' '}
                    <b>boardId 일정</b>으로만 뜸
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </section>
      ) : (
        <p style={{ opacity: 0.7, marginTop: 12 }}>
          로그인하면 보드를 만들 수 있음
        </p>
      )}

      <ul style={{ marginTop: 16, lineHeight: 1.9 }}>
        {boards.map((b) => (
          <li key={b.id}>
            <Link href={`/boards/${b.id}`}>{b.name}</Link>
            <span style={{ opacity: 0.6, marginLeft: 8 }}>
              by{' '}
              {b.owner?.name ??
                (b.owner?.email ? b.owner.email.split('@')[0] : 'unknown')}
            </span>
          </li>
        ))}
      </ul>
    </main>
  )
}
