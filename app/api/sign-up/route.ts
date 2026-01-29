import { NextResponse } from 'next/server'
import bcrypt from 'bcrypt'
import { prisma } from '@/app/lib/prisma'
import crypto from 'crypto'
import { sendMail } from '@/app/lib/mailer'

export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json()

    const cleanEmail = String(email || '').trim()
    const cleanPassword = String(password || '')
    const cleanName = name ? String(name).trim() : null

    if (!cleanEmail || !cleanPassword) {
      return NextResponse.json(
        { message: 'email/password required' },
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
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24)

    // 기존 토큰 제거(재가입/재발송 대비)
    await prisma.verificationToken.deleteMany({
      where: { identifier: cleanEmail },
    })
    await prisma.verificationToken.create({
      data: {
        identifier: cleanEmail,
        token,
        expires,
      },
    })

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
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
