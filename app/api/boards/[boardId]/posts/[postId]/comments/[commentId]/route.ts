import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'

export const runtime = 'nodejs'

async function getMe() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email
  if (!email) return null

  return prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  })
}

export async function PATCH(
  req: Request,
  {
    params,
  }: { params: Promise<{ boardId: string; postId: string; commentId: string }> }
) {
  const { boardId, postId, commentId } = await params

  const me = await getMe()
  if (!me)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const text = typeof body?.content === 'string' ? body.content.trim() : ''
  if (!text)
    return NextResponse.json({ message: 'content required' }, { status: 400 })

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

  const can =
    found.authorId === me.id ||
    found.post.board.ownerId === me.id ||
    me.role === 'ADMIN'

  if (!can) return NextResponse.json({ message: 'forbidden' }, { status: 403 })

  await prisma.comment.update({
    where: { id: found.id },
    data: { content: text },
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

  const me = await getMe()
  if (!me)
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

  const can =
    found.authorId === me.id ||
    found.post.board.ownerId === me.id ||
    me.role === 'ADMIN'

  if (!can) return NextResponse.json({ message: 'forbidden' }, { status: 403 })

  await prisma.comment.delete({ where: { id: found.id } })

  return NextResponse.json({ ok: true })
}
