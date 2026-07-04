# ⌘K 커맨드 팔레트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전역 `⌘K`/`Ctrl+K` 커맨드 팔레트로 기능/페이지 이동 + 블로그·Docs·게시판·고객센터 제목 검색을 제공한다.

**Architecture:** 신규 통합 검색 API(`/api/search`)가 각 표면의 기존 노출 where절을 그대로 미러링해 안전하게 제목만 반환한다. 전역 클라이언트 컴포넌트(`CommandPalette`)가 `⌘K` 단축키/커스텀 이벤트로 열리는 모달을 렌더하고, 이동 목록은 기존 `/api/permission`을 재사용한다. 공유 트리거 버튼(`CommandPaletteTrigger`)을 데스크톱(`GlobalTopRightControls`)·모바일(`AppShell` 상단바) 두 클러스터에 배치한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7(PostgreSQL), NextAuth v4(`useSession`), Tailwind v4 + 커스텀 CSS 디자인 시스템. 새 npm 의존성 없음.

## Global Constraints

- **새 npm 의존성 0** — `cmdk` 등 라이브러리 도입 금지. 기존 디자인 시스템 클래스(`.surface .card-pad .modal-enter .input .badge .nav-link .nav-link-active .btn .btn-outline`) 재사용.
- **보안 불변식(스펙 §3·§6 준수)** — 검색은 다음을 초과 조회 금지: 블로그 `board.type=BLOG & status=DONE`, Docs `board.type=DOCS & status=DONE`, 고객센터 `board.type=HELP`, 게시판 `board.type=GENERAL & ownerId=본인(로그인 시만)`. 응답에 `contentMd`·`secretPasswordHash` 등 민감 필드 **절대 미포함**(제목만). 비밀글 열람 잠금은 기존 상세페이지가 최종 결정.
- **테스트 러너 없음** — 리포지토리에 jest/vitest 등 자동 테스트 프레임워크가 없다. CLAUDE.md(“Simplicity First / nothing speculative”)에 따라 **테스트 프레임워크를 새로 추가하지 않는다.** 검증은 각 태스크에서 `npm run lint` + `npm run build`(타입 검사 포함) + 명시된 수동 스모크로 대체한다.
- **코드 스타일** — `.prettierrc` 및 수정 중인 파일의 주변 스타일을 따른다(`app/` 컴포넌트/페이지는 대체로 세미콜론 생략·single quote). import 별칭 `@/app/...` 사용.
- **URL 규칙(기존 목록과 일치)** — 블로그 `/blog/{id}`, Docs `/docs/{id}`, 고객센터 `/help/{id}`, 게시판 `/boards/{boardId}/{id}`. id는 `encodeURIComponent`로 감싼다.

---

### Task 1: 통합 검색 API (`GET /api/search`)

**Files:**
- Create: `app/api/search/route.ts`

**Interfaces:**
- Consumes: `@/app/lib/prisma`(`prisma`), `@/app/lib/serverAuth`(`getCurrentUserId(): Promise<string | null>`), `@/app/lib/prismaError`(`isDatabaseConnectionError(e): boolean`), `@prisma/client`(`Prisma` 타입).
- Produces: `GET /api/search?q=<string>` → `200 JSON`
  - `SearchItem = { id: string; title: string; url: string; isSecret?: boolean }`
  - `SearchResponse = { blog: SearchItem[]; docs: SearchItem[]; help: SearchItem[]; boards: SearchItem[] }`
  - `q.trim().length < 2` → 모든 그룹 빈 배열. DB 연결 오류 → 빈 배열(200).

- [ ] **Step 1: 라우트 파일 생성 (전체 코드)**

Create `app/api/search/route.ts`:

