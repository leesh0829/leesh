# 프론트엔드 & UI 디자인 시스템

`Leesh`의 디자인 시스템(`app/globals.css`의 테마 토큰 + 재사용 유틸 클래스)과 `app/components/`의 19개 공용 컴포넌트, 그리고 테마 토글 메커니즘과 키보드/스크롤 기반 이스터에그 이펙트를 정리한 권위 레퍼런스입니다.

> 작성 기준: 2026-06-24, `dev` 브랜치

관련 문서: [architecture.md](architecture.md) · [feature-content.md](feature-content.md) · [feature-misc.md](feature-misc.md) · [lib-reference.md](lib-reference.md)

---

## 1. 디자인 시스템 개요

스타일은 전부 Tailwind v4 + 단일 글로벌 시트 `app/globals.css`(약 2,660줄)로 구성됩니다. 별도 CSS-in-JS나 컴포넌트 라이브러리는 사용하지 않습니다.

- `app/globals.css:1` — `@import 'tailwindcss';`
- `app/globals.css:2` — `@custom-variant dark (&:where(.dark, .dark *));` : `.dark` 클래스 하위에서 Tailwind `dark:` variant가 동작하도록 커스텀 정의. (테마는 `data-theme` 속성 + `.dark` 클래스 이중으로 적용됨)
- "Aurora Glass" 테마: glassmorphism(반투명 `--card` + `backdrop-filter: blur`) 위에 보라/시안 계열 그라데이션 오로라 배경(`body` 배경의 3중 `radial-gradient`, `app/globals.css:149`).
- 폰트는 `next/font/google`의 Geist / Geist Mono를 CSS 변수(`--font-geist-sans`, `--font-geist-mono`)로 주입(`app/layout.tsx:17`), `@theme inline`에서 Tailwind `--font-sans`/`--font-mono`에 연결(`app/globals.css:30`).

### 1.1 전역 레이아웃 가드 (모바일 가로 스크롤 방지)

`@layer base`에 여러 방어 규칙이 있습니다.

| 규칙 | 위치 | 목적 |
| --- | --- | --- |
| `html, body { overflow-x: clip; max-width: 100vw }` | `app/globals.css:122` | 긴 콘텐츠가 페이지를 가로로 밀어내는 현상 차단. `clip`은 새 스크롤 컨테이너를 안 만들어 `sticky` 호환, 미지원 환경은 `hidden` 폴백 |
| `.app-scroll-container { overflow-x: clip }` | `app/globals.css:132` | AppShell 실제 스크롤 컨테이너에서 한 번 더 클립 |
| `:where(.grid) > *, :where([class*='flex']) > * { min-width: 0 }` | `app/globals.css:141` | grid/flex 자식의 기본 `min-width:auto`로 인한 truncation gotcha를 specificity 0으로 광범위 차단 |
| `* { outline: none; border-color: var(--border) }` | `app/globals.css:113` | 기본 보더 색을 토큰으로 통일 |

---

## 2. 테마 토큰 (CSS 변수)

토큰은 `:root`(기본=light), `@media (prefers-color-scheme: dark)`, 그리고 수동 오버라이드 `:root[data-theme='light']` / `:root[data-theme='dark']` 세 곳에 정의됩니다. 수동(`data-theme`)이 시스템 설정보다 우선합니다.

| 변수 | 용도 | Light | Dark |
| --- | --- | --- | --- |
| `--bg` | 페이지 배경 베이스 | `#f7f8fb` | `#060712` |
| `--fg` | 기본 전경(텍스트) | `#0b1020` | `#e7e9f3` |
| `--muted` | 보조 텍스트 | `#5b647a` | `#a8b0c7` |
| `--card` | 카드/surface 배경(반투명) | `rgba(255,255,255,0.72)` | `rgba(18,20,36,0.6)` |
| `--border` | 테두리 | `rgba(11,16,32,0.12)` | `rgba(231,233,243,0.14)` |
| `--ring` | focus ring / 강조 배경 | `rgba(109,90,255,0.25)` | `rgba(109,90,255,0.22)` |
| `--accent` | 주 강조색(보라) | `#6d5aff` | `#8c7bff` |
| `--accent2` | 보조 강조색(시안) | `#26c6ff` | `#32d1ff` |
| `--accent-foreground` | 강조 위 글자색 | `#ffffff` | `#070813` |
| `--code-block-bg` | 코드블록 배경 | `#edf2fb` | `rgba(8,12,28,0.92)` |
| `--code-block-border` | 코드블록 테두리 | `rgba(72,85,122,0.18)` | `rgba(148,163,184,0.3)` |
| `--code-block-fg` | 코드블록 기본 글자 | `#25324a` | `#dbe4ff` |
| `--code-comment` | hljs 주석 | `#72819f` | `#8ea0bf` |
| `--code-keyword` | hljs 키워드 | `#c65d48` | `#ff8a65` |
| `--code-string` | hljs 문자열 | `#347a52` | `#a5d6a7` |
| `--code-number` | hljs 숫자/메타 | `#9a6b08` | `#ffd54f` |
| `--code-function` | hljs 함수 | `#2b6cb0` | `#81d4fa` |
| `--radius` | 기본 반경(`:root`만) | `16px` | `16px` |
| `--shadow` | 기본 그림자 | `0 10px 30px rgba(11,16,32,0.08)` | `0 10px 30px rgba(0,0,0,0.25)` |

