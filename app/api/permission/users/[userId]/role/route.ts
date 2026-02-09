import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'

export const runtime = 'nodejs'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email ?? null
  if (!email) return null

  const me = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  })
  if (!me || me.role !== 'ADMIN') return null
  return me
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ userId: string }> }
) {
  const me = await requireAdmin()
  if (!me) return Response.json({ message: 'forbidden' }, { status: 403 })

  const { userId } = await ctx.params
  const body = (await req.json().catch(() => null)) as {
    role?: 'USER' | 'ADMIN'
  } | null
  const role = body?.role

  if (role !== 'USER' && role !== 'ADMIN') {
    return Response.json({ message: 'bad request' }, { status: 400 })
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  })
  if (!target) return Response.json({ message: 'not found' }, { status: 404 })

  // 마지막 ADMIN의 자기 강등 방지
  if (me.id === userId && role === 'USER') {
    const adminCount = await prisma.user.count({
      where: { role: 'ADMIN' },
    })
    if (adminCount <= 1) {
      return Response.json(
        { message: 'last admin cannot be demoted' },
        { status: 409 }
      )
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
  })

  return Response.json(updated)
}
