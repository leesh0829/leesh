import Link from 'next/link'
import { NavCreate } from '@/app/components/PageNavIcons'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { toISOStringSafe } from '@/app/lib/date'
import { isDatabaseConnectionError } from '@/app/lib/prismaError'
import type { Prisma } from '@prisma/client'
import { groupDocsByCategory, type DocsListItem } from '@/app/lib/docsTree'

export const runtime = 'nodejs'

type SortOrder = 'asc' | 'desc'

function parseSortOrder(v: string | undefined): SortOrder {
  return v === 'asc' ? 'asc' : 'desc'
}

type DocsPostRow = {
  id: string
  title: string
  createdAt: Date
  docsCategory: string | null
}

export default async function DocsListPage(props: {
  searchParams?: Promise<{ sort?: string; q?: string }>
}) {
  const searchParams = (await props.searchParams) ?? {}
  const sortOrder = parseSortOrder(searchParams.sort)
  const titleQuery =
    typeof searchParams.q === 'string' ? searchParams.q.trim() : ''
  let databaseUnavailable = false
  let session = null

  try {
    session = await getServerSession(authOptions)
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error
    databaseUnavailable = true
    console.error('[DOCS_PAGE_DB_UNAVAILABLE][SESSION]', error)
  }

  const canWrite = !!session?.user?.email

  const where: Prisma.PostWhereInput = {
    board: { type: 'DOCS' },
    status: 'DONE',
    ...(titleQuery
      ? { title: { contains: titleQuery, mode: 'insensitive' } }
      : {}),
  }

  let items: DocsListItem[] = []
  if (!databaseUnavailable) {
    try {
      const rows: DocsPostRow[] = await prisma.post.findMany({
        where,
        orderBy: { createdAt: sortOrder },
        select: { id: true, title: true, createdAt: true, docsCategory: true },
      })
      items = rows.map((p) => ({
        id: p.id,
        title: p.title,
        docsCategory: p.docsCategory,
        createdAt: toISOStringSafe(p.createdAt),
      }))
    } catch (error) {
      if (!isDatabaseConnectionError(error)) throw error
      databaseUnavailable = true
      items = []
      console.error('[DOCS_PAGE_DB_UNAVAILABLE][POSTS]', error)
    }
  }

  const groups = groupDocsByCategory(items)

  const buildHref = (next: { sort?: SortOrder; q?: string }) => {
    const params = new URLSearchParams()
    params.set('sort', next.sort ?? sortOrder)
    const q = (next.q ?? titleQuery).trim()
    if (q) params.set('q', q)
    return `/docs?${params.toString()}`
  }

  return (
    <main className="container-page py-8">
      <div className="surface card-pad card-hover-border-only">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Docs</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              배운 것과 공부할 것을 정리한 문서 목록
            </p>
          </div>

          <div className="grid w-full gap-2 lg:w-auto">
            <form
              method="get"
              action="/docs"
              className="flex w-full flex-wrap items-center gap-2 lg:justify-end"
            >
              <input type="hidden" name="sort" value={sortOrder} />
              <input
                type="text"
                name="q"
                defaultValue={titleQuery}
                placeholder="제목 검색"
                className="input min-w-0 flex-1 sm:min-w-[220px]"
                aria-label="문서 제목 검색"
              />
              <button
                type="submit"
                className="btn btn-outline shrink-0 min-w-[3.25rem]"
              >
                검색
              </button>
              {titleQuery ? (
                <Link href={buildHref({ q: '' })} className="btn btn-ghost">
                  초기화
                </Link>
              ) : null}
            </form>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Link
                href={buildHref({ sort: 'desc' })}
                className={
                  'btn ' +
                  (sortOrder === 'desc' ? 'btn-primary' : 'btn-outline')
                }
              >
                최신순
              </Link>
              <Link
                href={buildHref({ sort: 'asc' })}
                className={
                  'btn ' + (sortOrder === 'asc' ? 'btn-primary' : 'btn-outline')
                }
              >
                오래된순
              </Link>
              {canWrite ? (
                <NavCreate href="/docs/new" label="새 문서 작성" />
              ) : (
                <span className="badge">로그인하면 문서 작성 가능</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          {databaseUnavailable ? (
            <div className="card card-pad">
              <div className="font-medium">문서 목록을 불러올 수 없습니다.</div>
              <div className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                데이터베이스 연결이 준비되지 않았습니다. DB가 올라온 뒤
                새로고침하면 목록이 다시 표시됩니다.
              </div>
            </div>
          ) : groups.length === 0 ? (
            <div className="card card-pad">
              <div className="text-sm" style={{ color: 'var(--muted)' }}>
                {titleQuery ? `검색 결과 없음: "${titleQuery}"` : '문서 없음'}
              </div>
            </div>
          ) : (
            groups.map((group) => (
              <details
                key={group.category}
                open
                className="card card-pad card-hover-border-only"
              >
                <summary className="cursor-pointer text-sm font-semibold">
                  {group.category}{' '}
                  <span className="opacity-60">({group.items.length})</span>
                </summary>
                <div className="mt-3 grid gap-2">
                  {group.items.map((p) => (
                    <Link
                      key={p.id}
                      href={`/docs/${encodeURIComponent(p.id)}`}
                      className="card card-pad block no-underline hover:no-underline"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">
                            {p.title}
                          </div>
                          <div
                            className="mt-1 text-xs"
                            style={{ color: 'var(--muted)' }}
                          >
                            {p.createdAt.slice(0, 10)}
                          </div>
                        </div>
                        <span className="badge">보기</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </details>
            ))
          )}
        </div>
      </div>
    </main>
  )
}
