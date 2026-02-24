import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { toISOStringSafe } from '@/app/lib/date'
import { readUnlockedPostIds, UNLOCK_COOKIE_NAME } from '@/app/lib/unlockCookie'

export const runtime = 'nodejs'

type CommentRow = {
  id: string
  content: string
  createdAt: Date
  author: { name: string | null; email: string | null }
}

async function resolveReadableBlogPost(
  req: Request,
  {
    boardId,
    postId,
    userId,
  }: {
    boardId: string
    postId: string
    userId: string
  }
): Promise<{ ok: true } | { ok: false; status: 403 | 404 }> {
  const post = await prisma.post.findFirst({
    where: {
      id: postId,
      boardId,
      board: { type: 'BLOG' },
      status: 'DONE',
    },
    select: {
      id: true,
      authorId: true,
      isSecret: true,
      board: { select: { ownerId: true } },
    },
  })

  if (!post) return { ok: false, status: 404 }

  if (!post.isSecret) return { ok: true }

  const isPrivileged = userId === post.authorId || userId === post.board.ownerId
  if (isPrivileged) return { ok: true }

  const cookie = req.headers.get('cookie') ?? ''
  const match = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${UNLOCK_COOKIE_NAME}=`))
  let raw: string | undefined
  if (match) {
    try {
      raw = decodeURIComponent(match.slice(UNLOCK_COOKIE_NAME.length + 1))
    } catch {
      raw = undefined
    }
  }
  const unlockedIds = readUnlockedPostIds(raw)

  if (unlockedIds.includes(post.id)) return { ok: true }

  return { ok: false, status: 403 }
}

export async function GET(
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

  const readable = await resolveReadableBlogPost(req, {
    boardId,
    postId,
    userId: user.id,
  })
  if (!readable.ok) {
    const message = readable.status === 403 ? 'forbidden' : 'not found'
    return NextResponse.json({ message }, { status: readable.status })
  }

  const commentsRaw: CommentRow[] = await prisma.comment.findMany({
    where: { postId: postId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      content: true,
      createdAt: true,
      author: { select: { name: true, email: true } },
    },
  })

  const comments = commentsRaw.map((c: CommentRow) => ({
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

  const readable = await resolveReadableBlogPost(req, {
    boardId,
    postId,
    userId: user.id,
  })
  if (!readable.ok) {
    const message = readable.status === 403 ? 'forbidden' : 'not found'
    return NextResponse.json({ message }, { status: readable.status })
  }

  const { content } = await req.json()
  if (!content?.trim())
    return NextResponse.json({ message: 'content required' }, { status: 400 })

  const c = await prisma.comment.create({
    data: { postId: postId, authorId: user.id, content: content.trim() },
    select: { id: true },
  })

  return NextResponse.json(c, { status: 201 })
}
