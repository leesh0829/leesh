# 아키텍처 & 앱 구조

`Leesh`의 App Router 디렉터리 구조, 서버/클라이언트 컴포넌트 분리, 전역 레이아웃·셸·Provider 구성, 미들웨어 보안 헤더, Prisma 클라이언트 초기화, 그리고 요청 수명주기를 코드 근거와 함께 정리한 권위 레퍼런스입니다.

> 작성 기준: 2026-06-24, `dev` 브랜치

연관 문서: [setup-and-run.md](setup-and-run.md) · [env-and-security.md](env-and-security.md) · [database.md](database.md) · [auth-permissions.md](auth-permissions.md) · [api-reference.md](api-reference.md) · [frontend-and-ui.md](frontend-and-ui.md) · [lib-reference.md](lib-reference.md)

---

## 1. 기술 스택 & 핵심 의존성

`package.json`에 고정된 실제 버전입니다.

| 영역 | 패키지 | 버전 | 비고 |
| --- | --- | --- | --- |
| 프레임워크 | `next` | `16.1.1` | App Router |
| UI 런타임 | `react` / `react-dom` | `19.2.3` | React 19 |
| 언어 | `typescript` | `^5` | `strict: true` (`tsconfig.json:7`) |
| ORM | `prisma` / `@prisma/client` | `^7.2.0` | Prisma 7 |
| DB 어댑터 | `@prisma/adapter-pg` + `pg` | `^7.2.0` / `^8.16.3` | pg 드라이버 어댑터 |
| 인증 | `next-auth` | `^4.24.13` | Credentials + JWT |
| 인증 어댑터 | `@auth/prisma-adapter` | `^2.11.1` | |
| 해시 | `bcrypt` / `bcryptjs` | `^6.0.0` / `^3.0.3` | |
| 메일 | `nodemailer` | `^7.0.12` | 이메일 인증 발송 |
| 스타일 | `tailwindcss` + `@tailwindcss/postcss` | `^4` | CSS-first (config 파일 없음) |
| 마크다운 | `react-markdown` | `^10.1.0` | `remark-gfm`/`remark-breaks`/`rehype-raw`/`rehype-sanitize`/`rehype-highlight` 동반 |
| 검증 | `zod` | `^4.3.6` | 요청 바디/쿼리 스키마 |
| 공휴일 | `korean-holidays` | `^1.0.0` | 캘린더 |

`scripts`(`package.json:5`): `dev`(`next dev`), `build`(`prisma generate && next build`), `start`(`next start`), `lint`(`eslint`), `postinstall`(`prisma generate`).

---

## 2. App Router 디렉터리 구조

루트는 `app/` 단일 App Router 트리이며, `pages/` 디렉터리는 없습니다.

```text
app/
  layout.tsx          # 루트 레이아웃 (async 서버 컴포넌트)
  loading.tsx         # 전역 Suspense 폴백
  not-found.tsx       # 전역 404
  globals.css         # Tailwind v4 + 테마 CSS 변수
  page.tsx            # 홈 (/)
  (auth)/             # 라우트 그룹 — URL 경로에 미반영
    login/page.tsx        # /login
    sign-up/page.tsx      # /sign-up
  api/                # Route Handler (route.ts) — 약 89개
    auth/[...nextauth]/   # NextAuth 핸들러 + options.ts
    blog/ boards/ calendar/ diary/ docs/ help/ todos/
    ledger/ accounts/ holdings/ watchlist/ stock-note/ stock-alarm/
    kis/ ...            # 한국투자증권(KIS) 시세 라우트군
    permission/ schedule-shares/ sign-up/ verify-email/ ...
  blog/ boards/ calendar/ dashboard/ diary/ docs/ help/
  ledger/ leesh/ permission/ todos/ verify-email/   # 페이지 라우트
  minigame/MiniGameClient.tsx   # page.tsx 없음 — Sidebar 안에서만 렌더(라우트 아님)
  components/         # 공용 컴포넌트 19개 (AppShell, Sidebar, Providers, ...)
  lib/               # 도메인/유틸 모듈 33개 (prisma, date, validation, kis*, ...)
prisma/
  schema.prisma
  migrations/
middleware.ts        # 전역 보안 헤더
prisma.config.ts     # Prisma 7 CLI/migrate 설정
next.config.ts       # (비어 있음)
tsconfig.json        # strict + @/* alias
```

### 라우트 그룹

