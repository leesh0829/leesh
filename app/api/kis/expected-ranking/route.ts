import { NextResponse } from 'next/server'
import { requireKisCredential } from '@/app/lib/kisRouteAuth'
import { getExpectedTransRanking } from '@/app/lib/kisMarket'

export const runtime = 'nodejs'

// GET /api/kis/expected-ranking?type=rise|fall&limit=15
export async function GET(req: Request) {
  const auth = await requireKisCredential()
  if (!auth.ok) return auth.response
  const userId = auth.userId

  const url = new URL(req.url)
  const type = url.searchParams.get('type') ?? 'rise'
  const limitRaw = url.searchParams.get('limit')
  const limit = Math.min(
    30,
    Math.max(1, limitRaw ? parseInt(limitRaw, 10) : 15)
  )

  try {
    const items = await getExpectedTransRanking(
      userId,
      type !== 'fall',
      limit
    )
    return NextResponse.json({ type, items })
  } catch (e) {
    console.error('[KIS_EXPECTED_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
