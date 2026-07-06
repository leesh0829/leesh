import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { buildOwnedGeneralBoardsQuery } from '@/app/lib/boardQueries'
import { z } from 'zod'

export const runtime = 'nodejs'

const postStatusSchema = z.enum(['TODO', 'DOING', 'DONE'])
const dateInputSchema = z
  .preprocess((value) => (value === '' ? null : value), z.union([z.string(), z.null()]).optional().default(null))
  .refine((value) => !value || !Number.isNaN(new Date(value).getTime()), {
    message: 'invalid date',
  })

const boardCreateSchema = z
  .object({
    name: z.preprocess(
      (value) => (value == null ? '' : String(value).trim()),
      z.string().min(1, 'name required').max(120)
    ),
    description: z
      .preprocess(
        (value) => (value === null || value === undefined ? null : String(value)),
        z.union([z.string().max(1000), z.null()])
      )
      .optional()
      .default(null),
    singleSchedule: z.boolean().optional().default(false),
    scheduleStatus: postStatusSchema.optional().default('TODO'),
    scheduleStartAt: dateInputSchema,
    scheduleEndAt: dateInputSchema,
    scheduleAllDay: z.boolean().optional().default(false),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.singleSchedule && !value.scheduleStartAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scheduleStartAt'],
        message: 'scheduleStartAt required when singleSchedule is true',
      })
    }
  })

function toDateOrNull(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null
}

export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const boards = await prisma.board.findMany(buildOwnedGeneralBoardsQuery(userId))
  return NextResponse.json(boards)
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const parsed = await parseJsonWithSchema(req, boardCreateSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error)
  const {
    name,
    description,
    singleSchedule,
    scheduleStatus,
    scheduleStartAt,
    scheduleEndAt,
    scheduleAllDay,
  } = parsed.data

  const board = await prisma.board.create({
    data: {
      name,
      description,
      ownerId: userId,
      type: 'GENERAL',

      singleSchedule,
      scheduleStatus,
      scheduleStartAt: singleSchedule ? toDateOrNull(scheduleStartAt) : null,
      scheduleEndAt: singleSchedule ? toDateOrNull(scheduleEndAt) : null,
      scheduleAllDay: singleSchedule ? scheduleAllDay : false,
    },
  })

  return NextResponse.json(board)
}