```ts
import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/app/lib/prisma'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { isDatabaseConnectionError } from '@/app/lib/prismaError'

export const runtime = 'nodejs'

const MAX_PER_GROUP = 5
const MIN_QUERY_LEN = 2

type SearchItem = {
  id: string
  title: string
  url: string
  isSecret?: boolean
}

type SearchResponse = {
  blog: SearchItem[]
  docs: SearchItem[]
  help: SearchItem[]
  boards: SearchItem[]
}

const EMPTY: SearchResponse = { blog: [], docs: [], help: [], boards: [] }

export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  if (q.length < MIN_QUERY_LEN) {
    return NextResponse.json(EMPTY)
  }

  const title: Prisma.StringFilter = { contains: q, mode: 'insensitive' }

  try {
    const userId = await getCurrentUserId()

    const [blogRows, docsRows, helpRows, boardRows] = await Promise.all([
      prisma.post.findMany({
        where: { board: { type: 'BLOG' }, status: 'DONE', title },
        orderBy: { createdAt: 'desc' },
        take: MAX_PER_GROUP,
        select: { id: true, title: true, isSecret: true },
      }),
      prisma.post.findMany({
        where: { board: { type: 'DOCS' }, status: 'DONE', title },
        orderBy: { createdAt: 'desc' },
        take: MAX_PER_GROUP,
        select: { id: true, title: true, isSecret: true },
      }),
      prisma.post.findMany({
        where: { board: { type: 'HELP' }, title },
        orderBy: { createdAt: 'desc' },
        take: MAX_PER_GROUP,
        select: { id: true, title: true },
      }),
      userId
        ? prisma.post.findMany({
            where: { board: { type: 'GENERAL', ownerId: userId }, title },
            orderBy: { createdAt: 'desc' },
            take: MAX_PER_GROUP,
            select: { id: true, title: true, isSecret: true, boardId: true },
          })
        : Promise.resolve([] as { id: string; title: string; isSecret: boolean; boardId: string }[]),
    ])

    const result: SearchResponse = {
      blog: blogRows.map((p) => ({
        id: p.id,
        title: p.title,
        url: `/blog/${encodeURIComponent(p.id)}`,
        isSecret: p.isSecret,
      })),
      docs: docsRows.map((p) => ({
        id: p.id,
        title: p.title,
        url: `/docs/${encodeURIComponent(p.id)}`,
        isSecret: p.isSecret,
      })),
      help: helpRows.map((p) => ({
        id: p.id,
        title: p.title,
        url: `/help/${encodeURIComponent(p.id)}`,
      })),
      boards: boardRows.map((p) => ({
        id: p.id,
        title: p.title,
        url: `/boards/${encodeURIComponent(p.boardId)}/${encodeURIComponent(p.id)}`,
        isSecret: p.isSecret,
      })),
    }

    return NextResponse.json(result)
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      console.error('[SEARCH_DB_UNAVAILABLE]', error)
      return NextResponse.json(EMPTY)
    }
    throw error
  }
}
```

- [ ] **Step 2: Lint + 타입 검사**

Run: `npm run lint`
Expected: 새 파일에 대한 에러/경고 없음.

Run: `npx tsc --noEmit`
Expected: 타입 에러 없음. (특히 `Prisma.StringFilter`, `board.type`/`ownerId` where절, `select` 필드가 스키마와 일치.)

- [ ] **Step 3: 수동 스모크 — 보안 불변식 확인**

개발 서버(`npm run dev`)가 떠 있는 상태에서:

1. `q` 최소 길이: `curl -s 'http://localhost:3000/api/search?q=a'` → `{"blog":[],"docs":[],"help":[],"boards":[]}` (2자 미만).
2. 공개 표면(비로그인, 쿠키 없이): `curl -s 'http://localhost:3000/api/search?q=<존재하는_블로그제목일부>'` → `blog`에 결과, 각 항목에 `contentMd` **없음**, `url`이 `/blog/{id}`.
3. 게시판 격리: 비로그인 요청에서 `boards`는 항상 `[]`. (로그인 쿠키로 요청 시 본인 GENERAL 보드 글만 등장.)
4. 응답 JSON을 눈으로 확인: 어떤 항목에도 `contentMd`/`secretPasswordHash` 등 본문·해시 필드가 없어야 한다.

