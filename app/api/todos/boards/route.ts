import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { toISOStringSafe } from '@/app/lib/date'

type JsonError = { message: string }
const jsonError = (status: number, message: string) =>
  NextResponse.json({ message } satisfies JsonError, { status })

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return jsonError(401, 'unauthorized')

  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!me) return jsonError(401, 'unauthorized')

  const boards = await prisma.board.findMany({
    where: { ownerId: me.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      scheduleStatus: true,
      singleSchedule: true,
      scheduleStartAt: true,
      scheduleEndAt: true,
      scheduleAllDay: true,
      createdAt: true,
    },
  })

  return NextResponse.json(
    boards.map((b) => ({
      ...b,
      scheduleStartAt: b.scheduleStartAt
        ? toISOStringSafe(b.scheduleStartAt)
        : null,
      scheduleEndAt: b.scheduleEndAt ? toISOStringSafe(b.scheduleEndAt) : null,
      createdAt: toISOStringSafe(b.createdAt),
    }))
  )
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return jsonError(401, 'unauthorized')

  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!me) return jsonError(401, 'unauthorized')

  const body = (await req.json().catch(() => null)) as {
    name?: string
    description?: string | null
    singleSchedule?: boolean
    scheduleStartAt?: string | null
    scheduleEndAt?: string | null
    scheduleAllDay?: boolean
  } | null

  if (!body?.name?.trim()) return jsonError(400, 'name is required')

  const singleSchedule = !!body.singleSchedule

  const start =
    singleSchedule && body.scheduleStartAt
      ? new Date(body.scheduleStartAt)
      : null
  if (start && Number.isNaN(start.getTime()))
    return jsonError(400, 'invalid scheduleStartAt')

  const end =
    singleSchedule && body.scheduleEndAt ? new Date(body.scheduleEndAt) : null
  if (end && Number.isNaN(end.getTime()))
    return jsonError(400, 'invalid scheduleEndAt')

  const created = await prisma.board.create({
    data: {
      ownerId: me.id,
      name: body.name.trim(),
      description: body.description ?? null,
      type: 'TODO',
      scheduleStatus: 'TODO',
      singleSchedule,
      scheduleStartAt: start,
      scheduleEndAt: end,
      scheduleAllDay: !!body.scheduleAllDay,
    },
    select: {
      id: true,
      name: true,
      description: true,
      scheduleStatus: true,
      singleSchedule: true,
      scheduleStartAt: true,
      scheduleEndAt: true,
      scheduleAllDay: true,
      createdAt: true,
    },
  })

  return NextResponse.json({
    ...created,
    scheduleStartAt: created.scheduleStartAt
      ? toISOStringSafe(created.scheduleStartAt)
      : null,
    scheduleEndAt: created.scheduleEndAt
      ? toISOStringSafe(created.scheduleEndAt)
      : null,
    createdAt: toISOStringSafe(created.createdAt),
  })
}
