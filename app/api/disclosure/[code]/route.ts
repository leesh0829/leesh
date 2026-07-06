import { NextResponse } from 'next/server'
import { getNaverDisclosures } from '@/app/lib/naverDisclosure'
import { getCurrentUserId } from '@/app/lib/serverAuth'

export const runtime = 'nodejs'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  const { code } = await params
  if (!/^\d{6}$/.test(code))
    return NextResponse.json({ message: 'invalid code' }, { status: 400 })
  const url = new URL(req.url)
  const limitRaw = url.searchParams.get('limit')
  const limit = Math.min(50, Math.max(1, limitRaw ? parseInt(limitRaw, 10) : 30))
  try {
    const items = await getNaverDisclosures(code, limit)
    return NextResponse.json({ items })
  } catch (e) {
    console.error('[DISCLOSURE_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
