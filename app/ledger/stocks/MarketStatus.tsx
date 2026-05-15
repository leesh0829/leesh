'use client'

import { useEffect, useState } from 'react'
import { isHoliday as isKoreanHoliday } from 'korean-holidays'

type MarketState =
  | 'OPEN'
  | 'PRE'
  | 'POST'
  | 'CLOSED'
  | 'PRE_AUCTION' // 정규장 시작 동시호가 (08:30~09:00)
  | 'LUNCH' // (참고용 — 한국 증시는 점심 휴장 없으나 시각적 강조 없음)
  | 'CLOSING_AUCTION' // 종가 동시호가 (15:20~15:30)
  | 'AFTER_SINGLE' // 시간외 단일가 (16:00~18:00)

type Status = {
  state: MarketState
  label: string
}

// 특정 타임존의 현재 요일·시각·년/월/일
function getMarketTime(timezone: string): {
  day: number
  minutes: number
  year: number
  month: number
  date: number
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = fmt.formatToParts(new Date())
  let hour = 0
  let min = 0
  let weekday = ''
  let year = 0
  let month = 0
  let date = 0
  for (const p of parts) {
    if (p.type === 'hour') hour = parseInt(p.value, 10)
    if (p.type === 'minute') min = parseInt(p.value, 10)
    if (p.type === 'weekday') weekday = p.value
    if (p.type === 'year') year = parseInt(p.value, 10)
    if (p.type === 'month') month = parseInt(p.value, 10)
    if (p.type === 'day') date = parseInt(p.value, 10)
  }
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  if (hour === 24) hour = 0
  return {
    day: dayMap[weekday] ?? 0,
    minutes: hour * 60 + min,
    year,
    month,
    date,
  }
}

// 미국 공휴일 (NYSE/NASDAQ 휴장) — 주요 10개
function nthDayOfMonth(
  year: number,
  month: number, // 1-12
  weekday: number, // 0=Sun..6=Sat
  n: number // 1-5 (몇 번째)
): number {
  const first = new Date(year, month - 1, 1)
  const firstDay = first.getDay()
  const offset = (weekday - firstDay + 7) % 7
  return 1 + offset + (n - 1) * 7
}

function lastDayOfMonth(
  year: number,
  month: number,
  weekday: number
): number {
  const last = new Date(year, month, 0) // 다음 달 0일 = 이번 달 마지막 날
  const lastDate = last.getDate()
  const lastDay = last.getDay()
  const offset = (lastDay - weekday + 7) % 7
  return lastDate - offset
}

function isUSHoliday(year: number, month: number, date: number): boolean {
  // New Year's Day
  if (month === 1 && date === 1) return true
  // MLK Day (3rd Monday Jan)
  if (month === 1 && date === nthDayOfMonth(year, 1, 1, 3)) return true
  // Presidents Day (3rd Monday Feb)
  if (month === 2 && date === nthDayOfMonth(year, 2, 1, 3)) return true
  // Memorial Day (last Monday May)
  if (month === 5 && date === lastDayOfMonth(year, 5, 1)) return true
  // Juneteenth
  if (month === 6 && date === 19) return true
  // Independence Day
  if (month === 7 && date === 4) return true
  // Labor Day (1st Monday Sep)
  if (month === 9 && date === nthDayOfMonth(year, 9, 1, 1)) return true
  // Thanksgiving (4th Thursday Nov)
  if (month === 11 && date === nthDayOfMonth(year, 11, 4, 4)) return true
  // Christmas
  if (month === 12 && date === 25) return true
  return false
}

// 다음 거래일 계산 — 주말/공휴일 건너뛰고 다음 평일 반환
function nextKrxTradingDay(): {
  date: Date
  label: string
} {
  const { year, month, date } = getMarketTime('Asia/Seoul')
  const today = new Date(year, month - 1, date)
  for (let i = 1; i <= 10; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    const dow = d.getDay()
    if (dow === 0 || dow === 6) continue
    const hol = isKoreanHoliday(d, { includeSubstitute: true })
    if (hol) continue
    const m = d.getMonth() + 1
    const dt = d.getDate()
    const wdays = ['일', '월', '화', '수', '목', '금', '토']
    return {
      date: d,
      label: `${m}/${dt}(${wdays[dow]})`,
    }
  }
  return { date: today, label: '—' }
}

