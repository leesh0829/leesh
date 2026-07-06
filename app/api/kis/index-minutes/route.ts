import { NextResponse } from 'next/server'
import { requireKisCredential } from '@/app/lib/kisRouteAuth'
import { getIndexMinutes } from '@/app/lib/kisMarket'

export const runtime = 'nodejs'

// GET /api/kis/index-minutes?code=0001&gap=60
// gap: 60(1분), 600(10분), 3600(1시간)
export async function GET(req: Request) {
  const auth = await requireKisCredential()
  if (!auth.ok) return auth.response
  const userId = auth.userId

  const url = new URL(req.url)
  const code = url.searchParams.get('code') ?? '0001'
  const gapRaw = parseInt(url.searchParams.get('gap') ?? '60', 10)
  const gap =
    gapRaw === 600 || gapRaw === 3600 || gapRaw === 30 ? gapRaw : 60

  try {
    const items = await getIndexMinutes(userId, code, gap)
    return NextResponse.json({ code, gap, items })
  } catch (e) {
    console.error('[KIS_INDEX_MIN_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
