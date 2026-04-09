'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  BLOG_POST_TYPE_OPTIONS,
  BLOG_REVIEW_FILTER_STEPS,
  formatReviewRatingHalf,
  type BlogPostType,
} from '@/app/lib/blog'

type SortOrder = 'asc' | 'desc'

function controlButtonClass(active: boolean) {
  return `btn ${active ? 'btn-primary' : 'btn-outline'}`
}

function filterChipClass(active: boolean) {
  if (active) {
    return 'inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition border-0 text-[#2b2750] bg-[#ddd9ff] shadow-[0_8px_20px_rgba(124,109,255,0.22)]'
  }

  return 'card card-hover-border-only inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-medium'
}

export default function BlogListControlsClient({
  sortOrder,
  typeFilter,
  ratingFilter,
  canWrite,
}: {
  sortOrder: SortOrder
  typeFilter: BlogPostType | null
  ratingFilter: number | null
  canWrite: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [filterOpen, setFilterOpen] = useState(
    typeFilter !== null || ratingFilter !== null
  )

  function buildHref(next: {
    sort?: SortOrder
    type?: BlogPostType | null
    rating?: number | null
    page?: number
  }) {
    const params = new URLSearchParams(searchParams.toString())

    params.set('sort', next.sort ?? sortOrder)
    params.set('page', String(next.page ?? 1))

    const nextType = next.type === undefined ? typeFilter : next.type
    if (nextType) params.set('type', nextType)
    else params.delete('type')

    const nextRating =
      next.rating === undefined ? ratingFilter : next.rating
    if (typeof nextRating === 'number') params.set('rating', String(nextRating))
    else params.delete('rating')

    return `${pathname}?${params.toString()}`
  }

  function navigate(next: Parameters<typeof buildHref>[0]) {
    startTransition(() => {
      router.push(buildHref(next))
    })
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <button
          type="button"
          className={controlButtonClass(
            filterOpen ||
              sortOrder !== 'desc' ||
              typeFilter !== null ||
              ratingFilter !== null
          )}
          onClick={() => setFilterOpen((prev) => !prev)}
          aria-expanded={filterOpen}
          aria-controls="blog-filter-panel"
        >
          필터
        </button>

        {canWrite ? (
          <Link href="/blog/new" className="btn btn-primary">
            글 작성
          </Link>
        ) : (
          <span className="badge">로그인하면 글 작성 가능</span>
        )}
      </div>

      <div
        id="blog-filter-panel"
        className={`grid overflow-hidden transition-[grid-template-rows,opacity,transform] duration-300 ease-out ${
          filterOpen
            ? 'grid-rows-[1fr] opacity-100 translate-y-0'
            : 'pointer-events-none grid-rows-[0fr] opacity-0 -translate-y-2'
        }`}
      >
        <div className="overflow-hidden">
          <div className="card card-hover-border-only mt-1 space-y-4 p-3 sm:p-4">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] opacity-60">
                정렬
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={filterChipClass(sortOrder === 'desc')}
                  disabled={isPending}
                  onClick={() => navigate({ sort: 'desc', page: 1 })}
                >
                  최신순
                </button>
                <button
                  type="button"
                  className={filterChipClass(sortOrder === 'asc')}
                  disabled={isPending}
                  onClick={() => navigate({ sort: 'asc', page: 1 })}
                >
                  오래된순
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] opacity-60">
                글 종류
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={filterChipClass(typeFilter === null)}
                  disabled={isPending}
                  onClick={() => navigate({ type: null, page: 1 })}
                >
                  전체
                </button>
                {BLOG_POST_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={filterChipClass(typeFilter === option.value)}
                    disabled={isPending}
                    onClick={() => navigate({ type: option.value, page: 1 })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] opacity-60">
                별점
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={filterChipClass(ratingFilter === null)}
                  disabled={isPending}
                  onClick={() => navigate({ rating: null, page: 1 })}
                >
                  전체
                </button>
                {BLOG_REVIEW_FILTER_STEPS.map((step) => (
                  <button
                    key={step}
                    type="button"
                    className={filterChipClass(ratingFilter === step)}
                    disabled={isPending}
                    onClick={() =>
                      navigate({ rating: step, type: 'REVIEW', page: 1 })
                    }
                  >
                    ★ {formatReviewRatingHalf(step)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
