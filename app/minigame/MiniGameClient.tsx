'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type GameId = 'reflex' | 'numberRush' | 'targetBurst'

type ReflexPhase = 'idle' | 'waiting' | 'ready' | 'result' | 'tooSoon'
type NumberRushPhase = 'idle' | 'playing' | 'result'
type TargetBurstPhase = 'idle' | 'playing' | 'result'

type ReflexStats = {
  bestTime: number | null
  rounds: number
  falseStarts: number
}

type NumberRushStats = {
  bestTime: number | null
  rounds: number
}

type TargetBurstStats = {
  bestScore: number
  rounds: number
}

type TargetPosition = {
  x: number
  y: number
  size: number
}

type GameMeta = {
  id: GameId
  eyebrow: string
  title: string
  desc: string
  accent: string
}

const REFLEX_STORAGE_KEY = 'leesh-mini-game-reflex'
const NUMBER_RUSH_STORAGE_KEY = 'leesh-mini-game-number-rush'
const TARGET_BURST_STORAGE_KEY = 'leesh-mini-game-target-burst'

const REFLEX_MIN_DELAY_MS = 1200
const REFLEX_MAX_DELAY_MS = 2800
const TARGET_BURST_DURATION_MS = 12000

const GAMES: GameMeta[] = [
  {
    id: 'reflex',
    eyebrow: 'Reaction',
    title: 'Reflex Sprint',
    desc: '신호가 뜨면 바로 누르는 반응속도 테스트',
    accent: 'from-violet-300/30 via-sky-300/20 to-transparent',
  },
  {
    id: 'numberRush',
    eyebrow: 'Sequence',
    title: 'Number Rush',
    desc: '섞인 숫자 1부터 9까지 순서대로 누르기',
    accent: 'from-amber-300/30 via-orange-300/20 to-transparent',
  },
  {
    id: 'targetBurst',
    eyebrow: 'Arcade',
    title: 'Target Burst',
    desc: '12초 동안 튀는 타겟을 최대한 많이 맞히기',
    accent: 'from-emerald-300/30 via-cyan-300/18 to-transparent',
  },
] as const

function readStorage<T>(
  key: string,
  fallback: T,
  normalize: (raw: unknown) => T
) {
  if (typeof window === 'undefined') return fallback

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return normalize(JSON.parse(raw))
  } catch {
    return fallback
  }
}

function writeStorage<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

function readReflexStats() {
  return readStorage<ReflexStats>(
    REFLEX_STORAGE_KEY,
    { bestTime: null, rounds: 0, falseStarts: 0 },
    (raw) => {
      if (!raw || typeof raw !== 'object') {
        return { bestTime: null, rounds: 0, falseStarts: 0 }
      }

      const record = raw as Record<string, unknown>
      return {
        bestTime:
          typeof record.bestTime === 'number' &&
          Number.isFinite(record.bestTime)
            ? Math.max(1, Math.round(record.bestTime))
            : null,
        rounds:
          typeof record.rounds === 'number' && Number.isFinite(record.rounds)
            ? Math.max(0, Math.trunc(record.rounds))
            : 0,
        falseStarts:
          typeof record.falseStarts === 'number' &&
          Number.isFinite(record.falseStarts)
            ? Math.max(0, Math.trunc(record.falseStarts))
            : 0,
      }
    }
  )
}

function readNumberRushStats() {
  return readStorage<NumberRushStats>(
    NUMBER_RUSH_STORAGE_KEY,
    { bestTime: null, rounds: 0 },
    (raw) => {
      if (!raw || typeof raw !== 'object') {
        return { bestTime: null, rounds: 0 }
      }

      const record = raw as Record<string, unknown>
      return {
        bestTime:
          typeof record.bestTime === 'number' &&
          Number.isFinite(record.bestTime)
            ? Math.max(1, Math.round(record.bestTime))
            : null,
        rounds:
          typeof record.rounds === 'number' && Number.isFinite(record.rounds)
            ? Math.max(0, Math.trunc(record.rounds))
            : 0,
      }
    }
  )
}

