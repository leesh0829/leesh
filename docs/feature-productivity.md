# 생산성 기능 (TODO · 캘린더 · 일기장 · 일정공유)

보드 기반 TODO, 월간 캘린더(개인/공유 일정 + 대한민국 공휴일), 계정별 비공개 일기장, 사용자 간 일정 공유(scheduleShare)를 다루는 권위 레퍼런스입니다. 라우트·모델·페이지·KST 날짜 처리 관례를 빠짐없이 정리합니다.

> 작성 기준: 2026-06-24, dev 브랜치

관련 문서: [database.md](database.md) · [api-reference.md](api-reference.md) · [auth-permissions.md](auth-permissions.md) · [feature-content.md](feature-content.md) · [lib-reference.md](lib-reference.md) · [frontend-and-ui.md](frontend-and-ui.md)

---

## 1. 개요

이 영역의 핵심 모델은 `Board` / `Post`(일정 필드 포함) / `DiaryEntry` / `ScheduleShare` 네 가지입니다. TODO·캘린더는 `Board`/`Post`를 공유하며, 캘린더는 추가로 빌트인 "대한민국 공휴일"을 합성합니다. 일기장은 독립 모델(`DiaryEntry`)을 사용하고 본인만 조회 가능합니다.

| 기능 | 프론트 페이지 | 주요 API | 데이터 |
|---|---|---|---|
| TODO (보드 칸반) | `app/todos/*` | `/api/todos/boards`, `/api/todos/boards/[boardId]` | `Board(type=TODO)`, `Post` |
| TODO (아이템, 미사용) | - | `/api/todos`, `/api/todos/[todoId]` | `Board(type=TODO)`, `Post` |
| 캘린더 | `app/calendar/*` | `/api/calendar` (편집은 `/api/boards/...` 재사용) | `Board`, `Post`, 공휴일 |
| 일기장 | `app/diary/*` | `/api/diary` | `DiaryEntry` |
| 일정 공유 | `app/todos`, `app/calendar` 사이드바 | `/api/schedule-shares`, `/api/schedule-shares/[shareId]` | `ScheduleShare` |

모든 API는 `getServerSession(authOptions)` 기반 인증을 요구합니다. 대부분 `export const runtime = "nodejs"`를 선언하지만 `/api/todos/boards`·`/api/todos/boards/[boardId]`는 선언이 없어 기본 런타임을 사용합니다. 날짜는 응답 직렬화 시 대부분 `toISOStringSafe()`로 ISO 문자열화됩니다(`app/lib/date.ts:1`).

---

## 2. KST 날짜 처리 관례

서버 DB는 `TZ=Asia/Seoul`(Prisma 7 / pg adapter)이지만, API 응답은 UTC ISO 문자열로 내려가고 클라이언트에서 로컬 표시로 변환합니다. "하루 단위" 개념을 다룰 때 일관되게 쓰는 관례가 두 가지 있습니다.

**(1) `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })` → `YYYY-MM-DD`**
`en-CA` 로캘이 ISO식 `YYYY-MM-DD`를 출력한다는 점을 이용해 "KST 기준 오늘"을 구합니다.

- 일기장 클라이언트의 KST 오늘 계산: `app/diary/DiaryClient.tsx:14`
  ```ts
  function kstToday(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
  }
  ```
- 공휴일 날짜 키 계산: `app/lib/koreanHolidayCalendar.ts:9`, `:39`(`formatKoreaDateKey`)

**(2) UTC 기준 산술로 DST/타임존 흔들림 제거**
"YYYY-MM-DD 문자열에 일수 더하기"는 `Date.UTC()`로 계산해 로컬 타임존 영향을 배제합니다.

- 일기 날짜 ±N일 이동: `app/diary/DiaryClient.tsx:24`(`addDays`)
- 캘린더 월 범위 계산: `app/api/calendar/route.ts:51`(`ymToRange` — `Date.UTC(y, m-1, 1)` ~ `Date.UTC(y, m, 1)`)
- 일기 날짜 유효성 검증: `app/api/diary/route.ts:12`(`dateSchema`, UTC 재구성으로 실제 존재하는 날짜인지 확인)

**`app/lib/date.ts` 직렬화 헬퍼**

