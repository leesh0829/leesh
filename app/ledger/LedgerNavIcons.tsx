import Link from 'next/link'

type IconProps = { className?: string }

function LedgerIcon({ className }: IconProps) {
  // 가계부 (책/장부 모양)
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
        d="M5 4C5 3.44772 5.44772 3 6 3H18C18.5523 3 19 3.44772 19 4V20C19 20.5523 18.5523 21 18 21H6C5.44772 21 5 20.5523 5 20V4Z"
        strokeLinejoin="round"
      />
      <path d="M9 8H15" strokeLinecap="round" />
      <path d="M9 12H15" strokeLinecap="round" />
      <path d="M9 16H13" strokeLinecap="round" />
    </svg>
  )
}

function StatsIcon({ className }: IconProps) {
  // 통계 (막대 그래프)
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 20V12" strokeLinecap="round" />
      <path d="M10 20V8" strokeLinecap="round" />
      <path d="M16 20V14" strokeLinecap="round" />
      <path d="M22 20V4" strokeLinecap="round" />
    </svg>
  )
}

function AccountsIcon({ className }: IconProps) {
  // 계좌 (지갑 또는 카드)
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="6" width="20" height="13" rx="2" strokeLinejoin="round" />
      <path d="M2 10H22" strokeLinecap="round" />
      <path d="M6 15H10" strokeLinecap="round" />
    </svg>
  )
}

function StocksIcon({ className }: IconProps) {
  // 주식/투자 (상승 그래프)
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 17L9 11L13 15L21 7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 7H21V13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function KeyIcon({ className }: IconProps) {
  // KIS API 키 설정 (열쇠)
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <circle cx="8" cy="14" r="4" />
      <path d="M11 12L21 4" strokeLinecap="round" />
      <path d="M17 6L19 8" strokeLinecap="round" />
      <path d="M14 9L16 11" strokeLinecap="round" />
    </svg>
  )
}

function NavButton({
  href,
  label,
  children,
}: {
  href: string
  label: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="btn btn-outline"
      aria-label={label}
      title={label}
    >
      {children}
      <span className="sr-only">{label}</span>
    </Link>
  )
}

export function LedgerNavBack() {
  return (
    <NavButton href="/ledger" label="가계부로">
      <LedgerIcon className="h-4 w-4" />
    </NavButton>
  )
}

export function LedgerNavStats() {
  return (
    <NavButton href="/ledger/stats" label="통계 / 분석">
      <StatsIcon className="h-4 w-4" />
    </NavButton>
  )
}

export function LedgerNavAccounts() {
  return (
    <NavButton href="/ledger/accounts" label="계좌 관리">
      <AccountsIcon className="h-4 w-4" />
    </NavButton>
  )
}

export function LedgerNavStocks() {
  return (
    <NavButton href="/ledger/stocks" label="보유 종목">
      <StocksIcon className="h-4 w-4" />
    </NavButton>
  )
}

function MarketIcon({ className }: IconProps) {
  // 시장 (캔들 차트)
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 4V20" strokeLinecap="round" />
      <rect x="3.5" y="8" width="5" height="8" rx="1" />
      <path d="M14 4V20" strokeLinecap="round" />
      <rect x="11.5" y="10" width="5" height="6" rx="1" />
      <path d="M21 6L21 14" strokeLinecap="round" />
    </svg>
  )
}

export function LedgerNavMarket() {
  return (
    <NavButton href="/ledger/market" label="시장 / 주식 시세">
      <MarketIcon className="h-4 w-4" />
    </NavButton>
  )
}

export function LedgerNavKisSettings() {
  return (
    <NavButton href="/ledger/kis-settings" label="KIS API 설정">
      <KeyIcon className="h-4 w-4" />
    </NavButton>
  )
}
