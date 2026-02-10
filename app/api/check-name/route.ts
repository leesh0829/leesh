import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getClientIp, takeRateLimit } from '@/app/lib/rateLimit'

const CHECK_NAME_LIMIT = 40
const CHECK_NAME_WINDOW_MS = 10 * 60 * 1000

export async function GET(req: Request) {
  try {
    const ip = getClientIp(req)
    const rate = takeRateLimit(
      `check-name:${ip}`,
      CHECK_NAME_LIMIT,
      CHECK_NAME_WINDOW_MS
    )
    if (!rate.ok) {
      return NextResponse.json(
        { message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rate.retryAfterSec) },
        }
      )
    }

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
