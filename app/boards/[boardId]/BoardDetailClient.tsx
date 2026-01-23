'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import ImageUploadButton from '@/app/components/ImageUploadButton'

type Status = 'TODO' | 'DOING' | 'DONE'

type Board = {
  id: string
  name: string
  description: string | null

  singleSchedule: boolean
  scheduleStatus: Status
  scheduleStartAt: string | null
  scheduleEndAt: string | null
  scheduleAllDay: boolean
}

type Post = {
  id: string
  slug?: string | null
  title: string
  status: Status
  isSecret: boolean
  startAt: string | null
  endAt: string | null
  createdAt: string
}

type CreatePostBody = {
  title: string
  contentMd: string
  status: Status
  isSecret: boolean
  secretPassword?: string
  startAt?: string | null
  endAt?: string | null
  allDay?: boolean
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

function toIsoOrNull(datetimeLocal: string): string | null {
  if (!datetimeLocal) return null
  const d = new Date(datetimeLocal)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export default function BoardDetailClient({
  board,
  initialPosts,
  canCreate,
}: {
  board: Board
  initialPosts: Post[]
  canCreate: boolean
}) {
  const [posts, setPosts] = useState<Post[]>(initialPosts)

  // ===== 보드 수정/삭제 =====
  const [boardName, setBoardName] = useState(board.name)
  const [boardDesc, setBoardDesc] = useState(board.description ?? '')
  const [boardSaving, setBoardSaving] = useState(false)

  // ===== 단일 일정(보드 자체 일정) =====
  const [singleSchedule, setSingleSchedule] = useState<boolean>(
    board.singleSchedule
  )
  const [scheduleStatus, setScheduleStatus] = useState<Status>(
    board.scheduleStatus ?? 'TODO'
  )
  const [scheduleStartAt, setScheduleStartAt] = useState<string>(
    toDatetimeLocalValue(board.scheduleStartAt)
  )
  const [scheduleEndAt, setScheduleEndAt] = useState<string>(
    toDatetimeLocalValue(board.scheduleEndAt)
  )
  const [scheduleAllDay, setScheduleAllDay] = useState<boolean>(
    !!board.scheduleAllDay
  )

  const scheduleStartIso = useMemo(
    () => toIsoOrNull(scheduleStartAt),
    [scheduleStartAt]
  )
  const scheduleEndIso = useMemo(
    () => toIsoOrNull(scheduleEndAt),
    [scheduleEndAt]
  )

  const saveBoard = async () => {
    setBoardSaving(true)
    const res = await fetch(`/api/boards/${board.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: boardName,
        description: boardDesc ? boardDesc : null,
      }),
    })
    const data = await res.json().catch(() => null)
    setBoardSaving(false)

    if (!res.ok) {
      alert(data?.message ?? '보드 수정 실패')
      return
    }

    alert('보드 저장 완료')
  }

  const deleteBoard = async () => {
    const ok = confirm('이 보드를 삭제할까요? (보드 글/댓글도 같이 삭제됨)')
    if (!ok) return

    setBoardSaving(true)
    const res = await fetch(`/api/boards/${board.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    setBoardSaving(false)

    if (!res.ok) {
      alert(data?.message ?? '보드 삭제 실패')
      return
    }

    window.location.href = '/boards'
  }

  const saveSchedule = async () => {
    if (singleSchedule && !scheduleStartIso) {
      alert('단일 일정 모드는 시작일시가 필수임')
      return
    }

    setBoardSaving(true)
    const res = await fetch(`/api/boards/${board.id}/schedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        singleSchedule,
        scheduleStatus,
        scheduleStartAt: singleSchedule ? scheduleStartIso : null,
        scheduleEndAt: singleSchedule ? scheduleEndIso : null,
        scheduleAllDay: singleSchedule ? scheduleAllDay : false,
      }),
    })
    const data = await res.json().catch(() => null)
    setBoardSaving(false)

    if (!res.ok) {
      alert(data?.message ?? '일정 저장 실패')
      return
    }

    alert('단일 일정 저장 완료')
  }

  const clearSchedule = async () => {
    const ok = confirm('단일 일정을 제거하고(OFF) 일반 보드로 바꿀까요?')
    if (!ok) return

    setBoardSaving(true)
    const res = await fetch(`/api/boards/${board.id}/schedule`, {
      method: 'DELETE',
    })
    const data = await res.json().catch(() => null)
    setBoardSaving(false)

    if (!res.ok) {
      alert(data?.message ?? '제거 실패')
      return
    }

    // 화면 상태도 맞춰주기
    setSingleSchedule(false)
    setScheduleStatus('TODO')
    setScheduleStartAt('')
    setScheduleEndAt('')
    setScheduleAllDay(false)

    alert('단일 일정 제거 완료')
  }

  // ===== 글 생성/목록 =====
  const [title, setTitle] = useState('')
  const [contentMd, setContentMd] = useState('')
  const [isSecret, setIsSecret] = useState(false)
  const [secretPassword, setSecretPassword] = useState('')
  const [status, setStatus] = useState<Status>('TODO')
  const [startAt, setStartAt] = useState<string>('')
  const [endAt, setEndAt] = useState<string>('')
  const [allDay, setAllDay] = useState(false)

  const reload = async () => {
    const res = await fetch(`/api/boards/${board.id}/posts`)
    if (res.ok) setPosts(await res.json())
  }

  const create = async () => {
    if (singleSchedule) {
      alert('이 보드는 단일 일정 모드라 post 일정 생성이 막혀있음')
      return
    }

    const payload: CreatePostBody = {
      title,
      contentMd,
      status,
      isSecret,
      secretPassword: isSecret ? secretPassword : undefined,
      startAt: startAt ? new Date(startAt).toISOString() : null,
      endAt: endAt ? new Date(endAt).toISOString() : null,
      allDay,
    }

    const res = await fetch(`/api/boards/${board.id}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.status === 401) {
      alert('로그인 후, 보드 소유자만 작성할 수 있습니다.')
      return
    }

    if (res.ok) {
      setTitle('')
      setContentMd('')
      setIsSecret(false)
      setSecretPassword('')
      setStatus('TODO')
      setStartAt('')
      setEndAt('')
      setAllDay(false)
      await reload()
      return
    }

    const err = await res.json().catch(() => ({}))
    alert(err.message ?? '생성 실패')
  }

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <Link href="/boards">← boards</Link>

      <h1 style={{ marginTop: 12 }}>{board.name}</h1>
      {board.description ? <p>{board.description}</p> : null}

      {canCreate ? (
        <section
          style={{
            marginTop: 14,
            border: '1px solid #eee',
            borderRadius: 10,
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>보드 설정</div>

          <div style={{ display: 'grid', gap: 8 }}>
            <input
              value={boardName}
              onChange={(e) => setBoardName(e.target.value)}
              placeholder="보드 이름"
              style={{ padding: 8 }}
            />

            <input
              value={boardDesc}
              onChange={(e) => setBoardDesc(e.target.value)}
              placeholder="설명(선택)"
              style={{ padding: 8 }}
            />

            <div
              style={{
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <input
                      type="checkbox"
                      checked={scheduleAllDay}
                      onChange={(e) => setScheduleAllDay(e.target.checked)}
                    />
                    하루종일
                  </label>
                </>
              ) : (
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  OFF면 기존처럼 post 일정 여러개 생성 가능
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button disabled={boardSaving} onClick={saveBoard}>
                보드 저장
              </button>

              <button disabled={boardSaving} onClick={saveSchedule}>
                단일 일정 저장
              </button>

              <button disabled={boardSaving} onClick={clearSchedule}>
                단일 일정 제거
              </button>

              <button
                disabled={boardSaving}
                onClick={deleteBoard}
                style={{ marginLeft: 'auto' }}
              >
                보드 삭제
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {/* ✅ 단일 일정 모드일 땐 post 생성 UI 숨김 */}
      {!singleSchedule ? (
        <section
          style={{ marginTop: 16, borderTop: '1px solid #ddd', paddingTop: 16 }}
        >
          <h3>새 일정/할일</h3>

          {canCreate ? (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="제목"
                  style={{ minWidth: 260 }}
                />

                <ImageUploadButton
                  onUploaded={(url) => {
                    setContentMd((prev) => `${prev}\n\n![](${url})\n`)
                  }}
                />

                <textarea
                  value={contentMd}
                  onChange={(e) => setContentMd(e.target.value)}
                  placeholder="본문 (Markdown 지원)"
                  rows={6}
                  style={{
                    width: '100%',
                    marginTop: 10,
                    padding: 10,
                    borderRadius: 8,
                    border: '1px solid #ddd',
                    resize: 'vertical',
                  }}
                />

                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Status)}
                >
                  <option value="TODO">TODO</option>
                  <option value="DOING">DOING</option>
                  <option value="DONE">DONE</option>
                </select>

                <label
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <input
                    type="checkbox"
                    checked={isSecret}
                    onChange={(e) => setIsSecret(e.target.checked)}
                  />
                  비밀글
                </label>

                {isSecret ? (
                  <input
                    value={secretPassword}
                    onChange={(e) => setSecretPassword(e.target.value)}
                    placeholder="비밀번호"
                    type="password"
                  />
                ) : null}

                <button onClick={create}>생성</button>
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                />
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                />
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(e) => setAllDay(e.target.checked)}
                  />
                  하루종일
                </label>
              </div>
            </>
          ) : (
            <p style={{ opacity: 0.7, margin: 0 }}>
              로그인 후, 보드 소유자만 작성 가능
            </p>
          )}
        </section>
      ) : (
        <section
          style={{ marginTop: 16, borderTop: '1px solid #ddd', paddingTop: 16 }}
        >
          <h3>단일 일정 모드</h3>
          <p style={{ opacity: 0.75, marginTop: 6 }}>
            이 보드는 <b>post 일정 생성이 막혀있고</b>, 캘린더에는{' '}
            <b>boardId 일정</b>으로만 표시됨.
          </p>
        </section>
      )}

      <section style={{ marginTop: 24 }}>
        <h3>목록</h3>
        {singleSchedule ? (
          <p style={{ opacity: 0.75 }}>
            단일 일정 모드에서는 post 목록이 의미 없어서 여기선 표시만
            유지함(생성은 불가).
          </p>
        ) : null}

        <ul>
          {posts.map((p) => (
            <li key={p.id} style={{ marginBottom: 8 }}>
              <Link
                href={`/boards/${board.id}/${encodeURIComponent(p.slug ?? p.id)}`}
              >
                [{p.status}] {p.title} {p.isSecret ? '🔒' : ''}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
