'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Phase = 'idle' | 'waiting' | 'ready' | 'result' | 'tooSoon'

type StoredStats = {
  bestTime: number | null
  rounds: number
  falseStarts: number
}

const STORAGE_KEY = 'leesh-mini-game-reflex'
const MIN_DELAY_MS = 1200
const MAX_DELAY_MS = 2800

/**
 * Load persisted mini-game statistics or provide safe defaults when unavailable.
 *
 * Attempts to read and coerce a stored JSON record into a StoredStats object.
 * If running outside a browser, the storage key is missing, contains invalid JSON,
 * or fields are not numeric, the function returns default statistics.
 *
 * @returns An object with:
 * - `bestTime`: the rounded best reaction time in milliseconds (minimum 1) or `null` if not present,
 * - `rounds`: total completed rounds as an integer greater than or equal to 0,
 * - `falseStarts`: total false starts as an integer greater than or equal to 0.
 */
function readStoredStats(): StoredStats {
  const fallback: StoredStats = {
    bestTime: null,
    rounds: 0,
    falseStarts: 0,
  }

  if (typeof window === 'undefined') return fallback

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback

    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return fallback

    const record = parsed as Record<string, unknown>
    const bestTime =
      typeof record.bestTime === 'number' && Number.isFinite(record.bestTime)
        ? Math.max(1, Math.round(record.bestTime))
        : null
    const rounds =
      typeof record.rounds === 'number' && Number.isFinite(record.rounds)
        ? Math.max(0, Math.trunc(record.rounds))
        : 0
    const falseStarts =
      typeof record.falseStarts === 'number' &&
      Number.isFinite(record.falseStarts)
        ? Math.max(0, Math.trunc(record.falseStarts))
        : 0

    return {
      bestTime,
      rounds,
      falseStarts,
    }
  } catch {
    return fallback
  }
}

/**
 * Persist the provided stored stats to localStorage under the component's storage key.
 *
 * @param next - Stats object containing `bestTime`, `rounds`, and `falseStarts` to save
 */
function writeStoredStats(next: StoredStats) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

/**
 * Format a millisecond time value for display.
 *
 * @param value - Time in milliseconds, or `null` when no time is available
 * @returns `"--"` when `value` is `null`, otherwise `"<value> ms"`
 */
function formatTime(value: number | null) {
  return value === null ? '--' : `${value} ms`
}

/**
 * Map a reaction time to a qualitative Korean label used in the UI.
 *
 * @param time - Reaction time in milliseconds, or `null` when no record exists
 * @returns One of the UI labels: '첫 기록 대기' if `time` is `null`; '번개급' for ≤180 ms; '상당히 빠름' for ≤240 ms; '좋음' for ≤320 ms; '무난' for ≤420 ms; '다시 한 판' otherwise
 */
function getReactionLabel(time: number | null) {
  if (time === null) return '첫 기록 대기'
  if (time <= 180) return '번개급'
  if (time <= 240) return '상당히 빠름'
  if (time <= 320) return '좋음'
  if (time <= 420) return '무난'
  return '다시 한 판'
}

/**
 * Interactive React client component that implements a local, browser-persisted reflex timing mini-game.
 *
 * Manages game state (idle, waiting, ready, result, tooSoon), measures reaction times, handles keyboard and click input,
 * and persists best time, rounds, and false starts to localStorage while rendering the game's UI and stats.
 *
 * @returns The JSX element for the mini-game UI.
 */
