import { NextResponse } from 'next/server'
import { requireKisCredential } from '@/app/lib/kisRouteAuth'
import { getIndexHistory } from '@/app/lib/kisMarket'

export const runtime = 'nodejs'

// GET /api/kis/index-history?code=0001&period=D|W|M|Y
export async function GET(req: Request) {
  const auth = await requireKisCredential()
  if (!auth.ok) return auth.response
  const userId = auth.userId

  const url = new URL(req.url)
  const code = url.searchParams.get('code') ?? '0001'
  const periodRaw = url.searchParams.get('period') ?? 'D'
  const period: 'D' | 'W' | 'M' | 'Y' =
    periodRaw === 'W'
      ? 'W'
      : periodRaw === 'M'
        ? 'M'
        : periodRaw === 'Y'
          ? 'Y'
          : 'D'

  try {
    const items = await getIndexHistory(userId, code, period)
    return NextResponse.json({ code, period, items })
  } catch (e) {
    console.error('[KIS_INDEX_HISTORY_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
