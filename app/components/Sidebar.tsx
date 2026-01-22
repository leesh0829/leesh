'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useEffect, useMemo, useState } from 'react'

type Props = {
  open: boolean
  onClose: () => void
}

type Perm = {
  key: string
  label: string
  path: string
  requireLogin: boolean
  minRole: 'USER' | 'ADMIN'
  visible: boolean
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
      className={
        'block rounded-md px-3 py-2 text-sm transition ' +
        (active
          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black'
          : 'hover:bg-zinc-100 dark:hover:bg-zinc-900')
      }
    >
      {label}
    </Link>
  )
}

export default function Sidebar({ open, onClose }: Props) {
  const pathname = usePathname() ?? '/'
  const { data: session, status } = useSession()

  const [perms, setPerms] = useState<Perm[] | null>(null)

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
    session?.user?.name ||
    session?.user?.email ||
    (status === 'loading' ? '로딩...' : '비로그인')

  // NOTE:
  // - 세션에 role을 안 넣었으니(현재 authOptions 구조), 여기서는 “로그인 여부”까지만 반영.
  // - ADMIN 메뉴는 기본 visible=false라 사이드바에 안 뜨게 해둠.
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
      .map((x) => ({ href: x.path, label: x.label }))
  }, [perms, session?.user])

  return (
    <>
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
          'fixed z-50 h-dvh w-64 border-r border-zinc-200 bg-white p-4 transition-transform dark:border-zinc-800 dark:bg-black lg:static lg:translate-x-0 ' +
          (open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0')
        }
      >
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" onClick={onClose} className="text-base font-bold">
            Leesh
          </Link>
          <button
            type="button"
            className="rounded-md border border-zinc-200 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900 lg:hidden"
            onClick={onClose}
          >
            닫기
          </button>
        </div>

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

        <div className="mt-6 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          <div className="mb-2 font-semibold">계정</div>
          <div className="truncate opacity-80">{userLabel}</div>

          <div className="mt-3 flex gap-2">
            {session?.user ? (
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/' })}
                className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
              >
                로그아웃
              </button>
            ) : (
              <Link
                href="/login"
                onClick={onClose}
                className="w-full rounded-md bg-zinc-900 px-3 py-2 text-center text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
              >
                로그인
              </Link>
            )}
          </div>
        </div>

        <div className="mt-4 text-xs opacity-60">
          <div>Next.js + Prisma + PostgreSQL</div>
          <div>Blog / Boards / TODO / Calendar</div>
        </div>
      </aside>
    </>
  )
}
