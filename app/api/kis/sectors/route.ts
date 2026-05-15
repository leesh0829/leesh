import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { getCategoryIndices } from '@/app/lib/kisMarket'

export const runtime = 'nodejs'

// GET /api/kis/sectors?market=KOSPI|KOSDAQ
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
  const marketParam = url.searchParams.get('market') ?? 'KOSPI'
  const market: 'KOSPI' | 'KOSDAQ' =
    marketParam.toUpperCase() === 'KOSDAQ' ? 'KOSDAQ' : 'KOSPI'

  try {
    const data = await getCategoryIndices(user.id, market)
    return NextResponse.json({ market, ...data })
  } catch (e) {
    console.error('[KIS_SECTORS_API_ERROR]', e)
    return NextResponse.json(
      { message: '업종별 조회 중 오류가 발생했습니다.' },
      { status: 502 }
    )
  }
}
