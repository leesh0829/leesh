'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toHumanHttpError } from '@/app/lib/httpErrorText'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
import { useSession } from 'next-auth/react'
import { displayUserLabel } from '@/app/lib/userLabel'
import MarkdownEditor from '@/app/components/MarkdownEditor'

type Post = {
  id: string
  title: string
  contentMd: string | null
  isSecret: boolean
  status: 'TODO' | 'DOING' | 'DONE'
  createdAt: string
  locked?: boolean
  startAt?: string | null
  endAt?: string | null
  allDay?: boolean
  canEdit?: boolean
}

type Comment = {
  id: string
  content: string
  createdAt: string
  author: { name: string | null; email: string | null }
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

function formatKoreanDateTimeWithMs(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'invalid date'

  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')

  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}.${ms}`
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

export default function PostDetailClient({
  boardName,
  boardId,
  post,
}: {
  boardName: string
  boardId: string
  post: Post
}) {
  const router = useRouter()
  const { data: session } = useSession()
  const myEmail = session?.user?.email ?? null

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingCommentText, setEditingCommentText] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)

  const startCommentEdit = (c: Comment) => {
    setEditingCommentId(c.id)
    setEditingCommentText(c.content)
  }

  const saveCommentEdit = async () => {
    if (!editingCommentId) return
    const text = editingCommentText.trim()
    if (!text) return

    setCommentSaving(true)
    setCommentsError(null)

    const res = await fetch(
      `/api/boards/${boardId}/posts/${postState.id}/comments/${editingCommentId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      }
    )

    if (!res.ok) {
      const payload = await readJsonSafely(res)
      const msg = extractApiMessage(payload) ?? '댓글 수정 실패'
      const human = toHumanHttpError(res.status, msg)
      setCommentsError(human ?? `${res.status} · ${msg}`)
      setCommentSaving(false)
      return
    }

    setEditingCommentId(null)
    setEditingCommentText('')
    setCommentSaving(false)
    await loadComments()
  }

  const deleteComment = async (id: string) => {
    const ok = window.confirm('댓글 삭제할까요?')
    if (!ok) return

    setCommentsError(null)
    const res = await fetch(
      `/api/boards/${boardId}/posts/${postState.id}/comments/${id}`,
      { method: 'DELETE' }
    )

    if (!res.ok) {
      const payload = await readJsonSafely(res)
      const msg = extractApiMessage(payload) ?? '댓글 삭제 실패'
      const human = toHumanHttpError(res.status, msg)
      setCommentsError(human ?? `${res.status} · ${msg}`)
      return
    }

    await loadComments()
  }

  const [postState, setPostState] = useState<Post>(post)

  useEffect(() => {
    setPostState(post)
  }, [post])

  const locked = useMemo(
    () => postState.locked ?? postState.isSecret,
    [postState.locked, postState.isSecret]
  )

  const [pw, setPw] = useState('')
  const [unlocking, setUnlocking] = useState(false)

  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [commentsError, setCommentsError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [editTitle, setEditTitle] = useState(postState.title)
  const [editContent, setEditContent] = useState(postState.contentMd ?? '')
  const [editStatus, setEditStatus] = useState<Post['status']>(postState.status)

  useEffect(() => {
    if (editing) return
    setEditTitle(postState.title)
    setEditContent(postState.contentMd ?? '')
    setEditStatus(postState.status)
  }, [
    postState.id,
    postState.title,
    postState.contentMd,
    postState.status,
    editing,
  ])

  const [startLocal, setStartLocal] = useState(() =>
    toDatetimeLocalValue(postState.startAt ?? null)
  )
  const [endLocal, setEndLocal] = useState(() =>
    toDatetimeLocalValue(postState.endAt ?? null)
  )
  const [allDay, setAllDay] = useState(() => !!postState.allDay)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [scheduleSaving, setScheduleSaving] = useState(false)

  useEffect(() => {
    setStartLocal(toDatetimeLocalValue(postState.startAt ?? null))
    setEndLocal(toDatetimeLocalValue(postState.endAt ?? null))
    setAllDay(!!postState.allDay)
    setScheduleError(null)
  }, [postState.id, postState.startAt, postState.endAt, postState.allDay])

  const loadComments = async () => {
    setCommentsError(null)
    const res = await fetch(
      `/api/boards/${boardId}/posts/${postState.id}/comments`
    )
    if (res.ok) {
      setComments(await res.json())
      return
    }
    const payload = await readJsonSafely(res)
    const msg = extractApiMessage(payload) ?? '댓글 처리 실패'
    const human = toHumanHttpError(res.status, msg)
    setCommentsError(human ?? `${res.status} · ${msg}`)
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      setCommentsError(null)
      const res = await fetch(
        `/api/boards/${boardId}/posts/${postState.id}/comments`
      )
      if (!alive) return
      if (res.ok) {
        setComments(await res.json())
        return
      }
      const payload = await readJsonSafely(res)
      const msg = extractApiMessage(payload) ?? '댓글 처리 실패'
      const human = toHumanHttpError(res.status, msg)
      setCommentsError(human ?? `${res.status} · ${msg}`)
    })()

    return () => {
      alive = false
    }
  }, [boardId, postState.id])

  const saveSchedule = async () => {
    setScheduleSaving(true)
    setScheduleError(null)

    const startAt = startLocal ? new Date(startLocal).toISOString() : null
    const endAt = endLocal ? new Date(endLocal).toISOString() : null

    try {
      const res = await fetch(`/api/boards/${boardId}/posts/${postState.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startAt, endAt, allDay }),
      })

      if (!res.ok) {
        const payload = await readJsonSafely(res)
        const msg = extractApiMessage(payload) ?? '일정 저장 실패'
        const human = toHumanHttpError(res.status, msg)
        setScheduleError(human ?? `${res.status} · ${msg}`)
        return
      }

      const updated = (await res.json().catch(() => null)) as {
        startAt?: string | null
        endAt?: string | null
        allDay?: boolean
      } | null

      if (updated) {
        setPostState((prev) => ({
          ...prev,
          startAt: updated.startAt ?? prev.startAt ?? null,
          endAt: updated.endAt ?? prev.endAt ?? null,
          allDay:
            typeof updated.allDay === 'boolean' ? updated.allDay : prev.allDay,
        }))
      }

      router.refresh()
    } finally {
      setScheduleSaving(false)
    }
  }

  const saveEdit = async () => {
    if (!postState.canEdit) return
    setSavingEdit(true)
    setEditError(null)

    try {
      const res = await fetch(`/api/boards/${boardId}/posts/${postState.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          contentMd: editContent,
          status: editStatus,
        }),
      })

      if (!res.ok) {
        const payload = await readJsonSafely(res)
        const msg = extractApiMessage(payload) ?? '수정 저장 실패'
        const human = toHumanHttpError(res.status, msg)
        setEditError(human ?? `${res.status} · ${msg}`)
        return
      }

      const updated = (await res.json().catch(() => null)) as {
        title?: string
        contentMd?: string | null
        status?: Post['status']
      } | null

      setPostState((prev) => ({
        ...prev,
        title: updated?.title ?? editTitle,
        contentMd: updated?.contentMd ?? editContent,
        status: updated?.status ?? editStatus,
      }))

      setEditing(false)
      router.refresh()
    } finally {
      setSavingEdit(false)
    }
  }

  const deletePost = async () => {
    if (!postState.canEdit) return
    const ok = window.confirm('이 글을 삭제할까요?')
    if (!ok) return

    setSavingEdit(true)
    setEditError(null)

    try {
      const res = await fetch(`/api/boards/${boardId}/posts/${postState.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const payload = await readJsonSafely(res)
        const msg = extractApiMessage(payload) ?? '삭제 실패'
        const human = toHumanHttpError(res.status, msg)
        setEditError(human ?? `${res.status} · ${msg}`)
        return
      }

      router.push(`/boards/${boardId}`)
      router.refresh()
    } finally {
      setSavingEdit(false)
    }
  }

  const unlock = async () => {
    setUnlocking(true)
    try {
      const res = await fetch(
        `/api/boards/${boardId}/posts/${postState.id}/unlock`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pw }),
        }
      )

      if (res.ok) {
        setPw('')
        router.refresh()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.message ?? '비밀번호가 틀렸습니다.')
      }
    } finally {
      setUnlocking(false)
    }
  }

  const addComment = async () => {
    const res = await fetch(
      `/api/boards/${boardId}/posts/${postState.id}/comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newComment }),
      }
    )

    if (res.ok) {
      setNewComment('')
      loadComments()
      return
    }

    const payload = await readJsonSafely(res)
    const msg = extractApiMessage(payload) ?? '댓글 처리 실패'
    const human = toHumanHttpError(res.status, msg)
    setCommentsError(human ?? `${res.status} · ${msg}`)
  }

  return (
    <main className="container-page py-8">
      <div className="surface card-pad card-hover-border-only">
        <Link href={`/boards/${boardId}`} className="btn btn-outline">
          ← {boardName}
        </Link>

        <header className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge">{postState.status}</span>
            {postState.isSecret ? <span className="badge">SECRET</span> : null}
          </div>
          <h1 className="mt-2 text-2xl font-bold wrap-break-word">
            {postState.title}
          </h1>

          {postState.canEdit ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setEditing((v) => !v)}
              >
                {editing ? '편집 닫기' : '수정'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={deletePost}
                disabled={savingEdit}
              >
                삭제
              </button>
            </div>
          ) : null}

          {editError ? (
            <div className="mt-3 text-sm" style={{ color: 'crimson' }}>
              {editError}
            </div>
          ) : null}
        </header>

        {postState.canEdit ? (
          <section className="card card-pad mt-6 card-hover-border-only">
            <div className="flex items-center justify-between">
              <div className="text-sm font-extrabold">일정</div>
              <span className="badge">post 일정</span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="grid gap-2 sm:col-span-2">
                <div className="text-xs" style={{ color: 'var(--muted)' }}>
                  시작/종료
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    className="input"
                    type="datetime-local"
                    value={startLocal}
                    onChange={(e) => setStartLocal(e.target.value)}
                  />
                  <input
                    className="input"
                    type="datetime-local"
                    value={endLocal}
                    onChange={(e) => setEndLocal(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <div className="text-xs" style={{ color: 'var(--muted)' }}>
                  옵션
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(e) => setAllDay(e.target.checked)}
                  />
                  allDay
                </label>

                <button
                  className="btn btn-primary"
                  onClick={saveSchedule}
                  disabled={scheduleSaving}
                >
                  {scheduleSaving ? '저장중...' : '일정 저장'}
                </button>
              </div>
            </div>

            {scheduleError ? (
              <div className="mt-3 text-sm" style={{ color: 'crimson' }}>
                {scheduleError}
              </div>
            ) : null}
          </section>
        ) : null}

        {locked ? (
          <section className="card card-pad mt-6">
            <div className="text-sm" style={{ color: 'var(--muted)' }}>
              비밀글입니다. 비밀번호를 입력하세요.
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                className="input"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="비밀번호"
              />
              <button
                className="btn btn-primary"
                onClick={unlock}
                disabled={unlocking || !pw}
              >
                {unlocking ? '확인 중...' : '열람'}
              </button>
            </div>
          </section>
        ) : (
          <section className="mt-6">
            {editing ? (
              <div className="card card-pad grid gap-3">
                <div className="grid gap-2">
                  <div className="text-sm font-medium">제목</div>
                  <input
                    className="input"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <div className="text-sm font-medium">상태</div>
                  <select
                    className="select"
                    value={editStatus}
                    onChange={(e) =>
                      setEditStatus(e.target.value as Post['status'])
                    }
                  >
                    <option value="TODO">TODO</option>
                    <option value="DOING">DOING</option>
                    <option value="DONE">DONE</option>
                  </select>
                </div>

                <div className="grid gap-2">
                  <div className="text-sm font-medium">본문 (Markdown)</div>
                  <MarkdownEditor
                    value={editContent}
                    onChange={setEditContent}
                    rows={12}
                    previewEmptyText="미리보기할 본문이 없습니다."
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={saveEdit}
                    disabled={savingEdit}
                  >
                    {savingEdit ? '저장중...' : '저장'}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setEditTitle(postState.title)
                      setEditContent(postState.contentMd ?? '')
                      setEditStatus(postState.status)
                      setEditing(false)
                      setEditError(null)
                    }}
                    disabled={savingEdit}
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <article className="card card-pad card-hover-border-only">
                <div className="markdown-body">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkBreaks]}
                    rehypePlugins={[rehypeHighlight]}
                    components={{
                      img: ({ alt, ...props }) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          {...props}
                          alt={alt ?? ''}
                          style={{
                            maxWidth: '100%',
                            height: 'auto',
                            borderRadius: 12,
                          }}
                        />
                      ),
                    }}
                  >
                    {postState.contentMd || '(본문 없음)'}
                  </ReactMarkdown>
                </div>
              </article>
            )}
          </section>
        )}

        <section className="card card-pad mt-6 card-hover-border-only">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">댓글</h3>
            <span className="badge">{comments.length}</span>
          </div>

          {commentsError ? (
            <div className="mt-3 text-sm" style={{ color: 'crimson' }}>
              {commentsError}
            </div>
          ) : null}

          <div className="mt-4 grid gap-2">
            <textarea
              className="textarea"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent?.isComposing) return
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  addComment()
                }
              }}
              placeholder="댓글 입력 (Enter=전송, Shift+Enter=줄바꿈)"
              rows={3}
            />
            <div className="flex justify-end">
              <button className="btn btn-primary" onClick={addComment}>
                등록
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {comments.map((c) => {
              const canMine = myEmail && c.author?.email === myEmail
              const isEditing = editingCommentId === c.id

              return (
                <div key={c.id} className="card p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>
                      {displayUserLabel(
                        c.author?.name,
                        c.author?.email,
                        'unknown'
                      )}{' '}
                      · {formatKoreanDateTimeWithMs(c.createdAt)}
                    </div>

                    {canMine ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => startCommentEdit(c)}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => deleteComment(c.id)}
                        >
                          삭제
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {isEditing ? (
                    <div className="mt-2 grid gap-2">
                      <textarea
                        className="textarea"
                        value={editingCommentText}
                        onChange={(e) => setEditingCommentText(e.target.value)}
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={saveCommentEdit}
                          disabled={commentSaving}
                        >
                          {commentSaving ? '저장중...' : '저장'}
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            setEditingCommentId(null)
                            setEditingCommentText('')
                          }}
                          disabled={commentSaving}
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap text-sm leading-6">
                      {c.content}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </main>
  )
}
