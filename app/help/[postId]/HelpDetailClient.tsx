'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
import Link from 'next/link'
import { displayUserLabel } from '@/app/lib/userLabel'

type HelpPost = {
  id: string
  title: string
  contentMd: string
  createdAt: string
  author: { name: string | null; email: string | null }
  canAnswer: boolean
}

type Answer = {
  id: string
  content: string
  createdAt: string
  author: { name: string | null; email: string | null }
}

export default function HelpDetailClient({ postId }: { postId: string }) {
  const [post, setPost] = useState<HelpPost | null>(null)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [err, setErr] = useState<string | null>(null)

  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const canSend = useMemo(() => !!draft.trim(), [draft])

  const load = useCallback(async () => {
    setErr(null)

    const r1 = await fetch(`/api/help/posts/${postId}`, { cache: 'no-store' })
    const r2 = await fetch(`/api/help/posts/${postId}/answers`, {
      cache: 'no-store',
    })

    if (r1.ok) setPost(await r1.json())
    else setErr((await r1.json().catch(() => null))?.message ?? '불러오기 실패')

    if (r2.ok) setAnswers(await r2.json())
  }, [postId])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load()
    }, 0)

    return () => {
      window.clearTimeout(t)
    }
  }, [load])

  const sendAnswer = async () => {
    setSaving(true)
    setErr(null)

    const res = await fetch(`/api/help/posts/${postId}/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: draft }),
    })

    const data = await res.json().catch(() => null)
    setSaving(false)

    if (!res.ok) {
      setErr(data?.message ?? '답변 등록 실패')
      return
    }

    setDraft('')
    await load()
  }

  const mdComponents: Parameters<typeof ReactMarkdown>[0]['components'] = {
    h1: (props) => <h1 {...props} className="mt-6 text-2xl font-bold" />,
    h2: (props) => <h2 {...props} className="mt-5 text-xl font-semibold" />,
    h3: (props) => <h3 {...props} className="mt-4 text-lg font-semibold" />,
    p: (props) => <p {...props} className="mt-2 leading-7" />,
    ul: (props) => <ul {...props} className="mt-2 list-disc pl-5" />,
    ol: (props) => <ol {...props} className="mt-2 list-decimal pl-5" />,
    li: (props) => <li {...props} className="mt-1" />,
    a: (props) => <a {...props} className="underline" />,
    pre: (props) => (
      <pre
        {...props}
        className="mt-3 overflow-x-auto rounded-xl border p-3 text-sm"
      />
    ),
    code: (props) => {
      const { className, children, ...rest } = props
      const isBlock =
        typeof className === 'string' && className.includes('language-')
      if (isBlock)
        return (
          <code {...rest} className={className}>
            {children}
          </code>
        )
      return (
        <code
          {...rest}
          className="rounded-md border bg-black/5 px-1 py-0.5 text-[0.85em]"
        >
          {children}
        </code>
      )
    },
    img: ({ src, alt, ...props }) => {
      const safeSrc = typeof src === 'string' ? src.trim() : ''
      if (!safeSrc) return null
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          {...props}
          src={safeSrc}
          alt={typeof alt === 'string' ? alt : ''}
          style={{ maxWidth: '100%', height: 'auto', borderRadius: 12 }}
        />
      )
    },
  }

  if (!post) {
    return (
      <main className="space-y-3">
        <div>
          <Link href="/help" className="btn btn-outline">
            ← 고객센터
          </Link>
        </div>

        <div className="surface card-pad">
          <div className="text-sm opacity-70">로딩중...</div>
          {err ? <p className="mt-2 text-sm text-red-600">{err}</p> : null}
        </div>
      </main>
    )
  }

  return (
    <main className="space-y-4">
      <section className="surface card-pad card-hover-border-only">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Link href="/help" className="btn btn-outline">
              ← 고객센터
            </Link>

            <h1 className="mt-3 truncate text-2xl font-semibold">
              {post.title}
            </h1>

            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs opacity-70">
              <span className="badge">
                {displayUserLabel(
                  post.author?.name,
                  post.author?.email,
                  'user'
                )}
              </span>
              <span className="badge">{post.createdAt}</span>
              {post.canAnswer ? <span className="badge">operator</span> : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-outline" onClick={load}>
              새로고침
            </button>
          </div>
        </div>

        {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
      </section>

      <article className="card card-pad card-hover-border-only">
        <div className="markdown-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            rehypePlugins={[rehypeHighlight]}
            components={mdComponents}
          >
            {post.contentMd}
          </ReactMarkdown>
        </div>
      </article>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">운영진 답변</h2>
          <span className="badge">{answers.length}</span>
        </div>

        {answers.length === 0 ? (
          <div className="surface card-pad text-sm opacity-70 card-hover-border-only">
            아직 답변이 없습니다.
          </div>
        ) : (
          <div className="grid gap-2">
            {answers.map((a) => (
              <div key={a.id} className="surface card-pad card-hover-border-only">
                <div className="flex flex-wrap items-center gap-2 text-xs opacity-70">
                  <span className="badge">
                    {displayUserLabel(
                      a.author?.name,
                      a.author?.email,
                      'operator'
                    )}
                  </span>
                  <span className="badge">{a.createdAt}</span>
                </div>
                <div className="mt-3 whitespace-pre-wrap text-sm leading-6">
                  {a.content}
                </div>
              </div>
            ))}
          </div>
        )}

        {post.canAnswer ? (
          <div className="surface card-pad space-y-2 card-hover-border-only">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">운영진 답변 작성</div>
              <span className="badge">Enter=줄바꿈</span>
            </div>

            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="운영진 답변 작성..."
              rows={5}
              className="textarea"
              style={{ resize: 'vertical' }}
            />

            <div className="flex justify-end">
              <button
                type="button"
                className="btn btn-primary"
                onClick={sendAnswer}
                disabled={saving || !canSend}
              >
                {saving ? '등록중...' : '답변 등록'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm opacity-70">
            * 답변 작성은 운영진만 가능합니다.
          </p>
        )}
      </section>
    </main>
  )
}
