import Link from 'next/link'

type IconProps = { className?: string }

function BackArrowIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <path d="M19 12H5" strokeLinecap="round" />
      <path d="M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PencilIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M16.5 3.5a2.121 2.121 0 1 1 3 3L8 18l-4 1 1-4 11.5-11.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PlusIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  )
}

function NavButton({
  href,
  label,
  variant = 'outline',
  children,
}: {
  href: string
  label: string
  variant?: 'outline' | 'primary' | 'ghost'
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`btn btn-${variant}`}
      aria-label={label}
      title={label}
    >
      {children}
      <span className="sr-only">{label}</span>
    </Link>
  )
}

/** 목록으로 돌아가기 — ← 화살표 아이콘 */
export function NavBack({ href, label = '목록' }: { href: string; label?: string }) {
  return (
    <NavButton href={href} label={label}>
      <BackArrowIcon className="h-4 w-4" />
    </NavButton>
  )
}

/** 새 글/문서 작성 — + 아이콘 */
export function NavCreate({
  href,
  label = '새로 작성',
  variant = 'primary',
}: {
  href: string
  label?: string
  variant?: 'outline' | 'primary'
}) {
  return (
    <NavButton href={href} label={label} variant={variant}>
      <PlusIcon className="h-4 w-4" />
    </NavButton>
  )
}

/** 수정 — 연필 아이콘 */
export function NavEdit({ href, label = '수정' }: { href: string; label?: string }) {
  return (
    <NavButton href={href} label={label}>
      <PencilIcon className="h-4 w-4" />
    </NavButton>
  )
}
