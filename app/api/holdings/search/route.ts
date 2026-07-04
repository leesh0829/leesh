import { NextResponse } from 'next/server'
import { searchSymbols } from '@/app/lib/naverFinance'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { normalizeStockSearchQuery } from '@/app/lib/stockQuery'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const q = normalizeStockSearchQuery(url.searchParams.get('q'))
  if (!q) return NextResponse.json({ items: [] })

  try {
    const items = await searchSymbols(q)
    return NextResponse.json({ items })
  } catch (e) {
    console.error('[STOCK_SEARCH_ERROR]', e)
    return NextResponse.json({ message: '검색 실패' }, { status: 502 })
  }
}
