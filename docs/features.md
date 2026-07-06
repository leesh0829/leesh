# Features — 프로젝트 개요 & 기능 맵

Leesh는 한 사람의 포트폴리오 사이트에서 출발해 콘텐츠(블로그/Docs/게시판/고객센터), 생산성(TODO/캘린더/일기장/일정공유), 가계부, 투자(보유종목/관심종목/알림) 및 한국투자증권(KIS) 시장데이터까지 묶은 개인용 통합 웹 서비스입니다. 이 문서는 전체 기능 인벤토리와 도메인별 모듈 맵을 제공하며, 세부 사항은 각 도메인 상세 문서로 링크합니다.

> 작성 기준: 2026-06-24, dev 브랜치

---

## 1. 무엇이고 누구를 위한 것인가

- 단일 운영자(소유자)를 중심으로 한 **개인 통합 대시보드 + 공개 포트폴리오** 성격의 서비스입니다. 메인(`/`)의 타이틀은 `/leesh` 포트폴리오로 연결됩니다(`app/page.tsx:11`).
- 회원가입/이메일 인증(NextAuth Credentials)을 통해 로그인하면 콘텐츠·생산성·가계부·투자 모듈을 사용할 수 있고, 일부 데이터는 사용자 간 **일정 공유(ScheduleShare)** 로 열람을 분리합니다.
- 권한은 `USER` / `ADMIN` 2단계 역할 + **메뉴 단위 권한 정책(MenuPermission)** + **사용자별 오버라이드(UserMenuPermission, ALLOW/DENY)** 의 3계층으로 동작합니다. 자세한 내용은 [auth-permissions.md](auth-permissions.md) 참고.
- 사이드바에서 진입하지 않는 보조 기능으로 미니게임 아케이드(사이드바 내장), 공개 포트폴리오(`/leesh`), 외부 링크(펭 레스토랑) 등이 있습니다.

전체 규모 요약: **페이지 37개 · API route 89개 · Prisma 모델 20개 · enum 12개** (각각 `find app -name page.tsx` / `find app/api -name route.ts` / `prisma/schema.prisma` 기준).

---

## 2. 기술 스택 (package.json 기준)

`package.json` 의존성/버전입니다.

| 영역 | 패키지 | 버전 |
| --- | --- | --- |
| Framework | `next` | 16.1.1 |
| UI | `react`, `react-dom` | 19.2.3 |
| Language | `typescript` | ^5 (strict) |
| ORM | `prisma`, `@prisma/client` | ^7.2.0 |
| DB Adapter | `@prisma/adapter-pg`, `pg` | ^7.2.0 / ^8.16.3 (PostgreSQL, DB TZ=Asia/Seoul) |
| Auth | `next-auth` | ^4.24.13 (Credentials, JWT) |
| Auth Adapter | `@auth/prisma-adapter` | ^2.11.1 |
| 비밀번호 해시 | `bcrypt`, `bcryptjs` | ^6.0.0 / ^3.0.3 |
| Mail | `nodemailer` | ^7.0.12 |
| Markdown | `react-markdown`, `remark-gfm`, `remark-breaks`, `rehype-highlight`, `rehype-raw`, `rehype-sanitize` | 10.1.0 / 4.0.1 / 4.0.0 / 7.0.2 / 7.0.0 / 6.0.0 |
| 검증 | `zod` | ^4.3.6 |
| 공휴일 | `korean-holidays` | ^1.0.0 |
| Styling | `tailwindcss`, `@tailwindcss/postcss` | ^4 (globals.css 기반 테마) |
| Lint | `eslint`, `eslint-config-next` | ^9 / 16.1.1 |

스크립트(`package.json:5`): `dev`(next dev) · `build`(`prisma generate && next build`) · `start` · `lint`(eslint) · `postinstall`(`prisma generate`). 자세한 실행/환경은 [setup-and-run.md](setup-and-run.md), [env-and-security.md](env-and-security.md) 참고.

---

## 3. 사이드바 메뉴 ↔ 권한 ↔ 페이지 매핑

사이드바 메뉴는 `/api/permission` GET이 반환하는 `MenuPermission` 행을 기반으로 렌더되며(`app/components/Sidebar.tsx:89`), `SIDEBAR_ORDER`(`app/components/Sidebar.tsx:28`)로 표시 순서를 정렬합니다. 노출 필터는 `visible && (requireLogin ? loggedIn : true) && (minRole==='ADMIN' ? isAdmin : true)` 입니다(`app/api/permission/route.ts:191`).

