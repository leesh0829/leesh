import { NextResponse } from 'next/server'
import bcrypt from 'bcrypt'
import { prisma } from '@/app/lib/prisma'
import crypto from 'crypto'
import { sendMail } from '@/app/lib/mailer'
import { resolveAppUrl } from '@/app/lib/appUrl'
import { hashVerificationToken } from '@/app/lib/verificationToken'
import { getClientIp, takeRateLimit } from '@/app/lib/rateLimit'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'

const SIGN_UP_LIMIT = 8
const SIGN_UP_WINDOW_MS = 10 * 60 * 1000
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const signUpBodySchema = z
  .object({
    email: z.string().trim().min(1, 'email/password required'),
    password: z.string().min(1, 'email/password required'),
    name: z.union([z.string(), z.null()]).optional(),
  })
  .strict()

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req)
    const rate = takeRateLimit(
      `sign-up:${ip}`,
      SIGN_UP_LIMIT,
      SIGN_UP_WINDOW_MS
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

    const parsed = await parseJsonWithSchema(req, signUpBodySchema)
    if (!parsed.success) {
      return badRequestFromZod(parsed.error, 'invalid body')
    }

    const cleanEmail = parsed.data.email
    const cleanPassword = parsed.data.password
    const cleanName =
      typeof parsed.data.name === 'string' ? parsed.data.name.trim() || null : null

    if (!EMAIL_REGEX.test(cleanEmail)) {
      return NextResponse.json(
        { message: 'invalid email format' },
        { status: 400 }
      )
    }

    const exists = await prisma.user.findUnique({
      where: { email: cleanEmail },
    })
    if (exists) {
      return NextResponse.json(
        { message: 'email already exists' },
        { status: 409 }
      )
    }

    if (cleanName && cleanName.length > 0) {
      const nameExists = await prisma.user.findFirst({
        where: {
          name: {
            equals: cleanName,
            mode: 'insensitive',
          },
        },
        select: { id: true },
      })

      if (nameExists) {
        return NextResponse.json(
          { message: 'name already exists' },
          { status: 409 }
        )
      }
    }

    const hash = await bcrypt.hash(cleanPassword, 10)

    await prisma.user.create({
      data: {
        email: cleanEmail,
        password: hash,
        name: cleanName,
        emailVerified: null,
      },
    })

    // 인증 토큰 생성/저장 (24시간)
    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = hashVerificationToken(token)
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24)

    // 기존 토큰 제거(재가입/재발송 대비)
    await prisma.verificationToken.deleteMany({
      where: { identifier: cleanEmail },
    })
    await prisma.verificationToken.create({
      data: {
        identifier: cleanEmail,
        token: tokenHash,
        expires,
      },
    })

    const appUrl = resolveAppUrl(req)
    const link = `${appUrl}/verify-email?email=${encodeURIComponent(cleanEmail)}&token=${encodeURIComponent(token)}`

    await sendMail({
      to: cleanEmail,
      subject: '[Leesh] 이메일 인증',
      text: `아래 링크를 눌러 이메일 인증을 완료하세요:\n\n${link}\n\n만료: 24시간`,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[SIGN-UP ERROR]', e)
    return NextResponse.json({ message: 'server error' }, { status: 500 })
  }
}
