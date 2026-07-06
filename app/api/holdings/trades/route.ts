import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { normalizeStockSymbol } from '@/app/lib/stockQuery'
import {
  buildHoldingTradesWhere,
  holdingTradesOrderBy,
  holdingTradesSelect,
  toHoldingTradeMarker,
  type HoldingTradeRow,
} from '@/app/lib/holdingTradesQuery'

export const runtime = 'nodejs'

// GET /api/holdings/trades?symbol=005930
// 차트 마커용 — 해당 종목의 본인 매수/매도 거래 모음
export async function GET(req: Request) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const symbol = normalizeStockSymbol(url.searchParams.get('symbol'))
  if (!symbol)
    return NextResponse.json({ message: 'symbol required' }, { status: 400 })

  try {
    const txs: HoldingTradeRow[] = await prisma.holdingTransaction.findMany({
      where: buildHoldingTradesWhere(userId, symbol),
      orderBy: holdingTradesOrderBy,
      select: holdingTradesSelect,
    })
    return NextResponse.json({
      items: txs.map(toHoldingTradeMarker),
    })
  } catch (e) {
    console.error('[TRADES_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
