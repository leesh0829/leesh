import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { z } from 'zod'

export const runtime = 'nodejs'

const commentPatchSchema = z
  .object({
    content: z.preprocess(
      (value) => (value == null ? '' : String(value)),
      z.string().trim().min(1, 'content required').max(20_000)
    ),
  })
  .strict()

export async function PATCH(
  req: Request,
  {
    params,
  }: { params: Promise<{ boardId: string; postId: string; commentId: string }> }
) {
  const { boardId, postId, commentId } = await params

  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const parsed = await parseJsonWithSchema(req, commentPatchSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error)

  const found = await prisma.comment.findFirst({
    where: { id: commentId, postId },
    select: {
      id: true,
      authorId: true,
      post: { select: { boardId: true, board: { select: { ownerId: true } } } },
    },
  })

  if (!found || found.post.boardId !== boardId) {
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  }

  const can = found.authorId === userId

  if (!can) return NextResponse.json({ message: 'forbidden' }, { status: 403 })

  await prisma.comment.update({
    where: { id: found.id },
    data: { content: parsed.data.content },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  {
    params,
  }: { params: Promise<{ boardId: string; postId: string; commentId: string }> }
) {
  const { boardId, postId, commentId } = await params

  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const found = await prisma.comment.findFirst({
    where: { id: commentId, postId },
    select: {
      id: true,
      authorId: true,
      post: { select: { boardId: true, board: { select: { ownerId: true } } } },
    },
  })

  if (!found || found.post.boardId !== boardId) {
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  }

  const can = found.authorId === userId

  if (!can) return NextResponse.json({ message: 'forbidden' }, { status: 403 })

  await prisma.comment.delete({ where: { id: found.id } })

  return NextResponse.json({ ok: true })
}
