'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  buildDiaryHeatmap,
  buildMonthLabels,
  type HeatmapDay,
  type HeatmapWeek,
} from '@/app/lib/diaryHeatmap'

const WEEKS = 53
const CELL = 11
const GAP = 3
// 그리드 열 시작 위치(월 라벨 행 높이 + 여백) — 요일 라벨 정렬용
const GRID_TOP_OFFSET = 18
// 일~토 라벨(월/수/금만 표시)
const WEEKDAY_LABELS = ['', '월', '', '수', '', '금', '']

// 오늘(KST, UTC+9) 'YYYY-MM-DD'
function todayKstYmd(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 3600000)
  return kst.toISOString().slice(0, 10)
}

export default function DiaryHeatmap({
  onSelectDate,
}: {
  onSelectDate?: (date: string) => void
}) {
  const [dates, setDates] = useState<string[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [hovered, setHovered] = useState<HeatmapDay | null>(null)

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
  const monthLabels = useMemo(() => buildMonthLabels(grid), [grid])

  if (failed) return null

  const total = dates?.length ?? 0

  return (
    <div className="surface card-pad card-hover-border-only">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">일기 기록</div>
        <div className="text-xs" style={{ color: 'var(--muted)' }}>
          {hovered
            ? `${hovered.date} · ${hovered.hasEntry ? '작성함' : '작성 안 함'}`
            : `최근 1년 · ${total}일 작성`}
        </div>
      </div>

      <div className="mt-3 flex gap-1">
        {/* 요일 라벨 (행) */}
        <div
          className="flex flex-col text-[9px]"
          style={{ color: 'var(--muted)' }}
        >
          <div style={{ height: GRID_TOP_OFFSET }} />
          {WEEKDAY_LABELS.map((w, i) => (
            <div
              key={i}
              className="flex items-center justify-end pr-1"
              style={{ height: CELL, marginBottom: i < 6 ? GAP : 0 }}
            >
              {w}
            </div>
          ))}
        </div>

        {/* 월 라벨(열) + 그리드 */}
        <div className="overflow-x-auto pb-1">
          <div className="flex" style={{ gap: GAP, height: 14 }}>
            {monthLabels.map((label, i) => (
              <div key={i} className="relative" style={{ width: CELL }}>
                {label ? (
                  <span
                    className="absolute left-0 top-0 whitespace-nowrap text-[9px]"
                    style={{ color: 'var(--muted)' }}
                  >
                    {label}
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-1 flex py-1" style={{ gap: GAP }}>
            {grid.map((week, wi) => (
              <div key={wi} className="flex flex-col" style={{ gap: GAP }}>
                {week.map((day) => (
                  <button
                    key={day.date}
                    type="button"
                    disabled={!day.inRange}
                    onMouseEnter={() => day.inRange && setHovered(day)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => {
                      if (day.inRange) onSelectDate?.(day.date)
                    }}
                    aria-label={day.inRange ? day.date : undefined}
                    className={
                      'rounded-[2px] transition-transform duration-100 ' +
                      (day.inRange
                        ? 'cursor-pointer hover:relative hover:z-10 hover:scale-[1.6]'
                        : 'cursor-default')
                    }
                    style={{
                      height: CELL,
                      width: CELL,
                      background: !day.inRange
                        ? 'transparent'
                        : day.hasEntry
                          ? '#6d5aff'
                          : 'rgba(128,128,128,0.15)',
                      outline:
                        day.date === today ? '1px solid #6d5aff' : undefined,
                      outlineOffset: day.date === today ? '1px' : undefined,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
