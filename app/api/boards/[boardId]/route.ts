import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { z } from 'zod'

export const runtime = 'nodejs'
const MANAGEABLE_BOARD_TYPES: ReadonlySet<string> = new Set([
  'GENERAL',
  'TODO',
])

const boardPatchSchema = z
  .object({
    name: z.string().trim().min(1, 'invalid name').max(120).optional(),
    description: z.union([z.string().trim().max(1000), z.null()]).optional(),
  })
  .strict()

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params

  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const board = await prisma.board.findFirst({
    where: { id: boardId, ownerId: userId },
  })
  if (!board)
    return NextResponse.json({ message: 'not found' }, { status: 404 })

  return NextResponse.json(board)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params

  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const parsed = await parseJsonWithSchema(req, boardPatchSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid body')
  const { name, description } = parsed.data

  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { id: true, ownerId: true, type: true },
  })
  if (!board)
    return NextResponse.json({ message: 'not found' }, { status: 404 })

  const canManage = board.ownerId === userId
  if (!canManage)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  // BLOG/PORTFOLIO/HELP 등은 전용 페이지에서 관리
  if (!MANAGEABLE_BOARD_TYPES.has(board.type)) {
    return NextResponse.json({ message: 'forbidden' }, { status: 403 })
  }

  const updated = await prisma.board.update({
    where: { id: boardId },
    data: {
      name: name ?? undefined,
      description: description ?? undefined,
    },
    select: { id: true, name: true, description: true },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params

  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { id: true, ownerId: true, type: true },
  })
  if (!board)
    return NextResponse.json({ message: 'not found' }, { status: 404 })

  const canManage = board.ownerId === userId
  if (!canManage)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  if (!MANAGEABLE_BOARD_TYPES.has(board.type)) {
    return NextResponse.json({ message: 'forbidden' }, { status: 403 })
  }

  await prisma.board.delete({ where: { id: boardId } })

  return NextResponse.json({ ok: true })
}
