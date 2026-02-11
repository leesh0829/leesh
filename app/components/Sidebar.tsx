'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useEffect, useMemo, useState } from 'react'
import { displayUserLabel } from '@/app/lib/userLabel'

type Props = {
  open: boolean
  onClose: () => void

  // desktop hide/show
  desktopOpen: boolean
  onToggleDesktop: () => void
}

type Perm = {
  key: string
  label: string
  path: string
  requireLogin: boolean
  minRole: 'USER' | 'ADMIN'
  visible: boolean
}

const SIDEBAR_ORDER = [
  'home',
  'dashboard',
  'blog',
  'todos',
  'boards',
  'calendar',
  'permission',
  'help',
] as const

function normalizeKey(key: string) {
  return key.trim().toLowerCase()
}

function getOrderIndex(key: string) {
  const normalized = normalizeKey(key)
  const idx = SIDEBAR_ORDER.indexOf(
    normalized as (typeof SIDEBAR_ORDER)[number]
  )
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
}

function NavItem({
  href,
  label,
  active,
  onNavigate,
}: {
  href: string
  label: string
  active: boolean
  onNavigate: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={'nav-link ' + (active ? 'nav-link-active' : '')}
    >
      {label}
    </Link>
  )
}

export default function Sidebar({
  open,
  onClose,
  desktopOpen,
  onToggleDesktop,
}: Props) {
  const pathname = usePathname() ?? '/'
  const { data: session, status } = useSession()

  const [perms, setPerms] = useState<Perm[] | null>(null)
  const [showUpdates, setShowUpdates] = useState(false)

  useEffect(() => {
    ;(async () => {
      const r = await fetch('/api/permission', { cache: 'no-store' })
      if (!r.ok) {
        setPerms([])
        return
      }
      const data = (await r.json()) as Perm[]
      setPerms(data)
    })()
  }, [])

  const userLabel =
    status === 'loading'
      ? '로딩...'
      : session?.user
        ? displayUserLabel(session.user.name, session.user.email, '비로그인')
        : '비로그인'

  const nav = useMemo(() => {
    const base =
      perms && perms.length > 0
        ? perms
        : [
            {
              key: 'home',
              label: '메인',
              path: '/',
              requireLogin: false,
              minRole: 'USER',
              visible: true,
            },
            {
              key: 'dashboard',
              label: '대시보드',
              path: '/dashboard',
              requireLogin: true,
              minRole: 'USER',
              visible: true,
            },
            {
              key: 'blog',
              label: '블로그',
              path: '/blog',
              requireLogin: true,
              minRole: 'USER',
              visible: true,
            },
            {
              key: 'boards',
              label: '게시판',
              path: '/boards',
              requireLogin: true,
              minRole: 'USER',
              visible: true,
            },
            {
              key: 'todos',
              label: 'TODO',
              path: '/todos',
              requireLogin: true,
              minRole: 'USER',
              visible: true,
            },
            {
              key: 'calendar',
              label: '캘린더',
              path: '/calendar',
              requireLogin: true,
              minRole: 'USER',
              visible: true,
            },
            {
              key: 'help',
              label: '고객 센터',
              path: '/help',
              requireLogin: true,
              minRole: 'USER',
              visible: true,
            },
          ]

    const loggedIn = !!session?.user

    return base
      .filter((x) => x.visible)
      .filter((x) => (x.requireLogin ? loggedIn : true))
      .map((x) => ({ key: x.key, href: x.path, label: x.label }))
      .sort((a, b) => getOrderIndex(a.key) - getOrderIndex(b.key))
  }, [perms, session?.user])

  return (
    <>
      {showUpdates ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="업데이트 내역 닫기"
            onClick={() => setShowUpdates(false)}
          />
          <div className="surface card-pad relative z-[71] w-full max-w-md">
            <div className="flex items-center justify-between gap-2">
              <div className="text-base font-semibold">업데이트 내역</div>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setShowUpdates(false)}
              >
                X
              </button>
            </div>
            <ul>
              <li className="mt-3 text-sm">마크다운 스타일 수정</li>
              <li className="mt-3 text-sm">글 목록 검색 기능 추가</li>
              <li className="mt-3 text-sm">그 외 버그 수정</li>
            </ul>
          </div>
        </div>
      ) : null}

      {/* mobile overlay */}
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={
          // mobile: overlay
          'fixed z-50 h-dvh w-[82vw] max-w-64 border-r bg-(--card) p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] transition-transform ' +
          (open ? 'translate-x-0' : '-translate-x-full') +
          // desktop: sticky sidebar (independent scroll)
          ' lg:sticky lg:top-0 lg:translate-x-0 lg:h-dvh lg:overflow-y-auto ' +
          (desktopOpen
            ? ' lg:w-64 lg:p-4'
            : ' lg:w-0 lg:p-0 lg:overflow-hidden lg:border-r-0')
        }
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="mb-4 flex items-center justify-between">
            <Link href="/" onClick={onClose} className="text-base font-bold">
              Leesh
            </Link>

            {/* desktop hide 버튼 */}
            <button
              type="button"
              className="hidden btn btn-outline text-xs lg:inline-flex"
              onClick={onToggleDesktop}
              aria-label="Hide sidebar"
              title="사이드바 숨기기"
            >
              &lt;
            </button>

            {/* mobile close 버튼 */}
            <button
              type="button"
              className="btn btn-outline lg:hidden"
              onClick={onClose}
            >
              &lt;
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <nav className="grid gap-1">
              {nav.map((n) => (
                <NavItem
                  key={n.href}
                  href={n.href}
                  label={n.label}
                  active={
                    pathname === n.href ||
                    (n.href !== '/' && pathname.startsWith(n.href))
                  }
                  onNavigate={onClose}
                />
              ))}
            </nav>

            <div className="mt-6 card p-3 text-sm">
              <div className="mb-2 font-semibold">계정</div>
              <div className="truncate opacity-80">{userLabel}</div>

              <div className="mt-3 flex gap-2">
                {session?.user ? (
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: '/' })}
                    className="w-full btn btn-primary"
                  >
                    로그아웃
                  </button>
                ) : (
                  <div className="flex w-full gap-2">
                    <Link
                      href="/login"
                      onClick={onClose}
                      className="w-1/2 btn btn-primary text-center"
                    >
                      로그인
                    </Link>

                    <Link
                      href="/sign-up"
                      onClick={onClose}
                      className="w-1/2 btn btn-outline text-center"
                    >
                      회원가입
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <button
              type="button"
              className="btn btn-outline w-full"
              onClick={() => setShowUpdates(true)}
            >
              📄
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
