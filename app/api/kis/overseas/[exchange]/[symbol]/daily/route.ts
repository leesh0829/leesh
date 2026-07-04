import { NextResponse } from 'next/server'
import { requireKisCredential } from '@/app/lib/kisRouteAuth'
import { getOverseasDaily } from '@/app/lib/kisOverseas'
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
  const periodRaw = url.searchParams.get('period') ?? 'D'
  const period: 'D' | 'W' | 'M' =
    periodRaw === 'W' ? 'W' : periodRaw === 'M' ? 'M' : 'D'
  const pair = normalizeKisOverseasPair(
    decodeURIComponent(exchange),
    decodeURIComponent(symbol)
  )
  if (!pair)
    return NextResponse.json({ message: 'invalid symbol' }, { status: 400 })

  try {
    const data = await getOverseasDaily(
      userId,
      pair.exchange,
      pair.symbol,
      period
    )
    return NextResponse.json({ data })
  } catch (e) {
    console.error('[KIS_OVERSEAS_DAILY_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
