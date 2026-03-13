'use client'

import { useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import Footer from './Footer'
import Link from 'next/link'
import ThemeToggle from './ThemeToggle'

const NO_SHELL_PREFIXES = ['/login', '/sign-up']

/**
 * Render the application's outer layout and navigation shell around page content.
 *
 * Displays different layouts depending on the current route: a minimal layout for
 * specified auth routes, a Leesh-specific layout with a back-to-main button, or the
 * full shell with sidebar, top bar, responsive content area, and mobile bottom navigation.
 *
 * @param children - The page content to render inside the shell
 * @returns The app shell React node that wraps the provided `children` with route-appropriate navigation, sidebar, and footer
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/'
  const isLeeshPage = useMemo(() => pathname.startsWith('/leesh'), [pathname])
  const noShell = useMemo(
    () => NO_SHELL_PREFIXES.some((p) => pathname.startsWith(p)),
    [pathname]
  )
  const isBlogDetail = useMemo(() => {
    if (!pathname.startsWith('/blog/')) return false
    if (pathname.startsWith('/blog/new') || pathname.startsWith('/blog/edit'))
      return false
    const segments = pathname.split('/').filter(Boolean)
    return segments.length === 2 && segments[0] === 'blog'
  }, [pathname])
  const isWideLayout = useMemo(
    () =>
      isBlogDetail ||
      pathname.startsWith('/calendar') ||
      pathname.startsWith('/todos'),
    [isBlogDetail, pathname]
  )

  // mobile sidebar
  const [open, setOpen] = useState(false)

  // desktop sidebar
  const [desktopOpen, setDesktopOpen] = useState(true)

  if (noShell) {
    return (
      <div className="min-h-dvh flex flex-col">
        <div className="flex-1">{children}</div>
        <Footer />
      </div>
    )
  }

  if (isLeeshPage) {
    return (
      <div className="min-h-dvh flex flex-col">
        <div className="z-50 px-3 pt-3 sm:px-0 sm:pt-0">
          <div className="sm:fixed sm:left-4 sm:top-4">
            <Link
              href="/"
              className="btn btn-outline"
              aria-label="메인 페이지로 이동"
              title="메인 페이지로 이동"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path
                  d="M3.5 10.5L12 3.5L20.5 10.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M6 9.5V20.5H18V9.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M10 20.5V14.5H14V20.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="sr-only">메인 페이지</span>
            </Link>
          </div>
        </div>
        <div className="flex-1">{children}</div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-dvh lg:flex">
      {/* Sidebar (desktop: sticky, mobile: overlay fixed) */}
      <Sidebar
        open={open}
        onClose={() => setOpen(false)}
        desktopOpen={desktopOpen}
        onToggleDesktop={() => setDesktopOpen((v) => !v)}
      />

      {/* Right side: only this area scrolls */}
      <div className="min-w-0 flex-1 flex flex-col">
        {/* mobile top bar */}
        <div className="sticky top-0 z-30 flex items-center gap-3 px-3 py-3 sm:px-4 lg:hidden">
          <div className="surface flex w-full items-center gap-3 px-3 py-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="btn btn-outline"
              aria-label="Open menu"
            >
              ☰
            </button>
            {isBlogDetail ? (
              <Link href="/blog" className="btn btn-outline">
                ← 목록
              </Link>
            ) : null}
            <Link href="/" className="text-sm font-semibold">
              Leesh
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
            </div>
          </div>
        </div>

        {/* desktop hover trigger (사이드바 숨김일 때 왼쪽 끝에 마우스 올리면 열림) */}
        {!desktopOpen ? (
          <div
            className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:block lg:w-2"
            onMouseEnter={() => setDesktopOpen(true)}
            aria-hidden="true"
          />
        ) : null}

        {/* Scroll container */}
        <div className="app-scroll-container min-w-0 flex-1 overflow-y-auto pb-[calc(72px+env(safe-area-inset-bottom))] lg:pb-0">
          <div className="min-h-full flex flex-col">
            {/* desktop 상단 컨트롤: 사이드바 열기 + 블로그 목록 복귀 */}
            {!desktopOpen || isBlogDetail ? (
              <div className="hidden lg:flex lg:items-center lg:gap-2 lg:px-4 lg:py-3">
                {!desktopOpen ? (
                  <button
                    type="button"
                    onClick={() => setDesktopOpen(true)}
                    className="btn btn-outline"
                    aria-label="사이드바 열기"
                    title="사이드바 열기"
                  >
                    ☰
                  </button>
                ) : null}
                {isBlogDetail ? (
                  <Link href="/blog" className="btn btn-outline">
                    ← 목록으로
                  </Link>
                ) : null}
              </div>
            ) : null}

            <div
              className={
                (isWideLayout
                  ? 'w-full px-3 sm:px-4 lg:px-6'
                  : 'container-page') + ' py-6 flex-1'
              }
            >
              <div key={pathname} className="route-fade-enter">
                {children}
              </div>
            </div>
            <Footer />
          </div>
        </div>
        {/* mobile bottom nav */}
        <nav className="lg:hidden fixed inset-x-0 bottom-0 z-40">
          <div className="mx-auto w-full max-w-6xl px-3 sm:px-4">
            <div className="surface flex items-center justify-around gap-2 px-2 py-2 mb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <Link className="btn btn-ghost" href="/dashboard">
                대시
              </Link>
              <Link className="btn btn-ghost" href="/blog">
                블로그
              </Link>
              <Link className="btn btn-ghost" href="/boards">
                보드
              </Link>
              <Link className="btn btn-ghost" href="/calendar">
                캘린더
              </Link>
              <Link className="btn btn-ghost" href="/todos">
                TODO
              </Link>
            </div>
          </div>
        </nav>
      </div>
    </div>
  )
}
