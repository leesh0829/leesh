import { NextResponse } from 'next/server'
import { requireKisCredential } from '@/app/lib/kisRouteAuth'
import { normalizeKisDomesticCode } from '@/app/lib/kisDomesticCode'
import { getDailyPrice } from '@/app/lib/kisStock'

export const runtime = 'nodejs'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const auth = await requireKisCredential()
  if (!auth.ok) return auth.response
  const userId = auth.userId

  const { code: rawCode } = await params
  const code = normalizeKisDomesticCode(rawCode)
  if (code === null)
    return NextResponse.json({ message: 'invalid code' }, { status: 400 })

  const url = new URL(req.url)
  const periodRaw = url.searchParams.get('period') ?? 'D'
  const period: 'D' | 'W' | 'M' =
    periodRaw === 'W' ? 'W' : periodRaw === 'M' ? 'M' : 'D'

  try {
    const items = await getDailyPrice(userId, code, period)
    return NextResponse.json({ period, items })
  } catch (e) {
    console.error('[KIS_DAILY_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
