import { NextResponse } from 'next/server'
import { requireKisCredential } from '@/app/lib/kisRouteAuth'
import { getCategoryIndices } from '@/app/lib/kisMarket'

export const runtime = 'nodejs'

// GET /api/kis/sectors?market=KOSPI|KOSDAQ
export async function GET(req: Request) {
  const auth = await requireKisCredential()
  if (!auth.ok) return auth.response
  const userId = auth.userId

  const url = new URL(req.url)
  const marketParam = url.searchParams.get('market') ?? 'KOSPI'
  const market: 'KOSPI' | 'KOSDAQ' =
    marketParam.toUpperCase() === 'KOSDAQ' ? 'KOSDAQ' : 'KOSPI'

  try {
    const data = await getCategoryIndices(userId, market)
    return NextResponse.json({ market, ...data })
  } catch (e) {
    console.error('[KIS_SECTORS_API_ERROR]', e)
    return NextResponse.json(
      { message: '업종별 조회 중 오류가 발생했습니다.' },
      { status: 502 }
    )
  }
}
