'use client'

import { useMemo, useState } from 'react'
import MarkdownEditor from '@/app/components/MarkdownEditor'
import { useAsyncLock } from '@/app/lib/useAsyncLock'
import { BLOG_POST_TYPE_OPTIONS, type BlogPostType } from '@/app/lib/blog'
import BlogRatingInput from '@/app/blog/BlogRatingInput'

/**
 * Renders a blog post editor UI for the given board and handles creating/saving posts.
 *
 * The component manages title, markdown content, secret-post state/password, client-side validation,
 * and sending the post data to the backend. On successful save it navigates to the created post page.
 *
 * @param boardId - The identifier of the board where the post will be created
 * @returns A React element containing the blog editor UI
 */
export default function BlogEditorClient({
  boardId,
  apiBasePath = '/api/blog/posts',
  detailBasePath = '/blog',
  showBlogMeta = false,
}: {
  boardId: string
  apiBasePath?: string
  detailBasePath?: string
  showBlogMeta?: boolean
}) {
  const [title, setTitle] = useState('')
  const [contentMd, setContentMd] = useState('')
  const [blogCategory, setBlogCategory] = useState<BlogPostType>('INFO')
  const [ratingEnabled, setRatingEnabled] = useState(false)
  const [reviewRatingHalf, setReviewRatingHalf] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  const { pending: saving, run: runSave } = useAsyncLock()

  const [isSecret, setIsSecret] = useState(false)
  const [secretPassword, setSecretPassword] = useState('')

  const canPublish = useMemo(() => {
    if (!title.trim()) return false
    if (!contentMd.trim()) return false
    if (!isSecret) return true
    return !!secretPassword.trim()
  }, [contentMd, isSecret, secretPassword, title])

  async function save(publish: boolean) {
    await runSave(async () => {
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

      const res = await fetch(apiBasePath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardId,
          title: title.trim(),
          contentMd,
          ...(showBlogMeta
            ? {
                blogCategory,
                reviewRatingHalf:
                  blogCategory === 'REVIEW' && ratingEnabled
                    ? reviewRatingHalf
                    : null,
              }
            : {}),
          publish,
          isSecret,
          secretPassword: isSecret ? secretPassword.trim() || null : null,
        }),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        setMsg(data?.message ?? '저장 실패')
        return
      }

      const postId = typeof data?.id === 'string' ? data.id : null
      if (!postId) {
        setMsg('저장 응답이 올바르지 않습니다. 다시 시도해주세요.')
        return
      }

      window.location.href = `${detailBasePath}/${encodeURIComponent(postId)}`
    })
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
          disabled={saving}
        />
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium">본문 (Markdown)</label>
        <MarkdownEditor
          value={contentMd}
          onChange={setContentMd}
          placeholder="본문 (마크다운 호환)"
          rows={18}
          previewEmptyText="미리보기할 본문이 없습니다."
          htmlMode="raw"
          disabled={saving}
        />
      </div>

      {showBlogMeta ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,220px)_1fr]">
          <div className="grid gap-2">
            <label className="text-sm font-medium">글 종류</label>
            <select
              className="select"
              value={blogCategory}
              disabled={saving}
              onChange={(e) => {
                const next = e.target.value as BlogPostType
                setBlogCategory(next)
                if (next !== 'REVIEW') {
                  setRatingEnabled(false)
                  setReviewRatingHalf(0)
                }
              }}
            >
              {BLOG_POST_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="card card-pad card-hover-border-only space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">별점 기능</div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ratingEnabled}
                  disabled={saving || blogCategory !== 'REVIEW'}
                  onChange={(e) => {
                    const next = e.target.checked
                    setRatingEnabled(next)
                    if (!next) setReviewRatingHalf(0)
                  }}
                />
                별점 사용
              </label>
            </div>

            {blogCategory !== 'REVIEW' ? (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                글 종류를 리뷰/후기로 선택하면 별점을 켤 수 있습니다.
              </p>
            ) : ratingEnabled ? (
              <BlogRatingInput
                value={reviewRatingHalf}
                disabled={saving}
                onChange={setReviewRatingHalf}
              />
            ) : (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                별점 기능이 꺼져 있으면 리스트에 점수가 표시되지 않습니다.
              </p>
            )}
          </div>
        </div>
      ) : null}

      <div className="card card-pad card-hover-border-only">
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
              disabled={saving}
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
                disabled={saving}
              />
            </div>
          ) : (
            <span className="badge">일반 글</span>
          )}
        </div>
      </div>

      {saving ? (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          요청을 전송하는 중입니다. 완료될 때까지 잠시만 기다려주세요.
        </p>
      ) : null}

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
