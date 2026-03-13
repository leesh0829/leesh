'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type BossPhase = 'summon' | 'berserk' | 'collapse'

type DamageFx = {
  id: number
  value: number
  left: string
  top: string
  hue: number
}

const WARNINGS = [
  '경고: 문서화되지 않은 존재가 접근 중입니다.',
  '시스템 알림: 생산성 결계가 흔들리고 있습니다.',
  '긴급 공지: TODO 영역에 대형 개체 출현.',
  '관측 결과: 캘린더 평온 수치가 급감했습니다.',
]

const PHASE_COPY: Record<BossPhase, string> = {
  summon: '월드 보스가 난입했습니다',
  berserk: '월드 보스가 광폭화했습니다',
  collapse: '월드 보스가 연출을 남기고 사라집니다',
}

const DURATION_MS = 8200
const COLLAPSE_START_MS = 6500
const BERSERK_START_MS = 2200
const REVEAL_INTERVAL_MS = 10 * 60 * 1000
const REVEAL_CHANCE = 0.008
const REVEAL_DURATION_MS = 45 * 1000

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export default function WorldBossButton() {
  const [revealed, setRevealed] = useState(false)
  const [active, setActive] = useState(false)
  const [phase, setPhase] = useState<BossPhase>('summon')
  const [hp, setHp] = useState(100)
  const [warningIndex, setWarningIndex] = useState(0)
  const [damages, setDamages] = useState<DamageFx[]>([])
  const damageIdRef = useRef(0)
  const phaseRef = useRef<BossPhase>('summon')

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    const rollReveal = () => {
      if (document.hidden || active || revealed) return
      if (Math.random() >= REVEAL_CHANCE) return
      setRevealed(true)
    }

    const interval = window.setInterval(rollReveal, REVEAL_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [active, revealed])

  useEffect(() => {
    if (!revealed || active) return
    const timeout = window.setTimeout(() => {
      setRevealed(false)
    }, REVEAL_DURATION_MS)
    return () => window.clearTimeout(timeout)
  }, [revealed, active])

  useEffect(() => {
    if (!active) return

    document.body.classList.add('world-boss-active')

    const phaseTimer = window.setTimeout(() => setPhase('berserk'), BERSERK_START_MS)
    const collapseTimer = window.setTimeout(
      () => setPhase('collapse'),
      COLLAPSE_START_MS
    )
    const stopTimer = window.setTimeout(() => {
      setActive(false)
      setDamages([])
      setHp(100)
      setPhase('summon')
    }, DURATION_MS)

    const hpTimer = window.setInterval(() => {
      setHp((prev) => {
        const currentPhase = phaseRef.current
        const next =
          currentPhase === 'collapse'
            ? prev - 6.5
            : currentPhase === 'berserk'
              ? prev - 4.2
              : prev - 2.2
        return clamp(next, 0, 100)
      })
    }, 180)

    const warningTimer = window.setInterval(() => {
      setWarningIndex((prev) => (prev + 1) % WARNINGS.length)
    }, 1400)

    const damageTimer = window.setInterval(() => {
      const currentPhase = phaseRef.current
      damageIdRef.current += 1
      const nextFx: DamageFx = {
        id: damageIdRef.current,
        value:
          currentPhase === 'collapse'
            ? 9999
            : currentPhase === 'berserk'
              ? 300 + Math.floor(Math.random() * 400)
              : 80 + Math.floor(Math.random() * 140),
        left: `${18 + Math.random() * 64}%`,
        top: `${18 + Math.random() * 48}%`,
        hue: 8 + Math.floor(Math.random() * 55),
      }

      setDamages((prev) => [...prev.slice(-8), nextFx])
    }, 260)

    const cleanupDamageTimer = window.setInterval(() => {
      setDamages((prev) => prev.slice(-6))
    }, 900)

    return () => {
      document.body.classList.remove('world-boss-active')
      window.clearTimeout(phaseTimer)
      window.clearTimeout(collapseTimer)
      window.clearTimeout(stopTimer)
      window.clearInterval(hpTimer)
      window.clearInterval(warningTimer)
      window.clearInterval(damageTimer)
      window.clearInterval(cleanupDamageTimer)
    }
  }, [active])

  const phaseBadge = useMemo(() => {
    if (phase === 'summon') return 'Phase 1'
    if (phase === 'berserk') return 'Phase 2'
    return 'Final'
  }, [phase])

  const triggerBoss = () => {
    if (active) return
    setRevealed(false)
    setDamages([])
    setWarningIndex(0)
    setPhase('summon')
    setHp(100)
    setActive(true)
  }

  return (
    <>
      {revealed && !active ? (
        <button
          type="button"
          onClick={triggerBoss}
          className="world-boss-button"
          aria-label="수상한 버튼"
          title="수상한 버튼"
        >
          <span className="world-boss-button-dot" aria-hidden="true" />
          <span>???</span>
        </button>
      ) : null}

      {active ? (
        <div className="world-boss-overlay" aria-live="polite">
          <div className="world-boss-stripe" />

          <div className="world-boss-panel surface">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] opacity-70">
                  Raid Alert
                </div>
                <div className="mt-1 text-lg font-black">{PHASE_COPY[phase]}</div>
                <div className="mt-1 text-sm opacity-75">{WARNINGS[warningIndex]}</div>
              </div>
              <span className="badge">{phaseBadge}</span>
            </div>

            <div className="mt-4 grid gap-2">
              <div className="flex items-center justify-between text-xs opacity-75">
                <span>Boss HP</span>
                <span>{Math.round(hp)}%</span>
              </div>
              <div className="world-boss-hp-track">
                <div
                  className="world-boss-hp-fill"
                  style={{ width: `${hp}%` }}
                />
              </div>
            </div>
          </div>

          <div className="world-boss-centerpiece" aria-hidden="true">
            <div className="world-boss-core" />
            <div className="world-boss-ring world-boss-ring-a" />
            <div className="world-boss-ring world-boss-ring-b" />
            <div className="world-boss-ring world-boss-ring-c" />
          </div>

          {damages.map((damage) => (
            <span
              key={damage.id}
              className="world-boss-damage"
              style={{
                left: damage.left,
                top: damage.top,
                color: `hsl(${damage.hue} 100% 72%)`,
                textShadow: `0 0 20px hsl(${damage.hue} 100% 52% / 0.55)`,
              }}
            >
              -{damage.value}
            </span>
          ))}
        </div>
      ) : null}
    </>
  )
}
