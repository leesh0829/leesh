'use client'

import { useEffect, useMemo, useState } from 'react'
import { buildDiaryHeatmap, type HeatmapWeek } from '@/app/lib/diaryHeatmap'

const WEEKS = 53

// 오늘(KST, UTC+9) 'YYYY-MM-DD'
function todayKstYmd(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 3600000)
  return kst.toISOString().slice(0, 10)
}

export default function DiaryHeatmap() {
  const [dates, setDates] = useState<string[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let aborted = false
    ;(async () => {
      try {
        const r = await fetch('/api/diary/heatmap', { cache: 'no-store' })
        if (!r.ok) throw new Error('failed')
        const data = (await r.json()) as { dates: string[] }
        if (!aborted) setDates(data.dates)
      } catch {
        if (!aborted) setFailed(true)
      }
    })()
    return () => {
      aborted = true
    }
  }, [])

  const today = useMemo(() => todayKstYmd(), [])
  const grid = useMemo<HeatmapWeek[]>(
    () => (dates ? buildDiaryHeatmap(dates, today, WEEKS) : []),
    [dates, today]
  )

  if (failed) return null

  const total = dates?.length ?? 0

  return (
    <div className="surface card-pad card-hover-border-only">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">일기 기록</div>
        <div className="text-xs" style={{ color: 'var(--muted)' }}>
          최근 1년 · {total}일 작성
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <div className="flex gap-[3px]" style={{ minWidth: 'min-content' }}>
          {grid.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((day) => (
                <div
                  key={day.date}
                  title={day.inRange ? day.date + (day.hasEntry ? ' · 작성' : '') : ''}
                  className="h-[11px] w-[11px] rounded-[2px]"
                  style={{
                    background: !day.inRange
                      ? 'transparent'
                      : day.hasEntry
                        ? '#6d5aff'
                        : 'rgba(128,128,128,0.15)',
                    outline: day.date === today ? '1px solid #6d5aff' : undefined,
                    outlineOffset: day.date === today ? '1px' : undefined,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
