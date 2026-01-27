'use client'

import { useMemo, useState } from 'react'
import ImageUploadButton from '@/app/components/ImageUploadButton'

export default function BlogEditorClient({ boardId }: { boardId: string }) {
  const [title, setTitle] = useState('')
  const [contentMd, setContentMd] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [isSecret, setIsSecret] = useState(false)
  const [secretPassword, setSecretPassword] = useState('')

  const canPublish = useMemo(() => {
    if (!title.trim()) return false
    if (!contentMd.trim()) return false
    if (!isSecret) return true
    return !!secretPassword.trim()
  }, [contentMd, isSecret, secretPassword, title])

  async function save(publish: boolean) {
    setMsg(null)

    if (!title.trim()) {
      setMsg('제목을 입력해주세요.')
      return
    }

    if (!contentMd.trim()) {
      setMsg('본문을 입력해주세요.')
      return
    }

    if (publish && isSecret && !secretPassword.trim()) {
      setMsg('비밀글 발행은 비밀번호가 필요합니다.')
      return
    }

    setSaving(true)

    const res = await fetch('/api/blog/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        boardId,
        title: title.trim(),
        contentMd,
        publish,
        isSecret,
        secretPassword: isSecret ? secretPassword.trim() || null : null,
      }),
    })

    const data = await res.json().catch(() => null)
    setSaving(false)

    if (!res.ok) {
      setMsg(data?.message ?? '저장 실패')
      return
    }

    const slug = data.slug ?? data.id
    window.location.href = `/blog/${encodeURIComponent(slug)}`
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <label className="text-sm font-medium">제목</label>
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
        <span className="badge">이미지는 본문에 마크다운으로 삽입됩니다</span>
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium">본문 (Markdown)</label>
        <textarea
          className="textarea"
          value={contentMd}
          onChange={(e) => setContentMd(e.target.value)}
          placeholder="본문 (마크다운 호환)"
          rows={18}
        />
        <div className="text-xs" style={{ color: 'var(--muted)' }}>
          Enter=줄바꿈, 이미지: ![](url)
        </div>
      </div>

      <div className="card card-pad">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isSecret}
              onChange={(e) => {
                const next = e.target.checked
                setIsSecret(next)
                if (!next) setSecretPassword('')
              }}
            />
            비밀글
          </label>

          {isSecret ? (
            <div className="flex min-w-0 items-center gap-2">
              <input
                type="password"
                className="input min-w-0"
                value={secretPassword}
                onChange={(e) => setSecretPassword(e.target.value)}
                placeholder="비밀번호"
              />
            </div>
          ) : (
            <span className="badge">일반 글</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving || !title.trim()}
          className="btn btn-outline"
          onClick={() => save(false)}
        >
          {saving ? '저장중...' : '임시저장'}
        </button>

        <button
          type="button"
          disabled={saving || !canPublish}
          className="btn btn-primary"
          onClick={() => save(true)}
        >
          {saving ? '발행중...' : '발행'}
        </button>
      </div>

      {msg ? (
        <p className="text-sm" style={{ color: 'crimson' }}>
          {msg}
        </p>
      ) : null}
    </div>
  )
}
