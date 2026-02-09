import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import BoardDetailClient from '@/app/boards/[boardId]/BoardDetailClient'
import { toISOStringNullable, toISOStringSafe } from '@/app/lib/date'
import { toUserLabel } from '@/app/lib/scheduleShare'

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
      owner: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  })
  if (!board) return <main style={{ padding: 24 }}>보드 없음</main>
  if (board.type !== 'TODO')
    return <main style={{ padding: 24 }}>TODO 보드만 접근 가능</main>

  const canCreate = board.ownerId === me.id
  if (!canCreate) {
    const canRead = await prisma.scheduleShare.findFirst({
      where: {
        requesterId: me.id,
        ownerId: board.ownerId,
        scope: 'TODO',
        status: 'ACCEPTED',
      },
      select: { id: true },
    })
    if (!canRead) return <main style={{ padding: 24 }}>권한 없음</main>
  }

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
        description: canCreate
          ? board.description
          : `${board.description ? `${board.description} · ` : ''}공유자: ${toUserLabel(board.owner.name, board.owner.email)}`,
        singleSchedule: board.singleSchedule,
        scheduleStatus: board.scheduleStatus,
        scheduleStartAt: toISOStringNullable(board.scheduleStartAt),
        scheduleEndAt: toISOStringNullable(board.scheduleEndAt),
        scheduleAllDay: board.scheduleAllDay,
      }}
      initialPosts={safePosts}
      canCreate={canCreate}
      backHref="/todos"
      backLabel="← todos"
    />
  )
}
