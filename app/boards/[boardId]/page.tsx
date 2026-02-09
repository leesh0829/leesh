import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import BoardDetailClient from './BoardDetailClient'
import { toISOStringNullable, toISOStringSafe } from '@/app/lib/date'
import { notFound } from 'next/navigation'

export const runtime = 'nodejs'

type BoardPostRow = {
  id: string
  title: string
  status: 'TODO' | 'DOING' | 'DONE'
  isSecret: boolean
  startAt: Date | null
  endAt: Date | null
  createdAt: Date
  slug: string | null
}

export default async function BoardDetailPage(props: {
  params: Promise<{ boardId: string }>
}) {
  const { boardId } = await props.params

  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: {
      id: true,
      name: true,
      description: true,
      ownerId: true,
      type: true,
      singleSchedule: true,
      scheduleStatus: true,
      scheduleStartAt: true,
      scheduleEndAt: true,
      scheduleAllDay: true,
    },
  })
  if (!board)
    return <main style={{ padding: 24 }}>보드를 찾을 수 없습니다.</main>

  // PORTFOLIO(= /leesh 전용), HELP 등은 /boards에서 접근 금지
  if (board.type !== 'GENERAL') {
    notFound()
  }

  const session = await getServerSession(authOptions)
  const me = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      })
    : null

  const canCreate = !!me?.id && me.id === board.ownerId

  const postsRaw: BoardPostRow[] = await prisma.post.findMany({
    where: { boardId: board.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      status: true,
      isSecret: true,
      startAt: true,
      endAt: true,
      createdAt: true,
      slug: true,
    },
  })

  const safePosts = postsRaw.map((p: BoardPostRow) => ({
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
      canCreate={canCreate}
    />
  )
}
