'use client'

import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
import { toHumanHttpError } from '@/app/lib/httpErrorText'
import ImageUploadButton from '@/app/components/ImageUploadButton'
import MarkdownEditor from '@/app/components/MarkdownEditor'

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

type LeeshDoc = {
  id: string
  title: string
  contentMd: string
  canEdit: boolean
}

export default function LeeshClient() {
  const [pw, setPw] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [unlocked, setUnlocked] = useState(false)

  const [doc, setDoc] = useState<LeeshDoc | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const mdComponents: Parameters<typeof ReactMarkdown>[0]['components'] =
    useMemo(
      () => ({
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
        img: ({ alt, ...props }) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            {...props}
            alt={alt ?? ''}
            style={{ maxWidth: '100%', height: 'auto', borderRadius: 12 }}
          />
        ),
      }),
      []
    )

  const load = async () => {
    setErr(null)
    const res = await fetch('/api/leesh', { cache: 'no-store' })
    if (res.ok) {
      const data = (await res.json()) as LeeshDoc
      setDoc(data)
      setDraft(data.contentMd ?? '')
      setUnlocked(true)
      return
    }

    const payload = await readJsonSafely(res)
    const msg = extractApiMessage(payload) ?? '불러오기 실패'
    const human = toHumanHttpError(res.status, msg)
    setErr(human ?? `${res.status} · ${msg}`)
    setUnlocked(false)
  }

  useEffect(() => {
    Promise.resolve().then(() => {
      load()
    })
  }, [])

  const doUnlock = async () => {
    if (!pw) return
    setUnlocking(true)
    setErr(null)

    const res = await fetch('/api/leesh/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    })

    if (!res.ok) {
      const payload = await readJsonSafely(res)
      const msg = extractApiMessage(payload) ?? '비밀번호가 틀렸습니다.'
      setErr(msg)
      setUnlocking(false)
      return
    }

    setPw('')
    setUnlocking(false)
    await load()
  }

  const save = async () => {
    if (!doc?.canEdit) return
    setSaving(true)
    setErr(null)

    const res = await fetch('/api/leesh', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentMd: draft }),
    })

    if (!res.ok) {
      const payload = await readJsonSafely(res)
      const msg = extractApiMessage(payload) ?? '저장 실패'
      const human = toHumanHttpError(res.status, msg)
      setErr(human ?? `${res.status} · ${msg}`)
      setSaving(false)
      return
    }

    const updated = (await res.json()) as LeeshDoc
    setDoc((prev) => (prev ? { ...prev, contentMd: updated.contentMd } : prev))
    setEditing(false)
    setSaving(false)
  }

  return (
    <main className="container-page py-6 space-y-4">
      <section className="surface card-pad">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">Leesh</h1>
            <p className="mt-1 text-sm opacity-70">
              포트폴리오 자기소개서(마크다운). 비밀번호로 접근 후 편집 가능.
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs opacity-80">
              <span className="badge">{unlocked ? 'unlocked' : 'locked'}</span>
              {doc?.canEdit ? <span className="badge">editable</span> : null}
              {doc?.title ? <span className="badge">{doc.title}</span> : null}
            </div>

            {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-outline" onClick={load}>
              새로고침
            </button>

            {unlocked && doc?.canEdit ? (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setEditing((v) => !v)}
              >
                {editing ? '편집 닫기' : '편집'}
              </button>
            ) : null}

            {unlocked && doc?.canEdit && editing ? (
              <>
                <ImageUploadButton
                  onUploaded={(url) => {
                    setDraft((prev) => `${prev}\n\n![](${url})\n`)
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={save}
                  disabled={saving}
                >
                  {saving ? '저장중...' : '저장'}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </section>

      {!unlocked ? (
        <section className="surface card-pad">
          <div className="text-sm opacity-70">비밀번호를 입력하세요.</div>

          <div className="mt-3 grid gap-2 sm:max-w-md">
            <input
              className="input"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="비밀번호"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void doUnlock()
              }}
            />

            <button
              className="btn btn-primary"
              onClick={doUnlock}
              disabled={unlocking || !pw}
            >
              {unlocking ? '확인중...' : '입장'}
            </button>

            <div className="text-xs opacity-60">
              엔터로도 입장 가능하게 해놨음.
            </div>
          </div>
        </section>
      ) : (
        <section className="card card-pad">
          {editing ? (
            <div className="grid gap-3">
              <MarkdownEditor
                value={draft}
                onChange={setDraft}
                rows={18}
                previewEmptyText="미리보기할 내용이 없습니다."
              />
              <div className="text-xs opacity-60">
                이미지 업로드 버튼 누르면 마크다운으로 자동 삽입됨.
              </div>
            </div>
          ) : (
            <article className="markdown-body">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                rehypePlugins={[rehypeHighlight]}
                components={mdComponents}
              >
                {doc?.contentMd ?? ''}
              </ReactMarkdown>
            </article>
          )}
        </section>
      )}
    </main>
  )
}
