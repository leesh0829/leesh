'use client'

import { createContext, useContext, useMemo, useState } from 'react'

type GateCtx = {
  revealed: boolean
  setRevealed: (next: boolean) => void
}

const SpoilerGateContext = createContext<GateCtx>({
  revealed: true,
  setRevealed: () => {},
})

// 페이지 전체를 감싸 article + TOC가 같은 reveal 상태를 공유하게 함.
// active=false 면 항상 revealed=true 로 동작 (no-op).
export function SpoilerGateProvider({
  active,
  children,
}: {
  active: boolean
  children: React.ReactNode
}) {
  const [revealed, setRevealed] = useState(!active)
  const value = useMemo<GateCtx>(
    () => ({ revealed: active ? revealed : true, setRevealed }),
    [active, revealed]
  )
  return (
    <SpoilerGateContext.Provider value={value}>
      {children}
    </SpoilerGateContext.Provider>
  )
}

export function useSpoilerGate() {
  return useContext(SpoilerGateContext)
}

// 본문 게이트 — 흐림 + 동의 카드. revealed 시 children 그대로 노출.
export default function BlogSpoilerGateClient({
  children,
}: {
  children: React.ReactNode
}) {
  const { revealed, setRevealed } = useSpoilerGate()

  if (revealed) {
    return <>{children}</>
  }

  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none select-none"
        style={{
          filter: 'blur(12px)',
          maskImage:
            'linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 70%, rgba(0,0,0,0.6) 100%)',
          WebkitMaskImage:
            'linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 70%, rgba(0,0,0,0.6) 100%)',
        }}
      >
        {children}
      </div>

      <div className="absolute inset-0 flex items-start justify-center p-4 sm:items-center">
        <div
          className="card card-pad card-hover-border-only mx-3 max-w-md text-left"
          style={{
            background: 'var(--surface, rgba(0,0,0,0.04))',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div className="text-base font-extrabold">
            ⚠️ [열람 주의] 본 게시물은 아래의 내용을 포함하고 있습니다.
          </div>
          <ul
            className="mt-3 list-disc pl-5 text-sm space-y-1"
            style={{ color: 'var(--foreground)' }}
          >
            <li>
              <span className="font-semibold">내용 스포일러</span>{' '}
              (작품의 주요 반전 및 결말 포함)
            </li>
            <li>
              <span className="font-semibold">민감한 콘텐츠</span>{' '}
              (잔인하거나 선정적인 묘사, 트라우마 유발 요소)
            </li>
            <li>
              <span className="font-semibold">보안 및 개인정보</span>{' '}
              (일부 기밀 사항 및 개인 신상 관련 내용)
            </li>
          </ul>
          <p
            className="mt-3 text-sm leading-relaxed"
            style={{ color: 'var(--muted)' }}
          >
            해당 내용에 민감하시거나 원치 않으시는 분들은 열람을 중단해 주시기
            바랍니다. 본 게시글의 무단 복제, 캡처 및 유포를 금지하며, 열람으로
            인해 발생하는 문제의 책임은 독자 본인에게 있습니다.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="btn btn-primary"
            >
              동의하고 열람
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.history.back()
              }}
              className="btn btn-outline"
            >
              뒤로 가기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// 사이드(목차) 등 본문 외 영역용 — revealed 시 그대로, 아니면 블러+클릭 차단.
export function BlogSpoilerSideBlur({
  children,
}: {
  children: React.ReactNode
}) {
  const { revealed } = useSpoilerGate()
  if (revealed) return <>{children}</>
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none"
      style={{ filter: 'blur(10px)' }}
    >
      {children}
    </div>
  )
}
