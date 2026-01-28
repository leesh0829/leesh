'use client'

import { useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import Footer from './Footer'

const NO_SHELL_PREFIXES = ['/login', '/sign-up']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/'
  const noShell = useMemo(
    () => NO_SHELL_PREFIXES.some((p) => pathname.startsWith(p)),
    [pathname]
  )

  // mobile sidebar
  const [open, setOpen] = useState(false)

  // desktop sidebar
  const [desktopOpen, setDesktopOpen] = useState(true)

  if (noShell) {
    return (
      <div className="min-h-dvh flex flex-col">
        {children}
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <div className="flex-1">
        {/* mobile top bar */}
        <div className="sticky top-0 z-30 flex items-center gap-3 px-3 py-3 sm:px-4 lg:hidden">
          <div className="surface flex w-full items-center gap-3 px-3 py-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="btn btn-outline"
              aria-label="Open menu"
            >
              메뉴
            </button>
            <div className="text-sm font-semibold">Leesh</div>
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

        <div className="flex w-full">
          <Sidebar
            open={open}
            onClose={() => setOpen(false)}
            desktopOpen={desktopOpen}
            onToggleDesktop={() => setDesktopOpen((v) => !v)}
          />

          {/* desktopOpen에 따라 padding-left 조절 */}
          <div className={'flex-1 ' + (desktopOpen ? 'lg:pl-64' : 'lg:pl-0')}>
            {/* desktop용 상단에 “사이드바 열기” 버튼(숨김 상태일 때만) */}
            {!desktopOpen ? (
              <div className="hidden lg:flex lg:items-center lg:gap-2 lg:px-4 lg:py-3">
                <button
                  type="button"
                  onClick={() => setDesktopOpen(true)}
                  className="btn btn-outline"
                >
                  사이드바 열기
                </button>
                <div className="text-xs opacity-60"></div>
              </div>
            ) : null}

            <div className="container-page py-6">{children}</div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}