function readTargetBurstStats() {
  return readStorage<TargetBurstStats>(
    TARGET_BURST_STORAGE_KEY,
    { bestScore: 0, rounds: 0 },
    (raw) => {
      if (!raw || typeof raw !== 'object') {
        return { bestScore: 0, rounds: 0 }
      }

      const record = raw as Record<string, unknown>
      return {
        bestScore:
          typeof record.bestScore === 'number' &&
          Number.isFinite(record.bestScore)
            ? Math.max(0, Math.trunc(record.bestScore))
            : 0,
        rounds:
          typeof record.rounds === 'number' && Number.isFinite(record.rounds)
            ? Math.max(0, Math.trunc(record.rounds))
            : 0,
      }
    }
  )
}

/**
 * Format a reaction time in milliseconds for display.
 *
 * @param value - Reaction time in milliseconds, or `null` when no measurement exists
 * @returns `'--'` if `value` is `null`, otherwise the time suffixed with ` ms` (for example, `123 ms`)
 */
function formatTime(value: number | null) {
  return value === null ? '--' : `${value} ms`
}

/**
 * Map a reaction time (ms) to a short Korean performance label.
 *
 * @param time - Reaction time in milliseconds, or `null` when no measurement exists
 * @returns `'첫 기록 대기'` if `time` is `null`, `'번개급'` if `time` ≤ 180, `'상당히 빠름'` if `time` ≤ 240, `'좋음'` if `time` ≤ 320, `'무난'` if `time` ≤ 420, otherwise `'다시 한 판'`
 */
function getReactionLabel(time: number | null) {
  if (time === null) return '첫 기록 대기'
  if (time <= 180) return '번개급'
  if (time <= 240) return '상당히 빠름'
  if (time <= 320) return '좋음'
  if (time <= 420) return '무난'
  return '다시 한 판'
}

function shuffleNumbers(size: number) {
  const numbers = Array.from({ length: size }, (_, index) => index + 1)

  for (let index = numbers.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[numbers[index], numbers[swapIndex]] = [numbers[swapIndex], numbers[index]]
  }

  return numbers
}

function getRandomTargetPosition(): TargetPosition {
  const size = 56 + Math.floor(Math.random() * 22)
  return {
    x: 6 + Math.random() * 72,
    y: 8 + Math.random() * 66,
    size,
  }
}