- [ ] **Step 4: 커밋**

```bash
git add app/api/search/route.ts
git commit -m "✨ ⌘K 팔레트 — 통합 제목 검색 API(/api/search) 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 팔레트 컴포넌트 + 마운트

**Files:**
- Create: `app/components/CommandPalette.tsx`
- Modify: `app/layout.tsx` (Providers 내부에 `<CommandPalette/>` 마운트)

**Interfaces:**
- Consumes: Task 1의 `GET /api/search`(`SearchResponse`), 기존 `GET /api/permission`(`{ key,label,path,... }[]`), `next/navigation`(`useRouter`), `next-auth/react`(`useSession`).
- Produces:
  - `export default function CommandPalette()` — 전역 모달(닫힘 시 `null` 렌더).
  - `export const OPEN_EVENT = 'leesh:open-command-palette'` — 이 이름의 `window` `CustomEvent`를 dispatch하면 팔레트가 열린다.
  - `export function CommandPaletteTrigger({ className? }: { className?: string })` — `OPEN_EVENT`를 dispatch하는 버튼(Task 3에서 사용).

- [ ] **Step 1: 컴포넌트 생성 (전체 코드)**

Create `app/components/CommandPalette.tsx`:

```tsx
'use client'

import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

export const OPEN_EVENT = 'leesh:open-command-palette'

type NavItem = { key: string; label: string; path: string }
type SearchItem = { id: string; title: string; url: string; isSecret?: boolean }
type SearchResponse = {
  blog: SearchItem[]
  docs: SearchItem[]
  help: SearchItem[]
  boards: SearchItem[]
}

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
          const data = (await r.json()) as { key: string; label: string; path: string }[]
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
    const q = query.trim()
    if (q.length < 2) {
      setResults(EMPTY_RESULTS)
      setLoading(false)
      setSearchFailed(false)
      return undefined
    }
    setLoading(true)
    const controller = new AbortController()
    const id = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
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
        (n) => !q || n.label.toLowerCase().includes(q) || n.path.toLowerCase().includes(q)
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
    setActiveIndex((i) => (flatUrls.length === 0 ? 0 : Math.min(i, flatUrls.length - 1)))
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
      setActiveIndex((i) => (flatUrls.length ? (i - 1 + flatUrls.length) % flatUrls.length : 0))
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
              <div className="px-1 py-1 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
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
                <div className="px-1 py-1 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
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
```

- [ ] **Step 2: 레이아웃에 마운트**

Modify `app/layout.tsx` — import 추가(다른 컴포넌트 import들과 함께):

```tsx
import CommandPalette from './components/CommandPalette'
```

그리고 `<Providers>` 내부, `<GlobalTopRightControls />` 바로 다음 줄에 추가:

```tsx
          <GlobalTopRightControls />
          <CommandPalette />
          <AppShell>{children}</AppShell>
```

- [ ] **Step 3: Lint + 타입 검사**

Run: `npm run lint`
Expected: 새 파일/수정 파일에 에러 없음.

Run: `npx tsc --noEmit`
Expected: 타입 에러 없음.

- [ ] **Step 4: 빌드**

Run: `npm run build`
Expected: 성공(타입·컴파일 통과).

- [ ] **Step 5: 수동 스모크**

`npm run dev` 후 아무 페이지에서:
1. `⌘K`(mac) / `Ctrl+K`(win) → 팔레트 열림, 입력창 자동 포커스. 다시 누르면 닫힘. `Esc` 닫힘.
2. 빈 입력 → “이동” 섹션에 메뉴 전체 표시. `↑`/`↓`로 활성 항목 이동(순환), `Enter`로 해당 페이지 이동 후 팔레트 닫힘.
3. 2자 이상 입력(존재하는 블로그/Docs/고객센터 제목 일부) → 해당 그룹에 결과, 클릭/Enter로 상세 이동.
4. 비로그인 상태 → 로그인 필요 메뉴가 “이동” 목록에 없음, `게시판` 그룹 결과 없음, “로그인/회원가입” 항목 표시.
5. 열려 있는 동안 배경 스크롤 잠김, 닫으면 복원.

- [ ] **Step 6: 커밋**

```bash
git add app/components/CommandPalette.tsx app/layout.tsx
git commit -m "✨ ⌘K 팔레트 — 커맨드 팔레트 컴포넌트 + 전역 마운트

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 트리거 버튼 (데스크톱 + 모바일)

