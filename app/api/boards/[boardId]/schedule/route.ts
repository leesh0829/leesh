import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'

export const runtime = 'nodejs'

type PostStatus = 'TODO' | 'DOING' | 'DONE'
const POST_STATUS: readonly PostStatus[] = ['TODO', 'DOING', 'DONE'] as const

function parsePostStatus(
  v: unknown,
  fallback: PostStatus = 'TODO'
): PostStatus {
  if (typeof v !== 'string') return fallback
  const s = v.trim().toUpperCase()
  return (POST_STATUS as readonly string[]).includes(s)
    ? (s as PostStatus)
    : fallback
}

function toDateOrNull(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const json = await req.json()
    if (json && typeof json === 'object') return json as Record<string, unknown>
    return {}
  } catch {
    return {}
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ boardId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!me)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const { boardId } = await ctx.params
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { id: true, ownerId: true },
  })
  if (!board)
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  if (board.ownerId !== me.id)
    return NextResponse.json({ message: 'forbidden' }, { status: 403 })

  const body = await readBody(req)

  const singleSchedule = Boolean(body.singleSchedule)
  const scheduleStatus = parsePostStatus(body.scheduleStatus, 'TODO')
  const scheduleStartAt = toDateOrNull(body.scheduleStartAt)
  const scheduleEndAt = toDateOrNull(body.scheduleEndAt)
  const scheduleAllDay = Boolean(body.scheduleAllDay)

  if (singleSchedule && !scheduleStartAt) {
    return NextResponse.json(
      { message: 'scheduleStartAt required' },
      { status: 400 }
    )
  }

  await prisma.board.update({
    where: { id: boardId },
    data: {
      singleSchedule,
      scheduleStatus,
      scheduleStartAt: singleSchedule ? scheduleStartAt : null,
      scheduleEndAt: singleSchedule ? scheduleEndAt : null,
      scheduleAllDay: singleSchedule ? scheduleAllDay : false,
    },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ boardId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!me)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const { boardId } = await ctx.params
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { id: true, ownerId: true },
  })
  if (!board)
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  if (board.ownerId !== me.id)
    return NextResponse.json({ message: 'forbidden' }, { status: 403 })

  // 일정만 제거(보드는 유지)
  await prisma.board.update({
    where: { id: boardId },
    data: {
      singleSchedule: false,
      scheduleStartAt: null,
      scheduleEndAt: null,
      scheduleAllDay: false,
      scheduleStatus: 'TODO',
    },
  })

  return NextResponse.json({ ok: true })
}
