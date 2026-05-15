import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { getIndices } from '@/app/lib/kisMarket'

export const runtime = 'nodejs'

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
  const codesParam = url.searchParams.get('codes')
  const codes = codesParam
    ? codesParam.split(',').map((s) => s.trim()).filter(Boolean)
    : ['0001', '1001']

  try {
    const items = await getIndices(user.id, codes)
    return NextResponse.json({ items })
  } catch (e) {
    console.error('[KIS_INDICES_API_ERROR]', e)
    return NextResponse.json(
      { message: '지수 조회 중 오류가 발생했습니다.' },
      { status: 502 }
    )
  }
}
