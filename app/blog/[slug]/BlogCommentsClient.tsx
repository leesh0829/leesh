'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { toHumanHttpError } from '@/app/lib/httpErrorText'
import { displayUserLabel } from '@/app/lib/userLabel'

type CommentItem = {
  id: string
  content: string
  createdAt: string
  author: { name: string | null; email: string | null }
}

function formatKoreanDateTimeWithMs(isoOrDate: string | Date) {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
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
  return message.trim() || null
}

async function readJsonSafely(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export default function BlogCommentsClient({
  boardId,
  postId,
}: {
  boardId: string
  postId: string
}) {
  const [items, setItems] = useState<CommentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: session } = useSession()
  const myEmail = session?.user?.email ?? null

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  async function startEdit(c: CommentItem) {
    setEditingId(c.id)
    setEditText(c.content)
  }

  async function saveEdit() {
    if (!editingId) return
    const text = editText.trim()
    if (!text) return

    setSavingEdit(true)
    setError(null)

    const res = await fetch(
      `/api/boards/${boardId}/posts/${postId}/comments/${editingId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      }
    )

    if (!res.ok) {
      const payload = await readJsonSafely(res)
      const msg = extractApiMessage(payload) ?? '댓글 수정 실패'
      setError(`${res.status} · ${msg}`)
      setSavingEdit(false)
      return
    }

    setEditingId(null)
    setEditText('')
    setSavingEdit(false)
    await load()
  }

  async function deleteComment(id: string) {
    const ok = window.confirm('댓글 삭제할까요?')
    if (!ok) return

    setError(null)
    const res = await fetch(
      `/api/boards/${boardId}/posts/${postId}/comments/${id}`,
      { method: 'DELETE' }
    )

    if (!res.ok) {
      const payload = await readJsonSafely(res)
      const msg = extractApiMessage(payload) ?? '댓글 삭제 실패'
      setError(`${res.status} · ${msg}`)
      return
    }

    await load()
  }

  async function load() {
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/boards/${boardId}/posts/${postId}/comments`, {
      cache: 'no-store',
    })
    if (!res.ok) {
      const payload = await readJsonSafely(res)
      const msg = extractApiMessage(payload) ?? '댓글 처리 실패'
      const human = toHumanHttpError(res.status, msg)
      setError(human ?? `${res.status} · ${msg}`)
      setLoading(false)
      return
    }
    const data = await res.json()
    setItems(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function submit() {
    const text = content.trim()
    if (!text) return

    setError(null)
    const res = await fetch(`/api/boards/${boardId}/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    })

    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d?.message ?? '댓글 작성 실패')
      return
    }

    setContent('')
    await load()
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, postId])

  return (
    <section className="card card-pad card-hover-border-only">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">댓글</h2>
        <span className="badge">{items.length}</span>
      </div>

      <div className="mt-4 grid gap-2">
        <textarea
          className="textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent?.isComposing) return
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="댓글 달기... (Enter=전송, Shift+Enter=줄바꿈)"
          rows={3}
        />

        <div className="flex justify-end">
          <button type="button" onClick={submit} className="btn btn-primary">
            등록
          </button>
        </div>

        {error ? (
          <div className="text-sm" style={{ color: 'crimson' }}>
            {error}
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3">
        {loading ? (
          <div className="text-sm" style={{ color: 'var(--muted)' }}>
            불러오는 중...
          </div>
        ) : items.length === 0 ? (
          <div className="text-sm" style={{ color: 'var(--muted)' }}>
            댓글 없음
          </div>
        ) : (
          items.map((c) => {
            const mine = myEmail && c.author.email === myEmail
            const isEditing = editingId === c.id

            return (
              <div key={c.id} className="card p-3 card-hover-border-only">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>
                    {displayUserLabel(c.author.name, c.author.email, 'unknown')}{' '}
                    · {formatKoreanDateTimeWithMs(c.createdAt)}
                  </div>

                  {mine ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => startEdit(c)}
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
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                    />
                    <div className="flex gap-2">
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
                          setEditingId(null)
                          setEditText('')
                        }}
                        disabled={savingEdit}
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
          })
        )}
      </div>
    </section>
  )
}
