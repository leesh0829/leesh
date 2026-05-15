import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { getMarketInvestorDaily } from '@/app/lib/kisMarket'

export const runtime = 'nodejs'

// GET /api/kis/market-investors?market=KOSPI|KOSDAQ&limit=10
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const cred = await prisma.kisCredential.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (!cred)
    return NextResponse.json(
      { message: 'KIS 자격증명이 등록되어 있지 않습니다.' },
      { status: 412 }
    )

  const url = new URL(req.url)
  const marketRaw = (url.searchParams.get('market') ?? 'KOSPI').toUpperCase()
  const market: 'KOSPI' | 'KOSDAQ' =
    marketRaw === 'KOSDAQ' ? 'KOSDAQ' : 'KOSPI'
  const limitRaw = url.searchParams.get('limit')
  const limit = Math.min(
    30,
    Math.max(1, limitRaw ? parseInt(limitRaw, 10) : 10)
  )

  try {
    const items = await getMarketInvestorDaily(user.id, market, limit)
    return NextResponse.json({ market, items })
  } catch (e) {
    console.error('[KIS_MKT_INV_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
