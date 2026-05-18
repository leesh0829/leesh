import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { getIndexMinutes } from '@/app/lib/kisMarket'

export const runtime = 'nodejs'

// GET /api/kis/index-minutes?code=0001&gap=60
// gap: 60(1분), 600(10분), 3600(1시간)
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
  const code = url.searchParams.get('code') ?? '0001'
  const gapRaw = parseInt(url.searchParams.get('gap') ?? '60', 10)
  const gap =
    gapRaw === 600 || gapRaw === 3600 || gapRaw === 30 ? gapRaw : 60

  try {
    const items = await getIndexMinutes(user.id, code, gap)
    return NextResponse.json({ code, gap, items })
  } catch (e) {
    console.error('[KIS_INDEX_MIN_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
