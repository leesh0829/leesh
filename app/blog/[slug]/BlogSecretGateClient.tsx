'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function BlogSecretGateClient({
  boardId,
  postId,
}: {
  boardId: string
  postId: string
}) {
  const router = useRouter()
  const [pw, setPw] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const unlock = async () => {
    setUnlocking(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/boards/${boardId}/posts/${postId}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })

      if (res.ok) {
        setPw('')
        router.refresh()
        return
      }

      const data = await res.json().catch(() => null)
      setMsg(data?.message ?? '비밀번호가 틀렸습니다.')
    } finally {
      setUnlocking(false)
    }
  }

  return (
    <section className="grid gap-3">
      <div className="text-sm" style={{ color: 'var(--muted)' }}>
        비밀글입니다. 비밀번호를 입력하세요.
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          className="input"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="비밀번호"
        />
        <button
          type="button"
          onClick={unlock}
          disabled={unlocking || !pw.trim()}
          className="btn btn-primary"
        >
          {unlocking ? '확인 중...' : '열람'}
        </button>
      </div>

      {msg ? (
        <div className="text-sm" style={{ color: 'crimson' }}>
          {msg}
        </div>
      ) : null}
    </section>
  )
}
