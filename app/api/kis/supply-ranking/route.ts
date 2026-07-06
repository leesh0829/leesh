import { NextResponse } from 'next/server'
import { requireKisCredential } from '@/app/lib/kisRouteAuth'
import { getSupplyRanking } from '@/app/lib/kisMarket'

export const runtime = 'nodejs'

// GET /api/kis/supply-ranking?side=foreign|inst&limit=10
export async function GET(req: Request) {
  const auth = await requireKisCredential()
  if (!auth.ok) return auth.response
  const userId = auth.userId
  const url = new URL(req.url)
  const sideRaw = url.searchParams.get('side') ?? 'foreign'
  const side: 'foreign' | 'inst' = sideRaw === 'inst' ? 'inst' : 'foreign'
  const limitRaw = url.searchParams.get('limit')
  const limit = Math.min(30, Math.max(1, limitRaw ? parseInt(limitRaw, 10) : 10))
  try {
    const items = await getSupplyRanking(userId, side, limit)
    return NextResponse.json({ side, items })
  } catch (e) {
    console.error('[KIS_SUPPLY_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