| 함수 | 동작 | 인용 |
|---|---|---|
| `toISOStringSafe(value)` | `Date`/문자열/숫자를 ISO 문자열로. 잘못된 값이면 `throw` | `app/lib/date.ts:1` |
| `toISOStringNullable(value)` | `null`/`undefined`는 `null`, 그 외 `toISOStringSafe` | `app/lib/date.ts:12` |

> 캘린더 막대(allDay) 렌더 시 종료일이 다음날 00:00으로 저장되는 케이스를 하루 보정하는 로직은 클라이언트 `normalizeSpanEnd`에 있습니다(`app/calendar/CalenderClient.tsx:210`).

---

## 3. 데이터 모델

`Board`/`Post`/`PostStatus`/`BoardType`의 전체 정의는 [database.md](database.md) 참조. 여기서는 생산성 기능이 사용하는 필드만 정리합니다.

### 3.1 Board (일정 관련 필드) — `prisma/schema.prisma:94`

| 필드 | 타입 | 기본값 | 용도 |
|---|---|---|---|
| `type` | `BoardType` | `GENERAL` | `TODO`/`CALENDAR` 등 보드 종류 |
| `singleSchedule` | `Boolean` | `false` | 보드 자체를 캘린더의 단일 일정으로 노출 |
| `scheduleStatus` | `PostStatus` | `TODO` | 보드 일정 상태(칸반 컬럼) |
| `scheduleStartAt` | `DateTime?` | - | 보드 일정 시작 |
| `scheduleEndAt` | `DateTime?` | - | 보드 일정 종료 |
| `scheduleAllDay` | `Boolean` | `false` | 하루종일 여부 |

### 3.2 Post (일정 관련 필드) — `prisma/schema.prisma:115`

`startAt`(`DateTime?`), `endAt`(`DateTime?`), `allDay`(`Boolean @default(false)`, `:128`), `status`(`PostStatus`), `isSecret`, `secretPasswordHash`. TODO 보드의 글은 `contentMd=""`, `priority=0`으로 생성됩니다.

### 3.3 DiaryEntry — `prisma/schema.prisma:493`

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `userId` | `String` | `User`(`DiaryEntryOwner`) onDelete: Cascade |
| `date` | `String` | `"YYYY-MM-DD"` (KST 기준 하루) |
| `contentMd` | `String @db.Text` | 마크다운 본문 |
| `createdAt` / `updatedAt` | `DateTime` | |
| 제약 | `@@unique([userId, date])` | 계정·날짜당 1행 |

### 3.4 ScheduleShare — `prisma/schema.prisma:359`

| 필드 | 타입 | 비고 |
|---|---|---|
| `requesterId` | `String` | 공유를 **요청한** 사람(상대 데이터를 보게 됨) |
| `ownerId` | `String` | 데이터 **소유자**(승인/거절 권한자) |
| `scope` | `ScheduleShareScope` | `CALENDAR` / `TODO` / `LEDGER` / `STOCK` |
| `status` | `ScheduleShareStatus` | `PENDING` / `ACCEPTED` / `REJECTED`, 기본 `PENDING` |
| `respondedAt` | `DateTime?` | 승인/거절 시각 |
| 제약 | `@@unique([requesterId, ownerId, scope])` | + 인덱스 2종 |

관련 enum: `PostStatus { TODO, DOING, DONE }`(`:162`), `BoardType { GENERAL, BLOG, DOCS, PORTFOLIO, TODO, CALENDAR, HELP }`(`:168`), `ScheduleShareStatus`(`:189`), `ScheduleShareScope`(`:195`).

---

## 4. TODO (보드 기반 칸반)

### 4.1 페이지 `app/todos`