권한 기본값은 `DEFAULTS` 배열(`app/api/permission/route.ts:18`)에 정의되어 있으며, 빈 테이블일 때 `seedIfEmpty()`로 시드됩니다. 아래 표는 `DEFAULTS` ↔ 실제 page 라우트를 1:1로 매핑한 것입니다.

| 메뉴명 | key | 경로 | 페이지 파일 | 로그인 | 최소 role |
| --- | --- | --- | --- | --- | --- |
| 메인 | `home` | `/` | `app/page.tsx` | 불필요 | USER |
| 대시보드 | `dashboard` | `/dashboard` | `app/dashboard/page.tsx` | 필요 | USER |
| 블로그 | `blog` | `/blog` | `app/blog/page.tsx` | 필요 | USER |
| Docs | `docs` | `/docs` | `app/docs/page.tsx` | 필요 | USER |
| TODO | `todos` | `/todos` | `app/todos/page.tsx` | 필요 | USER |
| 게시판 | `boards` | `/boards` | `app/boards/page.tsx` | 필요 | USER |
| 캘린더 | `calendar` | `/calendar` | `app/calendar/page.tsx` | 필요 | USER |
| 일기장 | `diary` | `/diary` | `app/diary/page.tsx` | 필요 | USER |
| 가계부 | `ledger` | `/ledger` | `app/ledger/page.tsx` | 필요 | USER |
| 권한 관리 | `permission` | `/permission` | `app/permission/page.tsx` | 필요 | **ADMIN** |
| 고객 센터 | `help` | `/help` | `app/help/page.tsx` | 필요 | USER |

표시 순서(`SIDEBAR_ORDER`): home → dashboard → blog → docs → todos → boards → calendar → diary → ledger → permission → help. `permission`은 `minRole=ADMIN`이라 ADMIN에게만 사이드바에 노출됩니다. `accounting` 키는 `ledger`로 이름이 바뀐 잔재로 GET 시 자동 삭제됩니다(`app/api/permission/route.ts:145`).

> 참고: 투자(stocks/market/kis-settings) 페이지는 별도 사이드바 키가 없고 모두 `/ledger` 하위 경로라 **`ledger` 메뉴 권한으로 함께 게이트**됩니다. `/leesh` 포트폴리오와 미니게임은 사이드바 메뉴 목록 밖에 있습니다.

---

## 4. 전체 페이지 인벤토리

사이드바 메뉴 페이지 외에 하위/보조 페이지를 포함한 전체 라우트입니다(`page.tsx` 37개).

### 인증 / 계정
| 경로 | 파일 | 설명 |
| --- | --- | --- |
| `/login` | `app/(auth)/login/page.tsx` | 로그인(Credentials) |
| `/sign-up` | `app/(auth)/sign-up/page.tsx` | 회원가입 + 이메일/이름 중복 확인 |
| `/verify-email` | `app/verify-email/page.tsx` | 이메일 인증 토큰 확인 |

### 콘텐츠 (블로그 / Docs / 게시판 / 고객센터)
| 경로 | 파일 | 설명 |
| --- | --- | --- |
| `/blog` | `app/blog/page.tsx` | DONE 글 목록·검색·정렬·페이지네이션 |
| `/blog/new` | `app/blog/new/page.tsx` | 글 작성(임시저장/발행/비밀글/이미지) |
| `/blog/edit/[postId]` | `app/blog/edit/[postId]/page.tsx` | 본인 글 수정·slug 재생성·삭제 |
| `/blog/[slug]` | `app/blog/[slug]/page.tsx` | 본문 렌더·TOC·비밀글 해제·댓글 |
| `/docs` | `app/docs/page.tsx` | Docs 목록 |
| `/docs/new` | `app/docs/new/page.tsx` | Docs 작성 |
| `/docs/edit/[postId]` | `app/docs/edit/[postId]/page.tsx` | Docs 수정 |
| `/docs/[slug]` | `app/docs/[slug]/page.tsx` | Docs 본문 보기 |
| `/boards` | `app/boards/page.tsx` | GENERAL 보드 목록·생성 |
| `/boards/[boardId]` | `app/boards/[boardId]/page.tsx` | 보드 상세·설정·글 목록 |
| `/boards/[boardId]/[postId]` | `app/boards/[boardId]/[postId]/page.tsx` | 게시글 본문·댓글·일정 |
| `/help` | `app/help/page.tsx` | 고객센터 요청 목록·작성 |
| `/help/[postId]` | `app/help/[postId]/page.tsx` | 요청 본문·운영진 답변 |

