import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import Link from 'next/link'
import BlogEditClient from './BlogEditClient'

export const runtime = 'nodejs'

export default async function BlogEditPage({
  params,
}: {
  params: Promise<{ postId: string }>
}) {
  const { postId } = await params

  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return (
      <main className="space-y-3">
        <div className="surface card-pad">
          <div className="text-sm font-semibold">로그인이 필요합니다.</div>
          <div className="mt-2">
            <Link className="btn btn-outline" href="/login">
              로그인
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!user) {
    return (
      <main className="space-y-3">
        <div className="surface card-pad">
          <div className="text-sm font-semibold">사용자 없음</div>
        </div>
      </main>
    )
  }

  const post = await prisma.post.findFirst({
    where: { id: postId, authorId: user.id, board: { type: 'BLOG' } },
    select: {
      id: true,
      title: true,
      contentMd: true,
      slug: true,
      status: true,
      isSecret: true,
    },
  })

  if (!post) {
    return (
      <main className="space-y-3">
        <div className="surface card-pad">
          <div className="text-sm font-semibold">
            수정할 글이 없거나 권한 없음
          </div>
          <div className="mt-2">
            <Link className="btn btn-outline" href="/blog">
              블로그로
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs opacity-60">Blog</div>
          <h1 className="text-2xl font-semibold">글 수정</h1>
        </div>

        <Link href="/blog" className="btn btn-outline">
          목록으로
        </Link>
      </div>

      <div className="surface card-pad">
        <BlogEditClient post={post} />
      </div>
    </main>
  )
}
