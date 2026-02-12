import Link from 'next/link'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { toISOStringSafe } from '@/app/lib/date'
import type { Prisma } from '@prisma/client'

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
  slug: string | null
  title: string
  createdAt: Date
  author: { name: string | null; email: string | null }
}

export default async function BlogListPage(props: {
  searchParams?: Promise<{ sort?: string; page?: string; q?: string }>
}) {
  const searchParams = (await props.searchParams) ?? {}
  const sortOrder = parseSortOrder(searchParams.sort)
  const rawPage = parsePage(searchParams.page)
  const titleQuery =
    typeof searchParams.q === 'string' ? searchParams.q.trim() : ''
  const session = await getServerSession(authOptions)
  const canWrite = !!session?.user?.email

  const where: Prisma.PostWhereInput = {
    board: { type: 'BLOG' },
    status: 'DONE',
    ...(titleQuery
      ? { title: { contains: titleQuery, mode: 'insensitive' } }
      : {}),
  }
  const totalCount = await prisma.post.count({ where })
  const totalPages = Math.max(1, Math.ceil(totalCount / BLOG_PAGE_SIZE))
  const page = Math.min(rawPage, totalPages)

  const postsRaw: BlogPostRow[] = await prisma.post.findMany({
    where,
    orderBy: { createdAt: sortOrder },
    skip: (page - 1) * BLOG_PAGE_SIZE,
    take: BLOG_PAGE_SIZE,
    select: {
      id: true,
      slug: true,
      title: true,
      createdAt: true,
      author: { select: { name: true, email: true } },
    },
  })

  const posts = postsRaw.map((p: BlogPostRow) => ({
    ...p,
    createdAt: toISOStringSafe(p.createdAt),
    slug: p.slug ?? p.id,
  }))

  const toHref = (next: { page?: number; sort?: SortOrder; q?: string }) => {
    const params = new URLSearchParams()
    params.set('sort', next.sort ?? sortOrder)
    params.set(
      'page',
      String(Math.min(totalPages, Math.max(1, next.page ?? page)))
    )
    const q = (next.q ?? titleQuery).trim()
    if (q) params.set('q', q)
    return `/blog?${params.toString()}`
  }

  const pageHref = (nextPage: number) => toHref({ page: nextPage })

  return (
    <main className="container-page py-8">
      <div className="surface card-pad card-hover-border-only">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Blog</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              작성된 글 목록 (DONE만 표시)
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
              {titleQuery ? (
                <Link
                  href={toHref({ page: 1, q: '' })}
                  className="btn btn-ghost"
                >
                  초기화
                </Link>
              ) : null}
            </form>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Link
                href={toHref({ sort: 'desc', page: 1 })}
                className={
                  'btn ' +
                  (sortOrder === 'desc' ? 'btn-primary' : 'btn-outline')
                }
              >
                최신순
              </Link>
              <Link
                href={toHref({ sort: 'asc', page: 1 })}
                className={
                  'btn ' + (sortOrder === 'asc' ? 'btn-primary' : 'btn-outline')
                }
              >
                오래된순
              </Link>
              {canWrite ? (
                <Link href="/blog/new" className="btn btn-primary">
                  글 작성
                </Link>
              ) : (
                <span className="badge">로그인하면 글 작성 가능</span>
              )}
            </div>
          </div>
        </div>

        <div className="stagger-in mt-6 grid gap-3">
          {posts.length === 0 ? (
            <div className="card card-pad">
              <div className="text-sm" style={{ color: 'var(--muted)' }}>
                {titleQuery ? `검색 결과 없음: "${titleQuery}"` : '글 없음'}
              </div>
            </div>
          ) : (
            posts.map((p) => (
              <Link
                key={p.id}
                href={`/blog/${encodeURIComponent(p.slug)}`}
                className="card card-pad block no-underline hover:no-underline"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{p.title}</div>
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