- `app/todos/page.tsx:4` → `TodosClient`(클라이언트 컴포넌트) 렌더, `runtime='nodejs'`.
- `app/todos/TodosClient.tsx` — 좌측 칸반(TODO/DOING/DONE 3컬럼) + 우측 "TODO 공유 계정 관리" 사이드바.
  - **보드 생성 폼**: 이름(필수)·설명(선택)·단일 일정 모드 토글·시작/종료/하루종일 → `POST /api/todos/boards`(`:637` `create`).
  - **상태 이동**: 컬럼 버튼 또는 드래그앤드롭(`dndEnabled`는 `(hover:hover) and (pointer:fine)` 미디어쿼리로 데스크톱에서만 활성, `:531`). `PATCH /api/todos/boards/[id]`로 `scheduleStatus` 변경(`:677` `move`).
  - **삭제**: 확인창 후 `DELETE /api/boards/[id]`(보드 공용 삭제 라우트 재사용, `:726`).
  - **단일 일정 토글/저장**: `toggleSingle`(`:739`), `saveSchedule`(`:768`) 모두 `PATCH /api/todos/boards/[id]`. 단일 일정인 보드는 "캘린더 연동" 배지가 붙고 캘린더에 `kind:'BOARD'`로 노출됩니다.
  - **공유 계정 패널**: `/api/schedule-shares`로 `scope='TODO'` 요청/승인/거절/해제. `outgoing`/`incoming`은 `scope==='TODO'`만 필터링(`:502`, `:505`).
  - **소유자별 색상/표시 토글**: 승인된 공유 소유자에 파스텔 색(`getPastelColor`, FNV 해시 기반 `:71`)을 부여하고 체크박스로 컬럼 표시를 on/off.
  - `canEdit=false`(공유받은 보드)는 상태 버튼/일정 입력/삭제가 비활성, 읽기 전용.

### 4.2 보드 상세 / 글 상세 페이지 (서버 컴포넌트)

| 경로 | 파일 | 동작 |
|---|---|---|
| `/todos/[boardId]` | `app/todos/[boardId]/page.tsx` | 본인 또는 `ScheduleShare(scope=TODO, ACCEPTED)` 권한자만 접근. `Board.type!=='TODO'`면 거부. 글 목록을 `BoardDetailClient`(content 기능 재사용)로 렌더, `postDetailBaseHref=/todos/[id]`, `canCreate=ownerId===me.id` |
| `/todos/[boardId]/[postId]` | `app/todos/[boardId]/[postId]/page.tsx` | 동일 권한 검사. 비밀글은 `unlockCookie`/작성자/ADMIN만 본문 노출. `PostDetailClient` 재사용 |

권한 검사 핵심(`app/todos/[boardId]/page.tsx:66`): 소유자가 아니면 `prisma.scheduleShare.findFirst({ requesterId: me.id, ownerId: board.ownerId, scope:'TODO', status:'ACCEPTED' })`로 읽기 권한 확인.

### 4.3 API — 보드 단위

#### `GET /api/todos/boards` — `app/api/todos/boards/route.ts:29`
- **인증**: 필수(401 `unauthorized`).
- **동작**: `getReadableScheduleOwnerIds(me.id, 'TODO')`로 [내 id + ACCEPTED 공유 소유자 id]를 구한 뒤 `Board(type=TODO, ownerId in ...)` 조회(최신순).
- **응답**: 배열. 각 항목에 `ownerLabel`(`toUserLabel`), `shared`(소유자≠나), `canEdit`(소유자=나), `scheduleStatus/singleSchedule/scheduleStartAt/scheduleEndAt/scheduleAllDay`, `createdAt` 포함. 날짜는 ISO 문자열.

#### `POST /api/todos/boards` — `app/api/todos/boards/route.ts:82`
- **인증**: 필수.
- **바디**(zod 미사용, 수동 파싱): `name`(필수, trim), `description?`, `singleSchedule?`, `scheduleStartAt?`, `scheduleEndAt?`, `scheduleAllDay?`.
- **검증**: `name` 공백이면 400. `singleSchedule`일 때만 시작/종료 날짜 파싱하며 `Invalid Date`면 400.
- **부수효과**: `Board` 생성(`type='TODO'`, `scheduleStatus='TODO'`). 비단일 일정이면 시작/종료는 `null`.
- **응답**: 생성된 보드(날짜 ISO화).

#### `PATCH /api/todos/boards/[boardId]` — `app/api/todos/boards/[boardId]/route.ts:11`
- **인증/권한**: 필수. 보드 존재·`type==='TODO'` 확인(아니면 404), `ownerId!==me.id`면 403.
- **바디**(부분 갱신): `scheduleStatus?`, `singleSchedule?`, `scheduleStartAt?`, `scheduleEndAt?`, `scheduleAllDay?`. 날짜는 `null`/`''`이면 해제, 문자열이면 파싱(`Invalid Date` 400).
- **응답**: 갱신된 보드(시작/종료/`updatedAt` ISO화).