프로젝트에 존재하는 라우트 그룹은 `(auth)` 하나뿐입니다(`app/(auth)/`). 괄호 그룹은 URL 세그먼트에 포함되지 않으므로 실제 경로는 `/login`, `/sign-up`입니다. `(auth)` 그룹에는 별도 `layout.tsx`가 없으며, 인증 화면의 "셸 제거"는 레이아웃이 아니라 `AppShell`의 `NO_SHELL_PREFIXES` 분기로 처리합니다(`app/components/AppShell.tsx:10`).

페이지 라우트 트리 요약:

| 도메인 | 경로 예시 |
| --- | --- |
| 홈/대시보드 | `/`, `/dashboard` |
| 콘텐츠 | `/blog`, `/blog/[slug]`, `/blog/new`, `/blog/edit/[postId]`, `/docs/*`, `/boards`, `/boards/[boardId]`, `/boards/[boardId]/[postId]`, `/help`, `/help/[postId]` |
| 생산성 | `/todos`, `/todos/[boardId]`, `/todos/[boardId]/[postId]`, `/calendar`, `/diary` |
| 가계부/투자 | `/ledger`, `/ledger/accounts`, `/ledger/budgets`, `/ledger/calendar`, `/ledger/stats`, `/ledger/stocks`, `/ledger/stocks/portfolio` |
| 시장/시세 | `/ledger/market`, `/ledger/market/compare`, `/ledger/market/stock/[code]`, `/ledger/market/overseas/[exchange]/[symbol]`, `/ledger/kis-settings` |
| 권한/인증/기타 | `/permission`, `/verify-email`, `/login`, `/sign-up`, `/leesh` |

> 미니게임은 별도 페이지 라우트(`/minigame`)가 아니라 `app/minigame/MiniGameClient.tsx`를 사이드바 안에서 모드 전환으로만 렌더합니다(6.1 참고).

전체 페이지/라우트 목록은 [api-reference.md](api-reference.md), [features.md](features.md) 참고.

---

## 3. 서버/클라이언트 컴포넌트 분리 관례

App Router 기본값(서버 컴포넌트)을 적극 활용합니다.

- **페이지(`page.tsx`)는 거의 전부 서버 컴포넌트**입니다. 약 37개 페이지 중 `'use client'`를 선언한 페이지는 단 3개입니다: `app/(auth)/login/page.tsx`, `app/(auth)/sign-up/page.tsx`, `app/verify-email/page.tsx`(폼 상태/검증이 필요한 인증 화면).
- **데이터 페칭은 서버 페이지에서 직접** 수행합니다. 서버 페이지가 `getServerSession(authOptions)`로 세션을 읽고 `prisma`로 직접 쿼리한 뒤, 결과를 직렬화(`toISOStringSafe`)하여 인터랙티브한 부분만 `*Client.tsx`(클라이언트 컴포넌트)에 props로 넘기는 패턴이 표준입니다. 예: `app/blog/page.tsx`가 서버에서 글을 조회(`app/blog/page.tsx:93`)하고 정렬/필터 UI는 `BlogListControlsClient`에 위임(`app/blog/page.tsx:212`).
- **DB 연결 실패 방어**: 서버 페이지는 `isDatabaseConnectionError`로 연결 오류만 잡아 "목록을 불러올 수 없습니다" 폴백을 렌더하고 그 외 에러는 재던집니다(`app/blog/page.tsx:69`, `:118`).
- **공용 셸/Provider 컴포넌트는 클라이언트**입니다: `Providers`, `AppShell`, `Sidebar`, `ToastProvider`, `ThemeToggle`, `GlobalTopRightControls`, `Footer`는 모두 상단에 `'use client'`를 둡니다(상태/`usePathname`/`useSession`/이벤트 사용).
- 루트 `app/layout.tsx`는 `async` **서버** 컴포넌트로, `cookies()`를 읽어 초기 테마를 결정합니다(`app/layout.tsx:49`).

---

## 4. 전역 레이아웃 (`app/layout.tsx`)

루트 레이아웃은 메타데이터·뷰포트·폰트·테마 초기화·Provider/셸 트리를 구성합니다.

### 4.1 메타데이터 · 뷰포트 · 폰트