**Files:**
- Modify: `app/components/GlobalTopRightControls.tsx` (데스크톱 상단 우측)
- Modify: `app/components/AppShell.tsx` (모바일 상단바 `ml-auto` 그룹)

**Interfaces:**
- Consumes: Task 2의 `CommandPaletteTrigger`(`@/app/components/CommandPalette`).
- Produces: 사용자에게 보이는 검색 진입점 2곳(데스크톱·모바일). 클릭 시 `OPEN_EVENT` dispatch → 팔레트 열림.

- [ ] **Step 1: 데스크톱 트리거 추가**

Modify `app/components/GlobalTopRightControls.tsx` — 전체를 아래로 교체:

```tsx
'use client'

import ThemeToggle from './ThemeToggle'
import { CommandPaletteTrigger } from './CommandPalette'

export default function GlobalTopRightControls() {
  return (
    <div className="fixed right-3 top-3 z-50 hidden lg:flex lg:items-center lg:gap-2 sm:right-4 sm:top-4">
      <CommandPaletteTrigger />
      <ThemeToggle />
    </div>
  )
}
```

- [ ] **Step 2: 모바일 트리거 추가**

Modify `app/components/AppShell.tsx` — import 추가(기존 import들과 함께):

```tsx
import { CommandPaletteTrigger } from './CommandPalette'
```

모바일 상단바의 `ml-auto` 그룹(현재 `<ThemeToggle />`만 있음)을 아래로 교체:

```tsx
            <div className="ml-auto flex items-center gap-2">
              <CommandPaletteTrigger />
              <ThemeToggle />
            </div>
```

- [ ] **Step 3: Lint + 타입 검사**

Run: `npm run lint`
Expected: 에러 없음.

Run: `npx tsc --noEmit`
Expected: 타입 에러 없음.

- [ ] **Step 4: 수동 스모크**

`npm run dev` 후:
1. 데스크톱(lg+) 우상단에 🔍 버튼 → 클릭 시 팔레트 열림.
2. 모바일 폭(창 좁히기)에서 상단바 우측(테마토글 옆)에 🔍 버튼 → 클릭 시 팔레트 열림.
3. 두 버튼 모두 `⌘K`와 동일한 팔레트를 연다.

- [ ] **Step 5: 커밋**

```bash
git add app/components/GlobalTopRightControls.tsx app/components/AppShell.tsx
git commit -m "✨ ⌘K 팔레트 — 데스크톱/모바일 트리거 버튼 연결

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 검증 요약 (전체 완료 후)

- `npm run lint` + `npm run build` 통과.
- 스펙 §10 수동 스모크 4종: 열기/키보드/이동 · 비로그인 격리 · 콘텐츠 이동 · DB다운 soft-fail.
- 보안 불변식(§6): 검색 응답에 본문/해시 없음, 게시판은 로그인+본인 소유만.

## 스펙 대비 커버리지

| 스펙 항목 | 담당 태스크 |
| --- | --- |
| §4 UX(열기/닫기·레이아웃·결과 그룹·빈 쿼리·키보드·a11y) | Task 2 |
| §5.1 CommandPalette 컴포넌트 | Task 2 |
| §5.2 `/api/search` | Task 1 |
| §5.3 layout 마운트 | Task 2 |
| §5.4 트리거 버튼(데스크톱+모바일로 확장) | Task 3 |
| §3·§6 노출/보안 불변식 | Task 1(서버), Task 2(표시만) |
| §7 에러/엣지(DB다운·디바운스·abort·0건·비로그인) | Task 1(DB), Task 2(클라) |
