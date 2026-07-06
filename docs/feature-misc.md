# 기타 기능 (leesh 포트폴리오 · 대시보드 · 미니게임 · 홈)

다른 도메인 문서에 묶이지 않는 부가 표면을 모은 권위 레퍼런스입니다. 단일 비밀번호로 잠금 해제하는 포트폴리오(`/leesh`), 공개/개인 피드를 합성하는 대시보드(`/dashboard`), 사이드바에 내장된 미니게임, 홈(`/`)과 그 위젯(데일리 퀘스트·행운 카드·월드 보스 이스터에그), 그리고 시스템 페이지(`not-found`/`loading`)를 다룹니다.

> 작성 기준: 2026-06-24, dev 브랜치

상호 참조: [database.md](database.md) · [api-reference.md](api-reference.md) · [auth-permissions.md](auth-permissions.md) · [lib-reference.md](lib-reference.md) · [frontend-and-ui.md](frontend-and-ui.md) · [env-and-security.md](env-and-security.md) · [feature-content.md](feature-content.md) · [feature-productivity.md](feature-productivity.md)

---

## 0. 표면 한눈에 보기

| 표면 | 진입 | 주요 파일 | 데이터/저장소 |
| --- | --- | --- | --- |
| leesh 포트폴리오 | `/leesh` | `app/leesh/page.tsx` → `LeeshClient.tsx`, `app/api/leesh/*` | `Board(type=PORTFOLIO)` + `Post(slug='leesh')`, `leesh_unlocked` 쿠키 |
| 대시보드 | `/dashboard` | `app/dashboard/page.tsx` | `Board`/`Post`/`Comment`/`ScheduleShare` (읽기 합성) |
| 미니게임 | 사이드바 "미니 게임" 버튼 | `app/minigame/MiniGameClient.tsx` (Sidebar 내장) | `localStorage`(서버 저장 없음) |
| 홈 | `/` | `app/page.tsx` + `DailyQuestCard`/`DailyLuckCard` | `localStorage`(퀘스트 진행도) |
| 월드 보스(이스터에그) | 전역(레이아웃) | `app/components/WorldBossButton.tsx` | 클라이언트 상태(영속 없음) |
| 시스템 페이지 | 404 / 로딩 | `app/not-found.tsx`, `app/loading.tsx` | 없음 |

> **주의 — `/minigame` 라우트는 없습니다.** `app/minigame/`에는 `page.tsx`가 없고 `MiniGameClient.tsx`만 존재하며, 이 컴포넌트는 사이드바(`app/components/Sidebar.tsx:333`)에서 `mode==='game'`일 때만 렌더됩니다. README의 "도메인 ↔ 문서 빠른 매핑"에 적힌 `/minigame` 경로는 직접 탐색 가능한 페이지가 아니라 사이드바 내장 패널을 가리킵니다.
>
> **주의 — `app/api/uploads/` 디렉터리는 비어 있습니다.** `route.ts`가 없어 업로드 엔드포인트는 구현돼 있지 않으며, 코드베이스 어디에서도 `/api/uploads`를 호출하지 않습니다. 마크다운 이미지는 외부 URL을 직접 참조합니다(서버 측 파일 업로드 미지원).

---

## 1. leesh 포트폴리오 (`/leesh`)

자기소개/이력/프로젝트를 정적 섹션으로 보여주고, 하단의 편집 가능한 마크다운 문서 한 장을 **단일 비밀번호**로 잠금 해제해 편집하는 1인용 포트폴리오입니다. NextAuth 세션과 무관하게 `LEESH_PASSWORD` 평문 비교 + 쿠키로 동작합니다.

### 1.1 페이지 `app/leesh/page.tsx`

서버 컴포넌트(`runtime = "nodejs"`, `:3`)이며 `LeeshClient`만 렌더합니다. 모든 로직은 클라이언트(`app/leesh/LeeshClient.tsx`)에 있습니다.

### 1.2 데이터 모델 — PORTFOLIO 보드/글 자동 생성

포트폴리오 본문은 `Board(type=PORTFOLIO)` 아래 `slug='leesh'`인 `Post` 한 행에 저장됩니다(`BoardType.PORTFOLIO`, `prisma/schema.prisma:172`).

