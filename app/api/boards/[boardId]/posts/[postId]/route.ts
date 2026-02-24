import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { toISOStringSafe } from '@/app/lib/date'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'

export const runtime = 'nodejs'
const postStatusSchema = z.enum(['TODO', 'DOING', 'DONE'])
const patchDateInputSchema = z
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
const patchPostSchema = z
  .object({
    title: z.string().transform((v) => v.trim()).optional(),
    contentMd: z.string().optional(),
    status: postStatusSchema.optional(),
    allDay: z.boolean().optional(),
    startAt: patchDateInputSchema,
    endAt: patchDateInputSchema,
  })
  .strict()

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ boardId: string; postId: string }> }
) {
  const { boardId, postId } = await params

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

  // 기존 로직 유지: 보드 owner만 GET 허용
  const board = await prisma.board.findFirst({
    where: { id: boardId, ownerId: user.id },
    select: { id: true },
  })
  if (!board)
    return NextResponse.json({ message: 'not found' }, { status: 404 })

  const post = await prisma.post.findFirst({
    where: { id: postId, boardId },
    select: {
      id: true,
      title: true,
      contentMd: true,
      status: true,
      priority: true,
      startAt: true,
      endAt: true,
      allDay: true,
      isSecret: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (!post) return NextResponse.json({ message: 'not found' }, { status: 404 })

  if (post.isSecret) {
    return NextResponse.json({
      ...post,
      contentMd: '',
      locked: true,
      createdAt: toISOStringSafe(post.createdAt),
      updatedAt: toISOStringSafe(post.updatedAt),
      startAt: post.startAt ? toISOStringSafe(post.startAt) : null,
      endAt: post.endAt ? toISOStringSafe(post.endAt) : null,
    })
  }

  return NextResponse.json({
    ...post,
    locked: false,
    createdAt: toISOStringSafe(post.createdAt),
    updatedAt: toISOStringSafe(post.updatedAt),
    startAt: post.startAt ? toISOStringSafe(post.startAt) : null,
    endAt: post.endAt ? toISOStringSafe(post.endAt) : null,
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ boardId: string; postId: string }> }
) {
  const { boardId, postId } = await params

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

  const postForAuth = await prisma.post.findFirst({
    where: { id: postId, boardId },
    select: { id: true, authorId: true },
  })
  if (!postForAuth)
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  if (postForAuth.authorId !== user.id)
    return NextResponse.json({ message: 'forbidden' }, { status: 403 })

  const parsed = await parseJsonWithSchema(req, patchPostSchema)
  if (!parsed.success) {
    return badRequestFromZod(parsed.error, 'invalid body')
  }

  const title = parsed.data.title
  const status = parsed.data.status
  const contentMd = parsed.data.contentMd
  const allDay = parsed.data.allDay

  const startAt =
    parsed.data.startAt === undefined
      ? undefined
      : parsed.data.startAt === null || parsed.data.startAt === ''
        ? null
        : new Date(parsed.data.startAt)

  const endAt =
    parsed.data.endAt === undefined
      ? undefined
      : parsed.data.endAt === null || parsed.data.endAt === ''
        ? null
        : new Date(parsed.data.endAt)

  if (
    title === undefined &&
    contentMd === undefined &&
    status === undefined &&
    allDay === undefined &&
    startAt === undefined &&
    endAt === undefined
  ) {
    return NextResponse.json({ message: 'nothing to update' }, { status: 400 })
  }

  const updated = await prisma.post.update({
    where: { id: postForAuth.id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(contentMd !== undefined ? { contentMd } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(allDay !== undefined ? { allDay } : {}),
      ...(startAt !== undefined ? { startAt } : {}),
      ...(endAt !== undefined ? { endAt } : {}),
    },
    select: {
      id: true,
      title: true,
      contentMd: true,
      status: true,
      startAt: true,
      endAt: true,
      allDay: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({
    ...updated,
    startAt: updated.startAt ? toISOStringSafe(updated.startAt) : null,
    endAt: updated.endAt ? toISOStringSafe(updated.endAt) : null,
    updatedAt: toISOStringSafe(updated.updatedAt),
  })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ boardId: string; postId: string }> }
) {
  const { boardId, postId } = await params

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

  const post = await prisma.post.findFirst({
    where: { id: postId, boardId },
    select: { id: true, authorId: true },
  })
  if (!post) return NextResponse.json({ message: 'not found' }, { status: 404 })

  if (post.authorId !== user.id) {
    return NextResponse.json({ message: 'forbidden' }, { status: 403 })
  }

  await prisma.post.delete({
    where: { id: postId },
  })

  return NextResponse.json({ ok: true })
}
