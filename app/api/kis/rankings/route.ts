import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { getVolumeRanking, getRiseRanking } from '@/app/lib/kisMarket'

export const runtime = 'nodejs'

// GET /api/kis/rankings?type=value | rise | fall  &limit=10
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
  const type = url.searchParams.get('type') ?? 'value'
  const limitRaw = url.searchParams.get('limit')
  const limit = Math.min(
    50,
    Math.max(1, limitRaw ? parseInt(limitRaw, 10) : 10)
  )

  try {
    let items: Awaited<ReturnType<typeof getVolumeRanking>> = []
    if (type === 'value' || type === 'volume') {
      items = await getVolumeRanking(user.id, type === 'value', limit)
    } else if (type === 'rise') {
      items = await getRiseRanking(user.id, true, limit)
    } else if (type === 'fall') {
      items = await getRiseRanking(user.id, false, limit)
    } else {
      return NextResponse.json(
        { message: 'type must be value|volume|rise|fall' },
        { status: 400 }
      )
    }
    return NextResponse.json({ type, items })
  } catch (e) {
    console.error('[KIS_RANKINGS_API_ERROR]', e)
    return NextResponse.json(
      { message: '랭킹 조회 중 오류가 발생했습니다.' },
      { status: 502 }
    )
  }
}
