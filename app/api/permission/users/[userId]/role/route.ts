import { prisma } from '@/app/lib/prisma'
import { getCurrentAdmin } from '@/app/lib/serverAuth'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { z } from 'zod'

export const runtime = 'nodejs'

const roleUpdateSchema = z
  .object({
    role: z.enum(['USER', 'ADMIN']),
  })
  .strict()

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ userId: string }> }
) {
  const me = await getCurrentAdmin()
  if (!me) return Response.json({ message: 'forbidden' }, { status: 403 })

  const { userId } = await ctx.params
  const parsed = await parseJsonWithSchema(req, roleUpdateSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'bad request')
  const { role } = parsed.data

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