> `--radius`/일부 토큰은 `:root`(`app/globals.css:5`)에만 선언되고 light/dark 블록에서 상속됩니다. 버튼/인풋은 `calc(var(--radius) - 8px)`, nav-link는 `calc(var(--radius) - 10px)` 식으로 파생 반경을 씁니다.

---

## 3. 테마 토글 메커니즘

테마는 `localStorage('leesh-theme')`와 쿠키(`leesh-theme`) 두 곳에 저장되고, `<html>`의 `data-theme` 속성 + `.dark` 클래스로 적용됩니다.

### 3.1 SSR 초기값 + FOUC 방지

1. **서버**: `RootLayout`이 쿠키를 읽어 `<html data-theme=... className={'dark'?}>`로 초기 렌더(`app/layout.tsx:54`). 쿠키 없으면 `'light'`.
2. **클라이언트(beforeInteractive)**: `next/script`의 인라인 스크립트가 hydration 전에 실행되어 `localStorage` > 쿠키 > 서버초기값 순으로 최종 테마를 해석하고 `data-theme`/`.dark`를 재설정 + 양쪽 저장소 동기화(`app/layout.tsx:68`). `suppressHydrationWarning`으로 속성 불일치 경고 억제.

```text
우선순위: localStorage('leesh-theme') → cookie('leesh-theme') → SSR initialTheme('light')
저장 위치: data-theme 속성 + (dark면) .dark 클래스 / localStorage / cookie(max-age 1년, samesite=lax, https면 secure)
```

### 3.2 런타임 토글 — `ThemeToggle`

- `app/components/ThemeToggle.tsx`: 9×9 정사각 `btn btn-outline` 버튼. 클릭 시 light↔dark 토글하며 `applyTheme()`(`app/components/ThemeToggle.tsx:23`)로 `data-theme`/`.dark`를 바꾸고 localStorage+쿠키에 기록. 다크일 때 sun 아이콘, 라이트일 때 moon 아이콘 SVG 표시.
- mount 시 `useEffect`에서 저장값을 다시 해석해 state/DOM/저장소를 일치시킴(`app/components/ThemeToggle.tsx:31`).

### 3.3 배치

- 데스크톱: `GlobalTopRightControls`가 우상단 고정(`fixed right-3 top-3 z-50 hidden lg:flex`)으로 `ThemeToggle` 렌더(`app/components/GlobalTopRightControls.tsx`).
- 모바일: AppShell 상단 바 우측에 `ThemeToggle` 직접 배치(`app/components/AppShell.tsx:151`).

---

## 4. 재사용 유틸 클래스 (`@layer components`)

`@layer components` 블록(`app/globals.css:189`~)에 정의된 핵심 클래스. Tailwind `@apply`와 토큰을 조합합니다.

### 4.1 레이아웃 · 표면

| 클래스 | 정의 위치 | 핵심 |
| --- | --- | --- |
| `container-page` | `:190` | `mx-auto w-full max-w-6xl px-3 sm:px-4 lg:px-10` — 표준 본문 폭 |
| `surface` | `:194` | `var(--card)` 배경 + 보더 + `--radius` + `--shadow` + `backdrop-filter: blur(10px)`, `min-width:0; max-width:100%` |
| `card` | `:205` | `surface`와 동일 스펙(별칭 격) |
| `card-pad` | `:215` | `p-3 sm:p-4 lg:p-6` — 카드 내부 패딩 |
| `card-hover-border-only` | `:2378` | hover 시 그라데이션 하이라이트 없이 테두리/리프트만 반응(`translateY(-2px)`, 보더 보라, 그림자). `/leesh` 페이지·미니게임용 |

