'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import MarkdownEditor from '@/app/components/MarkdownEditor'

type HelpPost = {
  id: string
  title: string
  createdAt: string
  hasOperatorAnswer: boolean
  author: { name: string | null; email: string | null }
}

function maskEmail(email: string) {
  const [id, domain] = email.split('@')
  if (!domain) return email
  if (id.length <= 2) return `${id[0] ?? '*'}*@${domain}`
  return `${id.slice(0, 2)}***@${domain}`
}

export default function HelpClient() {
  const [posts, setPosts] = useState<HelpPost[]>([])
  const [title, setTitle] = useState('')
  const [contentMd, setContentMd] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const canSubmit = useMemo(() => !!title.trim(), [title])

  const load = async () => {
    setErr(null)
    const res = await fetch('/api/help/posts', { cache: 'no-store' })
    if (res.ok) {
      setPosts(await res.json())
      return
    }
    const data = await res.json().catch(() => null)
    setErr(data?.message ?? '불러오기 실패')
  }

  useEffect(() => {
    Promise.resolve().then(() => {
      void load()
    })
  }, [])

  const create = async () => {
    setSaving(true)
    setErr(null)

    const res = await fetch('/api/help/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, contentMd }),
    })

    const data = await res.json().catch(() => null)
    setSaving(false)

    if (!res.ok) {
      setErr(data?.message ?? '등록 실패')
      return
    }

    setTitle('')
    setContentMd('')
    await load()
  }

  return (
    <main className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs opacity-60">Help</div>
          <h1 className="text-2xl font-semibold">고객센터 / 개발·버그 요청</h1>
          <p className="mt-1 text-sm opacity-70">
            /boards와 분리된 전용 게시판입니다.
          </p>
        </div>

        <div className="flex gap-2">
          <button type="button" className="btn btn-outline" onClick={load}>
            새로고침
          </button>
        </div>
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <section className="surface card-pad space-y-3 card-hover-border-only">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">요청 작성</h2>
          <span className="badge">로그인 사용자만 작성 가능</span>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">제목</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목"
            className="input"
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium">내용 (Markdown)</label>
          <MarkdownEditor
            value={contentMd}
            onChange={setContentMd}
            placeholder="내용 (Markdown)"
            rows={8}
            previewEmptyText="미리보기할 내용이 없습니다."
          />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            className="btn btn-primary"
            onClick={create}
            disabled={saving || !canSubmit}
          >
            {saving ? '등록중...' : '등록'}
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">요청 목록</h2>

        {posts.length === 0 ? (
          <div className="surface card-pad text-sm opacity-70">
            등록된 요청이 없습니다.
          </div>
        ) : (
          <div className="grid gap-2">
            {posts.map((p) => {
              const by =
                p.author?.name ??
                (p.author?.email ? maskEmail(p.author.email) : 'unknown')
              return (
                <Link
                  key={p.id}
                  href={`/help/${p.id}`}
                  className="surface card-pad block no-underline hover:underline"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold wrap-break-word">{p.title}</div>
                      <div className="mt-1">
                        <span className="badge">
                          {p.hasOperatorAnswer ? '답변완료' : '답변대기'}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs opacity-60">
                      {p.createdAt.slice(0, 10)}
                    </div>
                  </div>
                  <div className="mt-1 text-xs opacity-70">by {by}</div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
