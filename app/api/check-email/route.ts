import { NextResponse } from 'next/server'

import { prisma } from '@/app/lib/prisma'
import { getClientIp, takeRateLimit } from '@/app/lib/rateLimit'

const CHECK_EMAIL_LIMIT = 40
const CHECK_EMAIL_WINDOW_MS = 10 * 60 * 1000

export async function GET(req: Request) {
  try {
    const ip = getClientIp(req)
    const rate = takeRateLimit(
      `check-email:${ip}`,
      CHECK_EMAIL_LIMIT,
      CHECK_EMAIL_WINDOW_MS
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