### 4.2 버튼

| 클래스 | 정의 위치 | 핵심 |
| --- | --- | --- |
| `btn` | `:219` | `inline-flex items-center justify-center gap-2`, 반응형 패딩, `text-sm font-medium`, 반경 `calc(--radius - 8px)`, 보더, 투명 배경, `white-space:nowrap; word-break:keep-all`. `:active`에서 `scale(0.99)` |
| `btn-primary` | `:237` | 보더 없음, 연보라 배경(`#ddd9ff`), 글자 `#2b2750`, 보라 그림자. hover 시 `#d3cdff` |
| `btn-outline` | `:252` | 투명 배경(보더는 `.btn` 상속) |
| `btn-ghost` | `:256` | 보더/배경 모두 없음 |

> 다크 테마에서 `btn-primary`/`nav-link-active`는 별도 오버라이드(`app/globals.css:325`)로 `#c8bfff` 배경 + 진한 글자.

### 4.3 폼

| 클래스 | 정의 위치 | 핵심 |
| --- | --- | --- |
| `input` / `select` / `textarea` | `:261` | `w-full px-3 py-1.5 sm:py-2 text-sm`, 반경 `calc(--radius - 8px)`, 보더, 투명 배경 |
| `textarea` | `:286` | 추가 `min-h-28` |
| focus-visible | `:280` | `box-shadow: 0 0 0 6px var(--ring)` — 6px 링 |
| `select option/optgroup` | `:272` | OS 팝업 가독성 위해 글자 `#111827` / 배경 `#ffffff` 강제(다크모드 흰글+흰배경 방지) |

### 4.4 배지 · 내비

| 클래스 | 정의 위치 | 핵심 |
| --- | --- | --- |
| `badge` | `:290` | `inline-flex rounded-full px-2 py-0.5 text-xs`, 보더, `color: var(--muted)` |
| `nav-link` | `:297` | `block px-3 py-2 text-sm`, 반경 `calc(--radius - 10px)`. non-active hover 시 옅은 배경 |
| `nav-link-active` | `:308` | 연보라 배경(`#ddd9ff`) + 진한 글자 + 보라 그림자(현재 메뉴 강조) |

### 4.5 호버 인터랙션 (`@media (hover: hover) and (pointer: fine)`)

`app/globals.css:2300`에서 `card`/`surface`/`btn`/`nav-link`에 공통 hover 연출 부여:

- `::after` 의사요소에 보라→시안 대각 그라데이션을 깔고 hover 시 `opacity:0.95 + translateY(0)`로 떠오르게 함(`:2315`).
- `card`/`surface` hover: `translateY(-2px)` + 보더 보라 + 강한 그림자. `btn`/`nav-link` hover: `translateY(-1px)`.
- `card-hover-border-only`, `.leesh-page` 카드, `.mini-arcade` surface는 이 `::after` 하이라이트를 `opacity:0`으로 끔(`:2368`, `:2396`, `:2404`).

### 4.6 마크다운 (`markdown-body`)

