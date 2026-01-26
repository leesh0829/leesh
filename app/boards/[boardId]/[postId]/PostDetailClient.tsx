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

  // 화면 즉시 반영용: 로컬 post state
  const [postState, setPostState] = useState<Post>(post)

  // 서버에서 refresh로 props가 바뀌면 동기화
  useEffect(() => {
    setPostState(post)
  }, [post])

  const locked = useMemo(
    () => postState.locked ?? postState.isSecret,
    [postState.locked, postState.isSecret]
  )

  // 비밀글 unlock
  const [pw, setPw] = useState('')
  const [unlocking, setUnlocking] = useState(false)

  // 댓글
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [commentsError, setCommentsError] = useState<string | null>(null)

  // 수정/삭제 (제목/본문/상태)
  const [editing, setEditing] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [editTitle, setEditTitle] = useState(postState.title)
  const [editContent, setEditContent] = useState(postState.contentMd ?? '')
  const [editStatus, setEditStatus] = useState<Post['status']>(postState.status)

  // postState가 변하면 편집 입력값도 동기화(편집중이 아닐 때만)
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

  // 일정 편집
  const [startLocal, setStartLocal] = useState(() =>
    toDatetimeLocalValue(postState.startAt ?? null)
  )
  const [endLocal, setEndLocal] = useState(() =>
    toDatetimeLocalValue(postState.endAt ?? null)
  )
  const [allDay, setAllDay] = useState(() => !!postState.allDay)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [scheduleSaving, setScheduleSaving] = useState(false)

  // postState 변경 시 일정 입력도 동기화
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

      // 서버 응답 반영(즉시 화면 반영)
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

      // 서버 응답(이제 contentMd도 내려옴) 반영 -> 즉시 화면 반영
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
    <main style={{ padding: 24, maxWidth: 900 }}>
      <Link href={`/boards/${boardId}`}>← {boardName}</Link>

      <h1 style={{ marginTop: 12 }}>
        [{postState.status}] {postState.title} {postState.isSecret ? '🔒' : ''}
      </h1>

      {/* 수정/삭제 버튼 */}
      {postState.canEdit ? (
        <div
          style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}
        >
          <button type="button" onClick={() => setEditing((v) => !v)}>
            {editing ? '편집 닫기' : '수정'}
          </button>
          <button type="button" onClick={deletePost} disabled={savingEdit}>
            삭제
          </button>
        </div>
      ) : null}

      {editError ? (
        <p style={{ color: 'crimson', marginTop: 10 }}>{editError}</p>
      ) : null}

      {/* 일정 */}
      {postState.canEdit ? (
        <section
          style={{
            marginTop: 12,
            padding: 12,
            border: '1px solid #eee',
            borderRadius: 10,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>일정</div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
            />
            <input
              type="datetime-local"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
              />
              allDay
            </label>

            <button onClick={saveSchedule} disabled={scheduleSaving}>
              {scheduleSaving ? '저장중...' : '일정 저장'}
            </button>
          </div>

          {scheduleError ? (
            <p style={{ color: 'crimson', marginTop: 10 }}>{scheduleError}</p>
          ) : null}
        </section>
      ) : null}

      {/* 본문 영역 */}
      {locked ? (
        <section style={{ marginTop: 16 }}>
          <p>비밀글입니다. 비밀번호를 입력하세요.</p>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="비밀번호"
          />
          <button
            onClick={unlock}
            disabled={unlocking || !pw}
            style={{ marginLeft: 8 }}
          >
            {unlocking ? '확인 중...' : '열람'}
          </button>
        </section>
      ) : (
        <section style={{ marginTop: 16 }}>
          {editing ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                제목
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                상태
                <select
                  value={editStatus}
                  onChange={(e) =>
                    setEditStatus(e.target.value as Post['status'])
                  }
                >
                  <option value="TODO">TODO</option>
                  <option value="DOING">DOING</option>
                  <option value="DONE">DONE</option>
                </select>
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                본문 (Markdown)
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={10}
                  style={{
                    width: '100%',
                    padding: 10,
                    borderRadius: 8,
                    border: '1px solid #ddd',
                    resize: 'vertical',
                  }}
                />
              </label>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={saveEdit} disabled={savingEdit}>
                  {savingEdit ? '저장중...' : '저장'}
                </button>
                <button
                  type="button"
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
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                img: (props) => (
                  <img
                    {...props}
                    style={{
                      maxWidth: '100%',
                      height: 'auto',
                      borderRadius: 8,
                    }}
                  />
                ),
              }}
            >
              {postState.contentMd || '(본문 없음)'}
            </ReactMarkdown>
          )}
        </section>
      )}

      <hr style={{ margin: '24px 0' }} />

      {/* 댓글 */}
      <section>
        <h3>댓글</h3>

        {commentsError ? (
          <p style={{ color: 'crimson', marginTop: 8 }}>{commentsError}</p>
        ) : null}

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent?.isComposing) return

              // Enter 단독 = 전송, Shift+Enter = 줄바꿈(기본동작)
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                addComment()
              }
            }}
            placeholder="댓글 입력 (Enter=전송, Shift+Enter=줄바꿈)"
            rows={3}
            style={{
              flex: 1,
              resize: 'vertical',
              lineHeight: 1.4,
            }}
          />
          <button onClick={addComment} style={{ marginTop: 2 }}>
            등록
          </button>
        </div>

        <ul style={{ marginTop: 16 }}>
          {comments.map((c) => {
            const canMine = myEmail && c.author?.email === myEmail

            return (
              <li key={c.id} style={{ marginBottom: 10 }}>
                <div
                  style={{
                    fontSize: 12,
                    opacity: 0.8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <div>
                    {displayUserLabel(
                      c.author?.name,
                      c.author?.email,
                      'unknown'
                    )}{' '}
                    · {formatKoreanDateTimeWithMs(c.createdAt)}
                  </div>

                  {canMine ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => startCommentEdit(c)}
                        style={{ fontSize: 12 }}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteComment(c.id)}
                        style={{ fontSize: 12 }}
                      >
                        삭제
                      </button>
                    </div>
                  ) : null}
                </div>

                {editingCommentId === c.id ? (
                  <div style={{ marginTop: 8 }}>
                    <textarea
                      value={editingCommentText}
                      onChange={(e) => setEditingCommentText(e.target.value)}
                      rows={3}
                      style={{
                        width: '100%',
                        resize: 'vertical',
                        lineHeight: 1.4,
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <button
                        onClick={saveCommentEdit}
                        disabled={commentSaving}
                      >
                        {commentSaving ? '저장중...' : '저장'}
                      </button>
                      <button
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
                  <div style={{ whiteSpace: 'pre-wrap' }}>{c.content}</div>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </main>
  )
}
