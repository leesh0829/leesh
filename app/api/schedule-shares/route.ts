import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/options'
import { toISOStringSafe } from '@/app/lib/date'
import { parseScheduleShareScope, toUserLabel } from '@/app/lib/scheduleShare'

export const runtime = 'nodejs'

type JsonError = { message: string }
const jsonError = (status: number, message: string) =>
  NextResponse.json({ message } satisfies JsonError, { status })

const scopeLabel = (scope: 'CALENDAR' | 'TODO') =>
  scope === 'CALENDAR' ? '캘린더' : 'TODO'

async function getMe() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return null
  return prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true },
  })
}

export async function GET() {
  try {
    const me = await getMe()
    if (!me) return jsonError(401, 'unauthorized')

    const [outgoing, incoming] = await Promise.all([
      prisma.scheduleShare.findMany({
        where: { requesterId: me.id },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        select: {
          id: true,
          scope: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          respondedAt: true,
          owner: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.scheduleShare.findMany({
        where: { ownerId: me.id, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          scope: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          requester: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
    ])

    return NextResponse.json({
      outgoing: outgoing.map((row) => ({
        id: row.id,
        scope: row.scope,
        status: row.status,
        createdAt: toISOStringSafe(row.createdAt),
        updatedAt: toISOStringSafe(row.updatedAt),
        respondedAt: row.respondedAt ? toISOStringSafe(row.respondedAt) : null,
        owner: {
          id: row.owner.id,
          name: row.owner.name,
          email: row.owner.email,
          label: toUserLabel(row.owner.name, row.owner.email),
        },
      })),
      incoming: incoming.map((row) => ({
        id: row.id,
        scope: row.scope,
        status: row.status,
        createdAt: toISOStringSafe(row.createdAt),
        updatedAt: toISOStringSafe(row.updatedAt),
        requester: {
          id: row.requester.id,
          name: row.requester.name,
          email: row.requester.email,
          label: toUserLabel(row.requester.name, row.requester.email),
        },
      })),
    })
  } catch (error) {
    console.error('[SCHEDULE_SHARES_GET_ERROR]', error)
    return jsonError(
      500,
      '공유 기능 초기화가 필요합니다. `npx prisma migrate dev` 후 서버를 재시작해 주세요.'
    )
  }
}

export async function POST(req: Request) {
  try {
    const me = await getMe()
    if (!me) return jsonError(401, 'unauthorized')

    const body = (await req.json().catch(() => null)) as {
      targetEmail?: string
      scope?: 'CALENDAR' | 'TODO'
    } | null
    const targetEmail = body?.targetEmail?.trim()
    if (!targetEmail) return jsonError(400, 'targetEmail is required')
    const scope = parseScheduleShareScope(body?.scope)
    if (!scope) return jsonError(400, 'scope must be CALENDAR or TODO')

    if (me.email && me.email.toLowerCase() === targetEmail.toLowerCase()) {
      return jsonError(400, '자기 자신에게는 요청할 수 없습니다.')
    }

    const target = await prisma.user.findFirst({
      where: { email: { equals: targetEmail, mode: 'insensitive' } },
      select: { id: true, name: true, email: true },
    })
    if (!target) return jsonError(404, '해당 이메일의 계정을 찾을 수 없습니다.')

    const existing = await prisma.scheduleShare.findUnique({
      where: {
        requesterId_ownerId_scope: {
          requesterId: me.id,
          ownerId: target.id,
          scope,
        },
      },
      select: { id: true, status: true },
    })

    if (existing?.status === 'PENDING') {
      return jsonError(409, `이미 ${scopeLabel(scope)} 공유 요청을 보냈습니다.`)
    }
    if (existing?.status === 'ACCEPTED') {
      return jsonError(
        409,
        `이미 ${scopeLabel(scope)} 공유가 허용된 계정입니다.`
      )
    }

    const row = existing
      ? await prisma.scheduleShare.update({
          where: { id: existing.id },
          data: { status: 'PENDING', respondedAt: null },
          select: {
            id: true,
            scope: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            respondedAt: true,
          },
        })
      : await prisma.scheduleShare.create({
          data: {
            requesterId: me.id,
            ownerId: target.id,
            scope,
            status: 'PENDING',
          },
          select: {
            id: true,
            scope: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            respondedAt: true,
          },
        })

    return NextResponse.json({
      id: row.id,
      scope: row.scope,
      status: row.status,
      createdAt: toISOStringSafe(row.createdAt),
      updatedAt: toISOStringSafe(row.updatedAt),
      respondedAt: row.respondedAt ? toISOStringSafe(row.respondedAt) : null,
      owner: {
        id: target.id,
        name: target.name,
        email: target.email,
        label: toUserLabel(target.name, target.email),
      },
    })
  } catch (error) {
    console.error('[SCHEDULE_SHARES_POST_ERROR]', error)
    return jsonError(
      500,
      '공유 기능 초기화가 필요합니다. `npx prisma migrate dev` 후 서버를 재시작해 주세요.'
    )
  }
}