- **소유자**: `getOwnerUserId()`(`app/api/leesh/route.ts:8`) — `User.createdAt` 오름차순 첫 행(= 첫 가입자). 사용자가 없으면 `null`.
- **자동 생성**: `getOrCreatePortfolioPost(ownerId)`(`:16`) — PORTFOLIO 보드(`name:'Leesh Portfolio'`)가 없으면 생성, 그 안에 `slug:'leesh'`/`title:'자기소개서'`/`status:'DONE'` 글이 없으면 기본 본문(`# Leesh ...`)으로 생성. GET/PATCH 모두 이 함수를 거치므로 최초 접근 시 자동 시드됩니다.

### 1.3 API — `/api/leesh` (`app/api/leesh/route.ts`)

잠금 쿠키 이름은 `leesh_unlocked`(값 `"1"`)이며 `COOKIE_NAME`(`:6`)으로 정의됩니다. **콘텐츠 비밀글의 `leesh_unlocked_posts` 쿠키와는 완전히 별개의 메커니즘**입니다([feature-content.md](feature-content.md)).

| 메서드 | 인증 | 동작 |
| --- | --- | --- |
| `GET` (`:78`) | 없음(공개) | 요청 `Cookie` 헤더에 `leesh_unlocked=1` 포함 여부로 `unlocked`/`canEdit` 계산. owner 없으면 placeholder 본문(`# Leesh ... (아직 작성된 문서가 없습니다.)`) 반환. owner 있으면 `{id, title, contentMd, updatedAt, unlocked, canEdit}` |
| `PATCH` (`:112`) | **쿠키 필수** | `leesh_unlocked=1` 없으면 401(`unauthorized`). owner 없으면 404(`owner not found`). 바디 `contentMd`가 문자열 아니면 400(`invalid body`). 통과 시 포트폴리오 글의 `contentMd` 갱신 후 `{id, title, contentMd, updatedAt}` 반환 |

`canEdit`은 항상 `unlocked`와 동일합니다(쿠키만 있으면 편집 허용 — 세션/역할과 무관).

### 1.4 API — `POST /api/leesh/unlock` (`app/api/leesh/unlock/route.ts`)

- 바디(zod `unlockBodySchema`, `.strict()`): `{ password: string(min 1) }`.
- 비교: 입력 비번을 `process.env.LEESH_PASSWORD`(`:7`)와 **평문 비교**(`pw !== PASSWORD` → 401 `비밀번호가 틀렸습니다.`).
- `LEESH_PASSWORD` 미설정 시 500(`서버 설정 오류: LEESH_PASSWORD가 설정되지 않았습니다.`).
- 성공 시 `leesh_unlocked=1` 쿠키 설정(`:39`): `httpOnly` · `sameSite=lax` · `secure`(production) · `path=/` · `maxAge = 60*60*24*30`(**30일**). `bcrypt`/HMAC 없이 단순 토큰 쿠키입니다.

> 보안 메모: 단일 평문 비밀번호 + 영속 쿠키 모델이라 개인 포트폴리오 편집용에 한정됩니다. 상세는 [env-and-security.md](env-and-security.md)(`LEESH_PASSWORD`) 참고.

### 1.5 API — `POST /api/leesh/contact` (`app/api/leesh/contact/route.ts`)

포트폴리오 하단 "Contact Me" 폼의 문의 메일 전송 엔드포인트.

- **레이트리밋**: `getClientIp(req)` 기준 키 `leesh-contact:{ip}`, `CONTACT_LIMIT=6`회 / `CONTACT_WINDOW_MS=10분`(`:9`~`:10`). 초과 시 429 + `Retry-After` 헤더(`app/lib/rateLimit.ts`).
- **바디**(zod `contactBodySchema`, `.strict()`, `:12`): `name?`(trim, ≤60), `email`(trim, min 1), `subject?`(trim, ≤120), `message`(trim, 10~2000자). 추가로 `EMAIL_REGEX`로 이메일 형식 재검증(불일치 시 400).
- **수신지**: `process.env.LEESH_CONTACT_TO ?? process.env.SMTP_USER`(`:86`). 둘 다 없으면 500.
- **전송**: `sendMail`(`app/lib/mailer.ts`) — `replyTo=발신자 이메일`, 제목 `[Leesh Contact] {subject|'포트폴리오 문의'}`, 본문에 보낸 사람/회신 이메일/IP/KST 시간(`formatKstDateTime`, Asia/Seoul)/메시지 포함. 헤더 인젝션 방지로 `sanitizeHeaderText`가 개행 제거.
- 성공 `{ ok: true }`, 예외 시 `[LEESH_CONTACT_ERROR]` 로깅 후 500.

