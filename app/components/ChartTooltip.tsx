'use client'

// SVG 차트 위에 떠 있는 작은 데이터 패널 — 마우스 좌표 기준 절대 위치.
// 사용 패턴:
//   const { ref, pos, hovered, onMove, onLeave, show } = useChartHover<T>()
//   <div ref={ref} className="relative" onMouseMove={onMove} onMouseLeave={onLeave}>
//     <svg ...>
//       <rect onMouseEnter={() => show(item)} onMouseLeave={() => show(null)} />
//     </svg>
//     <ChartTooltip pos={pos} visible={!!hovered}>
//       {hovered && <>...상세...</>}
//     </ChartTooltip>
//   </div>

import {
  type PointerEvent,
  type MouseEvent,
  useCallback,
  useRef,
  useState,
} from 'react'

export type TooltipPos = { x: number; y: number }

export function useChartHover<T>() {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<TooltipPos | null>(null)
  const [hovered, setHovered] = useState<T | null>(null)

  const onMove = useCallback(
    (e: MouseEvent<HTMLDivElement> | PointerEvent<HTMLDivElement>) => {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) return
      setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    },
    []
  )

  const onLeave = useCallback(() => {
    setPos(null)
    setHovered(null)
  }, [])

  const show = useCallback((data: T | null) => {
    setHovered(data)
  }, [])

  return { ref, pos, hovered, onMove, onLeave, show }
}

export function ChartTooltip({
  pos,
  visible,
  children,
}: {
  pos: TooltipPos | null
  visible: boolean
  children: React.ReactNode
}) {
  if (!visible || !pos) return null
  // 컨테이너 우측/하단을 넘기지 않도록 보수적 오프셋 + 약간의 좌측 보정
  // (정확한 clamp는 측정 비용이 커서 단순 offset만)
  const left = pos.x + 12
  const top = pos.y + 12
  return (
    <div
      className="pointer-events-none absolute z-20 rounded-md border px-2.5 py-1.5 text-xs shadow-lg"
      style={{
        left,
        top,
        background: 'var(--card)',
        borderColor: 'var(--border)',
        // 우측 잘림 방지 — 마우스가 오른쪽 끝일 때만 왼쪽으로 뒤집기
        transform: 'translate(0, 0)',
        maxWidth: 240,
        whiteSpace: 'nowrap',
        backdropFilter: 'blur(6px)',
      }}
    >
      {children}
    </div>
  )
}
