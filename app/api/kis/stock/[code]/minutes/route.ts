import { NextResponse } from 'next/server'
import { requireKisCredential } from '@/app/lib/kisRouteAuth'
import { normalizeKisDomesticCode } from '@/app/lib/kisDomesticCode'
import { getMinuteBars } from '@/app/lib/kisStock'
import { normalizeKisMinuteHour } from '@/app/lib/kisMinuteHour'

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
  const hour = normalizeKisMinuteHour(url.searchParams.get('hour'))
  if (hour === null)
    return NextResponse.json({ message: 'invalid hour' }, { status: 400 })

  try {
    const data = await getMinuteBars(userId, code, hour)
    return NextResponse.json({ data })
  } catch (e) {
    console.error('[KIS_MINUTES_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
