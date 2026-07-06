import { prisma } from '@/app/lib/prisma'
import { getCurrentAdmin } from '@/app/lib/serverAuth'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { z } from 'zod'

export const runtime = 'nodejs'

const overridesUpdateSchema = z
  .object({
    overrides: z
      .array(
        z
          .object({
            menuKey: z.string().trim().min(1).max(80),
            mode: z.enum(['ALLOW', 'DENY']),
          })
          .strict()
      )
      .max(100),
  })
  .strict()

export async function GET(
  _: Request,
  ctx: { params: Promise<{ userId: string }> }
) {
  const me = await getCurrentAdmin()
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
  const me = await getCurrentAdmin()
  if (!me) return Response.json({ message: 'forbidden' }, { status: 403 })

  const { userId } = await ctx.params

  const parsed = await parseJsonWithSchema(req, overridesUpdateSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'bad request')
  const { overrides } = parsed.data

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  })
  if (!target) return Response.json({ message: 'not found' }, { status: 404 })

  await prisma.$transaction(async (tx) => {
    await tx.userMenuPermission.deleteMany({ where: { userId } })
    if (overrides.length > 0) {
      await tx.userMenuPermission.createMany({
        data: overrides.map((o) => ({
          userId,
          menuKey: o.menuKey,
          mode: o.mode,
        })),
      })
    }
  })

  return Response.json({ ok: true })
}
