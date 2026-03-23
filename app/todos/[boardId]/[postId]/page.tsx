import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import PostDetailClient from '@/app/boards/[boardId]/[postId]/PostDetailClient'
import { toISOStringSafe } from '@/app/lib/date'
import { cookies } from 'next/headers'
import { readUnlockedPostIds, UNLOCK_COOKIE_NAME } from '@/app/lib/unlockCookie'

export const runtime = 'nodejs'

export default async function TodoPostDetailPage({
  params,
}: {
  params: Promise<{ boardId: string; postId: string }>
}) {
  const { boardId, postId } = await params

  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return <main style={{ padding: 24 }}>로그인이 필요합니다.</main>
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true },
  })
  if (!user) return <main style={{ padding: 24 }}>사용자 없음</main>

  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { id: true, name: true, ownerId: true, type: true },
  })
  if (!board) return <main style={{ padding: 24 }}>보드를 찾을 수 없습니다.</main>
  if (board.type !== 'TODO')
    return <main style={{ padding: 24 }}>TODO 보드만 접근 가능</main>

  const canReadOwnBoard = board.ownerId === user.id
  if (!canReadOwnBoard) {
    const shared = await prisma.scheduleShare.findFirst({
      where: {
        requesterId: user.id,
        ownerId: board.ownerId,
        scope: 'TODO',
        status: 'ACCEPTED',
      },
      select: { id: true },
    })
    if (!shared) return <main style={{ padding: 24 }}>권한 없음</main>
  }

  const postRaw = await prisma.post.findFirst({
    where: {
      boardId,
      OR: [{ id: postId }, { slug: postId }],
    },
    select: {
      id: true,
      title: true,
      contentMd: true,
      isSecret: true,
      secretPasswordHash: true,
      status: true,
      createdAt: true,
      authorId: true,
      startAt: true,
      endAt: true,
      allDay: true,
    },
  })
  if (!postRaw) return <main style={{ padding: 24 }}>글 없음</main>

  const jar = await cookies()
  const unlockedIds = readUnlockedPostIds(jar.get(UNLOCK_COOKIE_NAME)?.value)
  const unlockedByPassword = unlockedIds.includes(postRaw.id)

  const isAdmin = user.role === 'ADMIN'
  const isAuthor = postRaw.authorId === user.id
  const isPasswordLocked = postRaw.isSecret && !!postRaw.secretPasswordHash

  const canView = isPasswordLocked
    ? unlockedByPassword || isAuthor || isAdmin
    : !postRaw.isSecret || isAuthor || isAdmin

  const post = {
    id: postRaw.id,
    title: postRaw.title,
    contentMd: canView ? postRaw.contentMd : '',
    isSecret: postRaw.isSecret,
    status: postRaw.status,
    createdAt: toISOStringSafe(postRaw.createdAt),
    locked: !canView,
    startAt: postRaw.startAt ? toISOStringSafe(postRaw.startAt) : null,
    endAt: postRaw.endAt ? toISOStringSafe(postRaw.endAt) : null,
    allDay: !!postRaw.allDay,
    canEdit: isAuthor,
  }

  return (
    <PostDetailClient
      boardId={board.id}
      boardName={board.name}
      post={post}
      backHref={`/todos/${board.id}`}
      backLabel="todos"
    />
  )
}
