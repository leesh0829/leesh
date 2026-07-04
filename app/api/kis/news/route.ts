import { NextResponse } from 'next/server'
import { requireKisCredential } from '@/app/lib/kisRouteAuth'
import { getKisNews } from '@/app/lib/kisMarket'

export const runtime = 'nodejs'

// GET /api/kis/news?limit=15
export async function GET(req: Request) {
  const auth = await requireKisCredential()
  if (!auth.ok) return auth.response
  const userId = auth.userId

  const url = new URL(req.url)
  const limitRaw = url.searchParams.get('limit')
  const limit = Math.min(
    100,
    Math.max(1, limitRaw ? parseInt(limitRaw, 10) : 15)
  )

  try {
    const items = await getKisNews(userId, limit)
    return NextResponse.json({ items })
  } catch (e) {
    console.error('[KIS_NEWS_API_ERROR]', e)
    return NextResponse.json(
      { message: '뉴스 조회 중 오류가 발생했습니다.' },
      { status: 502 }
    )
  }
}