| 항목 | 값/근거 |
| --- | --- |
| `metadata` | `title: 'Leesh'`, `description: 'helping people find their way'` (`app/layout.tsx:27`) |
| `viewport` | `width: device-width`, `initialScale: 1`, `viewportFit: 'cover'` (`app/layout.tsx:34`) — 모바일 가로 스크롤 방지 목적 주석 명시 |
| 폰트 | `Geist`/`Geist_Mono`를 `next/font/google`로 로드, CSS 변수 `--font-geist-sans`/`--font-geist-mono`로 노출, `<body>`에 적용 (`app/layout.tsx:17`, `:65`) |

### 4.2 테마 무점멸(FOUC 방지) 초기화

`<html>`에 서버에서 결정한 `data-theme`/`dark` 클래스를 부여하고(`app/layout.tsx:59`), `suppressHydrationWarning`을 켭니다. 또한 `next/script`의 `beforeInteractive` 인라인 스크립트가 `localStorage('leesh-theme')` → 쿠키(`leesh-theme`) → 서버 초기값 순으로 최종 테마를 확정하여 첫 페인트 전 적용합니다(`app/layout.tsx:68`~`:100`). 서버는 `cookies()`에서 `leesh-theme`를 읽어 `light`/`dark`만 허용하고 기본값 `light`로 폴백합니다(`normalizeTheme`, `app/layout.tsx:42`, `:54`). 자세한 테마 흐름은 아래 9장과 [frontend-and-ui.md](frontend-and-ui.md) 참고.

### 4.3 트리 구성

```tsx
<Providers>
  <TitlePrank /> <DotMode /> <HeadingHackEffect />
  <InversionMode /> <ScrollSummonEffect />
  <div className="app-physics-layer">
    <WorldBossButton />
    <GlobalTopRightControls />
    <AppShell>{children}</AppShell>
  </div>
</Providers>
```
(`app/layout.tsx:101`)

- `Providers`: 전역 Provider 래퍼(5장).
- `TitlePrank`/`DotMode`/`HeadingHackEffect`/`InversionMode`/`ScrollSummonEffect`/`WorldBossButton`: 전역 효과·이스터에그용 클라이언트 컴포넌트(상세는 [feature-misc.md](feature-misc.md)).
- `GlobalTopRightControls`: 데스크톱 우상단 고정 컨트롤(테마 토글).
- `AppShell`: 라우트별 셸/내비게이션을 그리고 실제 페이지(`children`)를 감쌉니다.

---

## 5. 전역 Provider (`app/components/Providers.tsx`)

Provider 중첩은 2단계입니다.

```tsx
<SessionProvider>
  <ToastProvider>{children}</ToastProvider>
</SessionProvider>
```
(`app/components/Providers.tsx:6`)

| Provider | 출처 | 역할 |
| --- | --- | --- |
| `SessionProvider` | `next-auth/react` | 클라이언트 측 세션 컨텍스트(`useSession`) 제공. 세션 전략은 JWT(`options.ts:18`) |
| `ToastProvider` | `app/components/ToastProvider.tsx` | 토스트 컨텍스트(`useToast` → `show/success/error/info`). 자동 닫힘 2600ms, 퇴장 애니메이션 180ms (`ToastProvider.tsx:75`, `:59`) |

**테마는 Provider가 아닙니다.** 별도 React Context 없이 `<html>`의 `data-theme`/`dark` 속성과 `localStorage`/쿠키를 직접 토글하는 방식이며(`ThemeToggle.tsx:23`), `useToast`는 Provider 밖에서 호출 시 throw 합니다(`ToastProvider.tsx:116`).

---

## 6. 애플리케이션 셸 (`app/components/AppShell.tsx`)

`AppShell`은 클라이언트 컴포넌트로 `usePathname()`에 따라 세 가지 레이아웃 모드를 분기합니다.

| 모드 | 조건 | 렌더 |
| --- | --- | --- |
| no-shell | 경로가 `/login` 또는 `/sign-up` 으로 시작(`NO_SHELL_PREFIXES`, `AppShell.tsx:10`/`:25`) | 사이드바·내비 없이 `children` + `Footer`만 (`AppShell.tsx:66`) |
| Leesh 페이지 | 경로가 `/leesh`로 시작(`AppShell.tsx:24`) | "메인으로" 홈 버튼 + `children` + `Footer` (`AppShell.tsx:75`) |
| full shell | 그 외 전부 | `Sidebar` + 모바일 상단바 + 스크롤 컨테이너 + 모바일 하단 탭 + `Footer` (`AppShell.tsx:120`) |

full shell의 세부 동작:

