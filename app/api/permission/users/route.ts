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

export async function GET() {
  const me = await requireAdmin()
  if (!me) return Response.json({ message: 'forbidden' }, { status: 403 })

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  })

  return Response.json(users)
}