function ReflexSprintGame() {
  const [stats, setStats] = useState<ReflexStats>(() => readReflexStats())
  const [phase, setPhase] = useState<ReflexPhase>('idle')
  const [lastTime, setLastTime] = useState<number | null>(null)

  const timeoutRef = useRef<number | null>(null)
  const readyAtRef = useRef<number | null>(null)

  const persistStats = useCallback((next: ReflexStats) => {
    writeStorage(REFLEX_STORAGE_KEY, next)
    setStats(next)
  }, [])

  const resetTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    readyAtRef.current = null
  }, [])

  useEffect(() => {
    return () => resetTimer()
  }, [resetTimer])

  const startRound = useCallback(() => {
    resetTimer()
    setLastTime(null)
    setPhase('waiting')

    const delay =
      REFLEX_MIN_DELAY_MS +
      Math.floor(Math.random() * (REFLEX_MAX_DELAY_MS - REFLEX_MIN_DELAY_MS))

    timeoutRef.current = window.setTimeout(() => {
      readyAtRef.current = performance.now()
      setPhase('ready')
      timeoutRef.current = null
    }, delay)
  }, [resetTimer])

  const finishRound = useCallback(
    (time: number) => {
      const next: ReflexStats = {
        bestTime:
          stats.bestTime === null ? time : Math.min(stats.bestTime, time),
        rounds: stats.rounds + 1,
        falseStarts: stats.falseStarts,
      }

      setLastTime(time)
      setPhase('result')
      persistStats(next)
    },
    [persistStats, stats.bestTime, stats.falseStarts, stats.rounds]
  )

  const registerFalseStart = useCallback(() => {
    setLastTime(null)
    setPhase('tooSoon')
    persistStats({
      bestTime: stats.bestTime,
      rounds: stats.rounds,
      falseStarts: stats.falseStarts + 1,
    })
  }, [persistStats, stats.bestTime, stats.falseStarts, stats.rounds])

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
          action: '대기 중...',
        }
      case 'ready':
        return {
          title: '지금 누르세요',
          desc: '클릭하거나 스페이스바를 누르세요.',
          tone: 'from-emerald-300/35 via-cyan-300/20 to-transparent',
          action: '지금!',
        }
      case 'result':
        return {
          title: formatTime(lastTime),
          desc: `${getReactionLabel(lastTime)} · 다시 눌러서 재시작`,
          tone: 'from-sky-300/30 via-indigo-300/20 to-transparent',
          action: '다시 하기',
        }
      case 'tooSoon':
        return {
          title: '너무 빨랐습니다',
          desc: '신호 전에 눌렀습니다. 다시 눌러 재시작하세요.',
          tone: 'from-rose-300/30 via-orange-300/20 to-transparent',
          action: '다시 하기',
        }
      case 'idle':
      default:
        return {
          title: '반응속도 테스트',
          desc: '시작 후 잠시 기다리다가, 신호가 뜨면 바로 누르세요.',
          tone: 'from-violet-300/30 via-sky-300/20 to-transparent',
          action: '시작',
        }
    }
  }, [lastTime, phase])

  return (
    <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)]">
      <button
        type="button"
        onClick={handleAction}
        className={[
          'surface card-pad min-h-[360px] text-left',
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
              최고 기록 {formatTime(stats.bestTime)}
            </div>
            <div className="btn btn-outline">{stageCopy.action}</div>
          </div>
        </div>
      </button>

      <div className="grid gap-4">
        <StatsCard
          title="Reflex Stats"
          items={[
            { label: '최고 기록', value: formatTime(stats.bestTime) },
            { label: '최근 기록', value: formatTime(lastTime) },
            { label: '실패 횟수', value: String(stats.falseStarts) },
          ]}
          note={`총 완료 라운드 ${stats.rounds}회`}
        />
        <HowToCard
          title="How To"
          steps={[
            '시작 후 대기 중에는 아무 입력도 하지 않습니다.',
            '화면이 바뀌는 순간 클릭하거나 스페이스바를 누릅니다.',
            '성급하게 누르면 실패 횟수로 기록됩니다.',
          ]}
        />
      </div>
    </div>
  )
}

