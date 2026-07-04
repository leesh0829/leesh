import { prisma } from '@/app/lib/prisma'
import { getCurrentAdmin } from '@/app/lib/serverAuth'

export const runtime = 'nodejs'

export async function GET() {
  const me = await getCurrentAdmin()
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
