import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import BoardDetailClient from '@/app/boards/[boardId]/BoardDetailClient'
import { toISOStringNullable, toISOStringSafe } from '@/app/lib/date'

export const runtime = 'nodejs'

export default async function TodoBoardDetailPage({
  params,
}: {
  params: Promise<{ boardId: string }>
}) {
  const { boardId } = await params

  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return <main style={{ padding: 24 }}>로그인이 필요합니다.</main>
  }

  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!me) return <main style={{ padding: 24 }}>사용자 없음</main>

  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: {
      id: true,
      name: true,
      description: true,
      singleSchedule: true,
      scheduleStatus: true,
      scheduleStartAt: true,
      scheduleEndAt: true,
      scheduleAllDay: true,
      ownerId: true,
      type: true,
    },
  })
  if (!board) return <main style={{ padding: 24 }}>보드 없음</main>
  if (board.type !== 'TODO')
    return <main style={{ padding: 24 }}>TODO 보드만 접근 가능</main>
  if (board.ownerId !== me.id)
    return <main style={{ padding: 24 }}>권한 없음</main>

  const posts = await prisma.post.findMany({
    where: { boardId: board.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      isSecret: true,
      createdAt: true,
      startAt: true,
      endAt: true,
      allDay: true,
    },
  })

  const safePosts = posts.map((p) => ({
    ...p,
    createdAt: toISOStringSafe(p.createdAt),
    startAt: toISOStringNullable(p.startAt),
    endAt: toISOStringNullable(p.endAt),
  }))

  return (
    <BoardDetailClient
      board={{
        id: board.id,
        name: board.name,
        description: board.description,
        singleSchedule: board.singleSchedule,
        scheduleStatus: board.scheduleStatus,
        scheduleStartAt: toISOStringNullable(board.scheduleStartAt),
        scheduleEndAt: toISOStringNullable(board.scheduleEndAt),
        scheduleAllDay: board.scheduleAllDay,
      }}
      initialPosts={safePosts}
      canCreate={true}
      backHref="/todos"
      backLabel="← todos"
    />
  )
}
