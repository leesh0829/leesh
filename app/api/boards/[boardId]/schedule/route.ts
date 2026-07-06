import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import {
  boardSchedulePatchSchema,
  buildBoardScheduleUpdateData,
} from '@/app/lib/boardSchedulePayload'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'

export const runtime = 'nodejs'

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ boardId: string }> }
) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const { boardId } = await ctx.params
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { id: true, ownerId: true },
  })
  if (!board)
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  if (board.ownerId !== userId)
    return NextResponse.json({ message: 'forbidden' }, { status: 403 })

  const parsed = await parseJsonWithSchema(req, boardSchedulePatchSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid body')

  await prisma.board.update({
    where: { id: boardId },
    data: buildBoardScheduleUpdateData(parsed.data),
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ boardId: string }> }
) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const { boardId } = await ctx.params
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { id: true, ownerId: true },
  })
  if (!board)
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  if (board.ownerId !== userId)
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
