import { NextResponse } from 'next/server'
import { sendMail } from '@/app/lib/mailer'
import { getClientIp, takeRateLimit } from '@/app/lib/rateLimit'

export const runtime = 'nodejs'

const CONTACT_LIMIT = 6
const CONTACT_WINDOW_MS = 10 * 60 * 1000
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getTrimmed(body: unknown, key: string): string {
  if (!body || typeof body !== 'object') return ''
  const value = (body as Record<string, unknown>)[key]
  if (typeof value !== 'string') return ''
  return value.trim()
}

function sanitizeHeaderText(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

function formatKstDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((x) => x.type === type)?.value ?? ''

  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')} (KST)`
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req)
    const rate = takeRateLimit(
      `leesh-contact:${ip}`,
      CONTACT_LIMIT,
      CONTACT_WINDOW_MS
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

    const body = await req.json().catch(() => null)
    const name = getTrimmed(body, 'name')
    const email = getTrimmed(body, 'email')
    const subject = getTrimmed(body, 'subject')
    const message = getTrimmed(body, 'message')

    if (!email || !message) {
      return NextResponse.json(
        { message: '이메일과 메시지는 필수입니다.' },
        { status: 400 }
      )
    }

    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { message: '올바른 이메일 형식이 아닙니다.' },
        { status: 400 }
      )
    }

    if (name.length > 60) {
      return NextResponse.json(
        { message: '이름은 60자 이내로 입력해 주세요.' },
        { status: 400 }
      )
    }

    if (subject.length > 120) {
      return NextResponse.json(
        { message: '제목은 120자 이내로 입력해 주세요.' },
        { status: 400 }
      )
    }

    if (message.length < 10 || message.length > 2000) {
      return NextResponse.json(
        { message: '메시지는 10자 이상 2000자 이하로 입력해 주세요.' },
        { status: 400 }
      )
    }

    const to = process.env.LEESH_CONTACT_TO ?? process.env.SMTP_USER
    if (!to) {
      return NextResponse.json(
        {
          message:
            '서버 설정 오류: LEESH_CONTACT_TO 또는 SMTP_USER가 필요합니다.',
        },
        { status: 500 }
      )
    }

    const senderName = sanitizeHeaderText(name) || '익명'
    const senderEmail = sanitizeHeaderText(email)
    const senderSubject = sanitizeHeaderText(subject) || '포트폴리오 문의'

    await sendMail({
      to,
      replyTo: senderEmail,
      subject: `[Leesh Contact] ${senderSubject}`,
      text: [
        `보낸 사람: ${senderName}`,
        `회신 이메일: ${senderEmail}`,
        `IP: ${ip}`,
        `시간: ${formatKstDateTime(new Date())}`,
        '',
        message,
      ].join('\n'),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[LEESH_CONTACT_ERROR]', error)
    return NextResponse.json({ message: 'server error' }, { status: 500 })
  }
}
