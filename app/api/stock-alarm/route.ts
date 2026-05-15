import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import type { AlarmDirection } from '@prisma/client'

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

export async function GET(req: Request) {
  const userId = await getUserId()
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
  })
  return NextResponse.json({ items })
}

export async function POST(req: Request) {
  const userId = await getUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  const body = (await req.json()) as {
    market?: string
    symbol?: string
    name?: string
    target?: number
    direction?: AlarmDirection
  }
  const market = body.market?.trim()
  const symbol = body.symbol?.trim()
  const name = body.name?.trim() ?? ''
  const target = typeof body.target === 'number' ? body.target : NaN
  const direction = body.direction === 'BELOW' ? 'BELOW' : 'ABOVE'
  if (!market || !symbol || !Number.isFinite(target) || target <= 0)
    return NextResponse.json({ message: 'invalid body' }, { status: 400 })
  try {
    const item = await prisma.stockAlarm.create({
      data: { userId, market, symbol, name, target, direction },
    })
    return NextResponse.json({ item })
  } catch (e) {
    console.error('[ALARM_POST_ERROR]', e)
    return NextResponse.json({ message: '생성 실패' }, { status: 500 })
  }
}
