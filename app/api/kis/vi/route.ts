import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { getViStatus } from '@/app/lib/kisMarket'

export const runtime = 'nodejs'

// GET /api/kis/vi?market=ALL|KOSPI|KOSDAQ&limit=20
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
  const marketRaw = (url.searchParams.get('market') ?? 'ALL').toUpperCase()
  const market: 'ALL' | 'KOSPI' | 'KOSDAQ' =
    marketRaw === 'KOSPI' ? 'KOSPI' : marketRaw === 'KOSDAQ' ? 'KOSDAQ' : 'ALL'
  const limitRaw = url.searchParams.get('limit')
  const limit = Math.min(
    50,
    Math.max(1, limitRaw ? parseInt(limitRaw, 10) : 20)
  )

  try {
    const items = await getViStatus(user.id, market, limit)
    return NextResponse.json({ market, items })
  } catch (e) {
    console.error('[KIS_VI_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
