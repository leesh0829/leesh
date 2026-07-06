import { NextResponse } from 'next/server'
import { requireKisCredential } from '@/app/lib/kisRouteAuth'
import { getBulkTransRanking } from '@/app/lib/kisMarket'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const auth = await requireKisCredential()
  if (!auth.ok) return auth.response
  const userId = auth.userId
  const url = new URL(req.url)
  const limitRaw = url.searchParams.get('limit')
  const limit = Math.min(30, Math.max(1, limitRaw ? parseInt(limitRaw, 10) : 10))
  try {
    const items = await getBulkTransRanking(userId, limit)
    return NextResponse.json({ items })
  } catch (e) {
    console.error('[KIS_BULK_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
