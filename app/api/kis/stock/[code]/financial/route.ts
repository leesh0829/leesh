import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { getFinancialRatio } from '@/app/lib/kisStock'

export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
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

  const { code } = await params
  if (!/^\d{6}$/.test(code))
    return NextResponse.json({ message: 'invalid code' }, { status: 400 })

  try {
    const items = await getFinancialRatio(user.id, code)
    return NextResponse.json({ items })
  } catch (e) {
    console.error('[KIS_FINANCIAL_API_ERROR]', e)
    return NextResponse.json({ message: '오류' }, { status: 502 })
  }
}
