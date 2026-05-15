import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { getExpectedTransRanking } from '@/app/lib/kisMarket'

export const runtime = 'nodejs'

// GET /api/kis/expected-ranking?type=rise|fall&limit=15
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
  const type = url.searchParams.get('type') ?? 'rise'
  const limitRaw = url.searchParams.get('limit')
  const limit = Math.min(
    30,
    Math.max(1, limitRaw ? parseInt(limitRaw, 10) : 15)
  )

  try {
    const items = await getExpectedTransRanking(
      user.id,
      type !== 'fall',
      limit
    )
    return NextResponse.json({ type, items })
  } catch (e) {
    console.error('[KIS_EXPECTED_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
