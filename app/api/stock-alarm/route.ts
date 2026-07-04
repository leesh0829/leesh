import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'

export const runtime = 'nodejs'

const alarmCreateSchema = z
  .object({
    market: z.string().trim().min(1).max(20),
    symbol: z.string().trim().min(1).max(40),
    name: z.string().trim().max(120).optional().default(''),
    target: z.number().positive().max(2_000_000_000_000),
    direction: z.enum(['ABOVE', 'BELOW']).optional().default('ABOVE'),
  })
  .strict()

export async function GET(req: Request) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const market = url.searchParams.get('market')?.trim()
  const symbol = url.searchParams.get('symbol')?.trim()
  const where: { userId: string; market?: string; symbol?: string } = { userId }
  if (market) where.market = market
  if (symbol) where.symbol = symbol
  const items = await prisma.stockAlarm.findMany({
    where,
    orderBy: { createdAt: 'desc' },
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
  return NextResponse.json({ items })
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  const parsed = await parseJsonWithSchema(req, alarmCreateSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid body')

  const { market, symbol, name, target, direction } = parsed.data
  try {
    const item = await prisma.stockAlarm.create({
      data: { userId, market, symbol, name, target, direction },
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
  } catch (e) {
    console.error('[ALARM_POST_ERROR]', e)
    return NextResponse.json({ message: '생성 실패' }, { status: 500 })
  }
}
