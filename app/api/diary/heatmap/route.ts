import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { getDiaryLockState } from '@/app/lib/diaryLockServer'
import { isDatabaseConnectionError } from '@/app/lib/prismaError'

export const runtime = 'nodejs'

const WEEKS = 53

export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
  }

  const lock = await getDiaryLockState(userId)
  if (lock.enabled && !lock.unlocked) {
    return NextResponse.json({ message: 'locked' }, { status: 423 })
  }

  // 최근 ~53주보다 넉넉히 넓은 하한을 잡는다(그리드는 클라이언트에서 정확히 자름).
  const now = new Date()
  const start = new Date(now.getTime() - (WEEKS * 7 + 7) * 86400000)
  const startYmd = start.toISOString().slice(0, 10)

  try {
    const rows = await prisma.diaryEntry.findMany({
      where: { userId, date: { gte: startYmd } },
      select: { date: true },
      orderBy: { date: 'asc' },
    })
    return NextResponse.json({ dates: rows.map((r) => r.date) })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      console.error('[DIARY_HEATMAP_DB_UNAVAILABLE]', error)
      return NextResponse.json({ dates: [] })
    }
    throw error
  }
}
