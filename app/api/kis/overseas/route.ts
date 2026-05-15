import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { getOverseasQuotes } from '@/app/lib/kisOverseas'

export const runtime = 'nodejs'

// GET /api/kis/overseas?pairs=NAS:COMP,NYS:.DJI,NYS:SPX
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
  const pairsRaw = url.searchParams.get('pairs')
  if (!pairsRaw)
    return NextResponse.json({ message: 'pairs required' }, { status: 400 })

  const pairs = pairsRaw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [exchange, symbol] = p.split(':')
      return { exchange: (exchange ?? '').trim(), symbol: (symbol ?? '').trim() }
    })
    .filter((p) => p.exchange && p.symbol)
    .slice(0, 10)

  try {
    const items = await getOverseasQuotes(user.id, pairs)
    return NextResponse.json({ items })
  } catch (e) {
    console.error('[KIS_OVERSEAS_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
