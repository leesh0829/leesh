import { NextResponse } from 'next/server'
import { requireKisCredential } from '@/app/lib/kisRouteAuth'
import { getVolumeRanking, getRiseRanking } from '@/app/lib/kisMarket'

export const runtime = 'nodejs'

// GET /api/kis/rankings?type=value | rise | fall  &limit=10
export async function GET(req: Request) {
  const auth = await requireKisCredential()
  if (!auth.ok) return auth.response
  const userId = auth.userId

  const url = new URL(req.url)
  const type = url.searchParams.get('type') ?? 'value'
  const limitRaw = url.searchParams.get('limit')
  const limit = Math.min(
    50,
    Math.max(1, limitRaw ? parseInt(limitRaw, 10) : 10)
  )

  try {
    let items: Awaited<ReturnType<typeof getVolumeRanking>> = []
    if (type === 'value' || type === 'volume') {
      items = await getVolumeRanking(userId, type === 'value', limit)
    } else if (type === 'rise') {
      items = await getRiseRanking(userId, true, limit)
    } else if (type === 'fall') {
      items = await getRiseRanking(userId, false, limit)
    } else {
      return NextResponse.json(
        { message: 'type must be value|volume|rise|fall' },
        { status: 400 }
      )
    }
    return NextResponse.json({ type, items })
  } catch (e) {
    console.error('[KIS_RANKINGS_API_ERROR]', e)
    return NextResponse.json(
      { message: '랭킹 조회 중 오류가 발생했습니다.' },
      { status: 502 }
    )
  }
}
