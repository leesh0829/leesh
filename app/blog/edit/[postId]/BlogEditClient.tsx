'use client'

import { useMemo, useState } from 'react'
import MarkdownEditor from '@/app/components/MarkdownEditor'
import { BLOG_POST_TYPE_OPTIONS, type BlogPostType } from '@/app/lib/blog'
import BlogRatingInput from '@/app/blog/BlogRatingInput'

type EditPost = {
  id: string
  title: string
  contentMd: string
  slug: string | null
  status: string
  blogCategory?: BlogPostType
  reviewRatingHalf?: number | null
}

/**
 * Client-side editor for modifying a blog post, including title, Markdown content,
 * slug regeneration, save (draft/publish), and delete actions.
 *
 * @param post - The post to edit; an `EditPost` object containing `id`, `title`,
 *   `contentMd`, `slug`, and `status`.
 * @returns The React element rendering the editor UI with inputs for title and
 *   Markdown content, a regenerate-slug checkbox, save/publish/delete controls,
 *   and inline status messages.
 */
export default function BlogEditClient({
  post,
  apiBasePath = '/api/blog/posts',
  detailBasePath = '/blog',
  listBasePath = '/blog',
  showBlogMeta = false,
}: {
  post: EditPost
  apiBasePath?: string
  detailBasePath?: string
  listBasePath?: string
  showBlogMeta?: boolean
}) {
  const [title, setTitle] = useState(post.title)
  const [contentMd, setContentMd] = useState(post.contentMd)
  const [blogCategory, setBlogCategory] = useState<BlogPostType>(
    post.blogCategory ?? 'INFO'
  )
  const [ratingEnabled, setRatingEnabled] = useState(
    post.reviewRatingHalf !== null && post.reviewRatingHalf !== undefined
  )
  const [reviewRatingHalf, setReviewRatingHalf] = useState(
    post.reviewRatingHalf ?? 0
  )
  const [regenerateSlug, setRegenerateSlug] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const canPublish = useMemo(
    () => !!title.trim() && !!contentMd.trim(),
    [contentMd, title]
  )

  async function save(publish: boolean) {
    setSaving(true)
    setMsg(null)

    const res = await fetch(`${apiBasePath}/${post.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
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
        regenerateSlug,
      }),
    })

    const data = await res.json().catch(() => null)
    setSaving(false)

    if (!res.ok) {
      setMsg(data?.message ?? '수정 실패')
      return
    }

    window.location.href = `${detailBasePath}/${encodeURIComponent(post.id)}`
  }

  async function del() {
    if (!confirm('진짜 삭제?')) return

    setSaving(true)
    setMsg(null)

    const res = await fetch(`${apiBasePath}/${post.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => null)
    setSaving(false)

    if (!res.ok) {
      setMsg(data?.message ?? '삭제 실패')
      return
    }

    window.location.href = listBasePath
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

      <div className="grid gap-2">
        <label className="text-sm font-medium">본문 (Markdown)</label>
        <MarkdownEditor
          value={contentMd}
          onChange={setContentMd}
          placeholder="마크다운으로 작성..."
          rows={18}
          previewEmptyText="미리보기할 본문이 없습니다."
          htmlMode="raw"
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
                <div className="text-sm font-medium">별점</div>
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
