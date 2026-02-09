import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { toISOStringSafe } from '@/app/lib/date'

export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ boardId: string; postId: string }> }
) {
  const { boardId, postId } = await params

  const session = await getServerSession(authOptions)
  if (!session?.user?.email)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const board = await prisma.board.findFirst({
    where: { id: boardId, ownerId: user.id },
    select: { id: true },
  })
  if (!board)
    return NextResponse.json({ message: 'not found' }, { status: 404 })

  const commentsRaw: Array<{
    id: string
    content: string
    createdAt: Date
    author: { name: string | null; email: string | null }
  }> = await prisma.comment.findMany({
    where: { postId: postId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      content: true,
      createdAt: true,
      author: { select: { name: true, email: true } },
    },
  })

  const comments = commentsRaw.map((c) => ({
    ...c,
    createdAt: toISOStringSafe(c.createdAt),
  }))

  return NextResponse.json(comments)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ boardId: string; postId: string }> }
) {
  const { boardId, postId } = await params

  const session = await getServerSession(authOptions)
  if (!session?.user?.email)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const board = await prisma.board.findFirst({
    where: { id: boardId, ownerId: user.id },
    select: { id: true },
  })
  if (!board)
    return NextResponse.json({ message: 'not found' }, { status: 404 })

  const { content } = await req.json()
  if (!content?.trim())
    return NextResponse.json({ message: 'content required' }, { status: 400 })

  const c = await prisma.comment.create({
    data: { postId: postId, authorId: user.id, content: content.trim() },
    select: { id: true },
  })

  return NextResponse.json(c, { status: 201 })
}