function krxStatus(): Status {
  const { day, minutes, year, month, date } = getMarketTime('Asia/Seoul')
  if (day === 0 || day === 6) return { state: 'CLOSED', label: '주말 휴장' }
  // 한국 공휴일 (대체공휴일 포함)
  const holiday = isKoreanHoliday(new Date(year, month - 1, date), {
    includeSubstitute: true,
  })
  if (holiday)
    return { state: 'CLOSED', label: `공휴일 휴장 (${holiday.nameKo})` }
  // 08:00=480 / 08:30=510 / 09:00=540 / 15:20=920 / 15:30=930
  // 15:40=940 / 16:00=960 / 18:00=1080
  if (minutes < 480)
    return { state: 'CLOSED', label: '장 시작 전 (~08:00)' }
  if (minutes < 510)
    return { state: 'PRE', label: '장전 시간외 종가 (08:00~08:30)' }
  if (minutes < 540)
    return { state: 'PRE_AUCTION', label: '장 시작 동시호가 (08:30~09:00)' }
  if (minutes < 920)
    return { state: 'OPEN', label: '정규장 (09:00~15:20)' }
  if (minutes < 930)
    return { state: 'CLOSING_AUCTION', label: '종가 동시호가 (15:20~15:30)' }
  if (minutes < 940)
    return { state: 'POST', label: '장후 시간외 종가 (15:30~15:40)' }
  if (minutes < 960)
    return { state: 'POST', label: '시간외 휴식 (15:40~16:00)' }
  if (minutes < 1080)
    return { state: 'AFTER_SINGLE', label: '시간외 단일가 (16:00~18:00)' }
  return { state: 'CLOSED', label: '장 마감' }
}

function usStatus(): Status {
  const { day, minutes, year, month, date } = getMarketTime('America/New_York')
  if (day === 0 || day === 6) return { state: 'CLOSED', label: '주말 휴장' }
  if (isUSHoliday(year, month, date))
    return { state: 'CLOSED', label: '미국 공휴일 휴장' }
  // 04:00 = 240, 09:30 = 570, 16:00 = 960, 20:00 = 1200 (모두 ET)
  if (minutes < 240) return { state: 'CLOSED', label: '장 시작 전' }
  if (minutes < 570)
    return { state: 'PRE', label: '프리마켓 (04:00~09:30 ET)' }
  if (minutes < 960)
    return { state: 'OPEN', label: '정규장 (09:30~16:00 ET)' }
  if (minutes < 1200)
    return { state: 'POST', label: '애프터마켓 (16:00~20:00 ET)' }
  return { state: 'CLOSED', label: '장 마감' }
}

function stateColor(state: MarketState): {
  bg: string
  border: string
  dot: string
} {
  switch (state) {
    case 'OPEN':
      return { bg: '#10b981', border: '#10b981', dot: '#10b981' } // 초록
    case 'PRE_AUCTION':
    case 'CLOSING_AUCTION':
      return { bg: '#a855f7', border: '#a855f7', dot: '#a855f7' } // 보라 - 동시호가
    case 'AFTER_SINGLE':
      return { bg: '#ec4899', border: '#ec4899', dot: '#ec4899' } // 핑크 - 시간외 단일가
    case 'PRE':
    case 'POST':
    case 'LUNCH':
      return { bg: '#f59e0b', border: '#f59e0b', dot: '#f59e0b' } // 주황
    case 'CLOSED':
    default:
      return { bg: '#64748b', border: '#64748b', dot: '#94a3b8' } // 회색
  }
}

function MarketChip({ market, status }: { market: string; status: Status }) {
  const c = stateColor(status.state)
  return (
    <span
      className="badge"
      style={{
        background: `color-mix(in srgb, ${c.bg} 14%, var(--card))`,
        borderColor: `color-mix(in srgb, ${c.border} 50%, var(--border))`,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
      }}
      title={status.label}
    >
      <span
        className={
          status.state === 'OPEN' ||
          status.state === 'PRE_AUCTION' ||
          status.state === 'CLOSING_AUCTION' ||
          status.state === 'AFTER_SINGLE'
            ? 'animate-pulse'
            : ''
        }
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: c.dot,
        }}
      />
      <span className="font-semibold">{market}</span>
      <span>·</span>
      <span>{status.label}</span>
    </span>
  )
}

export default function MarketStatus() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((v) => v + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])
  void tick

  const kr = krxStatus()
  const us = usStatus()
  // 한국 시장이 닫혀있을 때 다음 거래일 안내
  const showNext = kr.state === 'CLOSED'
  const next = showNext ? nextKrxTradingDay() : null

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <MarketChip market="🇰🇷 국장" status={kr} />
      {next && (
        <span
          className="badge"
          style={{
            background: 'var(--surface-muted, rgba(0,0,0,0.04))',
            borderColor: 'var(--border, rgba(0,0,0,0.15))',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span style={{ opacity: 0.7 }}>다음 거래일</span>
          <span className="font-semibold">{next.label}</span>
        </span>
      )}
      <MarketChip market="🇺🇸 미장" status={us} />
    </div>
  )
}
