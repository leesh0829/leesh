import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { encrypt, decrypt, maskSecret } from '@/app/lib/cryptoUtil'

export const runtime = 'nodejs'

async function getUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return null
  return prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  })
}

const upsertSchema = z
  .object({
    appKey: z.string().trim().min(1).max(200),
    appSecret: z.string().trim().min(1).max(500),
    accountNumber: z
      .string()
      .trim()
      .min(8)
      .max(12)
      .regex(/^\d{8}$/, 'accountNumber must be 8 digits'),
    accountProductCode: z
      .string()
      .trim()
      .min(2)
      .max(2)
      .regex(/^\d{2}$/, 'productCode must be 2 digits')
      .optional()
      .default('01'),
    isLive: z.boolean().optional().default(true),
  })
  .strict()

// 사용자의 등록 상태 + 마스킹된 키 정보 반환 (실제 값 노출 X)
export async function GET() {
  const user = await getUser()
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const cred = await prisma.kisCredential.findUnique({
    where: { userId: user.id },
    select: {
      appKey: true,
      accountNumber: true,
      accountProductCode: true,
      isLive: true,
      tokenExpiresAt: true,
      updatedAt: true,
    },
  })
  if (!cred) return NextResponse.json({ registered: false })

  return NextResponse.json({
    registered: true,
    appKeyMasked: maskSecret(decrypt(cred.appKey)),
    accountNumber: cred.accountNumber,
    accountProductCode: cred.accountProductCode,
    isLive: cred.isLive,
    tokenExpiresAt: cred.tokenExpiresAt?.toISOString() ?? null,
    updatedAt: cred.updatedAt.toISOString(),
  })
}

// 등록/갱신 (upsert)
export async function PUT(req: Request) {
  const user = await getUser()
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const parsed = await parseJsonWithSchema(req, upsertSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid body')

  const { appKey, appSecret, accountNumber, accountProductCode, isLive } =
    parsed.data

  await prisma.kisCredential.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      appKey: encrypt(appKey),
      appSecret: encrypt(appSecret),
      accountNumber,
      accountProductCode,
      isLive,
    },
    update: {
      appKey: encrypt(appKey),
      appSecret: encrypt(appSecret),
      accountNumber,
      accountProductCode,
      isLive,
      // 키 바뀌면 토큰 무효화
      accessToken: null,
      tokenExpiresAt: null,
    },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const user = await getUser()
  if (!user)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  await prisma.kisCredential.deleteMany({ where: { userId: user.id } })
  return NextResponse.json({ ok: true })
}