### 생산성 (TODO / 캘린더 / 일기장)
| 경로 | 파일 | 설명 |
| --- | --- | --- |
| `/todos` | `app/todos/page.tsx` | 칸반 보드·공유 계정 관리 |
| `/todos/[boardId]` | `app/todos/[boardId]/page.tsx` | TODO 보드 상세 |
| `/todos/[boardId]/[postId]` | `app/todos/[boardId]/[postId]/page.tsx` | TODO 항목 상세 |
| `/calendar` | `app/calendar/page.tsx` | 월간 캘린더·공휴일·공유 |
| `/diary` | `app/diary/page.tsx` | 일별 마크다운 일기(본인 전용) |

### 가계부 / 투자 (모두 `/ledger` 하위)
| 경로 | 파일 | 설명 |
| --- | --- | --- |
| `/ledger` | `app/ledger/page.tsx` | 가계부 메인(거래 입력/목록) |
| `/ledger/accounts` | `app/ledger/accounts/page.tsx` | 금융 계좌 관리 |
| `/ledger/budgets` | `app/ledger/budgets/page.tsx` | 예산(머니 챌린지) 목표 |
| `/ledger/calendar` | `app/ledger/calendar/page.tsx` | 일자별 가계부 캘린더(계좌/카테고리 필터) |
| `/ledger/stats` | `app/ledger/stats/page.tsx` | 통계(시간대/카테고리 패턴) |
| `/ledger/stocks` | `app/ledger/stocks/page.tsx` | 보유 종목 목록·거래 |
| `/ledger/stocks/portfolio` | `app/ledger/stocks/portfolio/page.tsx` | 포트폴리오 집계 |
| `/ledger/market` | `app/ledger/market/page.tsx` | KIS 시장 데이터 대시보드 |
| `/ledger/market/compare` | `app/ledger/market/compare/page.tsx` | 종목 비교 |
| `/ledger/market/stock/[code]` | `app/ledger/market/stock/[code]/page.tsx` | 국내 종목 상세 |
| `/ledger/market/overseas/[exchange]/[symbol]` | `app/ledger/market/overseas/[exchange]/[symbol]/page.tsx` | 해외 종목 상세 |
| `/ledger/kis-settings` | `app/ledger/kis-settings/page.tsx` | KIS API 자격증명 설정 |

### 그 외
| 경로 | 파일 | 설명 |
| --- | --- | --- |
| `/` | `app/page.tsx` | 메인(타이틀→`/leesh`, 데일리 카드, 대시보드 바로가기) |
| `/dashboard` | `app/dashboard/page.tsx` | 최근 블로그/댓글/일정 요약 |
| `/permission` | `app/permission/page.tsx` | (ADMIN) 메뉴 정책·유저 권한 관리 |
| `/leesh` | `app/leesh/page.tsx` | 공개 포트폴리오(비밀번호 잠금 해제 후 편집) |

> 미니게임 아케이드는 별도 라우트가 아니라 사이드바 내장 컴포넌트(`app/minigame/MiniGameClient.tsx`)로, Sidebar의 게임 모드 토글에서 렌더됩니다(`app/components/Sidebar.tsx:331`). 게임: Reflex Sprint / Number Rush / Target Burst.

---

## 5. 도메인별 모듈 맵

각 도메인의 핵심 모델·API 그룹·상세 문서 링크입니다. 라우트별 HTTP 메서드/zod 스키마/응답 형태는 [api-reference.md](api-reference.md) 및 각 feature 문서에 정리되어 있습니다.

### 5.1 인증 (Auth)
- 모델: `User`, `Account`, `Session`, `VerificationToken`, `Role`(enum).
- API: `app/api/auth/[...nextauth]/route.ts`, `app/api/sign-up/route.ts`, `app/api/check-email/route.ts`, `app/api/check-name/route.ts`, `app/api/verify-email/route.ts`, `app/api/resend-verification/route.ts`.
- 메커니즘: NextAuth v4 Credentials + JWT, bcrypt 비밀번호 해시, Nodemailer 이메일 인증.
- 상세: [auth-permissions.md](auth-permissions.md).

### 5.2 콘텐츠 (블로그 / Docs / 게시판 / 고객센터)
- 모델: `Board`, `Post`, `Comment`, enum `PostStatus`/`BoardType`/`BlogPostCategory`. 블로그/Docs/게시판/고객센터는 모두 `Board.type`(BLOG/DOCS/GENERAL/HELP)으로 구분되는 동일 스키마를 공유합니다.
- API: `app/api/blog/posts/*`, `app/api/docs/posts/*`, `app/api/boards/*`(글·댓글·unlock·schedule), `app/api/help/posts/*`(요청·answers).
- 특징: 마크다운 본문, 비밀글(`isSecret` + `secretPasswordHash` + unlock 쿠키), slug, 스포일러, 블로그 카테고리/별점(`reviewRatingHalf`).
- 상세: [feature-content.md](feature-content.md).

