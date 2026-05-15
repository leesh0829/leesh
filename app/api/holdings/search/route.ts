import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { searchSymbols } from '@/app/lib/naverFinance'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim() ?? ''
  if (!q) return NextResponse.json({ items: [] })

  try {
    const items = await searchSymbols(q)
    return NextResponse.json({ items })
  } catch (e) {
    console.error('[STOCK_SEARCH_ERROR]', e)
    return NextResponse.json({ message: '검색 실패' }, { status: 502 })
  }
}
