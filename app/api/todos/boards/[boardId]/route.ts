import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { toISOStringSafe } from '@/app/lib/date'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { z } from 'zod'

type JsonError = { message: string }
const jsonError = (status: number, message: string) =>
  NextResponse.json({ message } satisfies JsonError, { status })

const todoStatusSchema = z.enum(['TODO', 'DOING', 'DONE'])
const dateInputSchema = z
  .preprocess(
    (value) => (value === '' ? null : value),
    z.union([z.string(), z.null()]).optional()
  )
  .refine((value) => !value || !Number.isNaN(new Date(value).getTime()), {
    message: 'invalid date',
  })

const todoBoardPatchSchema = z
  .object({
    scheduleStatus: todoStatusSchema.optional(),
    singleSchedule: z.boolean().optional(),
    scheduleStartAt: dateInputSchema,
    scheduleEndAt: dateInputSchema,
    scheduleAllDay: z.boolean().optional(),
  })
  .strict()

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params

  const userId = await getCurrentUserId()
  if (!userId) return jsonError(401, 'unauthorized')

  const exist = await prisma.board.findUnique({
    where: { id: boardId },
    select: { ownerId: true, type: true },
  })
  if (!exist) return jsonError(404, 'not found')
  if (exist.type !== 'TODO') return jsonError(404, 'not found')
  if (exist.ownerId !== userId) return jsonError(403, 'forbidden')

  const parsed = await parseJsonWithSchema(req, todoBoardPatchSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'bad request')
  const body = parsed.data

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
