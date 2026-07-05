export type HeatmapDay = {
  date: string // 'YYYY-MM-DD'
  hasEntry: boolean
  inRange: boolean // false = 오늘 이후(패딩) 칸
}

export type HeatmapWeek = HeatmapDay[] // length 7, 일(0)~토(6)

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function fmtYmd(dt: Date): string {
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(dt: Date, n: number): Date {
  return new Date(dt.getTime() + n * 86400000)
}

// GitHub 잔디식 그리드: `weeks`개 열(오래된→최신), 각 열 7일(일→토).
// 마지막 열은 오늘이 속한 주의 토요일에 정렬. 오늘 이후 칸은 inRange:false.
export function buildDiaryHeatmap(
  entryDates: Iterable<string>,
  today: string,
  weeks: number
): HeatmapWeek[] {
  const set = entryDates instanceof Set ? entryDates : new Set(entryDates)
  const todayUTC = parseYmd(today)
  const lastSaturday = addDays(todayUTC, 6 - todayUTC.getUTCDay())
  const start = addDays(lastSaturday, -(weeks * 7 - 1)) // 일요일

  const grid: HeatmapWeek[] = []
  for (let w = 0; w < weeks; w++) {
    const week: HeatmapWeek = []
    for (let d = 0; d < 7; d++) {
      const cell = addDays(start, w * 7 + d)
      const ymd = fmtYmd(cell)
      const inRange = cell.getTime() <= todayUTC.getTime()
      week.push({ date: ymd, hasEntry: inRange && set.has(ymd), inRange })
    }
    grid.push(week)
  }
  return grid
}
