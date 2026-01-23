import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { toISOStringSafe } from '@/app/lib/date'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import BlogCommentsClient from './BlogCommentsClient'
import BlogActionsClient from './BlogActionsClient'
import BlogSecretGateClient from './BlogSecretGateClient'
import { cookies } from 'next/headers'
import { readUnlockedPostIds, UNLOCK_COOKIE_NAME } from '@/app/lib/unlockCookie'

export const runtime = 'nodejs'

export default async function BlogDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // slug 우선 조회, 없으면 id fallback
  const post = await prisma.post.findFirst({
    where: {
      OR: [{ slug }, { id: slug }],
      board: { type: 'BLOG' },
      status: 'DONE',
    },
    select: {
      id: true,
      slug: true,
      boardId: true,
      title: true,
      contentMd: true,
      createdAt: true,
      authorId: true,
      isSecret: true,
      board: { select: { ownerId: true } },
    },
  })

  if (!post) return <main style={{ padding: 24 }}>글 없음</main>

  const session = await getServerSession(authOptions)
  const me = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      })
    : null

  // 작성자/보드주인은 비번 없이도 열람 허용
  const isPrivileged =
    !!me?.id && (me.id === post.authorId || me.id === post.board.ownerId)

  // 비번 unlock 쿠키 확인
  const cookieStore = await cookies()
  const unlocked = readUnlockedPostIds(
    cookieStore.get(UNLOCK_COOKIE_NAME)?.value
  )
  const unlockedByPassword = unlocked.includes(post.id)

  const locked = post.isSecret && !isPrivileged && !unlockedByPassword

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 4 }}>
        {post.title} {post.isSecret ? '🔒' : ''}
      </h1>

      <div style={{ opacity: 0.6, marginBottom: 18 }}>
        {toISOStringSafe(post.createdAt).slice(0, 10)}
      </div>

      <BlogActionsClient postId={post.id} canEdit={isPrivileged} />

      {locked ? (
        <BlogSecretGateClient boardId={post.boardId} postId={post.id} />
      ) : (
        <>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >
            {post.contentMd ?? ''}
          </ReactMarkdown>

          <BlogCommentsClient boardId={post.boardId} postId={post.id} />
        </>
      )}
    </main>
  )
}
