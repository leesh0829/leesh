import { NextResponse } from 'next/server'
import { requireKisCredential } from '@/app/lib/kisRouteAuth'
import { getOverseasQuotes } from '@/app/lib/kisOverseas'
import { normalizeKisOverseasPairsParam } from '@/app/lib/kisOverseasSymbol'

export const runtime = 'nodejs'

// GET /api/kis/overseas?pairs=NAS:COMP,NYS:.DJI,NYS:SPX
export async function GET(req: Request) {
  const auth = await requireKisCredential()
  if (!auth.ok) return auth.response
  const userId = auth.userId

  const url = new URL(req.url)
  const pairsRaw = url.searchParams.get('pairs')
  if (!pairsRaw)
    return NextResponse.json({ message: 'pairs required' }, { status: 400 })

  const pairs = normalizeKisOverseasPairsParam(pairsRaw)
  if (!pairs)
    return NextResponse.json({ message: 'invalid pairs' }, { status: 400 })

  try {
    const items = await getOverseasQuotes(userId, pairs)
    return NextResponse.json({ items })
  } catch (e) {
    console.error('[KIS_OVERSEAS_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
