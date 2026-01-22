import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'

export const runtime = 'nodejs'

type OverrideIn = {
  menuKey: string
  mode: 'ALLOW' | 'DENY'
}

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

export async function GET(
  _: Request,
  ctx: { params: Promise<{ userId: string }> }
) {
  const me = await requireAdmin()
  if (!me) return Response.json({ message: 'forbidden' }, { status: 403 })

  const { userId } = await ctx.params

  const rows = await prisma.userMenuPermission.findMany({
    where: { userId },
    select: { menuKey: true, mode: true },
    orderBy: { menuKey: 'asc' },
  })

  return Response.json(rows)
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ userId: string }> }
) {
  const me = await requireAdmin()
  if (!me) return Response.json({ message: 'forbidden' }, { status: 403 })

  const { userId } = await ctx.params

  const body = (await req.json().catch(() => null)) as {
    overrides?: OverrideIn[]
  } | null
  const overrides = body?.overrides
  if (!overrides || !Array.isArray(overrides)) {
    return Response.json({ message: 'bad request' }, { status: 400 })
  }

  // 🔥 통째 동기화(제일 안 꼬임): 기존 삭제 후 재생성
  await prisma.userMenuPermission.deleteMany({ where: { userId } })

  if (overrides.length > 0) {
    await prisma.userMenuPermission.createMany({
      data: overrides.map((o) => ({
        userId,
        menuKey: o.menuKey,
        mode: o.mode,
      })),
    })
  }

  return Response.json({ ok: true })
}
