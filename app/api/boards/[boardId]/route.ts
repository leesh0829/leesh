import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'

export const runtime = 'nodejs'

async function getMe() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return null

  const me = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, role: true },
  })

  return me
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params

  const me = await getMe()
  if (!me)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const board = await prisma.board.findFirst({
    where: { id: boardId, ownerId: me.id },
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

  const me = await getMe()
  if (!me)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : undefined
  const description =
    body?.description === null
      ? null
      : typeof body?.description === 'string'
        ? body.description.trim()
        : undefined

  if (name !== undefined && !name) {
    return NextResponse.json({ message: 'invalid name' }, { status: 400 })
  }

  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { id: true, ownerId: true, type: true },
  })
  if (!board)
    return NextResponse.json({ message: 'not found' }, { status: 404 })

  const canManage = board.ownerId === me.id || me.role === 'ADMIN'
  if (!canManage)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  // 안전장치: GENERAL만 허용 (BLOG/PORTFOLIO/HELP 등은 전용 페이지에서 관리)
  if (board.type !== 'GENERAL') {
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

  const me = await getMe()
  if (!me)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { id: true, ownerId: true, type: true },
  })
  if (!board)
    return NextResponse.json({ message: 'not found' }, { status: 404 })

  const canManage = board.ownerId === me.id || me.role === 'ADMIN'
  if (!canManage)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  if (board.type !== 'GENERAL') {
    return NextResponse.json({ message: 'forbidden' }, { status: 403 })
  }

  await prisma.board.delete({ where: { id: boardId } })

  return NextResponse.json({ ok: true })
}
