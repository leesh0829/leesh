import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { toISOStringSafe } from '@/app/lib/date'
import { readUnlockedPostIds, UNLOCK_COOKIE_NAME } from '@/app/lib/unlockCookie'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { z } from 'zod'

export const runtime = 'nodejs'

const commentCreateSchema = z
  .object({
    content: z.preprocess(
      (value) => (value == null ? '' : String(value)),
      z.string().trim().min(1, 'content required').max(20_000)
    ),
  })
  .strict()

type CommentRow = {
  id: string
  content: string
  createdAt: Date
  author: { name: string | null; email: string | null }
}

async function resolveReadablePost(
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
    },
    select: {
      id: true,
      authorId: true,
      isSecret: true,
      status: true,
      board: { select: { ownerId: true, type: true } },
    },
  })

  if (!post) return { ok: false, status: 404 }

  if (post.board.type === 'GENERAL') return { ok: true }

  if (post.board.type === 'TODO') {
    if (userId === post.board.ownerId) return { ok: true }

    const shared = await prisma.scheduleShare.findFirst({
      where: {
        requesterId: userId,
        ownerId: post.board.ownerId,
        scope: 'TODO',
        status: 'ACCEPTED',
      },
      select: { id: true },
    })

    return shared ? { ok: true } : { ok: false, status: 403 }
  }

  if (post.board.type !== 'BLOG' && post.board.type !== 'DOCS')
    return { ok: false, status: 404 }
  if (post.status !== 'DONE') return { ok: false, status: 404 }
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

  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const readable = await resolveReadablePost(req, {
    boardId,
    postId,
    userId,
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

  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const readable = await resolveReadablePost(req, {
    boardId,
    postId,
    userId,
  })
  if (!readable.ok) {
    const message = readable.status === 403 ? 'forbidden' : 'not found'
    return NextResponse.json({ message }, { status: readable.status })
  }

  const parsed = await parseJsonWithSchema(req, commentCreateSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error)

  const c = await prisma.comment.create({
    data: { postId: postId, authorId: userId, content: parsed.data.content },
    select: { id: true },
  })

  return NextResponse.json(c, { status: 201 })
}