- **사이드바 상태**: 모바일 오버레이 `open`, 데스크톱 표시 `desktopOpen`(기본 `true`)을 `useState`로 보유(`AppShell.tsx:61`). 데스크톱에서 숨김 상태일 때 화면 좌측 끝 호버 영역(`lg:w-2`, 약 8px)에 마우스를 올리면 다시 열립니다(`AppShell.tsx:158`).
- **와이드 레이아웃**(`isWideLayout`): 블로그/Docs 상세, 보드 글 상세, `/calendar`, `/todos`, `/ledger`는 `container-page` 대신 전폭 패딩 레이아웃을 사용(`AppShell.tsx:48`, `:191`). 블로그/Docs/보드 상세 판정은 경로 세그먼트 수로 결정(`AppShell.tsx:29`~`:47`).
- **목록 복귀 버튼**: 블로그/Docs 상세에서는 `detailListHref`(`/blog`·`/docs`)로 돌아가는 "← 목록" 버튼을 모바일 상단바와 데스크톱 상단에 노출(`AppShell.tsx:58`, `:143`, `:183`).
- **라우트 전환 연출**: 콘텐츠 래퍼에 `key={pathname}` + `route-fade-enter` 클래스로 페이지 전환 페이드를 적용(`AppShell.tsx:198`).
- **모바일 하단 탭**: 대시/블로그/보드/캘린더/TODO 5개 고정 링크(`AppShell.tsx:206`).
- 스크롤은 우측 콘텐츠 영역(`app-scroll-container`)만 발생하고 사이드바는 독립 스크롤입니다(`AppShell.tsx:167`, `Sidebar.tsx:266`).

### 6.1 사이드바 (`app/components/Sidebar.tsx`)

- 마운트 시 `GET /api/permission`을 `cache: 'no-store'`로 호출해 메뉴 항목(`Perm[]`)을 받아 내비게이션을 구성하고, 실패하거나 빈 응답이면 하드코딩된 기본 메뉴로 폴백합니다(`Sidebar.tsx:89`, `:108`).
- 표시 규칙: `visible`이 true인 항목만, `requireLogin`이면 로그인 사용자에게만 노출하고 `SIDEBAR_ORDER` 순서로 정렬(`Sidebar.tsx:197`, `:28`). 권한 모델은 [auth-permissions.md](auth-permissions.md) 참고.
- 활성 표시는 `pathname === href` 또는 (`href !== '/'`일 때) `pathname.startsWith(href)`로 판정합니다 — 홈(`/`)이 모든 경로에서 활성으로 잡히지 않도록 `'/'` 가드를 둡니다(`Sidebar.tsx:344`).
- 계정 카드: `useSession` + `displayUserLabel`로 라벨 표시, 로그인 시 `signOut({ callbackUrl: '/' })`, 비로그인 시 로그인/회원가입 링크(`Sidebar.tsx:101`, `:358`).
- 부가: 미니게임 모드 전환(`MiniGameClient`), 업데이트 내역 모달, 외부 링크 버튼(`Sidebar.tsx:331`, `:206`).

### 6.2 우상단 컨트롤 / 푸터

- `GlobalTopRightControls`: 데스크톱(`lg:`)에서만 우상단 고정으로 `ThemeToggle`만 렌더(`GlobalTopRightControls.tsx:7`).
- `Footer`: 하단 고정(`mt-auto`), `© {현재 연도} Leesh. All rights reserved.` 표시(`Footer.tsx:15`).

---

## 7. 미들웨어 보안 헤더 (`middleware.ts`)

미들웨어는 **인증을 수행하지 않고**(요청 인자는 `void`), 모든 매칭 응답에 보안 헤더만 부착합니다(`middleware.ts:4`).

| 헤더 | 값 |
| --- | --- |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-DNS-Prefetch-Control` | `off` |
| `X-Permitted-Cross-Domain-Policies` | `none` |
| `Origin-Agent-Cluster` | `?1` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` — **`NODE_ENV==='production'`에서만** (`middleware.ts:21`) |

`matcher`는 `/((?!_next/static|_next/image|favicon.ico).*)`로 정적 자산을 제외한 전 경로에 적용됩니다(`middleware.ts:32`). 보안 항목 종합은 [env-and-security.md](env-and-security.md) 참고.

---

## 8. 런타임/렌더링 관례

### 8.1 `runtime = 'nodejs'`

