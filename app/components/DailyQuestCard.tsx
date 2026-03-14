'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'

type Quest = {
  id: string
  category: string
  title: string
  description: string
  href: string
  cta: string
  accent: string
}

type StoredQuestState = {
  day: string
  index: number
  completed: boolean
  streak: number
  lastCompletedDay: string | null
}

const STORAGE_KEY = 'leesh-daily-quest'

const QUESTS: Quest[] = [
  {
    id: 'todo-reset',
    category: 'TODO',
    title: '밀린 보드 하나 정리하기',
    description: 'TODO 보드에서 오래 묵은 카드 하나만 오늘 끝내보세요.',
    href: '/todos',
    cta: 'TODO 열기',
    accent: '#7c6dff',
  },
  {
    id: 'calendar-focus',
    category: 'CALENDAR',
    title: '내일 일정 한 칸 선점하기',
    description: '캘린더에 내일 가장 중요한 일정을 먼저 박아두세요.',
    href: '/calendar',
    cta: '캘린더 열기',
    accent: '#2fc8ff',
  },
  {
    id: 'board-dig',
    category: 'BOARD',
    title: '보드에서 아이디어 하나 발굴하기',
    description: '메모만 남아 있는 글감이나 아이디어를 하나 발전시켜보세요.',
    href: '/boards',
    cta: '보드 보기',
    accent: '#ff8f6b',
  },
  {
    id: 'blog-line',
    category: 'BLOG',
    title: '블로그에 세 줄 초안 남기기',
    description: '완성본이 아니어도 좋습니다. 생각 하나만 기록해두면 됩니다.',
    href: '/blog',
    cta: '블로그 가기',
    accent: '#57d68d',
  },
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

function getDefaultQuestIndex(day: string) {
  return hashString(day) % QUESTS.length
}

function parseStoredQuestState(raw: string | null): StoredQuestState | null {
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null

    const record = parsed as Record<string, unknown>
    const day = typeof record.day === 'string' ? record.day : null
    const index =
      typeof record.index === 'number' && Number.isFinite(record.index)
        ? Math.abs(Math.trunc(record.index)) % QUESTS.length
        : null
    const completed =
      typeof record.completed === 'boolean' ? record.completed : null
    const streak =
      typeof record.streak === 'number' && Number.isFinite(record.streak)
        ? Math.max(0, Math.trunc(record.streak))
        : 0
    const lastCompletedDay =
      typeof record.lastCompletedDay === 'string'
        ? record.lastCompletedDay
        : null

    if (!day || index === null || completed === null) return null

    return {
      day,
      index,
      completed,
      streak,
      lastCompletedDay,
    }
  } catch {
    return null
  }
}

function writeStoredQuestState(next: StoredQuestState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

function getNormalizedQuestState(day: string, prev: StoredQuestState | null) {
  if (prev && prev.day === day) {
    return {
      ...prev,
      index: prev.index % QUESTS.length,
    }
  }

  return {
    day,
    index: getDefaultQuestIndex(day),
    completed: false,
    streak: prev?.streak ?? 0,
    lastCompletedDay: prev?.lastCompletedDay ?? null,
  }
}

function isPreviousDay(previousDay: string, today: string) {
  const prev = new Date(`${previousDay}T00:00:00`)
  const next = new Date(`${today}T00:00:00`)

  if (Number.isNaN(prev.getTime()) || Number.isNaN(next.getTime())) return false

  const diff = next.getTime() - prev.getTime()
  return diff === 24 * 60 * 60 * 1000
}

export default function DailyQuestCard({
  onNavigate,
}: {
  onNavigate?: () => void
}) {
  const [questState, setQuestState] = useState<StoredQuestState | null>(null)
  const [bursting, setBursting] = useState(false)

  useEffect(() => {
    const sync = () => {
      const today = getTodayKey()
      const stored = parseStoredQuestState(
        window.localStorage.getItem(STORAGE_KEY)
      )
      const normalized = getNormalizedQuestState(today, stored)
      writeStoredQuestState(normalized)
      setQuestState(normalized)
    }

    sync()

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') sync()
    }

    window.addEventListener('focus', sync)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  useEffect(() => {
    if (!bursting) return
    const timeout = window.setTimeout(() => setBursting(false), 900)
    return () => window.clearTimeout(timeout)
  }, [bursting])

  const quest = useMemo(() => {
    if (!questState) return null
    return QUESTS[questState.index]
  }, [questState])

  const handleReroll = () => {
    setQuestState((prev) => {
      if (!prev || QUESTS.length <= 1) return prev

      let nextIndex = prev.index
      while (nextIndex === prev.index) {
        nextIndex = Math.floor(Math.random() * QUESTS.length)
      }

      const next = {
        ...prev,
        index: nextIndex,
        completed: false,
      }
      writeStoredQuestState(next)
      return next
    })
  }

  const handleComplete = () => {
    const today = getTodayKey()

    setQuestState((prev) => {
      if (!prev || prev.completed) return prev

      const nextStreak =
        prev.lastCompletedDay === today
          ? Math.max(prev.streak, 1)
          : prev.lastCompletedDay && isPreviousDay(prev.lastCompletedDay, today)
            ? prev.streak + 1
            : 1

      const next = {
        ...prev,
        completed: true,
        streak: nextStreak,
        lastCompletedDay: today,
      }
      writeStoredQuestState(next)
      return next
    })

    setBursting(true)
  }

  if (!questState || !quest) {
    return (
      <div className="daily-quest-card mt-4 p-3">
        <div className="h-3 w-20 rounded-full skeleton" />
        <div className="mt-3 h-5 w-40 rounded-full skeleton" />
        <div className="mt-2 h-14 rounded-2xl skeleton" />
      </div>
    )
  }

  return (
    <section
      className="daily-quest-card mt-4 p-3"
      style={{
        background: `linear-gradient(155deg, color-mix(in srgb, ${quest.accent} 18%, var(--card)) 0%, var(--card) 62%)`,
        borderColor: `color-mix(in srgb, ${quest.accent} 36%, var(--border))`,
      }}
    >
      {bursting ? (
        <div className="daily-quest-burst" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, index) => (
            <span
              key={`spark-${index}`}
              className="daily-quest-spark"
              style={
                {
                  ['--spark-angle' as const]: `${index * 45}deg`,
                  ['--spark-color' as const]: quest.accent,
                } as CSSProperties
              }
            />
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-65">
            Daily Quest
          </div>
          <div className="mt-1 text-xs opacity-75">{quest.category}</div>
        </div>
        <span className="badge">
          {questState.streak > 0 ? `연속 ${questState.streak}일` : '첫 달성 대기'}
        </span>
      </div>

      <div className="mt-3">
        <div className="text-sm font-semibold leading-6">{quest.title}</div>
        <p className="mt-1 text-xs leading-5 opacity-80">{quest.description}</p>
      </div>

      <div className="mt-3 flex gap-2">
        <Link
          href={quest.href}
          onClick={onNavigate}
          className="btn btn-primary min-w-0 flex-1 text-center"
        >
          {quest.cta}
        </Link>
        <button
          type="button"
          className="btn btn-outline"
          onClick={handleReroll}
        >
          다시
        </button>
      </div>

      <button
        type="button"
        className={
          'mt-2 btn w-full ' +
          (questState.completed ? 'btn-primary' : 'btn-outline')
        }
        onClick={handleComplete}
        disabled={questState.completed}
      >
        {questState.completed ? '오늘 퀘스트 완료' : '완료 체크'}
      </button>
    </section>
  )
}
