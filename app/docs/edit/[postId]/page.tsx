import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import Link from 'next/link'
import BlogEditClient from '@/app/blog/edit/[postId]/BlogEditClient'

export const runtime = 'nodejs'

export default async function DocsEditPage({
  params,
}: {
  params: Promise<{ postId: string }>
}) {
  const { postId } = await params

  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return (
      <main className="space-y-3">
        <div className="surface card-pad card-hover-border-only">
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
        <div className="surface card-pad card-hover-border-only">
          <div className="text-sm font-semibold">사용자 없음</div>
        </div>
      </main>
    )
  }

  const post = await prisma.post.findFirst({
    where: { id: postId, authorId: user.id, board: { type: 'DOCS' } },
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
        <div className="surface card-pad card-hover-border-only">
          <div className="text-sm font-semibold">
            수정할 문서가 없거나 권한 없음
          </div>
          <div className="mt-2">
            <Link className="btn btn-outline" href="/docs">
              Docs로
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
          <div className="text-xs opacity-60">Docs</div>
          <h1 className="text-2xl font-semibold">문서 수정</h1>
        </div>

        <Link href="/docs" className="btn btn-outline">
          목록으로
        </Link>
      </div>

      <div className="surface card-pad card-hover-border-only">
        <BlogEditClient
          post={post}
          apiBasePath="/api/docs/posts"
          detailBasePath="/docs"
          listBasePath="/docs"
        />
      </div>
    </main>
  )
}