API Route Handler는 Node 런타임을 명시합니다. 전체 `app/api/**/route.ts` 89개 중 82개가 `export const runtime = 'nodejs'`를 선언합니다(따옴표 표기만 다름). 이유는 핸들러가 `prisma`(pg 드라이버), `bcrypt`, `nodemailer`, Node `crypto` 등 Edge 비호환 API에 의존하기 때문입니다. NextAuth 핸들러도 동일하게 선언(`app/api/auth/[...nextauth]/route.ts:4`).

명시 선언이 없는 7개 라우트(Next 기본값이 nodejs이므로 동작 동일): `app/api/verify-email/route.ts`, `app/api/check-email/route.ts`, `app/api/check-name/route.ts`, `app/api/resend-verification/route.ts`, `app/api/sign-up/route.ts`, `app/api/todos/boards/route.ts`, `app/api/todos/boards/[boardId]/route.ts`.

일부 **서버 페이지**도 `runtime = 'nodejs'`를 선언합니다(prisma 직접 사용). 예: `app/blog/page.tsx:17`.

### 8.2 `dynamic` / `revalidate`

| 선언 | 위치 | 의미 |
| --- | --- | --- |
| `export const dynamic = 'force-dynamic'` | `app/ledger/calendar/page.tsx`, `app/ledger/market/compare/page.tsx`, `app/ledger/stocks/portfolio/page.tsx` | 항상 동적 렌더(시세/실시간 데이터) |
| `export const revalidate = 1800` | `app/api/exchange-rates/route.ts` | 환율 응답 30분 캐시 |

### 8.3 로딩 / 404

- `app/loading.tsx`: 전역 Suspense 폴백. `role="status"` + `loading-dots` 점 애니메이션(`loading.tsx:3`).
- `app/not-found.tsx`: 전역 404. "404 생물" 이스터에그 연출 + 홈/대시보드 링크(`not-found.tsx:3`).
- 전역 `error.tsx`/`template.tsx`는 존재하지 않습니다(서버 페이지가 자체 try/catch로 DB 오류를 흡수).

---

## 9. 테마 시스템 (요약)

| 요소 | 동작 | 근거 |
| --- | --- | --- |
| 저장소 | `localStorage('leesh-theme')` + 쿠키 `leesh-theme`(1년, `samesite=lax`, https면 `secure`) | `ThemeToggle.tsx:18`, `layout.tsx:81` |
| 적용 방식 | `<html data-theme="light|dark">` + `.dark` 클래스 병행 | `ThemeToggle.tsx:23`, `layout.tsx:90` |
| SSR 초기값 | 서버가 쿠키를 읽어 `<html>`에 선반영 → 인라인 스크립트가 최종 확정(FOUC 방지) | `layout.tsx:54`, `:68` |
| CSS | Tailwind v4 CSS-first. `globals.css`에서 `@import 'tailwindcss'` + `@custom-variant dark (&:where(.dark, .dark *))`, 테마는 CSS 변수(`--bg`, `--fg`, `--accent` 등) | `app/globals.css:1` |

Tailwind는 별도 `tailwind.config`가 없고 PostCSS 플러그인 `@tailwindcss/postcss`로만 구성됩니다(`postcss.config.mjs`). 디자인 시스템 전반은 [frontend-and-ui.md](frontend-and-ui.md) 참고.

---

## 10. 경로 alias & TypeScript 설정 (`tsconfig.json`)

| 옵션 | 값 | 의미 |
| --- | --- | --- |
| `paths` | `"@/*": ["./*"]` | 프로젝트 루트 기준 alias. 예: `@/app/lib/prisma`, `@/app/api/auth/[...nextauth]/options` |
| `strict` | `true` | 엄격 타입 검사 |
| `target` | `ES2017` | |
| `moduleResolution` | `bundler` | |
| `module` | `esnext` | |
| `jsx` | `react-jsx` | |
| `plugins` | `[{ "name": "next" }]` | Next 타입 플러그인 |
| `noEmit` | `true` | 빌드는 Next가 담당 |

`include`에 `.next/types`, `.next/dev/types`가 포함되어 라우트 타입 생성물을 인식합니다(`tsconfig.json:25`). `next.config.ts`는 현재 옵션이 비어 있습니다(`next.config.ts:3`).

---

## 11. Prisma 클라이언트 초기화 (`app/lib/prisma.ts`)

런타임 DB 접근은 pg 드라이버 어댑터로 구성합니다.

