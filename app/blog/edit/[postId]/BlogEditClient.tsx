'use client'

import { useMemo, useState } from 'react'
import ImageUploadButton from '@/app/components/ImageUploadButton'
import MarkdownEditor from '@/app/components/MarkdownEditor'

type EditPost = {
  id: string
  title: string
  contentMd: string
  slug: string | null
  status: string
}

export default function BlogEditClient({ post }: { post: EditPost }) {
  const [title, setTitle] = useState(post.title)
  const [contentMd, setContentMd] = useState(post.contentMd)
  const [regenerateSlug, setRegenerateSlug] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const canPublish = useMemo(() => !!title.trim(), [title])

  async function save(publish: boolean) {
    setSaving(true)
    setMsg(null)

    const res = await fetch(`/api/blog/posts/${post.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, contentMd, publish, regenerateSlug }),
    })

    const data = await res.json().catch(() => null)
    setSaving(false)

    if (!res.ok) {
      setMsg(data?.message ?? '수정 실패')
      return
    }

    const slug = data?.slug ?? post.id
    window.location.href = `/blog/${encodeURIComponent(slug)}`
  }

  async function del() {
    if (!confirm('진짜 삭제?')) return

    setSaving(true)
    setMsg(null)

    const res = await fetch(`/api/blog/posts/${post.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    setSaving(false)

    if (!res.ok) {
      setMsg(data?.message ?? '삭제 실패')
      return
    }

    window.location.href = '/blog'
  }

  return (
    <div className="space-y-3">
      <div className="text-xs opacity-70">
        현재 slug:{' '}
        <span className="font-semibold">{post.slug ?? '(없음)'}</span>
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

      <div className="flex flex-wrap items-center gap-2">
        <ImageUploadButton
          onUploaded={(url) => {
            setContentMd((prev) => `${prev}\n\n![](${url})\n`)
          }}
          disabled={saving}
        />
        <span className="text-xs opacity-60">
          업로드 후 마크다운에 이미지 링크가 자동으로 추가됩니다.
        </span>
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium">본문 (Markdown)</label>
        <MarkdownEditor
          value={contentMd}
          onChange={setContentMd}
          placeholder="마크다운으로 작성..."
          rows={18}
          previewEmptyText="미리보기할 본문이 없습니다."
        />
      </div>

      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={regenerateSlug}
          onChange={(e) => setRegenerateSlug(e.target.checked)}
        />
        제목 기준으로 slug 다시 생성
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn btn-outline"
          disabled={saving || !title.trim()}
          onClick={() => save(false)}
          type="button"
        >
          {saving ? '저장중...' : '임시저장'}
        </button>
        <button
          className="btn btn-primary"
          disabled={saving || !canPublish}
          onClick={() => save(true)}
          type="button"
        >
          {saving ? '저장중...' : '발행'}
        </button>

        <button
          className="btn btn-outline ml-auto"
          disabled={saving}
          onClick={del}
          type="button"
        >
          삭제
        </button>
      </div>

      {msg ? <p className="text-sm text-red-600">{msg}</p> : null}
    </div>
  )
}
