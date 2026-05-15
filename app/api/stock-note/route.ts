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

export async function GET(req: Request) {
  const userId = await getUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const market = url.searchParams.get('market')?.trim()
  const symbol = url.searchParams.get('symbol')?.trim()
  if (!market || !symbol)
    return NextResponse.json({ message: 'invalid' }, { status: 400 })
  const note = await prisma.stockNote.findUnique({
    where: { userId_market_symbol: { userId, market, symbol } },
  })
  return NextResponse.json({ note })
}

export async function PUT(req: Request) {
  const userId = await getUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  const body = (await req.json()) as {
    market?: string
    symbol?: string
    note?: string
  }
  const market = body.market?.trim()
  const symbol = body.symbol?.trim()
  const noteText = (body.note ?? '').trim()
  if (!market || !symbol)
    return NextResponse.json({ message: 'invalid' }, { status: 400 })
  try {
    if (!noteText) {
      await prisma.stockNote.deleteMany({
        where: { userId, market, symbol },
      })
      return NextResponse.json({ note: null })
    }
    const note = await prisma.stockNote.upsert({
      where: { userId_market_symbol: { userId, market, symbol } },
      create: { userId, market, symbol, note: noteText },
      update: { note: noteText },
    })
    return NextResponse.json({ note })
  } catch (e) {
    console.error('[STOCK_NOTE_PUT_ERROR]', e)
    return NextResponse.json({ message: '저장 실패' }, { status: 500 })
  }
}
