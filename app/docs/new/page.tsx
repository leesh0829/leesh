import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import Link from 'next/link'
import BlogEditorClient from '@/app/blog/new/BlogEditorClient'

export const runtime = 'nodejs'

export default async function DocsNewPage() {
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

  let docsBoard = await prisma.board.findFirst({
    where: { ownerId: user.id, type: 'DOCS' },
    select: { id: true },
  })

  if (!docsBoard) {
    docsBoard = await prisma.board.create({
      data: { ownerId: user.id, name: '문서', type: 'DOCS' },
      select: { id: true },
    })
  }

  return (
    <main className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs opacity-60">Docs</div>
          <h1 className="text-2xl font-semibold">새 문서 작성</h1>
        </div>

        <Link href="/docs" className="btn btn-outline">
          목록으로
        </Link>
      </div>

      <div className="surface card-pad card-hover-border-only">
        <BlogEditorClient
          boardId={docsBoard.id}
          apiBasePath="/api/docs/posts"
          detailBasePath="/docs"
        />
      </div>
    </main>
  )
}
