'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useEffect, useMemo, useState } from 'react'
import { displayUserLabel } from '@/app/lib/userLabel'
import DailyQuestCard from './DailyQuestCard'
import DailyLuckCard from './DailyLuckCard'

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

/**
 * Sidebar component providing responsive, permission-aware navigation, account controls, and auxiliary widgets.
 *
 * Renders a mobile-overlay and a desktop sticky sidebar that fetches permission data to build the navigation list,
 * highlights the active route, shows account/login controls, includes DailyQuestCard and DailyLuckCard, a Mini Game block,
 * and an updates modal.
 *
 * @param open - Whether the mobile sidebar overlay is open.
 * @param onClose - Callback to close the sidebar (used for mobile overlay and link navigation).
 * @param desktopOpen - Whether the desktop sidebar is expanded and visible.
 * @param onToggleDesktop - Callback to toggle the desktop sidebar's expanded/collapsed state.
 * @returns The sidebar JSX element.
 */
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
          <div className="surface card-pad modal-enter relative z-[71] w-full max-w-md">
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
              <li className="mt-3 text-sm">미니 게임 Reflex Sprint 추가</li>
              <li className="mt-3 text-sm">스크롤 소환 연출 추가</li>
              <li className="mt-3 text-sm">월드 보스 버튼 이스터에그 추가</li>
              <li className="mt-3 text-sm">사이드바 오늘의 행운 카드 추가</li>
              <li className="mt-3 text-sm">사이드바 일일 랜덤 퀘스트 추가</li>
              <li className="mt-3 text-sm">업데이트 내역 기능 추가</li>
              <li className="mt-3 text-sm">블로그 트리 추가</li>
              <li className="mt-3 text-sm">TODO 마우스 연동 추가</li>
              <li className="mt-3 text-sm">글 목록 검색 기능 추가</li>
              <li className="mt-3 text-sm">포트폴리오 페이지 추가 및 수정</li>
              <li className="mt-3 text-sm">반응형 UI 추가</li>
              <li className="mt-3 text-sm">일부 버튼 UI 기호로 변경</li>
              <li className="mt-3 text-sm">캘린더 / TODO UI 변경</li>
              <li className="mt-3 text-sm">강조 버튼 UI 변경</li>
              <li className="mt-3 text-sm">고객 센터 답변 여부 배지 추가</li>
              <li className="mt-3 text-sm">애니메이션 추가</li>
              <li className="mt-3 text-sm">마크다운 스타일 수정</li>
              <li className="mt-3 text-sm">웹 아이콘 추가</li>
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
          'fixed z-50 h-dvh w-[82vw] max-w-64 border-r bg-(--card) p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] transition-transform duration-300 ease-in-out motion-reduce:transition-none ' +
          (open ? 'translate-x-0' : '-translate-x-full') +
          // desktop: sticky sidebar (independent scroll)
          ' lg:sticky lg:top-0 lg:translate-x-0 lg:h-dvh lg:overflow-y-auto lg:transition-[width,padding,border-color,transform] lg:duration-300 lg:ease-in-out lg:will-change-[width] ' +
          (desktopOpen
            ? ' lg:w-64 lg:p-4'
            : ' lg:w-0 lg:p-0 lg:overflow-hidden lg:border-r-0')
        }
      >
        <div
          className={
            'flex h-full min-h-0 flex-col transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ' +
            (desktopOpen
              ? 'lg:translate-x-0 lg:opacity-100'
              : 'lg:-translate-x-2 lg:opacity-0 lg:pointer-events-none')
          }
        >
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

            <DailyQuestCard onNavigate={onClose} />
            <DailyLuckCard />
            <section className="surface mt-4 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-65">
                    Mini Game
                  </div>
                  <div className="mt-1 text-sm font-semibold">Mini Arcade</div>
                </div>
                <span className="badge">NEW</span>
              </div>

              <p className="mt-2 text-xs leading-5 opacity-80">
                반응속도, 숫자 러시, 타겟 클릭까지 가볍게 열 수 있는 초소형 게임 모음입니다.
              </p>

              <Link
                href="/minigame"
                onClick={onClose}
                className="btn btn-primary mt-3 w-full"
              >
                열기
              </Link>
            </section>
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