### 4.4 API — 아이템(글) 단위 (현재 UI 미사용)

`/api/todos` 및 `/api/todos/[todoId]`는 단일 TODO 보드 안의 개별 글(`Post`)을 다루는 엔드포인트로 존재하지만, 코드베이스 내 프론트엔드 호출처가 없습니다(레거시/대체 API). 동작은 다음과 같습니다.

#### `GET /api/todos` — `app/api/todos/route.ts:72`
- **인증**: 필수. `getOrCreateTodoBoard(userId)`로 소유자의 첫 `type=TODO` 보드를 찾거나 없으면 `name='TODO'` 보드를 생성(`:58`).
- **응답**: `{ boardId, items: [...] }`. `items`는 해당 보드의 `Post`(최신순)로 `id/title/status/createdAt/startAt/endAt/allDay` 포함.

#### `POST /api/todos` — `app/api/todos/route.ts:95`
- **바디**(zod `todoCreateSchema`, `.strict()`): `title`(필수, trim min1), `startAt?`(문자열|null), `endAt?`, `allDay?`(기본 `true`). 날짜는 `''`/`null`/유효 Date만 허용.
- **부수효과**: 보드의 `Post` 생성(`contentMd=''`, `status='TODO'`, `priority=0`). 응답 `{ id }`.

#### `PATCH /api/todos/[todoId]` — `app/api/todos/[todoId]/route.ts:50`
- **바디**(zod `todoPatchSchema`, `.strict()`): `status?`(`TODO|DOING|DONE`), `title?`(trim), `allDay?`, `startAt?`, `endAt?`. 전부 미지정이면 400 `nothing to update`.
- **권한**: `Post(id, authorId=me, board.type=TODO)`가 없으면 404. 부분 갱신 후 `{ ok: true }`.

#### `DELETE /api/todos/[todoId]` — `app/api/todos/[todoId]/route.ts:103`
- 동일 권한 검사 후 `Post` 삭제, `{ ok: true }`.

> zod 파싱은 `parseJsonWithSchema`/`badRequestFromZod`(`app/lib/validation.ts:4`, `:12`)를 사용합니다. 자세한 헬퍼는 [lib-reference.md](lib-reference.md) 참조.

---

## 5. 캘린더

### 5.1 페이지 `app/calendar`

- `app/calendar/page.tsx:4` → `CalendarClient`(`app/calendar/CalenderClient.tsx`, 파일명 철자 `Calender`).
- 월간 그리드: 주 단위로 일정 막대(span bar)를 lane 배치(겹치면 아래 줄). 데스크톱은 막대 오버레이(`weeks` 계산 `:730`), 모바일(`sm:hidden`)은 날짜별 카드 리스트(`:1272`).
- **막대 한 칸당 최대 5개**(`MAX_VISIBLE_BARS=5`), 초과분은 "+N more" 버튼 → 모달(`openMore`).
- **필터**: 보드 필터(`boardFilter`), 상태 필터(`statusFilter` TODO/DOING/DONE), 공유 소유자 표시 토글(`visibleOwners`). 모두 클라이언트 측 `filteredItems`(`:350`).
- **색상**: 보드별 점 색(`getBoardColor` `:157`), 소유자별 막대 배경(`getOwnerColor` `:172`, 본인 `#ffffff`, 공휴일 `#fecaca`).
- **편집 모달**(`editing`): 제목/상태/시작/종료/allDay 수정, 삭제. `canEdit=false`(공유·공휴일)는 읽기 전용.
- **하루 이동 버튼**(◀▶): 막대 위에서 시작/종료를 ±1일 이동(`shiftItemDays` `:627`, `startAt` 없으면 거부).

편집/이동/삭제는 캘린더 전용 API가 아니라 **콘텐츠 보드 API를 재사용**합니다(`saveEdit` `:540`, `deleteEdit` `:589`):

| 항목 종류 | 저장/삭제 URL | 비고 |
|---|---|---|
| `kind==='POST'` | `PATCH`/`DELETE /api/boards/[boardId]/posts/[postId]` | `title`/`status`/`startAt`/`endAt`/`allDay` |
| `kind==='BOARD'` | `PATCH`/`DELETE /api/boards/[boardId]/schedule` | 제목은 보드명 고정, `status`/일정만 |
| `kind==='HOLIDAY'` | 없음 | 읽기 전용 |

