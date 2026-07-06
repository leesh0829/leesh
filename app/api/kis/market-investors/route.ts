import { NextResponse } from 'next/server'
import { requireKisCredential } from '@/app/lib/kisRouteAuth'
import { getMarketInvestorDaily } from '@/app/lib/kisMarket'

export const runtime = 'nodejs'

// GET /api/kis/market-investors?market=KOSPI|KOSDAQ&limit=10
export async function GET(req: Request) {
  const auth = await requireKisCredential()
  if (!auth.ok) return auth.response
  const userId = auth.userId

  const url = new URL(req.url)
  const marketRaw = (url.searchParams.get('market') ?? 'KOSPI').toUpperCase()
  const market: 'KOSPI' | 'KOSDAQ' =
    marketRaw === 'KOSDAQ' ? 'KOSDAQ' : 'KOSPI'
  const limitRaw = url.searchParams.get('limit')
  const limit = Math.min(
    30,
    Math.max(1, limitRaw ? parseInt(limitRaw, 10) : 10)
  )

  try {
    const items = await getMarketInvestorDaily(userId, market, limit)
    return NextResponse.json({ market, items })
  } catch (e) {
    console.error('[KIS_MKT_INV_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
