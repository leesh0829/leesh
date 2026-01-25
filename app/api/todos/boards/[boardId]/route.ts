import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { toISOStringSafe } from '@/app/lib/date'

type JsonError = { message: string }
const jsonError = (status: number, message: string) =>
  NextResponse.json({ message } satisfies JsonError, { status })

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params

  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return jsonError(401, 'unauthorized')

  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!me) return jsonError(401, 'unauthorized')

  const exist = await prisma.board.findUnique({
    where: { id: boardId },
    select: { ownerId: true },
  })
  if (!exist) return jsonError(404, 'not found')
  if (exist.ownerId !== me.id) return jsonError(403, 'forbidden')

  const body = (await req.json().catch(() => null)) as {
    scheduleStatus?: 'TODO' | 'DOING' | 'DONE'
    singleSchedule?: boolean
    scheduleStartAt?: string | null
    scheduleEndAt?: string | null
    scheduleAllDay?: boolean
  } | null

  if (!body) return jsonError(400, 'bad request')

  const data: Record<string, unknown> = {}

  if (body.scheduleStatus) data.scheduleStatus = body.scheduleStatus
  if (typeof body.singleSchedule === 'boolean')
    data.singleSchedule = body.singleSchedule
  if (typeof body.scheduleAllDay === 'boolean')
    data.scheduleAllDay = body.scheduleAllDay

  if (body.scheduleStartAt !== undefined) {
    if (body.scheduleStartAt === null || body.scheduleStartAt === '') {
      data.scheduleStartAt = null
    } else {
      const d = new Date(body.scheduleStartAt)
      if (Number.isNaN(d.getTime()))
        return jsonError(400, 'invalid scheduleStartAt')
      data.scheduleStartAt = d
    }
  }

  if (body.scheduleEndAt !== undefined) {
    if (body.scheduleEndAt === null || body.scheduleEndAt === '') {
      data.scheduleEndAt = null
    } else {
      const d = new Date(body.scheduleEndAt)
      if (Number.isNaN(d.getTime()))
        return jsonError(400, 'invalid scheduleEndAt')
      data.scheduleEndAt = d
    }
  }

  const updated = await prisma.board.update({
    where: { id: boardId },
    data,
    select: {
      id: true,
      name: true,
      description: true,
      scheduleStatus: true,
      singleSchedule: true,
      scheduleStartAt: true,
      scheduleEndAt: true,
      scheduleAllDay: true, // ✅ 여기
      updatedAt: true,
    },
  })

  return NextResponse.json({
    ...updated,
    scheduleStartAt: updated.scheduleStartAt
      ? toISOStringSafe(updated.scheduleStartAt)
      : null,
    scheduleEndAt: updated.scheduleEndAt
      ? toISOStringSafe(updated.scheduleEndAt)
      : null,
    updatedAt: toISOStringSafe(updated.updatedAt),
  })
}
