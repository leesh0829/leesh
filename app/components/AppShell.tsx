'use client'

import { useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'

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

  if (noShell) return <>{children}</>

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      {/* mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-zinc-200/70 bg-zinc-50/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-black/70 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
          aria-label="Open menu"
        >
          메뉴
        </button>
        <div className="text-sm font-semibold">Leesh</div>
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
                className="rounded-md border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                사이드바 열기
              </button>
              <div className="text-xs opacity-60"></div>
            </div>
          ) : null}

          <div className="mx-auto w-full max-w-300 px-4 py-6 lg:px-10">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