> 위 `posts/[postId]` 및 `schedule` 라우트의 상세 스펙은 [feature-content.md](feature-content.md) / [api-reference.md](api-reference.md) 참조. `schedule` 라우트는 보드 소유자(`ownerId===me.id`)만 PATCH/DELETE 가능하며, DELETE는 보드는 남기고 일정 필드만 초기화합니다(`app/api/boards/[boardId]/schedule/route.ts`). `posts/[postId]` PATCH는 `authorId!==me.id`면 403입니다.

### 5.2 API — `GET /api/calendar` — `app/api/calendar/route.ts:58`

- **인증**: 필수(401).
- **쿼리**: `month`(`YYYY-MM`, 필수, 없으면 400 `month required`).
- **동작**:
  1. `ymToRange(month)`로 `[start, end)` UTC 범위 계산(`:51`).
  2. `getReadableScheduleOwnerIds(user.id, 'CALENDAR')`로 [내 id + ACCEPTED 공유 소유자]를 구함.
  3. **Post 기반 일정**: 해당 소유자들의 **모든 보드**(타입 무관) 글 중 `startAt!=null && startAt<end` 이고 (`endAt=null && startAt>=start`) 또는 `endAt>=start`인 항목(`:102`).
  4. **Board 자체 일정**: `singleSchedule=true && scheduleStartAt`이고 월 범위와 겹치는 보드(`:168`).
  5. **공휴일**: `getKoreanHolidayCalendarItems(month)` 합성(아래 6장).
  6. `startAt` → `displayTitle` 순 정렬 후 단일 배열 반환.
- **응답 항목 공통 필드**: `kind`(`'POST'|'BOARD'|'HOLIDAY'`), `id`, `slug`, `boardId`, `boardName`, `boardType`, `ownerId`, `ownerLabel`, `canEdit`, `shared`, `title`, `displayTitle`(`[소유자] 보드명 · 제목` 형태), `status`, `isSecret`, `startAt`/`endAt`(ISO|null), `allDay`, `createdAt`. 공휴일은 추가로 `isSubstituteHoliday`/`isLunarHoliday`.
- **권한 표기**: `shared = ownerId !== user.id`, POST는 `canEdit = authorId === user.id`, BOARD는 `canEdit = ownerId === user.id`. 공유받은 일정엔 `displayTitle`에 `[소유자라벨]` 접두사.

---

## 6. 대한민국 공휴일 처리

`korean-holidays` 패키지의 `getHolidays(year)`를 가공해 캘린더에 합성합니다.

### `getKoreanHolidayCalendarItems(month)` — `app/lib/koreanHolidayCalendar.ts:51`
- `month`이 `^\d{4}-\d{2}$` 형식이 아니거나 연도 파싱 실패 시 빈 배열.
- 해당 연도 공휴일 중 KST 날짜 키(`formatKoreaDateKey`, en-CA/Asia/Seoul)가 `month`으로 시작하는 것만 필터, 날짜→한글명 순 정렬.
- 각 항목을 `kind:'HOLIDAY'` 캘린더 아이템으로 변환:
  - `id = holiday:kr:{dateKey}:{nameKo}`, `boardType='CALENDAR'`, `status='HOLIDAY'`, `allDay=true`, `canEdit=false`, `shared=false`, `startAt=holiday.date.toISOString()`, `endAt=null`.
  - `isSubstituteHoliday`(대체공휴일), `isLunarHoliday`(음력) 플래그 포함.

### 상수 — `app/lib/koreanHolidayConstants.ts:1`

| 상수 | 값 | 용도 |
|---|---|---|
| `KOREA_HOLIDAY_OWNER_ID` | `'builtin:kr-holidays'` | 가상 소유자 id |
| `KOREA_HOLIDAY_BOARD_ID` | `'builtin:kr-holidays'` | 가상 보드 id |
| `KOREA_HOLIDAY_LABEL` | `'대한민국 공휴일'` | 표시 라벨 |

클라이언트는 이 owner id를 "기본" 계정으로 사이드바에 고정 추가하고(`#fecaca` 색), 체크박스로 표시 토글합니다(`app/calendar/CalenderClient.tsx:301`). 공휴일 셀·일요일은 빨강, 토요일은 파랑으로 강조(`:1202`).