`app/globals.css:339`~ 약 200줄. react-markdown 렌더 출력 스타일링. (에디터/미리보기는 [MarkdownEditor](#markdowneditor), 발행 렌더는 [feature-content.md](feature-content.md) 참조.)

- 본문: `text-base leading-8`, `overflow-wrap:anywhere; word-break:keep-all`(한국어 줄바꿈).
- 제목 h1~h6: `font-semibold tracking-tight` + 단계별 크기/마진(`:355`).
- 링크: `var(--accent)` + 반투명 밑줄(`:417`). blockquote: 좌측 보라 보더 + 옅은 보라 배경(`:431`).
- 인라인 code: 둥근 보더 박스(`:438`). `pre`: `overflow-x-auto rounded-xl p-4`, 코드블록 토큰 색(`:447`).
- **highlight.js 토큰 매핑**(`:459`~): `.hljs-*` 클래스를 `--code-comment/keyword/string/number/function` 토큰에 `!important`로 매핑.
- 표(`table`/`thead`/`th`/`td`)·이미지(`img max-width:100%`) 스타일 포함(`:518`, `:537`).

### 4.7 로딩 · 스켈레톤 · 애니메이션 유틸

| 클래스 | 정의 위치 | 동작 |
| --- | --- | --- |
| `loading-orbit` | `:544` | 56px conic-gradient 스피너(`leesh-orbit-spin` 0.95s). `app/loading.tsx`에서 사용 |
| `loading-dots` | `:569` | 3점 바운스(`leesh-dot-bounce`, 0.15s 간격 stagger) |
| `route-fade-enter` | `:591` | 라우트 전환 시 페이드인(`leesh-route-fade-enter` 180ms). AppShell이 `key={pathname}`로 부여(`app/components/AppShell.tsx:198`) |
| `stagger-in` | `:596` | 자식 1~10번째 순차 등장(30ms씩 지연) |
| `modal-enter` | `:633` | 모달 등장(`leesh-modal-enter` 170ms) |
| `skeleton` | `:637` | `--fg` 92% 투명 배경 + `::after` shimmer(`leesh-shimmer` 1.35s). 둥근 반경 상속 |
| `toast-enter` / `toast-exit` | `:658` | 토스트 등장/퇴장(`leesh-toast-in` 220ms / `leesh-toast-out` 180ms) |
| `calendar-bar-enter` | `:666` | 캘린더 바 등장(120ms) |
| `daily-quest-card` / `daily-luck-card` | `:670`~ | 일일 카드 전용 컨테이너 스타일(보더/그림자/`::before` 광택) |

> 키프레임은 모두 `leesh-` 프리픽스(`app/globals.css:1607`~). 모든 모션은 `@media (prefers-reduced-motion: reduce)`(`:2536`)에서 광범위하게 비활성화됩니다(아래 [§7.3](#73-접근성--prefers-reduced-motion)).

---

## 5. 컴포넌트 카탈로그 (19개)

`app/components/`의 모든 공용 컴포넌트. 크게 **레이아웃/셸**, **콘텐츠/차트 유틸**, **이펙트(이스터에그)** 로 나뉩니다.

### 5.1 레이아웃 · 셸

#### `Providers`
- `app/components/Providers.tsx` — `'use client'`. `SessionProvider`(NextAuth) > `ToastProvider`로 children을 감싸는 전역 컨텍스트 루트. `RootLayout`이 최상위에서 사용(`app/layout.tsx:101`).
- props: `{ children }`.

#### `AppShell`
- `app/components/AppShell.tsx:22` — `'use client'`. 라우트별로 다른 외곽 레이아웃을 렌더하는 셸.
- props: `{ children }`.
- 경로 분기(`usePathname`):
  - `noShell`(`/login`, `/sign-up`): 사이드바 없이 children + Footer만(`:66`).
  - `isLeeshPage`(`/leesh*`): 좌상단 "메인으로" 홈 아이콘 버튼 + children + Footer(`:75`).
  - 그 외(기본): `Sidebar` + 스크롤 컨테이너 + 모바일 상단바/하단 내비 + Footer(`:120`).
- 레이아웃 폭: `isWideLayout`(블로그/Docs/게시판 상세, `/calendar`, `/todos`, `/ledger`)는 풀폭, 나머지는 `container-page`(`:48`, `:191`).
- 상세 페이지(`/blog/:slug`, `/docs/:slug`)면 "← 목록" 복귀 버튼 노출(`detailListHref`, `:58`).
- 사이드바 상태: 모바일 `open`(오버레이), 데스크톱 `desktopOpen`(접기/펴기, 닫혔을 때 좌측 끝 hover로 재오픈 trigger, `:158`).
- 모바일 하단 고정 내비: 대시/블로그/보드/캘린더/TODO 5개 `btn btn-ghost`(`:206`).

#### `Sidebar`
- `app/components/Sidebar.tsx:76` — `'use client'`.
- props: `{ open, onClose, desktopOpen, onToggleDesktop }`(`:10`).
- **메뉴 권한 연동**: mount 시 `GET /api/permission`을 호출해 메뉴 목록(`Perm[]`: key/label/path/requireLogin/minRole/visible)을 받아(`:89`), `visible` && (`requireLogin`이면 로그인) 필터 후 `SIDEBAR_ORDER`(`:28`) 순서로 정렬해 렌더. API 실패/빈 응답 시 하드코딩 fallback 메뉴 사용(`:108`). 권한 모델은 [auth-permissions.md](auth-permissions.md) 참조.
- active 판정: `pathname === href || (href!=='/' && pathname.startsWith(href))`(`:344`).
- 계정 카드: `displayUserLabel`(`app/lib/userLabel.ts`)로 이름/이메일 표시, 로그인 상태에 따라 로그아웃 / 로그인·회원가입 버튼(`:353`).
- 하단 3버튼: 미니게임 토글(`mode: 'menu'|'game'` → `MiniGameClient`), 외부 "펭 레스토랑" 링크, 업데이트 내역 모달(`showUpdates`)(`:389`).
- 반응형: 모바일 오버레이(`translate-x` 슬라이드) / 데스크톱 sticky(`lg:w-64`↔`lg:w-0` 폭 전환)(`:260`).

#### `Footer`
- `app/components/Footer.tsx` — `'use client'`. `surface` 박스 안에 `© {year} Leesh.` 표기. 중앙 텍스트에 `data-inversion-trigger="true"` 부여 → 5연타 시 [InversionMode](#63-inversionmode) 트리거(`:15`).

#### `GlobalTopRightControls`
- `app/components/GlobalTopRightControls.tsx` — `'use client'`. 데스크톱 우상단 고정 컨테이너에서 `ThemeToggle` 렌더.

#### `ThemeToggle`
- `app/components/ThemeToggle.tsx` — 위 [§3.2](#32-런타임-토글--themetoggle) 참조.

### 5.2 콘텐츠 · 내비 · 차트 유틸

#### `MarkdownEditor`
- `app/components/MarkdownEditor.tsx:87` — `'use client'`. Write/Preview 2탭 마크다운 에디터.
- props: `{ value, onChange, placeholder?, rows=12, disabled?, className?, previewEmptyText?, htmlMode? }`(`:15`).
- `htmlMode: 'off' | 'safe' | 'raw'`(`:13`)로 rehype 파이프라인 결정(`:98`):
  - `off`: `[rehypeHighlight]`
  - `safe`: `[rehypeRaw, [rehypeSanitize, sanitizedMarkdownSchema], rehypeHighlight]`
  - `raw`: `[rehypeRaw, rehypeHighlight]`
- remark: `[remarkGfm, remarkBreaks]`(`:150`). 미리보기는 `markdown-body` 클래스로 렌더. 커스텀 `img`(빈 src 제거)·`pre`·`code` 컴포넌트 매핑(`:26`). 살균 스키마는 `app/lib/markdown` 참조([lib-reference.md](lib-reference.md)).

#### `PageNavIcons`
- `app/components/PageNavIcons.tsx` — 서버 컴포넌트(`'use client'` 없음). 페이지 상단 아이콘 내비 버튼 3종을 named export.
  - `NavBack({ href, label='목록' })` — ← 화살표(`:80`)
  - `NavCreate({ href, label='새로 작성', variant='primary' })` — + 아이콘(`:89`)
  - `NavEdit({ href, label='수정' })` — 연필 아이콘(`:106`)
- 내부 `NavButton`이 `btn btn-{variant}` + `aria-label`/`title` + `sr-only` 라벨로 렌더(`:55`). 블로그/Docs/게시판/고객센터/가계부 전반에서 사용(다수 `*Client.tsx`).

#### `SectionTocClient`
- `app/components/SectionTocClient.tsx:11` — `'use client'`. 문서 우측 목차(TOC) aside.
- props: `{ headings: TocHeading[], title='목차' }`. `TocHeading = { id, text, level }`(`:5`).
- `IntersectionObserver`(`rootMargin: -45% 0 -45% 0`)로 화면 중앙 근처 heading을 active로 추적(`:39`), active 변경 시 TOC 항목을 컨테이너 중앙으로 자동 스크롤(`scrollTocItemToCenter`, `:60`). 클릭 시 대상 heading으로 smooth scroll. `level`에 따라 들여쓰기(`paddingLeft: 8+(level-1)*12`). `BlogTocClient`/게시판 `PostDetailClient`에서 사용.

#### `ChartTooltip` (+ `useChartHover`)
- `app/components/ChartTooltip.tsx` — `'use client'`. SVG 차트용 마우스 추종 툴팁.
- `useChartHover<T>()` 훅(`:25`): `{ ref, pos, hovered, onMove, onLeave, show }` 반환. 컨테이너 `ref`에 `onMouseMove={onMove}`, SVG 요소에 `onMouseEnter={()=>show(item)}` 식으로 연결.
- `ChartTooltip({ pos, visible, children })`(`:51`): 마우스 좌표 +12px 오프셋 절대 위치, `var(--card)` 배경 + `backdrop-filter: blur(6px)`, `max-width:240`. 가계부 `DonutChart`·`StatsClient`에서 사용([feature-ledger.md](feature-ledger.md)).

### 5.3 토스트 — `ToastProvider` & `useToast`

- `app/components/ToastProvider.tsx` — `'use client'`. 우상단 토스트 스택을 컨텍스트로 제공. `Providers`에서 전역 마운트.
- **`useToast()` API**(`:114`): `ToastProvider` 밖에서 호출 시 throw. 반환 객체:

| 메서드 | 시그니처 | 톤 |
| --- | --- | --- |
| `show` | `(message, tone?) => void` | 기본 `'info'` |
| `success` | `(message) => void` | `'success'` (emerald) |
| `error` | `(message) => void` | `'error'` (rose) |
| `info` | `(message) => void` | `'info'` (sky) |

- 동작: 빈 메시지 무시, 자동 ID 증가, 표시 후 2,600ms에 자동 dismiss → `exiting` 플래그로 `toast-exit` 애니메이션 후 180ms에 제거(`:55`, `:75`).
- 톤별 색상은 라이트/다크 각각 Tailwind 클래스로 분리(`toneClass`, `:32`). 컨테이너는 `pointer-events-none fixed right-3 top-3 z-[90]`(`:95`).

---

## 6. 재미요소 / 이펙트 컴포넌트 (이스터에그)

헤드리스 이펙트(`TitlePrank`/`DotMode`/`HeadingHackEffect`/`InversionMode`/`ScrollSummonEffect`)는 `RootLayout`에서 `AppShell`보다 바깥, `app-physics-layer` div 앞의 형제로 마운트됩니다(`app/layout.tsx:102`~`106`). `WorldBossButton`만 `app-physics-layer` div 안에 있습니다(`app/layout.tsx:108`). 표 하단의 `DailyLuckCard`/`DailyQuestCard`는 예외로 홈 페이지(`app/page.tsx:79`/`78`)에 직접 마운트됩니다. 대부분 DOM만 조작하고 `return null`인 헤드리스 컴포넌트이며, `WorldBossButton`·`ScrollSummonEffect`·일일 카드는 가시 UI를 가집니다. 모든 키 시퀀스는 입력 필드(`input`/`textarea`/`select`/contenteditable) 포커스 중에는 무시됩니다(`isEditableTarget`, `DotMode`·`HeadingHackEffect`에 적용).

| 컴포넌트 | 트리거 | 효과 |
| --- | --- | --- |
| `DotMode` | 키 `d→o→t` 2.2초 내 | 도트(픽셀) 모드 토글 |
| `HeadingHackEffect` | 키 `h→a→c→k` 2.4초 내 | 제목 텍스트 글리치 스크램블 |
| `InversionMode` | `data-inversion-trigger` 요소 5연타(4.2초 내) | UI 텍스트 무작위 치환(6.8초) |
| `TitlePrank` | 탭 숨김/복귀(visibilitychange) | 브라우저 탭 제목 변조 |
| `WorldBossButton` | 10분 주기 0.8% 확률 출현 → 클릭 | 풀스크린 "월드 보스 레이드" 연출 |
| `ScrollSummonEffect` | 페이지 끝에서 오버스크롤 누적 ≥ 8000 | 카드 클론 소환/낙하 물리 연출 |
| `DailyLuckCard` | 홈에 상시 표시 | 날짜 시드 기반 "오늘의 행운" |
| `DailyQuestCard` | 홈에 상시 표시 | 일일 랜덤 퀘스트 + 연속 달성 |

### 6.1 DotMode
- `app/components/DotMode.tsx`. 키 시퀀스 `'dot'`을 2.2초 윈도우 안에 입력하면 `<html>`에 `dot-mode-active` 클래스 토글(`:55`). 비알파벳/조합키 입력 시 시퀀스 리셋. 언마운트 시 클래스 제거.
- 스타일은 `html.dot-mode-active ...`(`app/globals.css:1095`~): body에 픽셀 패턴 오버레이(`::before`/`::after`), surface/card/btn/badge/input 등을 `image-rendering: pixelated` 느낌의 도트 룩으로 변환, 제목/카드 색 강조.

### 6.2 HeadingHackEffect
- `app/components/HeadingHackEffect.tsx`. 시퀀스 `'hack'` 입력 시 `triggerHack()`(`:136`).
- 화면에 보이는(`isVisible`) h1/h2/h3 및 굵은 대형 텍스트(`TARGET_SELECTOR`, `:16`) 중 **단일 텍스트 노드**(`getSingleTextNode`)이고 길이 2~42자인 것만 대상화. 각 타깃을 `CHAR_POOL`(`A-Z0-9#$%&*?/`) 무작위 문자로 채운 뒤 `requestAnimationFrame` 루프(`tick`)에서 progress에 따라 점진적으로 원문을 복원(`scrambleText`, `:78`). duration 720~1240ms + 0~220ms stagger. 복원 후 원문 텍스트 노드로 되돌림.

### 6.3 InversionMode
- `app/components/InversionMode.tsx`. `data-inversion-trigger="true"` 요소(현재 Footer 카피라이트, `app/components/Footer.tsx:15`)를 4.2초 내 5번 클릭하면 `activate()`(`:167`). React 19 `useEffectEvent` 사용.
- 보이는 `.nav-link`/`.btn`/`.badge`/h1~h3 등(`TARGET_SELECTOR`, `:17`) 중 단일 텍스트 노드를 최대 20개 셔플 선택(`:170`), 길이≤34자면 길이 8 기준으로 `SHORT_PHRASES`/`LONG_PHRASES`(개발자 농담 모음, `:29`/`:60`) 무작위 문구로 치환. `<html>`에 `ui-inversion-active` 추가, 6.8초(`ACTIVE_MS`) 후 원복(`:203`). `data-inversion-ignore="true"` 하위 요소는 제외. 배너 애니메이션 `leesh-inversion-banner`(`app/globals.css:1071`).

### 6.4 TitlePrank
- `app/components/TitlePrank.tsx`. 탭이 숨겨지면(`document.hidden`) 5~10분 후부터 주기적으로 `document.title`을 변조(`scheduleHiddenLoop`, `:166`). 숨김 시간/틱 수에 따라 SOFT→MID→MAX 단계로 문구 강도 상승(`getEscalatedHiddenTitles`, `:100`), 시간대별 문구(dawn/morning/.../night) 혼합, 1% 확률 RARE 문구. 복귀(focus/visibilitychange) 시 RETURN 문구를 1.3초 보여준 뒤 원래 제목 복원(`:208`). `MutationObserver`로 원본 제목 변경을 추적해 base title 갱신(`:194`).

### 6.5 WorldBossButton
- `app/components/WorldBossButton.tsx:39`. `'use client'`, 가시 UI 있음.
- 10분 간격 인터벌마다 0.8% 확률(`REVEAL_CHANCE`)로 `???` 버튼을 노출(45초간), 클릭 시 `triggerBoss()`로 레이드 시작(`:147`).
- 활성 8.2초(`DURATION_MS`) 동안 phase 전환: `summon`→2.2초 `berserk`→6.5초 `collapse`(`:77`). 180ms마다 HP 감소(phase별 감소량), 1.4초마다 경고문 회전, 260ms마다 데미지 숫자 FX 생성(최근 8개 유지). body에 `world-boss-active` 클래스 → 화면 흔들림(`leesh-world-boss-shake`, `app/globals.css:2411`). 오버레이는 `surface` 패널 + HP 바 + 회전 링/코어 연출(`world-boss-*` 스타일 `:1227`~).

### 6.6 ScrollSummonEffect
- `app/components/ScrollSummonEffect.tsx:466`. `'use client'`, 가시 UI 있음. 페이지(또는 `.app-scroll-container`) 끝에서 더 스크롤하려는 힘이 누적 8000(`OVERSCROLL_TRIGGER`)을 넘으면 발동.
- `wheel`/`touchmove`로 끝(`atTop`/`atBottom`) 상태에서 같은 방향 오버스크롤량 누적(`accumulateOverscroll`, `:590`). 중첩 스크롤 영역 위에서는 제외(`hasNestedScrollInDirection`). 끝에서 떨어지면(`onScroll`) 누적 리셋.
- 발동(`triggerSummon`, `:560`) 시 `.app-physics-layer` 안에서 카드류(`CARD_SELECTOR`: `.surface`/`.card`/일일카드/둥근-보더 컨테이너 등, `:47`)를 수집해 원본을 `scroll-physics-original-hidden`으로 숨기고, 위치/크기/회전/지연이 부여된 클론(`CloneSpec`)을 오버레이로 띄워 위(`top`)에서 쏟아지거나 아래(`bottom`)로 무너지는 물리 연출(3.6초, `SUMMON_DURATION_MS`)을 재생. 3개 색 프리셋 무작위(`PRESETS`, `:104`). `usePathname` 변경 시 상태/누적 리셋(`:495`).

### 6.7 DailyLuckCard
- `app/components/DailyLuckCard.tsx:233`. 홈(`app/page.tsx:79`)에 표시되는 "오늘의 행운" 카드.
- 날짜키(`YYYY-MM-DD`)를 FNV-1a 해시(`hashString`, `:194`)해 시드로 행운 번호(1~99)·색(`LUCKY_COLORS` 8종)·심볼(`LUCKY_SYMBOLS` 45종)·오라 문구(`LUCKY_AURAS` 50종)·팁(`LUCKY_TIPS` 60종)을 결정론적으로 선택(`getLuckyBundle`, `:216`). 1분 인터벌 + focus/visibilitychange로 자정 넘어가면 자동 갱신(`:236`). 색상은 `color-mix`로 카드 배경/테두리에 반영.

### 6.8 DailyQuestCard
- `app/components/DailyQuestCard.tsx:158`. 홈(`app/page.tsx:78`)에 표시되는 일일 퀘스트 카드. props `{ onNavigate? }`.
- `localStorage('leesh-daily-quest')`(`StoredQuestState`: day/index/completed/streak/lastCompletedDay)에 상태 저장(`:24`). 날짜 바뀌면 해시 기반 기본 퀘스트로 리셋하되 streak 유지(`getNormalizedQuestState`, `:131`).
- 4종 퀘스트(`QUESTS`: TODO/CALENDAR/BOARD/BLOG로 이동 유도, `:26`). "다시"로 reroll, "완료 체크"로 달성 → 연속일(streak) 계산(전날 달성이면 +1, `isPreviousDay`, `:148`) 후 `daily-quest-burst` 스파크 연출(8방향, `:266`). 로딩 중엔 `skeleton` placeholder.

---

## 7. 키프레임 · 반응형 · 접근성

### 7.1 키프레임 카탈로그
모든 `@keyframes`는 `leesh-` 프리픽스(`app/globals.css:1607`~). 주요 그룹:

- 로딩/공통: `leesh-orbit-spin`, `leesh-dot-bounce`, `leesh-route-fade-enter`, `leesh-stagger-enter`, `leesh-modal-enter`, `leesh-shimmer`, `leesh-toast-in/out`, `leesh-calendar-bar-enter`, `leesh-quest-burst`.
- 월드보스: `leesh-world-boss-shake/pulse/flash/core/spin/spin-reverse/breathe/damage`(`:1717`~).
- 스크롤 소환: `leesh-scroll-summon-*`, `leesh-scroll-water-*`, `leesh-scroll-physics-*`, `leesh-scroll-item-*`(`:1806`~).
- 404 페이지: `leesh-not-found-*`(`:2173`~, `app/not-found.tsx`).
- 인버전: `leesh-inversion-banner`(`:2281`).

### 7.2 반응형 브레이크포인트
- Tailwind 기본 + 커스텀 미디어쿼리: `@media (max-width: 960px)`(`:1032`), `@media (min-width: 1024px)`(`:2487`), `@media (max-width: 640px)`(`:2523`).
- 레이아웃 분기는 주로 `lg:`(1024px)를 기준으로 사이드바/상단바/하단 내비를 전환(AppShell·Sidebar).

### 7.3 접근성 — prefers-reduced-motion
- `@media (prefers-reduced-motion: reduce)`(`app/globals.css:2536`)에서 route/modal/toast/quest-spark/world-boss/scroll-summon/stagger 등 거의 모든 모션을 `animation:none; opacity:1; transform:none !important`로 제거. `scroll-physics-original-hidden`도 다시 보이게 해 콘텐츠 손실 방지(`:2593`).
- 인터랙티브 요소엔 `aria-label`/`title`/`sr-only`를 일관 적용(아이콘 버튼: `ThemeToggle`, `PageNavIcons`, `AppShell` 홈 버튼 등).
- `select option`/`optgroup` 색 강제(`:272`)로 다크모드 네이티브 팝업 가독성 확보.
