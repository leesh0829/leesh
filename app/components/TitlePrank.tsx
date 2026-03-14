'use client'

import { useEffect, useRef } from 'react'

const HIDDEN_TITLES_SOFT = [
  'Leesh | 어디 가셨어요?',
  'Leesh | 이 탭 아직 살아있습니다',
  'Leesh | 다시 오면 비밀 없던 척 할게요',
  'Leesh | 저기요? 안녕하세요',
]

const HIDDEN_TITLES_MID = [
  'Leesh | 진짜 잠깐만 본 거죠?',
  'Leesh | 지금쯤이면 돌아올 줄 알았습니다',
]

const HIDDEN_TITLES_MAX = [
  'Leesh | 저 혼자 일하는 중입니다',
  'Leesh | 이제 좀 서운한데요',
  'Leesh | 탭도 감정이 있습니다',
  'Leesh | 이쯤 되면 버려진 거 아닌가요',
]

const RETURN_TITLES = [
  'Leesh | 오, 돌아오셨네요',
  'Leesh | 아무 일도 없었던 척',
  'Leesh | 방금 탭이 말한 건 비밀입니다',
  'Leesh | ...드디어 오셨군요',
]

const RETURN_TITLES_LONG_AWAY = [
  'Leesh | 이제 와서요?',
  'Leesh | 오래 기다렸습니다',
  'Leesh | 탭이 삐졌다가 풀렸습니다',
  'Leesh | 늦었지만 복귀는 환영합니다',
]

const RARE_TITLES = [
  'Leesh | *탭의 축복을 받았습니다*',
  'Leesh | *오늘은 탭이 기분이 좋습니다*',
  'Leesh | *비밀 메시지를 찾으셨네요*',
]

const TIME_TITLES = {
  dawn: ['Leesh | 새벽인데 안 주무시네요', 'Leesh | 새벽 감성으로 일하는 중?'],
  morning: [
    'Leesh | 좋은 아침입니다, 일할 시간입니다',
    'Leesh | 오전 집중력 회수 중',
  ],
  afternoon: [
    'Leesh | 점심 이후 집중력 찾는 중',
    'Leesh | 오후의 Leesh가 기다립니다',
  ],
  evening: [
    'Leesh | 저녁에도 접속하셨군요',
    'Leesh | 오늘 마감, 아직 안 끝났죠?',
  ],
  night: ['Leesh | 밤인데도 탭은 깨어있습니다', 'Leesh | 야근 모드 감지됨'],
} as const

function randomItem(items: readonly string[]) {
  return items[Math.floor(Math.random() * items.length)] ?? 'Leesh'
}

function randomDelay(minMs: number, maxMs: number) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
}

const RARE_TITLE_CHANCE = 0.01
const FIRST_HIDDEN_TITLE_MIN_MS = 5 * 60 * 1000
const FIRST_HIDDEN_TITLE_MAX_MS = 10 * 60 * 1000
const NEXT_HIDDEN_TITLE_MIN_MS = 5 * 60 * 1000
const NEXT_HIDDEN_TITLE_MAX_MS = 10 * 60 * 1000
const HIDDEN_SOFT_MAX_MS = 30 * 60 * 1000
const HIDDEN_SOFT_MAX_TICKS = 10
const HIDDEN_MID_MAX_MS = 60 * 60 * 1000
const HIDDEN_MID_MAX_TICKS = 100
const RETURN_TITLES_MIN_HIDDEN_MS = 5 * 60 * 1000
const RETURN_TITLES_LONG_AWAY_MIN_HIDDEN_MS = 30 * 60 * 1000
const RETURN_TITLE_DURATION_MS = 1300

