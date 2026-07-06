import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'

export const runtime = 'nodejs'

const watchlistCreateSchema = z
  .object({
    market: z.string().trim().min(1).max(20),
    symbol: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(120),
  })
  .strict()

export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  const items = await prisma.watchlist.findMany({
    where: { userId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      market: true,
      symbol: true,
      name: true,
      position: true,
      createdAt: true,
    },
  })
  return NextResponse.json({ items })
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  const parsed = await parseJsonWithSchema(req, watchlistCreateSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid body')

  const { market, symbol, name } = parsed.data
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
      select: {
        id: true,
        market: true,
        symbol: true,
        name: true,
        position: true,
        createdAt: true,
      },
    })
    return NextResponse.json({ item })
  } catch (e) {
    console.error('[WATCHLIST_POST_ERROR]', e)
    return NextResponse.json({ message: '추가 실패' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const userId = await getCurrentUserId()
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
