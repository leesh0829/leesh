import { getHolidays } from 'korean-holidays'
import {
  KOREA_HOLIDAY_BOARD_ID,
  KOREA_HOLIDAY_LABEL,
  KOREA_HOLIDAY_OWNER_ID,
} from '@/app/lib/koreanHolidayConstants'

const KOREA_TIME_ZONE = 'Asia/Seoul'
const datePartFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: KOREA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export type KoreanHolidayCalendarItem = {
  kind: 'HOLIDAY'
  id: string
  slug: null
  boardId: typeof KOREA_HOLIDAY_BOARD_ID
  boardName: typeof KOREA_HOLIDAY_LABEL
  boardType: 'CALENDAR'
  ownerId: typeof KOREA_HOLIDAY_OWNER_ID
  ownerLabel: typeof KOREA_HOLIDAY_LABEL
  canEdit: false
  shared: false
  title: string
  displayTitle: string
  status: 'HOLIDAY'
  isSecret: false
  startAt: string
  endAt: null
  allDay: true
  createdAt: null
  isSubstituteHoliday: boolean
  isLunarHoliday: boolean
}

function formatKoreaDateKey(date: Date) {
  const parts = datePartFormatter.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''

  return `${get('year')}-${get('month')}-${get('day')}`
}

function isValidMonth(month: string) {
  return /^\d{4}-\d{2}$/.test(month)
}

export function getKoreanHolidayCalendarItems(
  month: string
): KoreanHolidayCalendarItem[] {
  if (!isValidMonth(month)) return []

  const year = Number(month.slice(0, 4))
  if (!Number.isInteger(year)) return []

  return getHolidays(year)
    .filter((holiday) => formatKoreaDateKey(holiday.date).startsWith(month))
    .sort((a, b) => {
      const timeDiff = a.date.getTime() - b.date.getTime()
      if (timeDiff !== 0) return timeDiff
      return a.nameKo.localeCompare(b.nameKo, 'ko')
    })
    .map((holiday) => {
      const dateKey = formatKoreaDateKey(holiday.date)
      return {
        kind: 'HOLIDAY',
        id: `holiday:kr:${dateKey}:${holiday.nameKo}`,
        slug: null,
        boardId: KOREA_HOLIDAY_BOARD_ID,
        boardName: KOREA_HOLIDAY_LABEL,
        boardType: 'CALENDAR',
        ownerId: KOREA_HOLIDAY_OWNER_ID,
        ownerLabel: KOREA_HOLIDAY_LABEL,
        canEdit: false,
        shared: false,
        title: holiday.nameKo,
        displayTitle: holiday.nameKo,
        status: 'HOLIDAY',
        isSecret: false,
        startAt: holiday.date.toISOString(),
        endAt: null,
        allDay: true,
        createdAt: null,
        isSubstituteHoliday: holiday.isSubstitute,
        isLunarHoliday: holiday.isLunar,
      }
    })
}
