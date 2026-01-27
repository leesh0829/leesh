import Link from 'next/link'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { toISOStringSafe } from '@/app/lib/date'

export const runtime = 'nodejs'

export default async function BlogListPage() {
  const session = await getServerSession(authOptions)
  const canWrite = !!session?.user?.email

  const postsRaw = await prisma.post.findMany({
    where: { board: { type: 'BLOG' }, status: 'DONE' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      slug: true,
      title: true,
      createdAt: true,
      author: { select: { name: true, email: true } },
    },
  })

  const posts = postsRaw.map((p) => ({
    ...p,
    createdAt: toISOStringSafe(p.createdAt),
    slug: p.slug ?? p.id,
  }))

  return (
    <main className="container-page py-8">
      <div className="surface card-pad">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Blog</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              작성된 글 목록 (DONE만 표시)
            </p>
          </div>

          <div className="flex items-center gap-2">
            {canWrite ? (
              <Link href="/blog/new" className="btn btn-primary">
                글 작성
              </Link>
            ) : (
              <span className="badge">로그인하면 글 작성 가능</span>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          {posts.length === 0 ? (
            <div className="card card-pad">
              <div className="text-sm" style={{ color: 'var(--muted)' }}>
                글 없음
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
      </div>
    </main>
  )
}
