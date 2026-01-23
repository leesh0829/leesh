'use client'

import { useState } from 'react'
import ImageUploadButton from '@/app/components/ImageUploadButton'

export default function BlogEditorClient({ boardId }: { boardId: string }) {
  const [title, setTitle] = useState('')
  const [contentMd, setContentMd] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [isSecret, setIsSecret] = useState(false)
  const [secretPassword, setSecretPassword] = useState('')

  async function save(publish: boolean) {
    setSaving(true)
    setMsg(null)

    const res = await fetch('/api/blog/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        boardId,
        title,
        contentMd,
        publish,
        isSecret,
        secretPassword: isSecret ? secretPassword : null,
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
    <div style={{ display: 'grid', gap: 10, maxWidth: 900 }}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="제목"
        style={{ padding: 10, fontSize: 16 }}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <ImageUploadButton
          onUploaded={(url) => {
            setContentMd((prev) => `${prev}\n\n![](${url})\n`)
          }}
        />
      </div>

      <textarea
        value={contentMd}
        onChange={(e) => setContentMd(e.target.value)}
        placeholder="설명 (마크다운 호환)"
        rows={18}
        style={{ padding: 10, fontSize: 14, lineHeight: 1.6 }}
      />

      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
          <input
            type="password"
            value={secretPassword}
            onChange={(e) => setSecretPassword(e.target.value)}
            placeholder="비밀번호"
            style={{ padding: 8, minWidth: 220 }}
          />
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button disabled={saving} onClick={() => save(false)}>
          임시저장
        </button>
        <button disabled={saving} onClick={() => save(true)}>
          발행
        </button>
      </div>

      {msg && <p style={{ color: 'crimson' }}>{msg}</p>}
    </div>
  )
}
