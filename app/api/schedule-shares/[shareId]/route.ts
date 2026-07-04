import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { toISOStringSafe } from '@/app/lib/date'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { z } from 'zod'

export const runtime = 'nodejs'

const scheduleShareActionSchema = z
  .object({
    action: z.enum(['ACCEPT', 'REJECT']),
  })
  .strict()

type JsonError = { message: string }
const jsonError = (status: number, message: string) =>
  NextResponse.json({ message } satisfies JsonError, { status })

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) return jsonError(401, 'unauthorized')

    const { shareId } = await params
    const parsed = await parseJsonWithSchema(req, scheduleShareActionSchema)
    if (!parsed.success)
      return badRequestFromZod(parsed.error, 'action must be ACCEPT or REJECT')
    const { action } = parsed.data

    const share = await prisma.scheduleShare.findUnique({
      where: { id: shareId },
      select: { id: true, ownerId: true, scope: true },
    })
    if (!share) return jsonError(404, 'not found')
    if (share.ownerId !== userId) return jsonError(403, 'forbidden')

    const updated = await prisma.scheduleShare.update({
      where: { id: share.id },
      data: {
        status: action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED',
        respondedAt: new Date(),
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
      id: updated.id,
      scope: updated.scope,
      status: updated.status,
      createdAt: toISOStringSafe(updated.createdAt),
      updatedAt: toISOStringSafe(updated.updatedAt),
      respondedAt: updated.respondedAt
        ? toISOStringSafe(updated.respondedAt)
        : null,
    })
  } catch (error) {
    console.error('[SCHEDULE_SHARE_PATCH_ERROR]', error)
    return jsonError(
      500,
      '공유 기능 초기화가 필요합니다. `npx prisma migrate dev` 후 서버를 재시작해 주세요.'
    )
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) return jsonError(401, 'unauthorized')

    const { shareId } = await params

    const share = await prisma.scheduleShare.findUnique({
      where: { id: shareId },
      select: { id: true, requesterId: true, ownerId: true, scope: true },
    })
    if (!share) return jsonError(404, 'not found')

    const allowed = share.requesterId === userId || share.ownerId === userId
    if (!allowed) return jsonError(403, 'forbidden')

    await prisma.scheduleShare.delete({ where: { id: share.id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[SCHEDULE_SHARE_DELETE_ERROR]', error)
    return jsonError(
      500,
      '공유 기능 초기화가 필요합니다. `npx prisma migrate dev` 후 서버를 재시작해 주세요.'
    )
  }
}