---

## 7. 일기장 (계정별 비공개 마크다운)

하루 한 장, **본인만** 볼 수 있는 마크다운 일기. KST 오늘을 기본 날짜로 열고, 날짜 네비게이션/달력으로 이동하며 변경분은 이동 시 자동 저장됩니다.

### 7.1 페이지 `app/diary` — `app/diary/page.tsx:5` → `DiaryClient`

`app/diary/DiaryClient.tsx` 동작:
- **미로그인 처리**: `useSession` 상태가 `authenticated`가 아니면 로그인/회원가입 안내 카드 노출(`:212`).
- **기본 날짜**: `kstToday()`로 `today`/`date` 초기화(`:68`). `date===today`면 "오늘" 배지, 아니면 "오늘로" 버튼.
- **날짜 네비게이션**: ◀ 전일 / 날짜 버튼(클릭 시 숨겨진 `type=date` input의 `showPicker()` 호출 → 달력) / 다음일 ▶. 이동은 모두 `goToDate`(`:158`). `addDays`로 ±1일(`:259`, `:301`).
- **로드**: `date` 변경 시 `GET /api/diary?date=...`(`load` `:91`). **경쟁 조건 방지**용 `reqIdRef`로 늦게 도착한 이전 응답을 무시(`:100`).
- **자동 저장**:
  - `goToDate`는 변경분(`content!==baseline`)이 있으면 먼저 `saveCurrent({ silent:true })`로 조용히 저장 후 이동, 저장 실패 시 이동 차단(작성 내용 보호, `:161`).
  - `Ctrl/Cmd + S` 단축키로 즉시 저장(`:171`).
  - `beforeunload`로 미저장 이탈 경고(`:183`).
  - `saveCurrent`는 변경이 없으면 네트워크 호출을 건너뜀(`:130`). 동시 저장은 `useAsyncLock`으로 직렬화(`:76`).
- **상태 표시**: `dirty`면 "● 저장하지 않은 변경사항이 있습니다", 아니면 마지막 저장 시각(`savedAt.toLocaleString('ko-KR')`).
- 편집기는 `MarkdownEditor`(미리보기 지원, `:319`).

### 7.2 API — `/api/diary` — `app/api/diary/route.ts`

#### `GET /api/diary?date=YYYY-MM-DD` — `:42`
- **인증**: 필수(401).
- **쿼리**: `date`(`dateSchema`로 검증 — 정규식 + UTC 재구성으로 실제 존재하는 날짜인지 확인, `:12`). 실패 시 400 `invalid date`.
- **동작**: `prisma.diaryEntry.findUnique({ where: { userId_date: { userId, date } } })`. **본인 데이터만** 조회(세션 userId로 키 구성, 공유/타인 조회 경로 없음).
- **응답**: `{ date, contentMd: entry?.contentMd ?? "", updatedAt: ISO|null }`.

#### `PUT /api/diary` — `:65`
- **인증**: 필수.
- **바디**(zod `diaryUpsertSchema`, `.strict()`, `:25`): `date`(위 `dateSchema`), `contentMd`(최대 50000자, 초과 시 "내용이 너무 깁니다.").
- **부수효과**:
  - `contentMd.trim()`이 비면 `deleteMany({ userId, date })`로 해당 날짜 행 삭제(빈 행 미생성), 응답 `{ date, contentMd:"", updatedAt:null }`.
  - 내용이 있으면 `upsert({ where: userId_date, create/update })`로 저장. 응답에 `updatedAt` ISO 포함.

---

## 8. 사용자 간 일정 공유 (ScheduleShare)

요청자(`requester`)가 소유자(`owner`)에게 특정 `scope`의 읽기 공유를 요청하고, 소유자가 승인(`ACCEPTED`)하면 요청자가 소유자의 해당 데이터를 **읽기 전용**으로 조회합니다. 캘린더/TODO 사이드바에서 사용하며, scope는 `CALENDAR`/`TODO`/`LEDGER`/`STOCK`이 정의되어 있습니다(LEDGER/STOCK은 가계부·투자 기능에서 사용).

### 8.1 라이브러리 `app/lib/scheduleShare.ts`

