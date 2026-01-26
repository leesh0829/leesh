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
    <section style={{ marginTop: 32 }}>
      <h2 style={{ marginBottom: 12 }}>댓글</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <textarea
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
          style={{
            flex: 1,
            padding: 10,
            resize: 'vertical',
            lineHeight: 1.4,
          }}
        />
        <button onClick={submit} style={{ padding: '10px 14px' }}>
          등록
        </button>
      </div>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {loading ? (
        <p>불러오는 중...</p>
      ) : items.length === 0 ? (
        <p>댓글 없음</p>
      ) : (
        <ul style={{ lineHeight: 1.8 }}>
          {items.map((c) => (
            <li
              key={c.id}
              style={{ padding: '8px 0', borderTop: '1px solid #eee' }}
            >
              <div
                style={{
                  fontSize: 13,
                  opacity: 0.7,
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div>
                  {displayUserLabel(c.author.name, c.author.email, 'unknown')} ·{' '}
                  {formatKoreanDateTimeWithMs(c.createdAt)}
                </div>

                {myEmail && c.author.email === myEmail ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
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

              {editingId === c.id ? (
                <div style={{ marginTop: 8 }}>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    style={{
                      width: '100%',
                      padding: 10,
                      resize: 'vertical',
                      lineHeight: 1.4,
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button onClick={saveEdit} disabled={savingEdit}>
                      {savingEdit ? '저장중...' : '저장'}
                    </button>
                    <button
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
                <div style={{ whiteSpace: 'pre-wrap' }}>{c.content}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