### 1.6 클라이언트 `app/leesh/LeeshClient.tsx`

`'use client'` 컴포넌트로, 정적 프로필 섹션과 동적 문서/문의를 함께 렌더합니다.

- **정적 섹션**(상수 배열로 하드코딩): Portfolio 헤더(이름 "이승현"), About me/핵심 역량(`highlights`), Experience(`experiences`), Career(`careers`), Projects(`projects`, GitHub 링크/멀티 링크 처리), GitHub 잔디 차트(`https://ghchart.rshah.org/6d5aff/leesh0829`), Tech Stack(`detailedTechStacks`), Direction, Contact Me 폼.
- **문서 로드/저장**: 마운트 시 `load()`(`:138`)가 `GET /api/leesh`(`cache:'no-store'`) 호출 → `doc`/`unlocked`/`canEdit` 세팅. `doUnlock()`(`:209`)이 `/api/leesh/unlock` POST 후 재로드. `save()`(`:234`)는 `doc.canEdit`일 때만 `PATCH /api/leesh`.
- **잠금 UI**: 우상단 "로그인" 버튼 → 비밀번호 모달(`showUnlockModal`). 해제되면 "편집"/"저장" 버튼 노출(`doc.canEdit`).
- **문의 전송**: `submitContact()`(`:263`) — 이메일 비고 + 메시지 10자 이상이어야 활성(`canSendContact`). `/api/leesh/contact` POST.
- **마크다운 렌더**: 읽기 모드는 `ReactMarkdown`(remark: `gfm`+`breaks`, rehype: `rehypeRaw`+`rehypeHighlight`) — **새니타이즈 없음(raw HTML 허용)**(`:862`). 편집 모드는 `MarkdownEditor` `htmlMode="raw"`(`:858`). 콘텐츠 도메인의 `safe` 모드와 달리 포트폴리오는 작성자=신뢰 모델로 raw 렌더합니다([feature-content.md](feature-content.md)).
- **스크롤 리빌**: `.leesh-page .scroll-reveal` 요소에 `IntersectionObserver`로 `is-visible` 토글(`:169`). `prefers-reduced-motion` 또는 IO 미지원 시 즉시 표시.
- `httpErrorText`의 `toHumanHttpError`로 에러 메시지를 한글화합니다([lib-reference.md](lib-reference.md)).

---

## 2. 대시보드 (`/dashboard`)

서버 컴포넌트(`app/dashboard/page.tsx`, `runtime = "nodejs"`, `DashboardPage` at `:316`) 하나로 공개 피드 + (로그인 시) 개인 일정/TODO/활동을 합성합니다. 미로그인도 공개 피드는 보입니다.

### 2.1 DB 비가용 그레이스풀 처리

세션/피드/개인 데이터 3단계 각각을 `try/catch`로 감싸고, `isDatabaseConnectionError`(`app/lib/prismaError.ts`)면 `databaseUnavailable=true`로 전환해 안내 카드를 보여줍니다(연결 오류가 아니면 rethrow). 로그: `[DASHBOARD_DB_UNAVAILABLE][SESSION|FEED|PERSONAL]`.

### 2.2 공개 피드 (로그인 불필요)

| 섹션 | 쿼리 | 필터 |
| --- | --- | --- |
| 최근 blog 리스트 | `post.findMany`(`:351`) | `board.type=BLOG`, `status=DONE`, `isSecret=false`, 최신순 5건 |
| 최근 댓글 리스트 | `comment.findMany`(`:363`) | BLOG/DOCS(공개·DONE·비밀 아님), GENERAL(비밀 아님), HELP(전체) 글의 댓글, 최신순 5건 |

각 항목 라벨은 `displayUserLabel(name, email, fallback)`(`app/lib/userLabel.ts:11`, 이메일은 `maskEmail`로 마스킹), 날짜는 `toISOStringSafe`(`app/lib/date.ts`). 댓글 `typeLabel`은 보드 타입에 따라 `blog`/`docs`/`help`/`board`.

### 2.3 개인 영역 (로그인 + 사용자 조회 성공 시)

