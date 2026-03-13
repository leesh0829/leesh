'use client'

import { useEffect, useMemo, useState } from 'react'

type LuckyColor = {
  name: string
  value: string
}

type LuckyBundle = {
  day: string
  number: number
  color: LuckyColor
  symbol: string
  aura: string
  tip: string
}

const LUCKY_COLORS: LuckyColor[] = [
  { name: 'Aurora Mint', value: '#57d68d' },
  { name: 'Sky Pulse', value: '#2fc8ff' },
  { name: 'Sunset Coral', value: '#ff8f6b' },
  { name: 'Electric Iris', value: '#7c6dff' },
  { name: 'Gold Dust', value: '#f3c95b' },
  { name: 'Rose Signal', value: '#ff6fae' },
  { name: 'Polar Lime', value: '#b9ff66' },
  { name: 'Deep Ocean', value: '#4f8cff' },
]

const LUCKY_SYMBOLS = ['✦', '☘', '☀', '☾', '⚑', '⚡', '◆', '∞'] as const

const LUCKY_AURAS = [
  '오늘은 이상하게 작은 선택이 잘 맞는 날',
  '우연처럼 보이지만 흐름이 따라오는 날',
  '평소보다 감이 빠르게 꽂히는 날',
  '별것 아닌 클릭 하나가 꽤 괜찮게 이어지는 날',
  '타이밍이 미묘하게 맞아떨어지는 날',
]

const LUCKY_TIPS = [
  '첫 번째로 눈에 띈 일을 먼저 처리해 보세요.',
  '고민되면 짧게 움직이는 쪽이 이깁니다.',
  '메모 하나만 남겨도 오늘 운을 써먹은 겁니다.',
  '색이 끌리는 버튼을 눌러도 이상하게 잘 풀릴 수 있습니다.',
  '작은 정리가 오늘 컨디션을 크게 바꿉니다.',
]

function hashString(input: string) {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function getTodayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}`
}

function pickBySeed<T>(items: readonly T[], seed: number, shift: number) {
  return items[(seed + shift) % items.length]
}

function getLuckyBundle(day: string): LuckyBundle {
  const seed = hashString(day)
  const color = pickBySeed(LUCKY_COLORS, seed, 3)
  const symbol = pickBySeed(LUCKY_SYMBOLS, seed, 7)
  const aura = pickBySeed(LUCKY_AURAS, seed, 11)
  const tip = pickBySeed(LUCKY_TIPS, seed, 19)

  return {
    day,
    number: (seed % 99) + 1,
    color,
    symbol,
    aura,
    tip,
  }
}

export default function DailyLuckCard() {
  const [day, setDay] = useState(() => getTodayKey())

  useEffect(() => {
    const syncDay = () => {
      const today = getTodayKey()
      setDay((prev) => (prev === today ? prev : today))
    }

    syncDay()

    const interval = window.setInterval(syncDay, 60 * 1000)
    window.addEventListener('focus', syncDay)
    document.addEventListener('visibilitychange', syncDay)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', syncDay)
      document.removeEventListener('visibilitychange', syncDay)
    }
  }, [])

  const lucky = useMemo(() => getLuckyBundle(day), [day])

  return (
    <section
      className="daily-luck-card mt-4 p-3"
      style={{
        background: `linear-gradient(160deg, color-mix(in srgb, ${lucky.color.value} 18%, var(--card)) 0%, var(--card) 62%)`,
        borderColor: `color-mix(in srgb, ${lucky.color.value} 38%, var(--border))`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-65">
            Lucky Today
          </div>
          <div className="mt-1 text-xs opacity-70">{lucky.day}</div>
        </div>
        <span className="badge">매일 갱신</span>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-3">
        <div>
          <div className="text-xs opacity-70">행운 번호</div>
          <div className="text-3xl font-black tracking-tight">
            {String(lucky.number).padStart(2, '0')}
          </div>
        </div>
        <div className="daily-luck-symbol">
          <span aria-hidden>{lucky.symbol}</span>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full border"
            style={{
              backgroundColor: lucky.color.value,
              borderColor: 'color-mix(in srgb, white 35%, transparent)',
              boxShadow: `0 0 0 4px color-mix(in srgb, ${lucky.color.value} 16%, transparent)`,
            }}
          />
          <span className="font-medium">{lucky.color.name}</span>
        </div>
        <p className="leading-5 opacity-80">{lucky.aura}</p>
        <p className="leading-5 opacity-70">{lucky.tip}</p>
      </div>
    </section>
  )
}