### 5.3 생산성 (TODO / 캘린더 / 일기장 / 일정공유)
- 모델: `Board`(type TODO/CALENDAR, `singleSchedule` + schedule 필드), `Post`(start/end/allDay), `DiaryEntry`, `ScheduleShare`, enum `ScheduleShareScope`(CALENDAR/TODO/LEDGER/STOCK)·`ScheduleShareStatus`.
- API: `app/api/todos/*`(보드·항목), `app/api/calendar/route.ts`, `app/api/diary/route.ts`, `app/api/schedule-shares/*`.
- 특징: 칸반(TODO/DOING/DONE), 데스크톱 DnD, 대한민국 공휴일 기본 캘린더(`app/lib/koreanHolidayCalendar.ts`), 사용자 간 공유 권한 분리, 일기는 본인 전용(`@@unique([userId, date])`).
- 상세: [feature-productivity.md](feature-productivity.md).

### 5.4 가계부 (거래 / 계좌 / 예산 / 통계)
- 모델: `LedgerEntry`(INCOME/EXPENSE, category/subcategory, `excludeFromTotals`, account 연결), `FinancialAccount`(`types: AccountType[]`, `initialBalance`), `BudgetTarget`(CATEGORY/SUBCATEGORY/ACCOUNT scope), enum `LedgerEntryType`/`AccountType`(18종)/`BudgetScope`.
- 카테고리: `app/lib/ledgerCategories.ts`의 `INCOME_CATEGORIES`/`EXPENSE_CATEGORIES`(소분류 포함)와 검증 함수 `isValidCategoryCombination`.
- API: `app/api/ledger/*`(항목·통계·이체), `app/api/ledger/budgets/*`, `app/api/accounts/*`, `app/api/exchange-rates/route.ts`, `app/api/fx-history/route.ts`.
- 특징: 계좌 잔액 누적(초기잔액 기준), 계좌 간 이체, 시간대(0~23h) 패턴 통계, 환율.
- 상세: [feature-ledger.md](feature-ledger.md).

### 5.5 투자 (보유종목 / 포트폴리오 / 관심종목 / 알림)
- 모델: `Holding`, `HoldingTransaction`(BUY/SELL/DIVIDEND/FEE/TAX, 가계부 연동 `ledgerEntryId`), `Watchlist`, `StockNote`, `StockAlarm`(ABOVE/BELOW), enum `HoldingTransactionType`/`AlarmDirection`.
- API: `app/api/holdings/*`(거래·시세·검색·trades), `app/api/watchlist/route.ts`, `app/api/stock-note/route.ts`, `app/api/stock-alarm/*`.
- 특징: 보유 종목 거래 ↔ 가계부 자동 동기화(`app/lib/holdingLedgerSync.ts`), 포트폴리오 집계(`app/lib/holdingAggregate.ts`), 관심목록/메모/도달가 알람.
- 상세: [feature-investing.md](feature-investing.md).

### 5.6 KIS 시장데이터
- 모델: `KisCredential`(사용자당 1개, appKey/appSecret/accessToken AES-256-GCM 암호화).
- API: `app/api/kis/*`(31개 — 지수/랭킹/섹터/뉴스/투자자/자격증명 및 종목 상세 daily/minutes/investor/financial/orderbook 등), `app/api/disclosure/[code]/route.ts`.
- lib: `app/lib/kisAuth.ts`, `kisCache.ts`, `kisMarket.ts`, `kisOverseas.ts`, `kisQuote.ts`, `kisRateLimit.ts`, `kisStock.ts`, `naverDisclosure.ts`, `naverFinance.ts`.
- 상세: [integration-kis.md](integration-kis.md).

### 5.7 권한 관리
- 모델: `MenuPermission`, `UserMenuPermission`(ALLOW/DENY), `PermissionOverrideMode`(enum).
- API: `app/api/permission/route.ts`(GET 시드/필터·PUT 정책 저장), `app/api/permission/users/route.ts`, `app/api/permission/users/[userId]/role/route.ts`, `app/api/permission/users/[userId]/overrides/route.ts`.
- 화면: `/permission`(ADMIN 전용) 2탭 — 메뉴 기본 정책 / 유저별 role·override.
- 상세: [auth-permissions.md](auth-permissions.md).

