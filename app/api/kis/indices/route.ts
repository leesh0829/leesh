import { NextResponse } from 'next/server'
import { requireKisCredential } from '@/app/lib/kisRouteAuth'
import { getIndices } from '@/app/lib/kisMarket'
import { normalizeKisIndexCodeList } from '@/app/lib/kisIndexCodes'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const auth = await requireKisCredential()
  if (!auth.ok) return auth.response
  const userId = auth.userId

  const url = new URL(req.url)
  const codesParam = url.searchParams.get('codes')
  const codes = normalizeKisIndexCodeList(codesParam)
  if (!codes)
    return NextResponse.json({ message: 'invalid codes' }, { status: 400 })

  try {
    const items = await getIndices(userId, codes)
    return NextResponse.json({ items })
  } catch (e) {
    console.error('[KIS_INDICES_API_ERROR]', e)
    return NextResponse.json(
      { message: '지수 조회 중 오류가 발생했습니다.' },
      { status: 502 }
    )
  }
}
