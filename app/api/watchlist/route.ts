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

export async function GET() {
  const userId = await getUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  const items = await prisma.watchlist.findMany({
    where: { userId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
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
  }
  const market = body.market?.trim()
  const symbol = body.symbol?.trim()
  const name = body.name?.trim()
  if (!market || !symbol || !name)
    return NextResponse.json({ message: 'invalid body' }, { status: 400 })
  try {
    const last = await prisma.watchlist.findFirst({
      where: { userId },
      orderBy: { position: 'desc' },
      select: { position: true },
    })
    const item = await prisma.watchlist.upsert({
      where: {
        userId_market_symbol: { userId, market, symbol },
      },
      create: {
        userId,
        market,
        symbol,
        name,
        position: (last?.position ?? -1) + 1,
      },
      update: { name },
    })
    return NextResponse.json({ item })
  } catch (e) {
    console.error('[WATCHLIST_POST_ERROR]', e)
    return NextResponse.json({ message: '추가 실패' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const userId = await getUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const market = url.searchParams.get('market')?.trim()
  const symbol = url.searchParams.get('symbol')?.trim()
  if (!market || !symbol)
    return NextResponse.json({ message: 'invalid' }, { status: 400 })
  try {
    await prisma.watchlist.deleteMany({
      where: { userId, market, symbol },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[WATCHLIST_DELETE_ERROR]', e)
    return NextResponse.json({ message: '삭제 실패' }, { status: 500 })
  }
}
