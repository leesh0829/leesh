import { prisma } from '@/app/lib/prisma'

export type ScheduleShareScope = 'CALENDAR' | 'TODO'

type ScheduleShareOwnerRow = { ownerId: string }

export async function getReadableScheduleOwnerIds(
  userId: string,
  scope: ScheduleShareScope
) {
  try {
    const rows: ScheduleShareOwnerRow[] = await prisma.scheduleShare.findMany({
      where: { requesterId: userId, scope, status: 'ACCEPTED' },
      select: { ownerId: true },
    })

    return Array.from(
      new Set([userId, ...rows.map((row: ScheduleShareOwnerRow) => row.ownerId)])
    )
  } catch (error) {
    console.error('[SCHEDULE_SHARE_READABLE_OWNERS_ERROR]', error)
    // 공유 테이블 마이그레이션이 안 된 상태여도 내 데이터 조회는 유지
    return [userId]
  }
}

export function parseScheduleShareScope(v: unknown): ScheduleShareScope | null {
  if (v === 'CALENDAR' || v === 'TODO') return v
  return null
}

export function toUserLabel(name: string | null, email: string | null) {
  if (name && name.trim()) return name.trim()
  if (email && email.trim()) return email.trim()
  return '알 수 없는 사용자'
}
