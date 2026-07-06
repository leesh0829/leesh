'use client'

import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import type { SearchResponse } from '@/app/lib/search'

export const OPEN_EVENT = 'leesh:open-command-palette'

type NavItem = { key: string; label: string; path: string }

const EMPTY_RESULTS: SearchResponse = { blog: [], docs: [], help: [], boards: [] }
const CONTENT_GROUPS = ['blog', 'docs', 'boards', 'help'] as const
const GROUP_LABEL: Record<(typeof CONTENT_GROUPS)[number], string> = {
  blog: '블로그',
  docs: 'Docs',
  boards: '게시판',
  help: '고객센터',
}

export function CommandPaletteTrigger({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_EVENT))}
      className={'btn btn-outline ' + (className ?? '')}
      aria-label="검색 (Ctrl+K)"
      title="검색 (⌘K / Ctrl+K)"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21L16.65 16.65" strokeLinecap="round" />
      </svg>
    </button>
  )
}

export default function CommandPalette() {
  const router = useRouter()
  const { data: session } = useSession()
  const loggedIn = !!session?.user

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [navItems, setNavItems] = useState<NavItem[] | null>(null)
  const [results, setResults] = useState<SearchResponse>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [searchFailed, setSearchFailed] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const lastFocusRef = useRef<HTMLElement | null>(null)

  // 전역 단축키 + 커스텀 이벤트로 열기/닫기
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    function onOpen() {
      setOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener(OPEN_EVENT, onOpen as EventListener)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener(OPEN_EVENT, onOpen as EventListener)
    }
  }, [])

  // 열림: 포커스 저장/이동 + 스크롤 잠금 / 닫힘: 상태 초기화 + 포커스 복원
  useEffect(() => {
    if (open) {
      lastFocusRef.current = document.activeElement as HTMLElement | null
      const prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      const id = window.setTimeout(() => inputRef.current?.focus(), 0)
      return () => {
        window.clearTimeout(id)
        document.body.style.overflow = prevOverflow
      }
    }
    setQuery('')
    setActiveIndex(0)
    lastFocusRef.current?.focus?.()
    return undefined
  }, [open])

  // 이동 목록 최초 1회 로드
  useEffect(() => {
    if (!open || navItems !== null) return
    let aborted = false
    ;(async () => {
      let base: NavItem[] = []
      try {
        const r = await fetch('/api/permission', { cache: 'no-store' })
        if (r.ok) {
          const data = (await r.json()) as {
            key: string
            label: string
            path: string
          }[]
          base = data.map((d) => ({ key: d.key, label: d.label, path: d.path }))
        }
      } catch {
        base = []
      }
      if (aborted) return
      const extras: NavItem[] = [
        { key: 'leesh', label: '포트폴리오 (Leesh)', path: '/leesh' },
        ...(loggedIn
          ? []
          : [
              { key: 'login', label: '로그인', path: '/login' },
              { key: 'signup', label: '회원가입', path: '/sign-up' },
            ]),
      ]
      setNavItems([...base, ...extras])
    })()
    return () => {
      aborted = true
    }
  }, [open, navItems, loggedIn])

  // 디바운스 콘텐츠 검색
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults(EMPTY_RESULTS)
      setLoading(false)
      setSearchFailed(false)
      return undefined
    }
    setLoading(true)
    const controller = new AbortController()
    const id = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!r.ok) throw new Error('search failed')
        const data = (await r.json()) as SearchResponse
        setResults(data)
        setSearchFailed(false)
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setResults(EMPTY_RESULTS)
        setSearchFailed(true)
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => {
      controller.abort()
      window.clearTimeout(id)
    }
  }, [query])

  // 키보드 내비게이션용 평탄 목록 (렌더 순서와 반드시 동일해야 함)
  const q = query.trim().toLowerCase()
  const navMatches = useMemo(
    () =>
      (navItems ?? []).filter(
        (n) =>
          !q ||
          n.label.toLowerCase().includes(q) ||
          n.path.toLowerCase().includes(q)
      ),
    [navItems, q]
  )
  const flatUrls = useMemo(() => {
    const urls: string[] = navMatches.map((n) => n.path)
    for (const group of CONTENT_GROUPS) {
      for (const it of results[group]) urls.push(it.url)
    }
    return urls
  }, [navMatches, results])

  useEffect(() => {
    setActiveIndex((i) =>
      flatUrls.length === 0 ? 0 : Math.min(i, flatUrls.length - 1)
    )
  }, [flatUrls.length])

  const go = useCallback(
    (url: string) => {
      setOpen(false)
      router.push(url)
    },
    [router]
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (flatUrls.length ? (i + 1) % flatUrls.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) =>
        flatUrls.length ? (i - 1 + flatUrls.length) % flatUrls.length : 0
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const url = flatUrls[activeIndex]
      if (url) go(url)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  if (!open) return null

  let idx = -1
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center p-4 pt-[12vh]">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label="검색 닫기"
        onClick={() => setOpen(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="명령 팔레트"
        className="surface card-pad modal-enter relative z-[81] w-full max-w-xl"
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이동 또는 검색… (블로그·Docs·게시판·고객센터)"
          className="input w-full"
          aria-label="명령 팔레트 검색"
        />
        <div className="mt-3 max-h-[50vh] overflow-y-auto" role="listbox">
          {navMatches.length > 0 ? (
            <div className="mb-2">
              <div
                className="px-1 py-1 text-xs font-semibold"
                style={{ color: 'var(--muted)' }}
              >
                이동
              </div>
              {navMatches.map((n) => {
                idx++
                return (
                  <ResultRow
                    key={'nav-' + n.key}
                    active={idx === activeIndex}
                    label={n.label}
                    onClick={() => go(n.path)}
                  />
                )
              })}
            </div>
          ) : null}

          {CONTENT_GROUPS.map((group) =>
            results[group].length > 0 ? (
              <div className="mb-2" key={group}>
                <div
                  className="px-1 py-1 text-xs font-semibold"
                  style={{ color: 'var(--muted)' }}
                >
                  {GROUP_LABEL[group]}
                </div>
                {results[group].map((it) => {
                  idx++
                  return (
                    <ResultRow
                      key={group + '-' + it.id}
                      active={idx === activeIndex}
                      label={it.title}
                      badge={it.isSecret ? '🔒' : undefined}
                      onClick={() => go(it.url)}
                    />
                  )
                })}
              </div>
            ) : null
          )}

          {loading ? (
            <div className="px-1 py-2 text-sm" style={{ color: 'var(--muted)' }}>
              검색 중…
            </div>
          ) : null}
          {!loading && q.length >= 2 && flatUrls.length === 0 && !searchFailed ? (
            <div className="px-1 py-2 text-sm" style={{ color: 'var(--muted)' }}>
              결과 없음
            </div>
          ) : null}
          {searchFailed ? (
            <div className="px-1 py-2 text-sm" style={{ color: 'var(--muted)' }}>
              검색 일시 불가 — 이동 메뉴는 사용할 수 있어요.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ResultRow({
  active,
  label,
  badge,
  onClick,
}: {
  active: boolean
  label: string
  badge?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={
        'nav-link flex w-full items-center justify-between gap-2 text-left ' +
        (active ? 'nav-link-active' : '')
      }
    >
      <span className="truncate">{label}</span>
      {badge ? <span className="shrink-0 text-xs">{badge}</span> : null}
    </button>
  )
}