| 함수 | 동작 | 인용 |
|---|---|---|
| `getReadableScheduleOwnerIds(userId, scope)` | `ScheduleShare(requesterId=userId, scope, status=ACCEPTED)`의 ownerId들 + 본인 id를 중복 제거한 배열 반환. **테이블 미마이그레이션 등 예외 시 `[userId]`로 폴백**(내 데이터 조회는 유지) | `app/lib/scheduleShare.ts:11` |
| `parseScheduleShareScope(v)` | `CALENDAR/TODO/LEDGER/STOCK`만 통과, 그 외 `null` | `:31` |
| `toUserLabel(name, email)` | `name` > `email` > `'알 수 없는 사용자'` 우선순위 라벨 | `:37` |

### 8.2 API — `/api/schedule-shares`

#### `GET /api/schedule-shares` — `app/api/schedule-shares/route.ts:52`
- **인증**: 필수.
- **응답**: `{ me, outgoing, incoming }`.
  - `outgoing`: 내가 **보낸** 요청(`requesterId=me`), 모든 상태. `owner` 정보 포함.
  - `incoming`: 내가 **받은** 요청(`ownerId=me`) 중 `PENDING`/`ACCEPTED`만. `requester` 정보 포함.
  - 정렬: `status asc, updatedAt desc`. 각 사용자에 `label`(`toUserLabel`) 첨부.
- 클라이언트는 받은 배열을 화면별 `scope`로 필터(캘린더=`CALENDAR`, TODO=`TODO`).
- **예외**: 테이블 미존재 등 오류 시 500 + "공유 기능 초기화가 필요합니다. `npx prisma migrate dev` ..." 메시지.

#### `POST /api/schedule-shares` — `:139`
- **바디**: `targetEmail`(상대 이메일 **또는** 닉네임, 필수), `scope`(`parseScheduleShareScope`로 검증, 아니면 400).
- **검증/부수효과**:
  - 자기 자신(이메일/닉네임 일치)에게 요청 시 400.
  - 대상 조회는 email/name 대소문자 무시 매칭(`take:2`). 0건 → 404, 2건↑(닉네임 중복) → 409("이메일로 요청해 주세요").
  - 기존 요청이 `PENDING`이면 409(이미 보냄), `ACCEPTED`면 409(이미 허용). `REJECTED` 등은 `PENDING`으로 재설정(`respondedAt=null`), 없으면 신규 생성.
- **응답**: 생성/갱신된 share + `owner` 라벨.

#### `PATCH /api/schedule-shares/[shareId]` — `app/api/schedule-shares/[shareId]/route.ts:22`
- **바디**: `action`(`ACCEPT`|`REJECT`, 그 외 400).
- **권한**: share `ownerId===me`만 가능(아니면 403, 없으면 404). 즉 **요청을 받은 소유자만** 승인/거절.
- **부수효과**: `status` 갱신 + `respondedAt=now()`. 응답에 갱신 결과(ISO 날짜).

#### `DELETE /api/schedule-shares/[shareId]` — `:81`
- **권한**: `requesterId===me`(요청 취소/공유 해제) 또는 `ownerId===me`(받은 공유 해제) 둘 다 허용, 그 외 403/404.
- **부수효과**: share 삭제 후 `{ ok: true }`.

### 8.3 공유 데이터의 권한 표기

- 조회 라우트(`/api/todos/boards`, `/api/calendar`)는 `shared`/`canEdit`/`ownerLabel`을 응답에 포함해 클라이언트가 색상·읽기전용 처리를 일관되게 적용.
- 보드/글 상세 페이지는 진입 시 `ScheduleShare(scope, ACCEPTED)`를 직접 확인해 비소유자 접근을 차단합니다(4.2 참조).

---

## 9. 상호 참조

- 모델 전체 스키마: [database.md](database.md)
- 콘텐츠 보드/글 API(`/api/boards/...`, 캘린더 편집 재사용): [feature-content.md](feature-content.md)
- 전체 라우트 표/공통 에러 코드: [api-reference.md](api-reference.md)
- 인증·권한 정책(`ADMIN`, 비밀글 unlock): [auth-permissions.md](auth-permissions.md)
- `useAsyncLock`, `validation`, `httpErrorText`, `MarkdownEditor`: [lib-reference.md](lib-reference.md) · [frontend-and-ui.md](frontend-and-ui.md)
