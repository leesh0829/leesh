import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
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
  const base = (url.searchParams.get('base') ?? 'USD').toUpperCase()
  const mapping = FX_SYMBOLS[base]
  if (!mapping)
    return NextResponse.json(
      { message: `지원하지 않는 통화: ${base}` },
      { status: 400 }
    )

  try {
    const items = await getFxMinutes(user.id, mapping.div, mapping.symbol)
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
