'use client'

import { useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import Footer from './Footer'
import Link from 'next/link'
import ThemeToggle from './ThemeToggle'

const NO_SHELL_PREFIXES = ['/login', '/sign-up']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/'
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
            <Link href="/" className="text-sm font-semibold">
              Leesh
            </Link>
            <div className="ml-auto">
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
        <div className="min-w-0 flex-1 overflow-y-auto pb-[calc(72px+env(safe-area-inset-bottom))] lg:pb-0">
          <div className="min-h-full flex flex-col">
            {/* desktop sidebar hidden 상태일 때만 상단 열기 버튼 */}
            {!desktopOpen ? (
              <div className="hidden lg:flex lg:items-center lg:gap-2 lg:px-4 lg:py-3">
                <button
                  type="button"
                  onClick={() => setDesktopOpen(true)}
                  className="btn btn-outline"
                >
                  ☰
                </button>
                <div className="text-xs opacity-60"></div>
              </div>
            ) : null}

            <div
              className={
                (isBlogDetail
                  ? 'w-full px-3 sm:px-4 lg:px-6'
                  : 'container-page') + ' py-6 flex-1'
              }
            >
              {children}
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