export default function MiniGameClient() {
  const [stats, setStats] = useState<StoredStats>(() => readStoredStats())
  const [phase, setPhase] = useState<Phase>('idle')
  const [lastTime, setLastTime] = useState<number | null>(null)

  const timeoutRef = useRef<number | null>(null)
  const readyAtRef = useRef<number | null>(null)

  const { bestTime, rounds, falseStarts } = stats

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const persistStats = useCallback((next: StoredStats) => {
    writeStoredStats(next)
    setStats(next)
  }, [])

  const resetTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    readyAtRef.current = null
  }, [])

  const startRound = useCallback(() => {
    resetTimer()
    setLastTime(null)
    setPhase('waiting')

    const delay =
      MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS))

    timeoutRef.current = window.setTimeout(() => {
      readyAtRef.current = performance.now()
      setPhase('ready')
      timeoutRef.current = null
    }, delay)
  }, [resetTimer])

  const finishRound = useCallback(
    (time: number) => {
      const nextBest =
        bestTime === null ? time : Math.min(bestTime, Math.round(time))
      const nextRounds = rounds + 1

      setLastTime(time)
      setPhase('result')
      persistStats({
        bestTime: nextBest,
        rounds: nextRounds,
        falseStarts,
      })
    },
    [bestTime, falseStarts, persistStats, rounds]
  )

  const registerFalseStart = useCallback(() => {
    const nextFalseStarts = falseStarts + 1

    setLastTime(null)
    setPhase('tooSoon')
    persistStats({
      bestTime,
      rounds,
      falseStarts: nextFalseStarts,
    })
  }, [bestTime, falseStarts, persistStats, rounds])

  const handleAction = useCallback(() => {
    if (phase === 'idle' || phase === 'result' || phase === 'tooSoon') {
      startRound()
      return
    }

    if (phase === 'waiting') {
      resetTimer()
      registerFalseStart()
      return
    }

    if (phase !== 'ready' || readyAtRef.current === null) return

    const measured = Math.max(
      1,
      Math.round(performance.now() - readyAtRef.current)
    )
    resetTimer()
    finishRound(measured)
  }, [finishRound, phase, registerFalseStart, resetTimer, startRound])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }

      if (event.code !== 'Space' && event.code !== 'Enter') return

      event.preventDefault()
      handleAction()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleAction])

  const stageCopy = useMemo(() => {
    switch (phase) {
      case 'waiting':
        return {
          title: '기다리세요',
          desc: '색이 바뀌기 전에 누르면 실격입니다.',
          tone: 'from-amber-300/30 via-orange-300/15 to-transparent',
          button: '대기 중...',
        }
      case 'ready':
        return {
          title: '지금 누르세요',
          desc: '클릭하거나 스페이스바를 누르세요.',
          tone: 'from-emerald-300/35 via-cyan-300/20 to-transparent',
          button: '지금!',
        }
      case 'result':
        return {
          title: formatTime(lastTime),
          desc: `${getReactionLabel(lastTime)} · 다시 눌러서 재시작`,
          tone: 'from-sky-300/30 via-indigo-300/20 to-transparent',
          button: '다시 하기',
        }
      case 'tooSoon':
        return {
          title: '너무 빨랐습니다',
          desc: '신호 전에 눌렀습니다. 다시 눌러 재시작하세요.',
          tone: 'from-rose-300/30 via-orange-300/20 to-transparent',
          button: '다시 하기',
        }
      case 'idle':
      default:
        return {
          title: '반응속도 테스트',
          desc: '버튼을 눌러 시작하고, 신호가 뜨면 즉시 누르세요.',
          tone: 'from-violet-300/30 via-sky-300/20 to-transparent',
          button: '시작',
        }
    }
  }, [lastTime, phase])

  return (
    <main className="mx-auto w-full max-w-5xl">
      <section className="surface card-pad overflow-hidden">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.26em] opacity-60">
              Mini Game
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Reflex Sprint
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              홈이나 사이드바에서 바로 열 수 있는 초소형 게임의 첫 버전입니다.
              클릭 한 번으로 시작되고, 최고 기록은 브라우저에 저장됩니다.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/" className="btn btn-outline">
              홈
            </Link>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleAction}
            >
              {phase === 'waiting' ? '대기 중' : '바로 플레이'}
            </button>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)]">
        <button
          type="button"
          onClick={handleAction}
          className={[
            'surface card-pad group min-h-[360px] text-left',
            'relative overflow-hidden',
            phase === 'ready' ? 'ring-2 ring-emerald-300/60' : '',
          ].join(' ')}
          aria-live="polite"
        >
          <div
            aria-hidden="true"
            className={`absolute inset-0 bg-gradient-to-br ${stageCopy.tone}`}
          />
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20 blur-3xl"
          />

          <div className="relative flex h-full flex-col justify-between gap-6">
            <div className="flex items-center justify-between gap-3">
              <span className="badge">
                {phase === 'ready'
                  ? '신호 감지'
                  : phase === 'waiting'
                    ? '예열 중'
                    : '클릭 / 스페이스'}
              </span>
              <span className="text-xs opacity-65">로컬 저장</span>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <div className="text-sm font-semibold uppercase tracking-[0.32em] opacity-55">
                Reaction
              </div>
              <div className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">
                {stageCopy.title}
              </div>
              <p className="mt-4 max-w-md text-sm leading-6 opacity-80">
                {stageCopy.desc}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="text-xs opacity-65">
                최고 기록 {formatTime(bestTime)}
              </div>
              <div className="btn btn-outline">{stageCopy.button}</div>
            </div>
          </div>
        </button>

        <div className="grid gap-4">
          <section className="surface card-pad">
            <div className="text-xs font-semibold uppercase tracking-[0.26em] opacity-60">
              Stats
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-[calc(var(--radius)-6px)] border p-3">
                <div className="text-xs opacity-65">최고 기록</div>
                <div className="mt-1 text-2xl font-black tracking-tight">
                  {formatTime(bestTime)}
                </div>
              </div>
              <div className="rounded-[calc(var(--radius)-6px)] border p-3">
                <div className="text-xs opacity-65">최근 기록</div>
                <div className="mt-1 text-2xl font-black tracking-tight">
                  {formatTime(lastTime)}
                </div>
              </div>
              <div className="rounded-[calc(var(--radius)-6px)] border p-3">
                <div className="text-xs opacity-65">실패 횟수</div>
                <div className="mt-1 text-2xl font-black tracking-tight">
                  {falseStarts}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-[calc(var(--radius)-6px)] border p-3 text-sm leading-6 opacity-80">
              총 완료 라운드 {rounds}회. 첫 버전은 매우 작게 두고, 이후 점수
              경쟁형이나 회피형으로 확장예정입니다. [타 게임도 추가 예정]
            </div>
          </section>

          <section className="surface card-pad">
            <div className="text-xs font-semibold uppercase tracking-[0.26em] opacity-60">
              How To
            </div>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 opacity-80">
              <li>시작 버튼을 누릅니다.</li>
              <li>대기 중에는 아무 입력도 하지 않습니다.</li>
              <li>화면이 바뀌면 즉시 클릭하거나 스페이스바를 누릅니다.</li>
            </ol>
          </section>
        </div>
      </section>
    </main>
  )
}