function NumberRushGame() {
  const [stats, setStats] = useState<NumberRushStats>(() => readNumberRushStats())
  const [phase, setPhase] = useState<NumberRushPhase>('idle')
  const [board, setBoard] = useState<number[]>(() => shuffleNumbers(9))
  const [nextNumber, setNextNumber] = useState(1)
  const [lastTime, setLastTime] = useState<number | null>(null)
  const [mistakes, setMistakes] = useState(0)

  const startedAtRef = useRef<number | null>(null)

  const persistStats = useCallback((next: NumberRushStats) => {
    writeStorage(NUMBER_RUSH_STORAGE_KEY, next)
    setStats(next)
  }, [])

  const startGame = useCallback(() => {
    startedAtRef.current = performance.now()
    setBoard(shuffleNumbers(9))
    setNextNumber(1)
    setMistakes(0)
    setLastTime(null)
    setPhase('playing')
  }, [])

  const handleCellClick = useCallback(
    (value: number) => {
      if (phase !== 'playing') {
        startGame()
        return
      }

      if (value !== nextNumber) {
        setMistakes((current) => current + 1)
        return
      }

      if (value === 9 && startedAtRef.current !== null) {
        const elapsed = Math.max(
          1,
          Math.round(performance.now() - startedAtRef.current)
        )
        const nextStats: NumberRushStats = {
          bestTime:
            stats.bestTime === null ? elapsed : Math.min(stats.bestTime, elapsed),
          rounds: stats.rounds + 1,
        }

        setLastTime(elapsed)
        setPhase('result')
        persistStats(nextStats)
        return
      }

      setNextNumber((current) => current + 1)
    },
    [nextNumber, persistStats, phase, startGame, stats.bestTime, stats.rounds]
  )

  return (
    <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)]">
      <section className="surface card-pad relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-amber-300/20 via-orange-300/14 to-transparent"
        />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="badge">
                {phase === 'playing' ? `다음 숫자 ${nextNumber}` : '1부터 9까지'}
              </span>
            </div>
            <button type="button" className="btn btn-primary" onClick={startGame}>
              {phase === 'playing' ? '다시 섞기' : '시작'}
            </button>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            {board.map((value) => {
              const cleared = value < nextNumber
              const isNext = value === nextNumber && phase === 'playing'

              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleCellClick(value)}
                  className={[
                    'aspect-square rounded-[calc(var(--radius)-2px)] border text-2xl font-black tracking-tight transition',
                    cleared
                      ? 'bg-emerald-300/20 opacity-45'
                      : isNext
                        ? 'bg-amber-300/25 ring-2 ring-amber-300/45'
                        : 'bg-white/10',
                  ].join(' ')}
                  disabled={cleared}
                >
                  {value}
                </button>
              )
            })}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <InfoTile label="상태" value={phase === 'playing' ? '진행 중' : '대기'} />
            <InfoTile label="실수" value={String(mistakes)} />
            <InfoTile label="최근 기록" value={formatTime(lastTime)} />
          </div>
        </div>
      </section>

      <div className="grid gap-4">
        <StatsCard
          title="Number Rush"
          items={[
            { label: '최고 기록', value: formatTime(stats.bestTime) },
            { label: '최근 기록', value: formatTime(lastTime) },
            { label: '완료 라운드', value: String(stats.rounds) },
          ]}
          note={
            phase === 'result'
              ? `마지막 라운드 실수 ${mistakes}회`
              : '섞인 숫자를 가능한 빠르게 순서대로 누르세요.'
          }
        />
        <HowToCard
          title="How To"
          steps={[
            '시작 후 1부터 9까지 오름차순으로 누릅니다.',
            '틀린 숫자를 누르면 실수만 늘고 진행은 그대로입니다.',
            '9를 누르는 순간 시간이 기록됩니다.',
          ]}
        />
      </div>
    </div>
  )
}