세션 이메일로 `me`를 찾은 뒤(`:391`), `getReadableScheduleOwnerIds(me.id, 'CALENDAR')`/`(..., 'TODO')`(`app/lib/scheduleShare.ts`)로 [내 id + ACCEPTED 공유 소유자]를 구해 합성합니다([feature-productivity.md](feature-productivity.md)).

- **오늘의 일정**: 공유 보드들의 `singleSchedule` 보드 일정(`kind:'BOARD'`)과 글 일정(`kind:'POST'`)을 오늘(`startOfDay`~`endOfDay`) 범위로 필터(`schedulePosts` 쿼리 `:544`). `ownerId===me.id`면 "내 일정", 아니면 "공유된 계정 일정"(`groupByOwner`로 소유자별 그룹화).
- **내 TODO 목록**: `board.type=TODO` + 소유자 in TODO 공유, `status in (TODO, DOING)`인 글(`:472`). `splitTodoByStatus`로 TODO/DOING 2컬럼.
- **내 활동 피드**: 내가 만든 보드(`:495`) + 작성한 글(`:507`) + 남긴 댓글(`:521`)을 합쳐 최신순 5건.

### 2.4 링크 빌더 (BoardType → 경로)

`buildBoardHref`(`:162`)/`buildPostHref`(`:172`)가 보드 타입별로 경로를 만듭니다.

| BoardType | 보드 링크 | 글 링크 |
| --- | --- | --- |
| `BLOG` | `/blog` | `/blog/{postId}` |
| `DOCS` | `/docs` | `/docs/{postId}` |
| `TODO` | `/todos/{boardId}` | `/todos/{boardId}/{slug‖postId}` |
| `HELP` | `/help` | `/help/{postId}` |
| `PORTFOLIO` | `/leesh` | `/leesh` |
| `CALENDAR` | `/calendar` | `/calendar` |
| 그 외(GENERAL) | `/boards/{boardId}` | `/boards/{boardId}/{slug‖postId}` |

상단 헤더에는 로그인 여부 배지와 블로그/보드/캘린더 바로가기, DB 비가용 시 안내 카드를 표시합니다.

---

## 3. 미니게임 (Mini Arcade)

`app/minigame/MiniGameClient.tsx`의 `'use client'` 컴포넌트. **별도 라우트가 아니라** 사이드바에서 "미니 게임" 버튼(`app/components/Sidebar.tsx:393`, `setMode('game')`)을 누르면 사이드바 패널이 게임 모드로 바뀌며 렌더됩니다(`:333`). 기록은 서버가 아닌 `localStorage`에만 저장됩니다.

| 게임 | id | 규칙 | localStorage 키 | 최고 기록 |
| --- | --- | --- | --- | --- |
| Reflex Sprint | `reflex` | 신호(녹색) 뜨면 즉시 클릭/Space/Enter, 너무 빠르면 실패 | `leesh-mini-game-reflex` | 최단 반응(ms), false start 횟수 |
| Number Rush | `numberRush` | 1→9 순서대로 누르기(매 클릭 보드 셔플) | `leesh-mini-game-number-rush` | 최단 완료(ms) |
| Target Burst | `targetBurst` | 12초간 타겟 최대한 많이 클릭 | `leesh-mini-game-target-burst` | 최고 점수 |

- 반응 지연 랜덤 범위 `REFLEX_MIN_DELAY_MS=1200`~`REFLEX_MAX_DELAY_MS=2800`, Target Burst 제한시간 `TARGET_BURST_DURATION_MS=12000`(`:51`~`:53`).
- `readStorage`/`writeStorage`가 SSR/파싱 오류를 안전 폴백하며, 각 게임은 마운트 시 저장값을 정규화해 복원합니다.
- 게임 선택 탭(`GAMES`, `:55`)으로 3종 전환, 기본값은 `reflex`.

---

## 4. 홈 (`/`)

`app/page.tsx` 서버 컴포넌트. 히어로(제목 "Leesh" → `/leesh` 링크, "대시보드" 버튼 → `/dashboard`), 기능 카드 5종(블로그/Docs/게시판/TODO/캘린더), 그리고 하단 위젯 2개(`DailyQuestCard` `:78`, `DailyLuckCard` `:79`)로 구성됩니다.

### 4.1 데일리 퀘스트 — `app/components/DailyQuestCard.tsx`

