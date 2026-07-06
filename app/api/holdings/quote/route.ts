import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getQuote as getNaverQuote } from '@/app/lib/naverFinance'
import { getKisQuote, isKrSymbol } from '@/app/lib/kisQuote'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import {
  normalizeStockSymbol,
  normalizeStockSymbolList,
} from '@/app/lib/stockQuery'

export const runtime = 'nodejs'

async function userHasKis(userId: string): Promise<boolean> {
  const c = await prisma.kisCredential.findUnique({
    where: { userId },
    select: { id: true },
  })
  return !!c
}

// 단일 종목 시세: 한국 주식이고 사용자가 KIS 자격 등록했으면 KIS, 아니면 Naver
async function fetchOneQuote(
  userId: string,
  symbol: string,
  kisEnabled: boolean
) {
  if (kisEnabled && isKrSymbol(symbol)) {
    try {
      const q = await getKisQuote(userId, symbol)
      if (q) return q
      console.warn(
        `[KIS_QUOTE_EMPTY] symbol=${symbol} — KIS 응답 없음/실패, Naver로 fallback`
      )
    } catch (e) {
      console.error(`[KIS_QUOTE_ERROR] symbol=${symbol}:`, e)
    }
  }
  return getNaverQuote(symbol)
}

// GET /api/holdings/quote?symbol=AAPL.O — 단일
// GET /api/holdings/quote?symbols=A,B,C — 배치 (콤마 구분)
export async function GET(req: Request) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const kisEnabled = await userHasKis(userId)

  const url = new URL(req.url)
  const single = url.searchParams.get('symbol')?.trim()
  const batchRaw = url.searchParams.get('symbols')?.trim()

  if (single) {
    const symbol = normalizeStockSymbol(single)
    if (!symbol)
      return NextResponse.json({ message: 'invalid symbol' }, { status: 400 })

    try {
      const q = await fetchOneQuote(userId, symbol, kisEnabled)
      if (!q)
        return NextResponse.json(
          { message: '시세를 가져오지 못했습니다.' },
          { status: 502 }
        )
      return NextResponse.json(q)
    } catch (e) {
      console.error('[QUOTE_FATAL]', e)
      return NextResponse.json(
        { message: '시세 조회 중 오류가 발생했습니다.' },
        { status: 502 }
      )
    }
  }

  if (batchRaw) {
    const symbols = normalizeStockSymbolList(batchRaw, 30)
    if (symbols.length === 0) return NextResponse.json({ items: [] })

    const results = await Promise.all(
      symbols.map((s) => fetchOneQuote(userId, s, kisEnabled))
    )
    return NextResponse.json({
      items: results
        .map((q, i) =>
          q ?? {
            symbol: symbols[i],
            price: null,
            prevClose: null,
            currency: null,
            exchange: null,
            name: null,
            marketTime: null,
          }
        )
        .filter((q) => !!q),
    })
  }

  return NextResponse.json(
    { message: 'symbol or symbols required' },
    { status: 400 }
  )
}
