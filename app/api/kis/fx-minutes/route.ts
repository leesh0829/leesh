import { NextResponse } from 'next/server'
import { requireKisCredential } from '@/app/lib/kisRouteAuth'
import { getFxMinutes } from '@/app/lib/kisMarket'

export const runtime = 'nodejs'

// USD/JPY → KRW 환율 분봉 매핑 (KIS 해외지수분봉조회, KX=원화환율)
// 다른 base 통화 추가 시 여기 매핑만 늘리면 됨.
const FX_SYMBOLS: Record<string, { div: 'KX' | 'X' | 'N'; symbol: string }> = {
  USD: { div: 'KX', symbol: 'FX@KRW' },
  JPY: { div: 'KX', symbol: 'FX@JPY' },
  EUR: { div: 'KX', symbol: 'FX@EUR' },
  CNY: { div: 'KX', symbol: 'FX@CNY' },
  HKD: { div: 'KX', symbol: 'FX@HKD' },
}

// GET /api/kis/fx-minutes?base=USD
export async function GET(req: Request) {
  const auth = await requireKisCredential()
  if (!auth.ok) return auth.response
  const userId = auth.userId

  const url = new URL(req.url)
  const base = (url.searchParams.get('base') ?? 'USD').toUpperCase()
  const mapping = FX_SYMBOLS[base]
  if (!mapping)
    return NextResponse.json(
      { message: `지원하지 않는 통화: ${base}` },
      { status: 400 }
    )

  try {
    const items = await getFxMinutes(userId, mapping.div, mapping.symbol)
    return NextResponse.json({
      base,
      symbol: mapping.symbol,
      div: mapping.div,
      items,
    })
  } catch (e) {
    console.error('[KIS_FX_MIN_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
