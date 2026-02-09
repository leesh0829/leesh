import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { toISOStringSafe } from '@/app/lib/date'
import {
  getReadableScheduleOwnerIds,
  toUserLabel,
} from '@/app/lib/scheduleShare'

export const runtime = 'nodejs'

type BoardType = 'GENERAL' | 'BLOG' | 'PORTFOLIO' | 'TODO' | 'CALENDAR' | 'HELP'
type PostStatus = 'TODO' | 'DOING' | 'DONE'

type CalendarBoardRow = {
  id: string
  name: string
  type: BoardType
  ownerId: string
  owner: { id: string; name: string | null; email: string | null }
  singleSchedule: boolean
  scheduleStatus: PostStatus
  scheduleStartAt: Date | null
  scheduleEndAt: Date | null
  scheduleAllDay: boolean
}

type CalendarPostRow = {
  id: string
  slug: string | null
  boardId: string
  authorId: string
  title: string
  status: PostStatus
  isSecret: boolean
  startAt: Date | null
  endAt: Date | null
  allDay: boolean
  createdAt: Date
}

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

  const readableOwnerIds = await getReadableScheduleOwnerIds(
    user.id,
    'CALENDAR'
  )

  // 내 보드 + 공유 허용된 사용자 보드
  const boards: CalendarBoardRow[] = await prisma.board.findMany({
    where: { ownerId: { in: readableOwnerIds } },
    select: {
      id: true,
      name: true,
      type: true,
      ownerId: true,
      owner: { select: { id: true, name: true, email: true } },
      singleSchedule: true,
      scheduleStatus: true,
      scheduleStartAt: true,
      scheduleEndAt: true,
      scheduleAllDay: true,
    },
  })
  const boardIds = boards.map((b: CalendarBoardRow) => b.id)

  // 1) 게시글(Post) 기반 일정
  const posts: CalendarPostRow[] = await prisma.post.findMany({
    where: {
      boardId: { in: boardIds },
      startAt: { not: null, lt: end },
      OR: [{ endAt: null, startAt: { gte: start } }, { endAt: { gte: start } }],
    },
    select: {
      id: true,
      slug: true,
      boardId: true,
      authorId: true,
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
    boards.map((b: CalendarBoardRow) => [
      b.id,
      {
        name: b.name,
        type: b.type,
        ownerId: b.ownerId,
        ownerLabel: toUserLabel(b.owner.name, b.owner.email),
      },
    ])
  )

  const data = posts
    .filter((p: CalendarPostRow) => p.startAt)
    .map((p: CalendarPostRow) => {
      const info = boardInfoMap.get(p.boardId)
      const ownerId = info?.ownerId ?? user.id
      const ownerLabel = info?.ownerLabel ?? '알 수 없는 사용자'
      const shared = ownerId !== user.id
      const canEdit = p.authorId === user.id
      const ownerPrefix = shared ? `[${ownerLabel}] ` : ''
      return {
        kind: 'POST' as const,
        id: p.id,
        slug: p.slug ?? null,
        boardId: p.boardId,
        boardName: info?.name ?? '',
        boardType: info?.type ?? 'GENERAL',
        ownerId,
        ownerLabel,
        canEdit,
        shared,
        title: p.title,
        displayTitle: `${ownerPrefix}${info?.name ?? ''} · ${p.title}`.trim(),
        status: p.status,
        isSecret: p.isSecret,
        startAt: p.startAt ? toISOStringSafe(p.startAt) : null,
        endAt: p.endAt ? toISOStringSafe(p.endAt) : null,
        allDay: p.allDay,
        createdAt: p.createdAt ? toISOStringSafe(p.createdAt) : null,
      }
    })

  // 2) 보드(Board) 자체 일정 (singleSchedule=true)
  const boardSchedules = boards
    .filter((b: CalendarBoardRow) => b.singleSchedule && b.scheduleStartAt)
    .filter((b: CalendarBoardRow) => {
      const s = b.scheduleStartAt!
      const e = b.scheduleEndAt
      if (s >= end) return false
      if (!e) return s >= start
      return e >= start
    })
    .map((b: CalendarBoardRow) => {
      const ownerLabel = toUserLabel(b.owner.name, b.owner.email)
      const shared = b.ownerId !== user.id
      const canEdit = b.ownerId === user.id
      const ownerPrefix = shared ? `[${ownerLabel}] ` : ''
      return {
        kind: 'BOARD' as const,
        id: b.id, // 캘린더에선 boardId가 곧 id
        slug: null,
        boardId: b.id,
        boardName: b.name,
        boardType: b.type,
        ownerId: b.ownerId,
        ownerLabel,
        canEdit,
        shared,
        title: b.name, // title은 board title만
        displayTitle: `${ownerPrefix}${b.name}`.trim(),
        status: b.scheduleStatus,
        isSecret: false,
        startAt: b.scheduleStartAt ? toISOStringSafe(b.scheduleStartAt) : null,
        endAt: b.scheduleEndAt ? toISOStringSafe(b.scheduleEndAt) : null,
        allDay: b.scheduleAllDay,
        createdAt: null,
      }
    })

  const merged = [...data, ...boardSchedules].sort((a, b) => {
    const at = a.startAt ? new Date(a.startAt).getTime() : 0
    const bt = b.startAt ? new Date(b.startAt).getTime() : 0
    if (at !== bt) return at - bt
    return a.displayTitle.localeCompare(b.displayTitle)
  })

  return NextResponse.json(merged)
}
