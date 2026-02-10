'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import ImageUploadButton from '@/app/components/ImageUploadButton'
import MarkdownEditor from '@/app/components/MarkdownEditor'

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
  backHref = '/boards',
  backLabel = 'boards',
}: {
  board: Board
  initialPosts: Post[]
  canCreate: boolean
  backHref?: string
  backLabel?: string
}) {
  const POST_PAGE_SIZE = 10
  const [posts, setPosts] = useState<Post[]>(initialPosts)
  const [postSortOrder, setPostSortOrder] = useState<'desc' | 'asc'>('desc')
  const [postPage, setPostPage] = useState(1)

  const [boardName, setBoardName] = useState(board.name)
  const [boardDesc, setBoardDesc] = useState(board.description ?? '')
  const [boardSaving, setBoardSaving] = useState(false)

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

    setSingleSchedule(false)
    setScheduleStatus('TODO')
    setScheduleStartAt('')
    setScheduleEndAt('')
    setScheduleAllDay(false)

    alert('단일 일정 제거 완료')
  }

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

  const sortedPosts = useMemo(() => {
    const copied = [...posts]
    copied.sort((a, b) => {
      const at = new Date(a.createdAt).getTime()
      const bt = new Date(b.createdAt).getTime()
      return postSortOrder === 'desc' ? bt - at : at - bt
    })
    return copied
  }, [posts, postSortOrder])

  const postTotalPages = Math.max(
    1,
    Math.ceil(sortedPosts.length / POST_PAGE_SIZE)
  )
  const currentPostPage = Math.min(postPage, postTotalPages)
  const pagedPosts = useMemo(() => {
    const start = (currentPostPage - 1) * POST_PAGE_SIZE
    return sortedPosts.slice(start, start + POST_PAGE_SIZE)
  }, [sortedPosts, currentPostPage])

  useEffect(() => {
    setPostPage(1)
  }, [postSortOrder])

  useEffect(() => {
    setPostPage((prev) => Math.min(prev, postTotalPages))
  }, [postTotalPages])

  return (
    <main className="container-page py-8">
      <div className="surface card-pad">
        <Link href={backHref} className="btn btn-outline">
          ← {backLabel}
        </Link>

        <header className="mt-4">
          <h1 className="text-2xl font-bold">{board.name}</h1>
          {board.description ? (
            <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
              {board.description}
            </p>
          ) : null}
        </header>

        {canCreate ? (
          <section className="card card-pad mt-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-extrabold">보드 설정</div>
              {singleSchedule ? (
                <span className="badge">단일 일정 모드</span>
              ) : (
                <span className="badge">일반 모드</span>
              )}
            </div>

            <div className="mt-4 grid gap-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <div className="text-sm font-medium">보드 이름</div>
                  <input
                    className="input"
                    value={boardName}
                    onChange={(e) => setBoardName(e.target.value)}
                    placeholder="보드 이름"
                  />
                </div>
                <div className="grid gap-2">
                  <div className="text-sm font-medium">설명(선택)</div>
                  <input
                    className="input"
                    value={boardDesc}
                    onChange={(e) => setBoardDesc(e.target.value)}
                    placeholder="설명(선택)"
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
                      className="select w-auto"
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
                      className="input w-auto"
                      type="datetime-local"
                      value={scheduleStartAt}
                      onChange={(e) => setScheduleStartAt(e.target.value)}
                      title="시작"
                    />
                    <input
                      className="input w-auto"
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
                  </>
                ) : (
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    OFF면 기존처럼 post 일정 여러개 생성 가능
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-primary"
                  disabled={boardSaving}
                  onClick={saveBoard}
                >
                  보드 저장
                </button>
                <button
                  className="btn"
                  disabled={boardSaving}
                  onClick={saveSchedule}
                >
                  단일 일정 저장
                </button>
                <button
                  className="btn"
                  disabled={boardSaving}
                  onClick={clearSchedule}
                >
                  단일 일정 제거
                </button>
                <button
                  className="btn ml-auto"
                  disabled={boardSaving}
                  onClick={deleteBoard}
                >
                  보드 삭제
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {!singleSchedule ? (
          <section className="card card-pad mt-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold">새 일정/할일</h3>
              {!canCreate ? <span className="badge">로그인 필요</span> : null}
            </div>

            {canCreate ? (
              <div className="mt-4 grid gap-3">
                <div className="grid gap-2">
                  <div className="text-sm font-medium">제목</div>
                  <input
                    className="input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="제목"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <ImageUploadButton
                    onUploaded={(url) => {
                      setContentMd((prev) => `${prev}\n\n![](${url})\n`)
                    }}
                  />

                  <select
                    className="select w-auto"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Status)}
                  >
                    <option value="TODO">TODO</option>
                    <option value="DOING">DOING</option>
                    <option value="DONE">DONE</option>
                  </select>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={isSecret}
                      onChange={(e) => setIsSecret(e.target.checked)}
                    />
                    비밀글
                  </label>

                  {isSecret ? (
                    <input
                      className="input w-auto"
                      value={secretPassword}
                      onChange={(e) => setSecretPassword(e.target.value)}
                      placeholder="비밀번호"
                      type="password"
                    />
                  ) : null}
                </div>

                <div className="grid gap-2">
                  <div className="text-sm font-medium">본문 (Markdown)</div>
                  <MarkdownEditor
                    value={contentMd}
                    onChange={setContentMd}
                    placeholder="본문 (Markdown 지원)"
                    rows={8}
                    previewEmptyText="미리보기할 본문이 없습니다."
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="grid gap-2 sm:col-span-2">
                    <div className="text-sm font-medium">일정</div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        className="input"
                        type="datetime-local"
                        value={startAt}
                        onChange={(e) => setStartAt(e.target.value)}
                      />
                      <input
                        className="input"
                        type="datetime-local"
                        value={endAt}
                        onChange={(e) => setEndAt(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <div className="text-sm font-medium">옵션</div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={allDay}
                        onChange={(e) => setAllDay(e.target.checked)}
                      />
                      하루종일
                    </label>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button className="btn btn-primary" onClick={create}>
                    생성
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>
                이 보드는 읽기 전용입니다. (공유받은 보드 또는 권한 없음)
              </p>
            )}
          </section>
        ) : (
          <section className="card card-pad mt-6">
            <h3 className="text-lg font-bold">단일 일정 모드</h3>
            <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
              이 보드는 <b>post 일정 생성이 막혀있고</b>, 캘린더에는{' '}
              <b>boardId 일정</b>으로만 표시됨.
            </p>
          </section>
        )}

        <section className="mt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold">목록</h3>
              <span className="badge">{posts.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: 'var(--muted)' }}>
                정렬
              </span>
              <select
                className="select w-auto"
                value={postSortOrder}
                onChange={(e) =>
                  setPostSortOrder(e.target.value as 'desc' | 'asc')
                }
              >
                <option value="desc">최신순</option>
                <option value="asc">오래된순</option>
              </select>
            </div>
          </div>

          {singleSchedule ? (
            <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
              단일 일정 모드에서는 post 생성이 불가(표시만 유지)
            </p>
          ) : null}

          <div className="mt-4 grid gap-3">
            {pagedPosts.map((p) => (
              <Link
                key={p.id}
                href={`/boards/${board.id}/${encodeURIComponent(p.slug ?? p.id)}`}
                className="card card-pad block no-underline hover:no-underline"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="badge">{p.status}</span>
                      {p.isSecret ? (
                        <span className="badge">SECRET</span>
                      ) : null}
                    </div>
                    <div className="mt-2 font-semibold truncate">{p.title}</div>
                  </div>
                  <span className="badge">열기</span>
                </div>
              </Link>
            ))}
          </div>

          {postTotalPages > 1 ? (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setPostPage((p) => Math.max(1, p - 1))}
                disabled={currentPostPage <= 1}
              >
                이전
              </button>
              <span className="badge">
                {currentPostPage} / {postTotalPages}
              </span>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() =>
                  setPostPage((p) => Math.min(postTotalPages, p + 1))
                }
                disabled={currentPostPage >= postTotalPages}
              >
                다음
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}
