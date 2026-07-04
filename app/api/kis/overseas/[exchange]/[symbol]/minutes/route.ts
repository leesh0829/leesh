import { NextResponse } from 'next/server'
import { requireKisCredential } from '@/app/lib/kisRouteAuth'
import { getOverseasMinute } from '@/app/lib/kisOverseas'
import { normalizeKisOverseasPair } from '@/app/lib/kisOverseasSymbol'

export const runtime = 'nodejs'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ exchange: string; symbol: string }> }
) {
  const auth = await requireKisCredential()
  if (!auth.ok) return auth.response
  const userId = auth.userId
  const { exchange, symbol } = await params
  const url = new URL(req.url)
  const gapRaw = url.searchParams.get('gap')
  const gap = Math.min(60, Math.max(1, gapRaw ? parseInt(gapRaw, 10) : 1))
  const pair = normalizeKisOverseasPair(
    decodeURIComponent(exchange),
    decodeURIComponent(symbol)
  )
  if (!pair)
    return NextResponse.json({ message: 'invalid symbol' }, { status: 400 })
  try {
    const data = await getOverseasMinute(
      userId,
      pair.exchange,
      pair.symbol,
      gap
    )
    return NextResponse.json({ data })
  } catch (e) {
    console.error('[KIS_OVERSEAS_MIN_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
