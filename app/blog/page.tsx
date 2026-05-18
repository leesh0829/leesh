import Link from 'next/link'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { toISOStringSafe } from '@/app/lib/date'
import type { Prisma } from '@prisma/client'
import {
  formatReviewRatingHalf,
  getBlogPostTypeLabel,
  parseBlogPostType,
  parseReviewRatingHalf,
  type BlogPostType,
} from '@/app/lib/blog'
import { isDatabaseConnectionError } from '@/app/lib/prismaError'
import BlogListControlsClient from './BlogListControlsClient'

export const runtime = 'nodejs'

type SortOrder = 'asc' | 'desc'
const BLOG_PAGE_SIZE = 10

function parseSortOrder(v: string | undefined): SortOrder {
  return v === 'asc' ? 'asc' : 'desc'
}

function parsePage(v: string | undefined): number {
  if (!v) return 1
  const n = Number(v)
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.floor(n))
}

type BlogPostRow = {
  id: string
  title: string
  createdAt: Date
  blogCategory: BlogPostType
  reviewRatingHalf: number | null
  isSpoiler: boolean
  author: { name: string | null; email: string | null }
}

type BlogPostListItem = Omit<BlogPostRow, 'createdAt'> & {
  createdAt: string
}

export default async function BlogListPage(props: {
  searchParams?: Promise<{
    sort?: string
    page?: string
    q?: string
    type?: string
    rating?: string
  }>
}) {
  const searchParams = (await props.searchParams) ?? {}
  const sortOrder = parseSortOrder(searchParams.sort)
  const rawPage = parsePage(searchParams.page)
  const titleQuery =
    typeof searchParams.q === 'string' ? searchParams.q.trim() : ''
  const typeFilter = parseBlogPostType(searchParams.type)
  const ratingFilter = parseReviewRatingHalf(searchParams.rating)
  let databaseUnavailable = false
  let session = null

  try {
    session = await getServerSession(authOptions)
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error
    databaseUnavailable = true
    console.error('[BLOG_PAGE_DB_UNAVAILABLE][SESSION]', error)
  }

  const canWrite = !!session?.user?.email

  const where: Prisma.PostWhereInput = {
    board: { type: 'BLOG' },
    status: 'DONE',
    ...(titleQuery
      ? { title: { contains: titleQuery, mode: 'insensitive' } }
      : {}),
    ...(typeFilter ? { blogCategory: typeFilter } : {}),
    ...(ratingFilter !== null ? { reviewRatingHalf: ratingFilter } : {}),
  }

  let totalCount = 0
  let totalPages = 1
  let page = 1
  let posts: BlogPostListItem[] = []

  if (!databaseUnavailable) {
    try {
      totalCount = await prisma.post.count({ where })
      totalPages = Math.max(1, Math.ceil(totalCount / BLOG_PAGE_SIZE))
      page = Math.min(rawPage, totalPages)

      const postsRaw: BlogPostRow[] = await prisma.post.findMany({
        where,
        orderBy: { createdAt: sortOrder },
        skip: (page - 1) * BLOG_PAGE_SIZE,
        take: BLOG_PAGE_SIZE,
        select: {
          id: true,
          title: true,
          createdAt: true,
          blogCategory: true,
          reviewRatingHalf: true,
          isSpoiler: true,
          author: { select: { name: true, email: true } },
        },
      })

      posts = postsRaw.map((p: BlogPostRow) => ({
        ...p,
        createdAt: toISOStringSafe(p.createdAt),
      }))
    } catch (error) {
      if (!isDatabaseConnectionError(error)) throw error
      databaseUnavailable = true
      totalCount = 0
      totalPages = 1
      page = 1
      posts = []
      console.error('[BLOG_PAGE_DB_UNAVAILABLE][POSTS]', error)
    }
  }

  const toHref = (next: {
    page?: number
    sort?: SortOrder
    q?: string
    type?: BlogPostType | null
    rating?: number | null
  }) => {
    const params = new URLSearchParams()
    params.set('sort', next.sort ?? sortOrder)
    params.set(
      'page',
      String(Math.min(totalPages, Math.max(1, next.page ?? page)))
    )

    const q = (next.q ?? titleQuery).trim()
    if (q) params.set('q', q)

    const type = next.type === undefined ? typeFilter : next.type
    if (type) params.set('type', type)

    const rating = next.rating === undefined ? ratingFilter : next.rating
    if (typeof rating === 'number') params.set('rating', String(rating))

    return `/blog?${params.toString()}`
  }

  const pageHref = (nextPage: number) => toHref({ page: nextPage })

  return (
    <main className="container-page py-8">
      <div className="surface card-pad card-hover-border-only">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="sm:pr-4">
            <h1 className="text-2xl font-bold">Blog</h1>
            <p
              className="mt-1 text-sm whitespace-nowrap"
              style={{ color: 'var(--muted)' }}
            >
              작성된 글 목록
            </p>
          </div>

          <div className="grid w-full gap-2 lg:w-auto">
            <form
              method="get"
              action="/blog"
              className="flex w-full flex-wrap items-center gap-2 lg:justify-end"
            >
              <input type="hidden" name="sort" value={sortOrder} />
              <input type="hidden" name="page" value="1" />
              {typeFilter ? (
                <input type="hidden" name="type" value={typeFilter} />
              ) : null}
              {ratingFilter !== null ? (
                <input
                  type="hidden"
                  name="rating"
                  value={String(ratingFilter)}
                />
              ) : null}
              <input
                type="text"
                name="q"
                defaultValue={titleQuery}
                placeholder="제목 검색"
                className="input min-w-0 flex-1 sm:min-w-[220px]"
                aria-label="블로그 제목 검색"
              />
              <button
                type="submit"
                className="btn btn-outline shrink-0 min-w-[3.25rem]"
              >
                검색
              </button>
              {titleQuery || typeFilter || ratingFilter !== null ? (
                <Link
                  href={toHref({ page: 1, q: '', type: null, rating: null })}
                  className="btn btn-ghost"
                >
                  초기화
                </Link>
              ) : null}
            </form>

            <BlogListControlsClient
              sortOrder={sortOrder}
              typeFilter={typeFilter}
              ratingFilter={ratingFilter}
              canWrite={canWrite}
            />
          </div>
        </div>

        <div className="stagger-in mt-6 grid gap-3">
          {databaseUnavailable ? (
            <div className="card card-pad">
              <div className="font-medium">
                블로그 목록을 불러올 수 없습니다.
              </div>
              <div className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                데이터베이스 연결이 준비되지 않았습니다. DB가 올라온 뒤
                새로고침하면 목록이 다시 표시됩니다.
              </div>
            </div>
          ) : posts.length === 0 ? (
            <div className="card card-pad">
              <div className="text-sm" style={{ color: 'var(--muted)' }}>
                {titleQuery || typeFilter || ratingFilter !== null
                  ? '조건에 맞는 글이 없습니다.'
                  : '글 없음'}
              </div>
            </div>
          ) : (
            posts.map((p) => (
              <Link
                key={p.id}
                href={`/blog/${encodeURIComponent(p.id)}`}
                className="card card-pad block no-underline hover:no-underline"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <div className="max-w-full truncate font-semibold">
                        {p.title}
                      </div>
                      <span
                        className="text-xs"
                        style={{ color: 'var(--muted)' }}
                      >
                        {getBlogPostTypeLabel(p.blogCategory)}
                      </span>
                      {p.reviewRatingHalf !== null ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold"
                          style={{
                            borderColor: 'rgba(214, 158, 46, 0.35)',
                            background: 'rgba(250, 204, 21, 0.12)',
                            color: '#c78900',
                          }}
                        >
                          <span aria-hidden="true">★</span>
                          <span>
                            {formatReviewRatingHalf(p.reviewRatingHalf)}
                          </span>
                        </span>
                      ) : null}
                      {p.isSpoiler ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold"
                          style={{
                            borderColor: 'rgba(220, 38, 38, 0.4)',
                            background: 'rgba(220, 38, 38, 0.12)',
                            color: '#dc2626',
                          }}
                          title="열람 주의 — 스포일러/민감 콘텐츠/기밀 정보 등 포함 가능"
                        >
                          ⚠️ 열람 주의
                        </span>
                      ) : null}
                    </div>
                    <div
                      className="mt-1 text-xs"
                      style={{ color: 'var(--muted)' }}
                    >
                      {p.createdAt.slice(0, 10)}
                      {p.author?.name || p.author?.email ? (
                        <>
                          {' '}
                          ·{' '}
                          {p.author?.name ??
                            (p.author?.email
                              ? p.author.email.split('@')[0]
                              : 'unknown')}
                        </>
                      ) : null}
                    </div>
                  </div>
                  <span className="badge">보기</span>
                </div>
              </Link>
            ))
          )}
        </div>

        {totalPages > 1 ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Link
              href={pageHref(page - 1)}
              aria-disabled={page <= 1}
              className={
                'btn btn-outline ' +
                (page <= 1 ? 'pointer-events-none opacity-50' : '')
              }
            >
              이전
            </Link>
            <span className="badge">
              {page} / {totalPages}
            </span>
            <Link
              href={pageHref(page + 1)}
              aria-disabled={page >= totalPages}
              className={
                'btn btn-outline ' +
                (page >= totalPages ? 'pointer-events-none opacity-50' : '')
              }
            >
              다음
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  )
}
