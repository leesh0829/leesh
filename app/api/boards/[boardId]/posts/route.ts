import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'

export const runtime = 'nodejs'
const postStatusSchema = z.enum(['TODO', 'DOING', 'DONE'])
const dateInputSchema = z
  .union([z.string(), z.null()])
  .optional()
  .refine(
    (value) =>
      value === undefined ||
      value === null ||
      value === '' ||
      !Number.isNaN(new Date(value).getTime()),
    { message: 'invalid date' }
  )
const createBoardPostSchema = z
  .object({
    title: z.string().trim().min(1, 'title required'),
    contentMd: z.string().optional().default(''),
    status: postStatusSchema.optional().default('TODO'),
    priority: z.coerce.number().optional().default(0),
    startAt: dateInputSchema,
    endAt: dateInputSchema,
    allDay: z.boolean().optional().default(false),
    isSecret: z.boolean().optional().default(false),
    secretPassword: z.string().optional().default(''),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.isSecret && !value.secretPassword.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'secretPassword required',
        path: ['secretPassword'],
      })
    }
  })

type Ctx = { params: Promise<{ boardId: string }> }

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function toNullableDate(raw: string | null | undefined): Date | null {
  if (!raw) return null
  return new Date(raw)
}

export async function GET(_req: Request, ctx: Ctx) {
  const { boardId } = await ctx.params

  const session = await getServerSession(authOptions)
  if (!session?.user?.email)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  // 보드 소유자 확인
  const board = await prisma.board.findFirst({
    where: { id: boardId, ownerId: user.id },
    select: { id: true },
  })
  if (!board)
    return NextResponse.json({ message: 'not found' }, { status: 404 })

  const posts = await prisma.post.findMany({
    where: { boardId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      isSecret: true,
      startAt: true,
      endAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json(posts)
}

export async function POST(req: Request, ctx: Ctx) {
  const { boardId } = await ctx.params

  const session = await getServerSession(authOptions)
  if (!session?.user?.email)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  // 보드 소유자 확인
  const board = await prisma.board.findFirst({
    where: { id: boardId, ownerId: user.id },
    select: { id: true, singleSchedule: true },
  })
  if (!board)
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  if (board.singleSchedule) {
    return NextResponse.json(
      {
        message:
          '이 보드는 한 일정만(보드 자체 일정) 모드라 일정을 만들 수 없습니다.',
      },
      { status: 409 }
    )
  }

  const parsed = await parseJsonWithSchema(req, createBoardPostSchema)
  if (!parsed.success) {
    return badRequestFromZod(parsed.error, 'invalid body')
  }

  const title = parsed.data.title
  const contentMd = parsed.data.contentMd
  const isSecret = parsed.data.isSecret
  const secretPassword = parsed.data.secretPassword.trim()

  let secretPasswordHash: string | null = null
  if (isSecret) {
    secretPasswordHash = await bcrypt.hash(secretPassword, 10)
  }

  const baseSlug = slugify(title) || 'post'
  let slug = baseSlug

  for (let i = 2; i < 50; i++) {
    const exists = await prisma.post.findFirst({
      where: { boardId, slug },
      select: { id: true },
    })
    if (!exists) break
    slug = `${baseSlug}-${i}`
  }

  const post = await prisma.post.create({
    data: {
      boardId,
      authorId: user.id,
      title,
      contentMd,
      status: parsed.data.status,
      priority: Number(parsed.data.priority) || 0,
      startAt: toNullableDate(parsed.data.startAt),
      endAt: toNullableDate(parsed.data.endAt),
      allDay: parsed.data.allDay,
      isSecret,
      secretPasswordHash,
      slug,
    },
    select: { id: true, slug: true },
  })

  return NextResponse.json(post, { status: 201 })
}
