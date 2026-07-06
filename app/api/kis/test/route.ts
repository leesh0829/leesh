import { NextResponse } from 'next/server'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { testKisCredentials } from '@/app/lib/kisAuth'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { getClientIp, takeRateLimit } from '@/app/lib/rateLimit'
import {
  buildKisCredentialTestRateLimitKey,
  KIS_CREDENTIAL_TEST_LIMIT,
  KIS_CREDENTIAL_TEST_WINDOW_MS,
} from '@/app/lib/kisCredentialTestRateLimit'

export const runtime = 'nodejs'

const schema = z
  .object({
    appKey: z.string().trim().min(1),
    appSecret: z.string().trim().min(1),
    isLive: z.boolean().optional().default(true),
  })
  .strict()

export async function POST(req: Request) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const ip = getClientIp(req)
  const rate = takeRateLimit(
    buildKisCredentialTestRateLimitKey(userId, ip),
    KIS_CREDENTIAL_TEST_LIMIT,
    KIS_CREDENTIAL_TEST_WINDOW_MS
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

  const parsed = await parseJsonWithSchema(req, schema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid body')

  const result = await testKisCredentials(userId, parsed.data)
  if (result.ok) return NextResponse.json({ ok: true })
  return NextResponse.json({ ok: false, message: result.message }, { status: 400 })
}