export default function TitlePrank() {
  const baseTitleRef = useRef('Leesh')
  const hasControlledTitleRef = useRef(false)
  const hiddenLoopTimerRef = useRef<number | null>(null)
  const restoreTimerRef = useRef<number | null>(null)
  const hiddenSinceRef = useRef<number | null>(null)
  const hiddenTickCountRef = useRef(0)

  useEffect(() => {
    const getTimeAwareTitles = () => {
      const hour = new Date().getHours()
      if (hour < 6) return TIME_TITLES.dawn
      if (hour < 12) return TIME_TITLES.morning
      if (hour < 18) return TIME_TITLES.afternoon
      if (hour < 22) return TIME_TITLES.evening
      return TIME_TITLES.night
    }

    const getEscalatedHiddenTitles = () => {
      const hiddenForMs = hiddenSinceRef.current
        ? Date.now() - hiddenSinceRef.current
        : 0

      if (Math.random() < RARE_TITLE_CHANCE) return RARE_TITLES

      const timeAware = getTimeAwareTitles()
      if (
        hiddenForMs < HIDDEN_SOFT_MAX_MS &&
        hiddenTickCountRef.current < HIDDEN_SOFT_MAX_TICKS
      ) {
        return [...HIDDEN_TITLES_SOFT, ...timeAware]
      }
      if (
        hiddenForMs < HIDDEN_MID_MAX_MS &&
        hiddenTickCountRef.current < HIDDEN_MID_MAX_TICKS
      ) {
        return [...HIDDEN_TITLES_MID, ...timeAware]
      }
      return [...HIDDEN_TITLES_MAX, ...HIDDEN_TITLES_MID, ...timeAware]
    }

    const getReturnTitles = () => {
      const hiddenForMs = hiddenSinceRef.current
        ? Date.now() - hiddenSinceRef.current
        : 0
      if (hiddenForMs >= RETURN_TITLES_LONG_AWAY_MIN_HIDDEN_MS) {
        return RETURN_TITLES_LONG_AWAY
      }
      if (hiddenForMs >= RETURN_TITLES_MIN_HIDDEN_MS) {
        return RETURN_TITLES
      }
      return RETURN_TITLES
    }

    const readBaseTitle = () => {
      const current = document.title.trim()
      if (current) baseTitleRef.current = current
    }

    const clearHiddenLoop = () => {
      if (hiddenLoopTimerRef.current !== null) {
        window.clearTimeout(hiddenLoopTimerRef.current)
        hiddenLoopTimerRef.current = null
      }
    }

    const clearRestoreTimer = () => {
      if (restoreTimerRef.current !== null) {
        window.clearTimeout(restoreTimerRef.current)
        restoreTimerRef.current = null
      }
    }

    const setControlledTitle = (title: string) => {
      hasControlledTitleRef.current = true
      document.title = title
    }

    const restoreBaseTitle = () => {
      clearRestoreTimer()
      hasControlledTitleRef.current = false
      document.title = baseTitleRef.current
    }

    const scheduleHiddenLoop = (delay: number) => {
      clearHiddenLoop()
      hiddenLoopTimerRef.current = window.setTimeout(() => {
        if (!document.hidden) return
        hiddenTickCountRef.current += 1
        setControlledTitle(randomItem(getEscalatedHiddenTitles()))
        scheduleHiddenLoop(
          randomDelay(NEXT_HIDDEN_TITLE_MIN_MS, NEXT_HIDDEN_TITLE_MAX_MS)
        )
      }, delay)
    }

    const startHiddenLoop = () => {
      clearRestoreTimer()
      readBaseTitle()
      hiddenSinceRef.current = Date.now()
      hiddenTickCountRef.current = 0
      scheduleHiddenLoop(
        randomDelay(FIRST_HIDDEN_TITLE_MIN_MS, FIRST_HIDDEN_TITLE_MAX_MS)
      )
    }

    const stopHiddenLoop = () => {
      clearHiddenLoop()
    }

    readBaseTitle()

    const titleElement = document.querySelector('title')
    const observer = titleElement
      ? new MutationObserver(() => {
          if (hasControlledTitleRef.current) return
          readBaseTitle()
        })
      : null

    observer?.observe(titleElement as HTMLTitleElement, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    const handleVisibilityChange = () => {
      if (document.hidden) {
        startHiddenLoop()
        return
      }

      stopHiddenLoop()

      if (!hasControlledTitleRef.current) {
        hiddenSinceRef.current = null
        hiddenTickCountRef.current = 0
        restoreBaseTitle()
        return
      }

      setControlledTitle(randomItem(getReturnTitles()))
      restoreTimerRef.current = window.setTimeout(() => {
        hiddenSinceRef.current = null
        hiddenTickCountRef.current = 0
        restoreBaseTitle()
      }, RETURN_TITLE_DURATION_MS)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleVisibilityChange)

    return () => {
      observer?.disconnect()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleVisibilityChange)
      clearHiddenLoop()
      clearRestoreTimer()
      restoreBaseTitle()
    }
  }, [])

  return null
}
