import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'

export const runtime = 'nodejs'

// GET /api/holdings/trades?symbol=005930
// 차트 마커용 — 해당 종목의 본인 매수/매도 거래 모음
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const symbol = url.searchParams.get('symbol')?.trim() ?? ''
  if (!symbol)
    return NextResponse.json({ message: 'symbol required' }, { status: 400 })

  try {
    // 해당 종목의 모든 본인 보유 (다른 계좌에 같은 종목 여러 개 있을 수 있음)
    const holdings = await prisma.holding.findMany({
      where: { ownerId: user.id, symbol },
      select: { id: true },
    })
    if (holdings.length === 0)
      return NextResponse.json({ items: [] })
    const txs = await prisma.holdingTransaction.findMany({
      where: {
        holdingId: { in: holdings.map((h) => h.id) },
        type: { in: ['BUY', 'SELL'] },
      },
      orderBy: { occurredAt: 'asc' },
      select: {
        id: true,
        type: true,
        quantity: true,
        pricePerUnit: true,
        occurredAt: true,
      },
    })
    return NextResponse.json({
      items: txs.map((t) => ({
        id: t.id,
        type: t.type,
        quantity: t.quantity,
        unitPrice: t.pricePerUnit,
        date: t.occurredAt.toISOString().slice(0, 10).replace(/-/g, ''),
      })),
    })
  } catch (e) {
    console.error('[TRADES_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
