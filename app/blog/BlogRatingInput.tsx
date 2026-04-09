'use client'

import { useState } from 'react'
import { formatReviewRatingHalf } from '@/app/lib/blog'

function StarSvg({
  filled,
  className = '',
}: {
  filled: boolean
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="m12 2.8 2.87 5.82 6.42.93-4.64 4.52 1.09 6.4L12 17.44 6.26 20.47l1.1-6.4-4.65-4.52 6.43-.93L12 2.8Z" />
    </svg>
  )
}

function StarHalf({
  filled,
  side,
}: {
  filled: boolean
  side: 'left' | 'right'
}) {
  const translateClass = side === 'left' ? 'translate-x-0' : '-translate-x-5'

  return (
    <span className="pointer-events-none relative block h-10 w-5 overflow-hidden">
      <StarSvg
        filled={false}
        className={`absolute left-0 top-0 h-10 w-10 text-slate-300 ${translateClass}`}
      />
      <StarSvg
        filled
        className={`absolute left-0 top-0 h-10 w-10 text-amber-400 ${translateClass} ${
          filled ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </span>
  )
}

export default function BlogRatingInput({
  value,
  disabled = false,
  onChange,
}: {
  value: number
  disabled?: boolean
  onChange: (next: number) => void
}) {
  const [hoverValue, setHoverValue] = useState<number | null>(null)
  const activeValue = hoverValue ?? value

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <div
          className={`inline-flex items-center rounded-2xl border px-2 py-1 ${
            disabled ? 'opacity-60' : ''
          }`}
          style={{
            borderColor: 'rgba(214, 158, 46, 0.18)',
            background: 'rgba(250, 204, 21, 0.05)',
          }}
          role="group"
          aria-label="별점 선택"
          onMouseLeave={() => setHoverValue(null)}
        >
          {Array.from({ length: 10 }, (_, index) => {
            const step = index + 1
            const side = step % 2 === 1 ? 'left' : 'right'

            return (
              <button
                key={step}
                type="button"
                disabled={disabled}
                className="cursor-pointer rounded-sm transition-transform hover:scale-[1.04] disabled:cursor-default"
                aria-label={`${formatReviewRatingHalf(step)}점 선택`}
                onMouseEnter={() => setHoverValue(step)}
                onFocus={() => setHoverValue(step)}
                onBlur={() => setHoverValue(null)}
                onClick={() => onChange(value === step ? 0 : step)}
              >
                <StarHalf filled={step <= activeValue} side={side} />
              </button>
            )
          })}
        </div>

        <div
          className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-semibold"
          style={{
            borderColor: 'rgba(214, 158, 46, 0.35)',
            background: 'rgba(250, 204, 21, 0.12)',
            color: '#c78900',
          }}
        >
          <span aria-hidden="true">★</span>
          <span>{formatReviewRatingHalf(activeValue)}</span>
        </div>

        <button
          type="button"
          disabled={disabled}
          className="btn btn-outline"
          onClick={() => onChange(0)}
        >
          0.0 초기화
        </button>
      </div>
    </div>
  )
}
