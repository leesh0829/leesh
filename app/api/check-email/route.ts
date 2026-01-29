import { NextResponse } from 'next/server'

import { prisma } from '@/app/lib/prisma'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const email = String(searchParams.get('email') ?? '').trim()

    if (!email) {
      return NextResponse.json({ message: 'email required' }, { status: 400 })
    }

    const exists = await prisma.user.findUnique({ where: { email } })
    return NextResponse.json({ available: !exists })
  } catch (e) {
    console.error('[CHECK-EMAIL ERROR]', e)
    return NextResponse.json({ message: 'server error' }, { status: 500 })
  }
}
