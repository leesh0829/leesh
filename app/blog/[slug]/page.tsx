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

  if (!post) {
    return (
      <main className="container-page py-8">
        <div className="surface card-pad">
          <div className="text-sm" style={{ color: 'var(--muted)' }}>
            글 없음
          </div>
        </div>
      </main>
    )
  }

  const session = await getServerSession(authOptions)
  const me = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      })
    : null

  const isPrivileged =
    !!me?.id && (me.id === post.authorId || me.id === post.board.ownerId)

  const cookieStore = await cookies()
  const unlocked = readUnlockedPostIds(
    cookieStore.get(UNLOCK_COOKIE_NAME)?.value
  )
  const unlockedByPassword = unlocked.includes(post.id)

  const locked = post.isSecret && !isPrivileged && !unlockedByPassword

  return (
    <main className="container-page py-8">
      <div className="surface card-pad">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight">
              <span className="break-words">{post.title}</span>{' '}
              {post.isSecret ? (
                <span className="badge align-middle">SECRET</span>
              ) : null}
            </h1>
            <div className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
              {toISOStringSafe(post.createdAt).slice(0, 10)}
            </div>
          </div>

          <div className="shrink-0">
            <BlogActionsClient postId={post.id} canEdit={isPrivileged} />
          </div>
        </header>

        <div className="mt-6">
          {locked ? (
            <div className="card card-pad">
              <BlogSecretGateClient boardId={post.boardId} postId={post.id} />
            </div>
          ) : (
            <>
              <article className="card card-pad">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    img: (props) => (
                      <img
                        {...props}
                        style={{
                          maxWidth: '100%',
                          height: 'auto',
                          borderRadius: 12,
                        }}
                      />
                    ),
                  }}
                >
                  {post.contentMd ?? ''}
                </ReactMarkdown>
              </article>

              <div className="mt-6">
                <BlogCommentsClient boardId={post.boardId} postId={post.id} />
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
