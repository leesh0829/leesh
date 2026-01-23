import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { toISOStringSafe } from '@/app/lib/date'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'
import BlogCommentsClient from './BlogCommentsClient'
import BlogActionsClient from './BlogActionsClient'

export const runtime = 'nodejs'

export default async function BlogDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const post = await prisma.post.findFirst({
    where: {
      OR: [{ slug }, { id: slug }],
      board: { type: 'BLOG' },
      status: 'DONE',
    },
    select: {
      id: true,
      boardId: true,
      title: true,
      contentMd: true,
      createdAt: true,
      authorId: true,
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

  const canEdit =
    !!me?.id && (me.id === post.authorId || me.id === post.board.ownerId)

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 4 }}>{post.title}</h1>

      <div style={{ opacity: 0.6, marginBottom: 18 }}>
        {toISOStringSafe(post.createdAt).slice(0, 10)}
      </div>

      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeHighlight]}
      >
        {post.contentMd ?? ''}
      </ReactMarkdown>

      <BlogActionsClient postId={post.id} canEdit={canEdit} />

      <BlogCommentsClient
        boardId={post.boardId ?? undefined}
        postId={post.id}
      />
    </main>
  )
}
