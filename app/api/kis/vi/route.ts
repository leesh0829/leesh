import { NextResponse } from 'next/server'
import { requireKisCredential } from '@/app/lib/kisRouteAuth'
import { getViStatus } from '@/app/lib/kisMarket'

export const runtime = 'nodejs'

// GET /api/kis/vi?market=ALL|KOSPI|KOSDAQ&limit=20
export async function GET(req: Request) {
  const auth = await requireKisCredential()
  if (!auth.ok) return auth.response
  const userId = auth.userId

  const url = new URL(req.url)
  const marketRaw = (url.searchParams.get('market') ?? 'ALL').toUpperCase()
  const market: 'ALL' | 'KOSPI' | 'KOSDAQ' =
    marketRaw === 'KOSPI' ? 'KOSPI' : marketRaw === 'KOSDAQ' ? 'KOSDAQ' : 'ALL'
  const limitRaw = url.searchParams.get('limit')
  const limit = Math.min(
    50,
    Math.max(1, limitRaw ? parseInt(limitRaw, 10) : 20)
  )

  try {
    const items = await getViStatus(userId, market, limit)
    return NextResponse.json({ market, items })
  } catch (e) {
    console.error('[KIS_VI_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
