import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'

export const runtime = 'nodejs'

async function getUserId() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return null
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  return user?.id ?? null
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const body = (await req.json()) as {
    enabled?: boolean
    triggered?: boolean
  }
  const exists = await prisma.stockAlarm.findUnique({ where: { id } })
  if (!exists || exists.userId !== userId)
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  const data: { enabled?: boolean; triggeredAt?: Date | null } = {}
  if (typeof body.enabled === 'boolean') data.enabled = body.enabled
  if (body.triggered === true) data.triggeredAt = new Date()
  if (body.triggered === false) data.triggeredAt = null
  const item = await prisma.stockAlarm.update({ where: { id }, data })
  return NextResponse.json({ item })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const exists = await prisma.stockAlarm.findUnique({ where: { id } })
  if (!exists || exists.userId !== userId)
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  await prisma.stockAlarm.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