### 5.8 기타 (포트폴리오 / 대시보드 / 미니게임)
- `/leesh`: 공개 포트폴리오. 본문은 누구나 열람, `LEESH_PASSWORD` 기반 unlock(`app/api/leesh/unlock/route.ts`) + `canEdit` 시 본문 편집, 문의 폼(`app/api/leesh/contact/route.ts`). 데이터 API `app/api/leesh/route.ts`.
- `/dashboard`: 최근 블로그/댓글/일정 요약(서버 컴포넌트, `app/dashboard/page.tsx`).
- 미니게임: 사이드바 내장 아케이드(`app/minigame/MiniGameClient.tsx`).
- 데일리 카드·연출: `DailyLuckCard`, `DailyQuestCard`, `ScrollSummonEffect`, `WorldBossButton`, `TitlePrank` 등(`app/components/`).
- 상세: [feature-misc.md](feature-misc.md).

---

## 6. 데이터 모델 · 라이브러리 · 컴포넌트 (요약)

- **Prisma 모델 20개**: User, Account, Session, VerificationToken, Board, Post, Comment, LedgerEntry, KisCredential, FinancialAccount, Holding, HoldingTransaction, ScheduleShare, UserMenuPermission, Watchlist, StockNote, StockAlarm, BudgetTarget, DiaryEntry, MenuPermission. **enum 12개**: Role, PostStatus, BoardType, BlogPostCategory, PermissionOverrideMode, ScheduleShareStatus, ScheduleShareScope, LedgerEntryType, AccountType, HoldingTransactionType, AlarmDirection, BudgetScope. 관계·인덱스 상세는 [database.md](database.md).
- **lib 모듈**(`app/lib/`): 인증/유틸(`prisma.ts`, `prismaError.ts`, `mailer.ts`, `verificationToken.ts`, `rateLimit.ts`, `cryptoUtil.ts`, `unlockCookie.ts`, `validation.ts`, `userLabel.ts`, `appUrl.ts`, `date.ts`, `httpErrorText.ts`, `markdown.ts`, `useAsyncLock.ts`), 도메인(`ledgerCategories.ts`, `accountTypes.ts`, `budgetTargets.ts`, `holdingAggregate.ts`, `holdingLedgerSync.ts`, `fxRate.ts`, `scheduleShare.ts`, `blog.ts`, `koreanHolidayCalendar.ts`, `koreanHolidayConstants.ts`), KIS(`kisAuth/kisCache/kisMarket/kisOverseas/kisQuote/kisRateLimit/kisStock`, `naverDisclosure`, `naverFinance`). 상세는 [lib-reference.md](lib-reference.md).
- **공통 UI 컴포넌트**(`app/components/`): `AppShell`, `Sidebar`, `Providers`, `ToastProvider`, `ThemeToggle`, `MarkdownEditor`, `Footer`, `GlobalTopRightControls`, `PageNavIcons`, `SectionTocClient`, `ChartTooltip` 등. 레이아웃/테마/마크다운 렌더링은 [frontend-and-ui.md](frontend-and-ui.md).

---

## 7. 관련 문서

| 문서 | 내용 |
| --- | --- |
| [architecture.md](architecture.md) | 폴더 구조·런타임·데이터 흐름 |
| [setup-and-run.md](setup-and-run.md) | 로컬 실행·초기 설정 |
| [env-and-security.md](env-and-security.md) | 환경변수·보안·레이트리밋 |
| [database.md](database.md) | Prisma 스키마·관계·enum·인덱스 |
| [auth-permissions.md](auth-permissions.md) | 인증·권한 모델·ADMIN 정책 |
| [api-reference.md](api-reference.md) | 전체 API 엔드포인트 레퍼런스 |
| [frontend-and-ui.md](frontend-and-ui.md) | 레이아웃·테마·컴포넌트 |
| [lib-reference.md](lib-reference.md) | lib 함수 레퍼런스 |
| [feature-content.md](feature-content.md) | 블로그·Docs·게시판·고객센터 |
| [feature-productivity.md](feature-productivity.md) | TODO·캘린더·일기·일정공유 |
| [feature-ledger.md](feature-ledger.md) | 가계부·계좌·예산·통계 |
| [feature-investing.md](feature-investing.md) | 보유종목·포트폴리오·관심·알림 |
| [integration-kis.md](integration-kis.md) | KIS·외부 시장데이터 연동 |
| [feature-misc.md](feature-misc.md) | leesh 포트폴리오·대시보드·미니게임 |
| [operations-troubleshooting.md](operations-troubleshooting.md) | 운영·장애 대응 |
| [qa-checklist.md](qa-checklist.md) | 수동 QA 체크리스트 |
