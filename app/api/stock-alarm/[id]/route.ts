import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'

export const runtime = 'nodejs'

const alarmPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    triggered: z.boolean().optional(),
  })
  .strict()

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const parsed = await parseJsonWithSchema(req, alarmPatchSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid body')

  const exists = await prisma.stockAlarm.findUnique({
    where: { id },
    select: { id: true, userId: true },
  })
  if (!exists || exists.userId !== userId)
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  const data: { enabled?: boolean; triggeredAt?: Date | null } = {}
  if (typeof parsed.data.enabled === 'boolean') data.enabled = parsed.data.enabled
  if (parsed.data.triggered === true) data.triggeredAt = new Date()
  if (parsed.data.triggered === false) data.triggeredAt = null
  const item = await prisma.stockAlarm.update({
    where: { id },
    data,
    select: {
      id: true,
      market: true,
      symbol: true,
      name: true,
      target: true,
      direction: true,
      enabled: true,
      triggeredAt: true,
      createdAt: true,
    },
  })
  return NextResponse.json({ item })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const exists = await prisma.stockAlarm.findUnique({
    where: { id },
    select: { id: true, userId: true },
  })
  if (!exists || exists.userId !== userId)
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  await prisma.stockAlarm.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
