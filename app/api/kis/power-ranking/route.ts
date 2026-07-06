import { NextResponse } from 'next/server'
import { requireKisCredential } from '@/app/lib/kisRouteAuth'
import { getVolumePowerRanking } from '@/app/lib/kisMarket'

export const runtime = 'nodejs'

// GET /api/kis/power-ranking?limit=15
export async function GET(req: Request) {
  const auth = await requireKisCredential()
  if (!auth.ok) return auth.response
  const userId = auth.userId

  const url = new URL(req.url)
  const limitRaw = url.searchParams.get('limit')
  const limit = Math.min(
    30,
    Math.max(1, limitRaw ? parseInt(limitRaw, 10) : 15)
  )

  try {
    const items = await getVolumePowerRanking(userId, limit)
    return NextResponse.json({ items })
  } catch (e) {
    console.error('[KIS_POWER_API_ERROR]', e)
    return NextResponse.json(
      { message: '체결강도 조회 중 오류가 발생했습니다.' },
      { status: 502 }
    )
  }
}
