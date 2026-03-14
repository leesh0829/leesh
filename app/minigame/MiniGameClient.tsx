'use client'

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
    desc: '신호가 뜨면 즉시 누르기',
  },
  {
    id: 'numberRush',
    eyebrow: 'Sequence',
    title: 'Number Rush',
    desc: '1부터 9까지 순서대로 누르기',
  },
  {
    id: 'targetBurst',
    eyebrow: 'Arcade',
    title: 'Target Burst',
    desc: '12초 동안 타겟 많이 맞히기',
  },
]

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

function formatTime(value: number | null) {
  return value === null ? '--' : `${value} ms`
}

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
  const size = 46 + Math.floor(Math.random() * 18)
  return {
    x: 10 + Math.random() * 80,
    y: 16 + Math.random() * 70,
    size,
  }
}

function InfoRow({
  primary,
  secondary,
  tertiary,
}: {
  primary: string
  secondary: string
  tertiary?: string
}) {
  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      <div className="rounded-xl border p-2">
        <div className="opacity-60">최고</div>
        <div className="mt-1 font-semibold">{primary}</div>
      </div>
      <div className="rounded-xl border p-2">
        <div className="opacity-60">최근</div>
        <div className="mt-1 font-semibold">{secondary}</div>
      </div>
      {tertiary ? (
        <div className="col-span-2 rounded-xl border p-2">
          <div className="opacity-60">추가</div>
          <div className="mt-1 font-semibold">{tertiary}</div>
        </div>
      ) : null}
    </div>
  )
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
      setLastTime(time)
      setPhase('result')
      persistStats({
        bestTime:
          stats.bestTime === null ? time : Math.min(stats.bestTime, time),
        rounds: stats.rounds + 1,
        falseStarts: stats.falseStarts,
      })
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

    finishRound(
      Math.max(1, Math.round(performance.now() - readyAtRef.current))
    )
    resetTimer()
  }, [finishRound, phase, registerFalseStart, resetTimer, startRound])

  const status = useMemo(() => {
    switch (phase) {
      case 'waiting':
        return {
          title: '기다리세요',
          desc: '색이 바뀌면 바로 누르기',
          tone: 'from-amber-300/30 via-orange-300/20 to-transparent',
        }
      case 'ready':
        return {
          title: '지금!',
          desc: '클릭 또는 스페이스',
          tone: 'from-emerald-300/35 via-cyan-300/20 to-transparent',
        }
      case 'result':
        return {
          title: formatTime(lastTime),
          desc: getReactionLabel(lastTime),
          tone: 'from-sky-300/30 via-indigo-300/20 to-transparent',
        }
      case 'tooSoon':
        return {
          title: '실패',
          desc: '너무 빨랐습니다',
          tone: 'from-rose-300/30 via-orange-300/20 to-transparent',
        }
      default:
        return {
          title: 'START',
          desc: '눌러서 시작',
          tone: 'from-violet-300/30 via-sky-300/20 to-transparent',
        }
    }
  }, [lastTime, phase])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.code !== 'Enter') return
      event.preventDefault()
      handleAction()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleAction])

  return (
    <div className="grid gap-3">
      <button
        type="button"
        onClick={handleAction}
        className="surface relative min-h-[220px] overflow-hidden p-4 text-left"
      >
        <div
          aria-hidden="true"
          className={`absolute inset-0 bg-gradient-to-br ${status.tone}`}
        />
        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="badge">
              {phase === 'ready'
                ? '신호'
                : phase === 'waiting'
                  ? '대기'
                  : '터치'}
            </span>
            <span className="text-[11px] opacity-60">Reflex</span>
          </div>
          <div className="py-6 text-center">
            <div className="text-4xl font-black tracking-tight">
              {status.title}
            </div>
            <p className="mt-3 text-sm opacity-80">{status.desc}</p>
          </div>
          <div className="text-xs opacity-65">
            최고 기록 {formatTime(stats.bestTime)}
          </div>
        </div>
      </button>

      <InfoRow
        primary={formatTime(stats.bestTime)}
        secondary={formatTime(lastTime)}
        tertiary={`실패 ${stats.falseStarts}회`}
      />
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

        setLastTime(elapsed)
        setPhase('result')
        persistStats({
          bestTime:
            stats.bestTime === null ? elapsed : Math.min(stats.bestTime, elapsed),
          rounds: stats.rounds + 1,
        })
        return
      }

      setNextNumber((current) => current + 1)
    },
    [nextNumber, persistStats, phase, startGame, stats.bestTime, stats.rounds]
  )

  return (
    <div className="grid gap-3">
      <section className="surface p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="badge">
            {phase === 'playing' ? `다음 ${nextNumber}` : '1부터 9'}
          </span>
          <button type="button" className="btn btn-primary" onClick={startGame}>
            {phase === 'playing' ? '재시작' : '시작'}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {board.map((value) => {
            const cleared = value < nextNumber
            const isNext = value === nextNumber && phase === 'playing'

            return (
              <button
                key={value}
                type="button"
                onClick={() => handleCellClick(value)}
                className={[
                  'aspect-square rounded-xl border text-xl font-black',
                  cleared
                    ? 'bg-emerald-300/20 opacity-45'
                    : isNext
                      ? 'bg-amber-300/25 ring-2 ring-amber-300/45'
                      : 'bg-white/8',
                ].join(' ')}
                disabled={cleared}
              >
                {value}
              </button>
            )
          })}
        </div>
      </section>

      <InfoRow
        primary={formatTime(stats.bestTime)}
        secondary={formatTime(lastTime)}
        tertiary={`실수 ${mistakes}회`}
      />
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
      setTimeLeftMs(
        Math.max(0, TARGET_BURST_DURATION_MS - (Date.now() - startedAt))
      )
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
    <div className="grid gap-3">
      <section className="surface p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="badge">
            {phase === 'playing' ? '12초 제한' : '타겟 클릭'}
          </span>
          <button type="button" className="btn btn-primary" onClick={startGame}>
            {phase === 'playing' ? '재시작' : '시작'}
          </button>
        </div>

        <div className="mb-3 h-2 overflow-hidden rounded-full border bg-white/10">
          <div
            className="h-full rounded-full bg-emerald-300/70 transition-[width]"
            style={{
              width: `${(timeLeftMs / TARGET_BURST_DURATION_MS) * 100}%`,
            }}
          />
        </div>

        <button
          type="button"
          onClick={handleTargetClick}
          className="relative block h-[250px] w-full overflow-hidden rounded-xl border bg-black/10"
          aria-label="타겟 게임 영역"
        >
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
          <div className="absolute left-3 top-3 text-left text-xs opacity-75">
            {phase === 'playing'
              ? `${Math.max(0, timeLeftMs / 1000).toFixed(1)}초`
              : '눌러서 시작'}
          </div>
          <div className="absolute bottom-3 left-3 text-left text-xs opacity-75">
            score {score}
          </div>
        </button>
      </section>

      <InfoRow
        primary={String(stats.bestScore)}
        secondary={lastScore === null ? '--' : String(lastScore)}
        tertiary={`라운드 ${stats.rounds}회`}
      />
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] opacity-60">
          Mini Arcade
        </div>
        <div className="mt-1 text-sm font-semibold">{currentGame.title}</div>
        <p className="mt-1 text-xs leading-5 opacity-75">{currentGame.desc}</p>
      </div>

      <div className="grid gap-2">
        {GAMES.map((game) => (
          <button
            key={game.id}
            type="button"
            onClick={() => setActiveGame(game.id)}
            className={
              'rounded-xl border px-3 py-2 text-left transition ' +
              (game.id === activeGame
                ? 'bg-(--card) shadow-[0_8px_20px_rgba(124,109,255,0.16)]'
                : 'bg-transparent')
            }
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] opacity-60">
              {game.eyebrow}
            </div>
            <div className="mt-1 text-sm font-semibold">{game.title}</div>
          </button>
        ))}
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        {activeGame === 'reflex' ? <ReflexSprintGame /> : null}
        {activeGame === 'numberRush' ? <NumberRushGame /> : null}
        {activeGame === 'targetBurst' ? <TargetBurstGame /> : null}
      </div>
    </div>
  )
}