```ts
const DB_TIMEZONE = "Asia/Seoul";
const pool = globalForPrisma.pgPool ?? new Pool({ connectionString });
pool.on("connect", (client) => {
  void client.query("SELECT set_config('TimeZone', $1, false)", [DB_TIMEZONE]) ...
});
const adapter = new PrismaPg(pool);
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter, log: ["error"] });
```
(`app/lib/prisma.ts:15`, `:21`, `:31`)

핵심 사항:

- **연결 문자열**: `process.env.DATABASE_URL` 필수. 없으면 모듈 로드 시 throw(`app/lib/prisma.ts:12`).
- **타임존**: 새 커넥션마다 `connect` 이벤트에서 세션 타임존을 `Asia/Seoul`로 설정. 실패 시 에러 로그만 남기고 진행(`app/lib/prisma.ts:21`).
- **어댑터**: `PrismaPg(pool)` — Prisma 7의 driver adapter로 `pg.Pool` 위에서 동작(`app/lib/prisma.ts:29`).
- **싱글턴 캐싱**: `globalThis`에 `prisma`/`pgPool`을 보관하여 개발 모드(HMR)에서 커넥션 누수를 방지. 프로덕션에서는 캐시하지 않습니다(`app/lib/prisma.ts:7`, `:38`).
- **로깅**: `log: ['error']`만.

스키마/모델 상세는 [database.md](database.md), 시간대 정책은 [env-and-security.md](env-and-security.md) 참고.

### 11.1 Prisma CLI/Migrate 설정 (`prisma.config.ts`)

Prisma 7에서는 CLI/`migrate`가 `prisma.config.ts`의 `datasource.url`을 사용합니다(앱 런타임 어댑터와 분리).

| 항목 | 값 | 비고 |
| --- | --- | --- |
| `schema` | `prisma/schema.prisma` | |
| `migrations.path` | `prisma/migrations` | |
| `datasource.url` | `DIRECT_URL ?? DATABASE_URL` | `DIRECT_URL`이 있으면 direct 연결로 pgbouncer의 prepared-statement 문제 회피, 없으면 `DATABASE_URL` 폴백 (`prisma.config.ts:15`) |

`import 'dotenv/config'`로 `.env`를 로드합니다(`prisma.config.ts:3`). 환경변수 표는 [env-and-security.md](env-and-security.md), 마이그레이션 절차는 [setup-and-run.md](setup-and-run.md) 참고.

---

## 12. 요청 수명주기 (요청 → 미들웨어 → 핸들러 → Prisma)

```text
브라우저 요청
  │
  ├─[1] middleware.ts (정적 자산 제외)
  │      └ 응답에 보안 헤더 부착 (인증 처리 안 함)
  │
  ├─[2] 라우트 분기
  │      ├ 페이지(RSC): 서버 컴포넌트에서 getServerSession + prisma 직접 조회
  │      │             → toISOStringSafe로 직렬화 → 클라이언트 컴포넌트에 props 전달
  │      └ API(route.ts, runtime='nodejs')
  │
  ├─[3] 인증/인가
  │      └ getServerSession(authOptions)로 JWT 해석 → 필요 시 prisma.user 재조회로 role/owner 검사
  │
  ├─[4] 입력 검증
  │      └ zod 스키마(parseJsonWithSchema / safeParse) → 실패 시 badRequestFromZod (400)
  │
  ├─[5] 데이터 접근
  │      └ prisma (PrismaPg + pg Pool, 세션 TZ=Asia/Seoul)
  │
  └─[6] 응답
         └ NextResponse.json(...) — 날짜는 ISO 문자열로 직렬화
```

대표 예시인 `app/api/diary/route.ts`가 위 흐름을 그대로 보여줍니다: `runtime='nodejs'` 선언(`:9`), `getUserId()`가 세션→`prisma.user` 조회로 사용자 확정(`:32`), `dateSchema`/`diaryUpsertSchema` zod 검증(`:12`/`:25`), `prisma.diaryEntry` upsert(`:83`), `toISOStringSafe`로 직렬화된 JSON 응답(`:90`). 미인증 시 `401`, 바디 검증 실패 시 `badRequestFromZod`로 `400`을 반환합니다(`:44`, `:69`).

인증/권한 메커니즘은 [auth-permissions.md](auth-permissions.md), 라우트별 상세 스펙은 [api-reference.md](api-reference.md), 공용 유틸(`validation`/`date`/`prismaError` 등)은 [lib-reference.md](lib-reference.md)를 참고하세요.