- `localStorage` 키 `leesh-daily-quest`(`:24`)에 `{day, index, completed, streak, lastCompletedDay}` 저장.
- 퀘스트 4종(`QUESTS`, `:26`): TODO/CALENDAR/BOARD/BLOG 각각으로 유도(링크 + CTA + accent 색).
- 그날의 기본 퀘스트는 날짜 키 FNV 해시(`hashString`) `% QUESTS.length`로 결정(`getDefaultQuestIndex`). "다시"(reroll)로 다른 퀘스트 무작위 교체, "완료 체크"로 달성 + **연속 일수(streak)** 갱신(`isPreviousDay`로 어제 달성 시 +1). 완료 시 스파크 버스트 애니메이션.
- `focus`/`visibilitychange`에 날짜 재동기화.

### 4.2 행운 카드 — `app/components/DailyLuckCard.tsx`

- **localStorage 미사용** — 날짜 키만으로 결정론적 생성(`getLuckyBundle`, `:216`). FNV 해시 시드로 행운 번호(1~99), 색(`LUCKY_COLORS`), 심볼(`LUCKY_SYMBOLS`), 분위기 문구(`LUCKY_AURAS`), 팁(`LUCKY_TIPS`)을 `pickBySeed`로 선택.
- 1분 간격 인터벌 + `focus`/`visibilitychange`로 자정 넘김 시 날짜 갱신(`getTodayKey`는 로컬 타임존 기준).
- 색상에 따라 카드 배경/테두리를 `color-mix`로 동적 스타일링.

### 4.3 월드 보스(이스터에그) — `app/components/WorldBossButton.tsx`

홈 전용이 아니라 **루트 레이아웃 전역**에 마운트됩니다(`app/layout.tsx:108`, `app-physics-layer` 안).

- 10분마다(`REVEAL_INTERVAL_MS`) `REVEAL_CHANCE=0.008` 확률로 "???" 수상한 버튼이 노출되고, 클릭하지 않으면 `REVEAL_DURATION_MS=45초` 후 사라짐(`:31`~`:33`).
- 버튼 클릭 시 `DURATION_MS=8200ms`짜리 보스 레이드 오버레이 연출(phase: summon→berserk(`BERSERK_START_MS=2200`)→collapse(`COLLAPSE_START_MS=6500`)), HP 게이지/데미지 숫자/경고 문구가 흐르며 `document.body`에 `world-boss-active` 클래스 부여. 서버/영속 상태 없음.

---

## 5. 시스템 페이지

| 파일 | 역할 | 비고 |
| --- | --- | --- |
| `app/not-found.tsx` | 404 페이지 | "404 생물" 크리처 애니메이션(`not-found-creature` 등) + 홈/대시보드 이동 버튼. `data-scroll-physics-ignore` 사용 |
| `app/loading.tsx` | 전역 로딩 UI | `role="status"` + `loading-dots` 점 3개 스피너 |

스타일 클래스(`not-found-*`, `loading-dots`, `world-boss-*`, `daily-luck-*`, `daily-quest-*`, `mini-arcade`)는 `app/globals.css`에 정의됩니다([frontend-and-ui.md](frontend-and-ui.md)).

---

## 6. 권한·저장소 요약

| 행위 | 요구 조건 | 저장 위치 |
| --- | --- | --- |
| 포트폴리오 본문 열람 | 없음(공개) | `Post(PORTFOLIO, slug='leesh')` |
| 포트폴리오 본문 편집 | `leesh_unlocked=1` 쿠키(= `LEESH_PASSWORD` 입력) | 동일 |
| 포트폴리오 문의 전송 | 없음(레이트리밋 6/10분) | 이메일(`LEESH_CONTACT_TO‖SMTP_USER`) |
| 대시보드 공개 피드 | 없음 | DB(읽기) |
| 대시보드 개인 영역 | 로그인 + 사용자 일치 | DB(읽기) + `ScheduleShare` |
| 미니게임 기록 | 없음 | `localStorage`(서버 저장 없음) |
| 데일리 퀘스트 진행도 | 없음 | `localStorage` |
| 행운 카드 | 없음 | 없음(날짜 결정론) |

> 관련: 포트폴리오 잠금 쿠키/환경변수는 [env-and-security.md](env-and-security.md), 일정 공유·읽기 권한은 [feature-productivity.md](feature-productivity.md), 비밀글 unlock 쿠키(`leesh_unlocked_posts`, 포트폴리오와 별개)는 [feature-content.md](feature-content.md) 참고.
</content>
</invoke>
