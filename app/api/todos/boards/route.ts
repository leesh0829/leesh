import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { toISOStringSafe } from '@/app/lib/date'
import {
  getReadableScheduleOwnerIds,
  toUserLabel,
} from '@/app/lib/scheduleShare'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { z } from 'zod'

type JsonError = { message: string }
const jsonError = (status: number, message: string) =>
  NextResponse.json({ message } satisfies JsonError, { status })

type TodoBoardRow = {
  id: string
  name: string
  description: string | null
  ownerId: string
  owner: { id: string; name: string | null; email: string | null }
  scheduleStatus: 'TODO' | 'DOING' | 'DONE'
  singleSchedule: boolean
  scheduleStartAt: Date | null
  scheduleEndAt: Date | null
  scheduleAllDay: boolean
  createdAt: Date
}

const dateInputSchema = z
  .preprocess(
    (value) => (value === '' ? null : value),
    z.union([z.string(), z.null()]).optional().default(null)
  )
  .refine((value) => !value || !Number.isNaN(new Date(value).getTime()), {
    message: 'invalid date',
  })

const todoBoardCreateSchema = z
  .object({
    name: z.preprocess(
      (value) => (value == null ? '' : String(value).trim()),
      z.string().min(1, 'name is required').max(120)
    ),
    description: z
      .preprocess(
        (value) =>
          value === null || value === undefined ? null : String(value),
        z.union([z.string().max(1000), z.null()])
      )
      .optional()
      .default(null),
    singleSchedule: z.boolean().optional().default(false),
    scheduleStartAt: dateInputSchema,
    scheduleEndAt: dateInputSchema,
    scheduleAllDay: z.boolean().optional().default(false),
  })
  .strict()

function toDateOrNull(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null
}

export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) return jsonError(401, 'unauthorized')

  const readableOwnerIds = await getReadableScheduleOwnerIds(userId, 'TODO')

  const boards: TodoBoardRow[] = await prisma.board.findMany({
    where: { ownerId: { in: readableOwnerIds }, type: 'TODO' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      ownerId: true,
      owner: {
        select: { id: true, name: true, email: true },
      },
      scheduleStatus: true,
      singleSchedule: true,
      scheduleStartAt: true,
      scheduleEndAt: true,
      scheduleAllDay: true,
      createdAt: true,
    },
  })

  return NextResponse.json(
    boards.map((b: TodoBoardRow) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      ownerId: b.ownerId,
      ownerLabel: toUserLabel(b.owner.name, b.owner.email),
      shared: b.ownerId !== userId,
      canEdit: b.ownerId === userId,
      scheduleStatus: b.scheduleStatus,
      singleSchedule: b.singleSchedule,
      scheduleStartAt: b.scheduleStartAt
        ? toISOStringSafe(b.scheduleStartAt)
        : null,
      scheduleEndAt: b.scheduleEndAt ? toISOStringSafe(b.scheduleEndAt) : null,
      scheduleAllDay: b.scheduleAllDay,
      createdAt: toISOStringSafe(b.createdAt),
    }))
  )
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId()
  if (!userId) return jsonError(401, 'unauthorized')

  const parsed = await parseJsonWithSchema(req, todoBoardCreateSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'bad request')
  const {
    name,
    description,
    singleSchedule,
    scheduleStartAt,
    scheduleEndAt,
    scheduleAllDay,
  } = parsed.data

  const created = await prisma.board.create({
    data: {
      ownerId: userId,
      name,
      description,
      type: 'TODO',
      scheduleStatus: 'TODO',
      singleSchedule,
      scheduleStartAt: singleSchedule ? toDateOrNull(scheduleStartAt) : null,
      scheduleEndAt: singleSchedule ? toDateOrNull(scheduleEndAt) : null,
      scheduleAllDay,
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
