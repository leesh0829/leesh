import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { getIndexHistory } from '@/app/lib/kisMarket'

export const runtime = 'nodejs'

// GET /api/kis/index-history?code=0001&period=D|W|M|Y
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
  const periodRaw = url.searchParams.get('period') ?? 'D'
  const period: 'D' | 'W' | 'M' | 'Y' =
    periodRaw === 'W'
      ? 'W'
      : periodRaw === 'M'
        ? 'M'
        : periodRaw === 'Y'
          ? 'Y'
          : 'D'

  try {
    const items = await getIndexHistory(user.id, code, period)
    return NextResponse.json({ code, period, items })
  } catch (e) {
    console.error('[KIS_INDEX_HISTORY_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
