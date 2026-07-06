import { NextResponse } from 'next/server'
import { requireKisCredential } from '@/app/lib/kisRouteAuth'
import { normalizeKisDomesticCode } from '@/app/lib/kisDomesticCode'
import { getMembers } from '@/app/lib/kisStock'

export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const auth = await requireKisCredential()
  if (!auth.ok) return auth.response
  const userId = auth.userId

  const { code: rawCode } = await params
  const code = normalizeKisDomesticCode(rawCode)
  if (code === null)
    return NextResponse.json({ message: 'invalid code' }, { status: 400 })

  try {
    const data = await getMembers(userId, code)
    return NextResponse.json({ data })
  } catch (e) {
    console.error('[KIS_MEMBERS_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