function TargetBurstGame() {
  const [stats, setStats] = useState<TargetBurstStats>(() => readTargetBurstStats())
  const [phase, setPhase] = useState<TargetBurstPhase>('idle')
  const [score, setScore] = useState(0)
  const [lastScore, setLastScore] = useState<number | null>(null)
  const [timeLeftMs, setTimeLeftMs] = useState(TARGET_BURST_DURATION_MS)
  const [target, setTarget] = useState<TargetPosition>(() => getRandomTargetPosition())

  const scoreRef = useRef(0)
  const finishTimeoutRef = useRef<number | null>(null)
  const tickIntervalRef = useRef<number | null>(null)
  const finishGameRef = useRef<(() => void) | null>(null)

  const persistStats = useCallback((next: TargetBurstStats) => {
    writeStorage(TARGET_BURST_STORAGE_KEY, next)
    setStats(next)
  }, [])

  const clearTimers = useCallback(() => {
    if (finishTimeoutRef.current !== null) {
      window.clearTimeout(finishTimeoutRef.current)
      finishTimeoutRef.current = null
    }

    if (tickIntervalRef.current !== null) {
      window.clearInterval(tickIntervalRef.current)
      tickIntervalRef.current = null
    }
  }, [])

  const finishGame = useCallback(() => {
    const finalScore = scoreRef.current

    clearTimers()
    setPhase('result')
    setLastScore(finalScore)
    setTimeLeftMs(0)
    persistStats({
      bestScore: Math.max(stats.bestScore, finalScore),
      rounds: stats.rounds + 1,
    })
  }, [clearTimers, persistStats, stats.bestScore, stats.rounds])

  useEffect(() => {
    finishGameRef.current = finishGame
  }, [finishGame])

  useEffect(() => {
    return () => clearTimers()
  }, [clearTimers])

  const startGame = useCallback(() => {
    clearTimers()
    scoreRef.current = 0
    setScore(0)
    setLastScore(null)
    setTimeLeftMs(TARGET_BURST_DURATION_MS)
    setTarget(getRandomTargetPosition())
    setPhase('playing')

    const startedAt = Date.now()

    tickIntervalRef.current = window.setInterval(() => {
      const remaining = Math.max(
        0,
        TARGET_BURST_DURATION_MS - (Date.now() - startedAt)
      )
      setTimeLeftMs(remaining)
    }, 100)

    finishTimeoutRef.current = window.setTimeout(() => {
      finishGameRef.current?.()
    }, TARGET_BURST_DURATION_MS)
  }, [clearTimers])

  const handleTargetClick = useCallback(() => {
    if (phase !== 'playing') {
      startGame()
      return
    }

    scoreRef.current += 1
    setScore(scoreRef.current)
    setTarget(getRandomTargetPosition())
  }, [phase, startGame])

  return (
    <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)]">
      <section className="surface card-pad relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-emerald-300/20 via-cyan-300/14 to-transparent"
        />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="badge">
              {phase === 'playing' ? '12초 제한' : '타겟 클릭 게임'}
            </span>
            <button type="button" className="btn btn-primary" onClick={startGame}>
              {phase === 'playing' ? '재시작' : '시작'}
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <InfoTile label="점수" value={String(score)} />
            <InfoTile
              label="남은 시간"
              value={`${Math.max(0, timeLeftMs / 1000).toFixed(1)}초`}
            />
            <InfoTile
              label="최고 점수"
              value={String(Math.max(stats.bestScore, lastScore ?? 0))}
            />
          </div>

          <div className="mt-5">
            <button
              type="button"
              onClick={handleTargetClick}
              className="relative block h-[360px] w-full overflow-hidden rounded-[calc(var(--radius)-2px)] border bg-black/10"
              aria-label="타겟 게임 영역"
            >
              <div className="absolute inset-x-4 top-4 h-2 overflow-hidden rounded-full border bg-white/20">
                <div
                  className="h-full rounded-full bg-emerald-300/70 transition-[width]"
                  style={{
                    width: `${(timeLeftMs / TARGET_BURST_DURATION_MS) * 100}%`,
                  }}
                />
              </div>

              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.14),transparent_58%)]" />

              <div className="absolute inset-0">
                <div
                  className="absolute rounded-full border border-white/70 bg-white/80 shadow-[0_0_26px_rgba(255,255,255,0.45)] transition-[left,top,width,height] duration-150"
                  style={{
                    left: `${target.x}%`,
                    top: `${target.y}%`,
                    width: `${target.size}px`,
                    height: `${target.size}px`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
                <div
                  className="absolute rounded-full border border-emerald-200/60"
                  style={{
                    left: `${target.x}%`,
                    top: `${target.y}%`,
                    width: `${target.size + 20}px`,
                    height: `${target.size + 20}px`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              </div>

              <div className="absolute bottom-4 left-4 text-left">
                <div className="text-xs font-semibold uppercase tracking-[0.28em] opacity-65">
                  Burst Zone
                </div>
                <div className="mt-2 text-sm opacity-80">
                  {phase === 'playing'
                    ? '도망가는 원을 최대한 많이 맞히세요.'
                    : '영역을 누르면 게임이 시작됩니다.'}
                </div>
              </div>
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-4">
        <StatsCard
          title="Target Burst"
          items={[
            { label: '최고 점수', value: String(stats.bestScore) },
            { label: '최근 점수', value: lastScore === null ? '--' : String(lastScore) },
            { label: '완료 라운드', value: String(stats.rounds) },
          ]}
          note={
            phase === 'result'
              ? `이번 라운드 ${score}점`
              : '12초 동안 타겟을 따라가며 클릭 속도를 테스트합니다.'
          }
        />
        <HowToCard
          title="How To"
          steps={[
            '시작 후 하얀 원을 클릭할 때마다 위치가 바뀝니다.',
            '제한시간은 12초이며 끝나면 점수가 저장됩니다.',
            '짧은 집중력 테스트용으로 가장 가볍게 플레이할 수 있습니다.',
          ]}
        />
      </div>
    </div>
  )
}

function StatsCard({
  title,
  items,
  note,
}: {
  title: string
  items: Array<{ label: string; value: string }>
  note: string
}) {
  return (
    <section className="surface card-pad">
      <div className="text-xs font-semibold uppercase tracking-[0.26em] opacity-60">
        {title}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-[calc(var(--radius)-6px)] border p-3"
          >
            <div className="text-xs opacity-65">{item.label}</div>
            <div className="mt-1 text-2xl font-black tracking-tight">
              {item.value}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-[calc(var(--radius)-6px)] border p-3 text-sm leading-6 opacity-80">
        {note}
      </div>
    </section>
  )
}

function HowToCard({
  title,
  steps,
}: {
  title: string
  steps: string[]
}) {
  return (
    <section className="surface card-pad">
      <div className="text-xs font-semibold uppercase tracking-[0.26em] opacity-60">
        {title}
      </div>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 opacity-80">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </section>
  )
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[calc(var(--radius)-6px)] border p-3">
      <div className="text-xs opacity-65">{label}</div>
      <div className="mt-1 text-xl font-black tracking-tight">{value}</div>
    </div>
  )
}

export default function MiniGameClient() {
  const [activeGame, setActiveGame] = useState<GameId>('reflex')

  const currentGame = useMemo(
    () => GAMES.find((game) => game.id === activeGame) ?? GAMES[0],
    [activeGame]
  )

  return (
    <main className="mx-auto w-full max-w-6xl">
      <section className="surface card-pad overflow-hidden">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.26em] opacity-60">
              Mini Arcade
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              초소형 게임 모음
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              홈이나 사이드바에서 바로 열 수 있는 미니게임 허브입니다. 현재는
              반응속도, 숫자 순서 누르기, 제한시간 타겟 클릭까지 3종을 넣었습니다.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/" className="btn btn-outline">
              홈
            </Link>
            <Link href="/dashboard" className="btn btn-primary">
              대시보드
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-3 lg:grid-cols-3">
        {GAMES.map((game) => {
          const active = game.id === activeGame

          return (
            <button
              key={game.id}
              type="button"
              onClick={() => setActiveGame(game.id)}
              className={[
                'surface card-pad text-left',
                active ? 'ring-2 ring-violet-300/55' : '',
              ].join(' ')}
            >
              <div
                aria-hidden="true"
                className={`-mx-6 -mt-6 mb-4 h-20 bg-gradient-to-br ${game.accent}`}
              />
              <div className="text-xs font-semibold uppercase tracking-[0.26em] opacity-60">
                {game.eyebrow}
              </div>
              <div className="mt-2 text-xl font-black tracking-tight">
                {game.title}
              </div>
              <p className="mt-2 text-sm leading-6 opacity-80">{game.desc}</p>
              <div className="mt-4">
                <span className={active ? 'badge' : 'text-xs opacity-60'}>
                  {active ? '플레이 중' : '열기'}
                </span>
              </div>
            </button>
          )
        })}
      </section>

      <section className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.26em] opacity-60">
              Now Playing
            </div>
            <div className="mt-2 text-2xl font-black tracking-tight">
              {currentGame.title}
            </div>
          </div>
          <span className="badge">{currentGame.eyebrow}</span>
        </div>

        {activeGame === 'reflex' ? <ReflexSprintGame /> : null}
        {activeGame === 'numberRush' ? <NumberRushGame /> : null}
        {activeGame === 'targetBurst' ? <TargetBurstGame /> : null}
      </section>
    </main>
  )
}
