import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import Link from 'next/link'
import BlogEditorClient from './BlogEditorClient'

export const runtime = 'nodejs'

export default async function BlogNewPage() {
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

  let blogBoard = await prisma.board.findFirst({
    where: { ownerId: user.id, type: 'BLOG' },
    select: { id: true },
  })

  if (!blogBoard) {
    blogBoard = await prisma.board.create({
      data: { ownerId: user.id, name: '블로그', type: 'BLOG' },
      select: { id: true },
    })
  }

  return (
    <main className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs opacity-60">Blog</div>
          <h1 className="text-2xl font-semibold">새 글 작성</h1>
        </div>

        <Link href="/blog" className="btn btn-outline">
          목록으로
        </Link>
      </div>

      <div className="surface card-pad">
        <BlogEditorClient boardId={blogBoard.id} />
      </div>
    </main>
  )
}
