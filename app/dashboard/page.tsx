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

  // 로그인 섹션: 내 TODO(간단히 최근 6개) — 너 프로젝트에 status가 TODO/DOING/DONE이 있어서 이렇게 잡음
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
    <main style={{ padding: 24, maxWidth: 1000 }}>
      <h1 style={{ marginBottom: 6 }}>Dashboard</h1>

      {!isLoggedIn ? (
        <p style={{ opacity: 0.7, marginTop: 0 }}>
          지금은 공개 피드만 보여줌. 로그인하면 내 TODO/내 일정도 같이 볼 수
          있음.
        </p>
      ) : (
        <p style={{ opacity: 0.7, marginTop: 0 }}>
          안녕하세요, {displayUserLabel(me?.name, me?.email, 'user')} 👋
        </p>
      )}

      <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
        {/* 공개 피드: 최근 블로그 */}
        <section
          style={{ border: '1px solid #eee', borderRadius: 12, padding: 14 }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18 }}>최근 블로그</h2>
            <Link href="/blog" style={{ opacity: 0.7 }}>
              전체보기
            </Link>
          </div>

          {recentBlog.length === 0 ? (
            <p style={{ marginTop: 10, opacity: 0.7 }}>글 없음</p>
          ) : (
            <ul style={{ marginTop: 10, lineHeight: 1.9 }}>
              {recentBlog.map((p) => (
                <li key={p.id}>
                  <Link href={`/blog/${encodeURIComponent(p.key)}`}>
                    {p.title}
                  </Link>
                  <span style={{ opacity: 0.6, marginLeft: 8 }}>
                    {p.createdAt.slice(0, 10)} · {p.authorName}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 공개 피드: 최근 댓글 */}
        <section
          style={{ border: '1px solid #eee', borderRadius: 12, padding: 14 }}
        >
          <h2 style={{ margin: 0, fontSize: 18 }}>최근 댓글</h2>

          {recentComments.length === 0 ? (
            <p style={{ marginTop: 10, opacity: 0.7 }}>댓글 없음</p>
          ) : (
            <ul style={{ marginTop: 10, lineHeight: 1.6 }}>
              {recentComments.map((c) => (
                <li key={c.id} style={{ marginBottom: 10 }}>
                  <div style={{ opacity: 0.75, fontSize: 12 }}>
                    {c.createdAt} · {c.authorName}
                  </div>
                  <div style={{ marginTop: 2 }}>
                    <Link href={c.href} style={{ fontWeight: 600 }}>
                      {c.postTitle}
                    </Link>
                  </div>
                  <div style={{ marginTop: 2 }}>{c.content}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 로그인 섹션: 내 TODO */}
        {isLoggedIn ? (
          <section
            style={{ border: '1px solid #eee', borderRadius: 12, padding: 14 }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <h2 style={{ margin: 0, fontSize: 18 }}>내 TODO (최근)</h2>
              <Link href="/boards" style={{ opacity: 0.7 }}>
                보드로
              </Link>
            </div>

            {myTodos.length === 0 ? (
              <p style={{ marginTop: 10, opacity: 0.7 }}>할 일이 없음</p>
            ) : (
              <ul style={{ marginTop: 10, lineHeight: 1.9 }}>
                {myTodos.map((t) => {
                  const key = t.slug ?? t.id
                  return (
                    <li key={t.id}>
                      <Link
                        href={`/boards/${t.boardId}/${encodeURIComponent(key)}`}
                      >
                        [{t.status}] {t.title}
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
