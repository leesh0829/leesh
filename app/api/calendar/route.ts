import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { toISOStringSafe } from '@/app/lib/date'

export const runtime = 'nodejs'

function ymToRange(month: string) {
  const [y, m] = month.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0))
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0))
  return { start, end }
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const month = url.searchParams.get('month')
  if (!month)
    return NextResponse.json({ message: 'month required' }, { status: 400 })

  const { start, end } = ymToRange(month)

  // 내 보드
  const boards = await prisma.board.findMany({
    where: { ownerId: user.id },
    select: {
      id: true,
      name: true,
      type: true,
      singleSchedule: true,
      scheduleStatus: true,
      scheduleStartAt: true,
      scheduleEndAt: true,
      scheduleAllDay: true,
    },
  })
  const boardIds = boards.map((b) => b.id)

  // 1) 게시글(Post) 기반 일정
  const posts = await prisma.post.findMany({
    where: {
      boardId: { in: boardIds },
      startAt: { not: null, lt: end },
      OR: [{ endAt: null, startAt: { gte: start } }, { endAt: { gte: start } }],
    },
    select: {
      id: true,
      slug: true,
      boardId: true,
      title: true,
      status: true,
      isSecret: true,
      startAt: true,
      endAt: true,
      allDay: true,
      createdAt: true,
    },
    orderBy: [{ startAt: 'asc' }, { createdAt: 'asc' }],
  })

  const boardInfoMap = new Map(
    boards.map((b) => [b.id, { name: b.name, type: b.type }])
  )

  const data = posts
    .filter((p) => p.startAt)
    .map((p) => ({
      kind: 'POST' as const,
      id: p.id,
      slug: p.slug ?? null,
      boardId: p.boardId,
      boardName: boardInfoMap.get(p.boardId)?.name ?? '',
      boardType: boardInfoMap.get(p.boardId)?.type ?? 'GENERAL',
      title: p.title,
      displayTitle:
        `${boardInfoMap.get(p.boardId)?.name ?? ''} · ${p.title}`.trim(),
      status: p.status,
      isSecret: p.isSecret,
      startAt: p.startAt ? toISOStringSafe(p.startAt) : null,
      endAt: p.endAt ? toISOStringSafe(p.endAt) : null,
      allDay: p.allDay,
      createdAt: p.createdAt ? toISOStringSafe(p.createdAt) : null,
    }))

  // 2) 보드(Board) 자체 일정 (singleSchedule=true)
  const boardSchedules = boards
    .filter((b) => b.singleSchedule && b.scheduleStartAt)
    .filter((b) => {
      const s = b.scheduleStartAt!
      const e = b.scheduleEndAt
      if (s >= end) return false
      if (!e) return s >= start
      return e >= start
    })
    .map((b) => ({
      kind: 'BOARD' as const,
      id: b.id, // 캘린더에선 boardId가 곧 id
      slug: null,
      boardId: b.id,
      boardName: b.name,
      boardType: b.type,
      title: b.name, // title은 board title만
      displayTitle: b.name,
      status: b.scheduleStatus,
      isSecret: false,
      startAt: b.scheduleStartAt ? toISOStringSafe(b.scheduleStartAt) : null,
      endAt: b.scheduleEndAt ? toISOStringSafe(b.scheduleEndAt) : null,
      allDay: b.scheduleAllDay,
      createdAt: null,
    }))

  const merged = [...data, ...boardSchedules].sort((a, b) => {
    const at = a.startAt ? new Date(a.startAt).getTime() : 0
    const bt = b.startAt ? new Date(b.startAt).getTime() : 0
    if (at !== bt) return at - bt
    return a.displayTitle.localeCompare(b.displayTitle)
  })

  return NextResponse.json(merged)
}
