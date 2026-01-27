import Link from 'next/link'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { toISOStringSafe } from '@/app/lib/date'
import { displayUserLabel } from '../lib/userLabel'

export const runtime = 'nodejs'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  const isLoggedIn = !!session?.user?.email

  // 공개 피드: 최근 블로그 글(전체)
  const recentBlogRaw = await prisma.post.findMany({
    where: { board: { type: 'BLOG' }, status: 'DONE' },
    orderBy: { createdAt: 'desc' },
    take: 6,
    select: {
      id: true,
      slug: true,
      title: true,
      createdAt: true,
      author: { select: { name: true, email: true } },
    },
  })

  const recentBlog = recentBlogRaw.map((p) => ({
    ...p,
    createdAt: toISOStringSafe(p.createdAt),
    key: p.slug ?? p.id,
    authorName: displayUserLabel(p.author?.name, p.author?.email, 'unknown'),
  }))

  // 공개 피드: 최근 댓글(전체)
  const recentCommentsRaw = await prisma.comment.findMany({
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      id: true,
      content: true,
      createdAt: true,
      author: { select: { name: true } },
      post: {
        select: {
          id: true,
          slug: true,
          title: true,
          boardId: true,
          board: { select: { type: true } },
        },
      },
    },
  })

  const recentComments = recentCommentsRaw.map((c) => {
    const postKey = c.post.slug ?? c.post.id
    const href =
      c.post.board.type === 'BLOG'
        ? `/blog/${encodeURIComponent(postKey)}`
        : `/boards/${c.post.boardId}/${encodeURIComponent(postKey)}`

    return {
      id: c.id,
      content: c.content,
      createdAt: toISOStringSafe(c.createdAt),
      authorName: c.author?.name ?? '익명',
      postTitle: c.post.title,
      href,
    }
  })

  // 로그인 사용자 정보 (로그인 했을 때만)
  const me = isLoggedIn
    ? await prisma.user.findUnique({
        where: { email: session!.user!.email! },
        select: { id: true, name: true, email: true },
      })
    : null

  // 로그인 섹션: 내 TODO(간단히 최근 6개)
  const myTodos = me
    ? await prisma.post.findMany({
        where: { authorId: me.id, status: { in: ['TODO', 'DOING'] } },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          slug: true,
          title: true,
          boardId: true,
          status: true,
        },
      })
    : []

  return (
    <main className="container-page py-6 space-y-5">
      <section className="surface card-pad">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs opacity-60">Home</div>
            <h1 className="text-2xl font-semibold">Dashboard</h1>

            {!isLoggedIn ? (
              <p className="mt-2 text-sm opacity-70">
                지금은 공개 피드만 표시됩니다. 로그인하면 내 TODO도 같이 볼 수
                있습니다.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="badge">로그인됨</span>
                <span className="text-sm opacity-70">
                  {displayUserLabel(me?.name, me?.email, 'user')}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/blog" className="btn btn-outline">
              블로그
            </Link>
            <Link href="/boards" className="btn btn-outline">
              보드
            </Link>
            <Link href="/calendar" className="btn btn-outline">
              캘린더
            </Link>
          </div>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* 최근 블로그 */}
        <section className="surface card-pad">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">최근 블로그</h2>
            <Link href="/blog" className="btn btn-outline">
              전체보기
            </Link>
          </div>

          {recentBlog.length === 0 ? (
            <div className="mt-3 text-sm opacity-70">글 없음</div>
          ) : (
            <ul
              className="mt-3 divide-y"
              style={{ borderColor: 'var(--border)' }}
            >
              {recentBlog.map((p) => (
                <li key={p.id} className="py-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <Link
                      href={`/blog/${encodeURIComponent(p.key)}`}
                      className="truncate font-semibold"
                    >
                      {p.title}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2 text-xs opacity-70">
                      <span className="badge">{p.createdAt.slice(0, 10)}</span>
                      <span className="badge">{p.authorName}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 최근 댓글 */}
        <section className="surface card-pad">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">최근 댓글</h2>
            <span className="badge">{recentComments.length}</span>
          </div>

          {recentComments.length === 0 ? (
            <div className="mt-3 text-sm opacity-70">댓글 없음</div>
          ) : (
            <ul className="mt-3 grid gap-2">
              {recentComments.map((c) => (
                <li key={c.id} className="surface card-pad">
                  <div className="flex flex-wrap items-center gap-2 text-xs opacity-70">
                    <span className="badge">{c.createdAt}</span>
                    <span className="badge">{c.authorName}</span>
                  </div>

                  <div className="mt-2 min-w-0">
                    <Link
                      href={c.href}
                      className="block truncate font-semibold"
                    >
                      {c.postTitle}
                    </Link>
                    <div className="mt-1 line-clamp-2 text-sm opacity-80">
                      {c.content}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 내 TODO */}
        {isLoggedIn ? (
          <section className="surface card-pad lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">내 TODO (최근)</h2>
              <Link href="/boards" className="btn btn-outline">
                보드로
              </Link>
            </div>

            {myTodos.length === 0 ? (
              <div className="mt-3 text-sm opacity-70">할 일이 없음</div>
            ) : (
              <ul
                className="mt-3 divide-y"
                style={{ borderColor: 'var(--border)' }}
              >
                {myTodos.map((t) => {
                  const key = t.slug ?? t.id
                  return (
                    <li key={t.id} className="py-2">
                      <Link
                        href={`/boards/${t.boardId}/${encodeURIComponent(key)}`}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <span className="badge">{t.status}</span>
                        <span className="truncate font-semibold">
                          {t.title}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </main>
  )
}
