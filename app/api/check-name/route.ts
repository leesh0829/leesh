import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const name = String(searchParams.get('name') ?? '').trim()

    if (!name) {
      return NextResponse.json({ message: 'name required' }, { status: 400 })
    }

    const exists = await prisma.user.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive',
        },
      },
      select: { id: true },
    })

    return NextResponse.json({ available: !exists })
  } catch (e) {
    console.error('[CHECK-NAME ERROR]', e)
    return NextResponse.json({ message: 'server error' }, { status: 500 })
  }
}
