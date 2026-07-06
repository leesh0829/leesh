# API Reference (전체 라우트 인덱스)

`app/api/**/route.ts` 에 정의된 모든 HTTP 라우트를 도메인별로 망라한 마스터 레퍼런스입니다. 메서드 / 경로 / 인증·권한 / 요청 파라미터 / 응답 / 주요 부수효과를 정리합니다.

> 작성 기준: 2026-06-24, dev 브랜치

- 전수 확인: `find app/api -name route.ts` 기준 **89개** route 파일.
- 도메인별 상세 동작은 [feature-content.md](feature-content.md) · [feature-productivity.md](feature-productivity.md) · [feature-ledger.md](feature-ledger.md) · [feature-investing.md](feature-investing.md) · [integration-kis.md](integration-kis.md) · [feature-misc.md](feature-misc.md) 를, 모델 필드는 [database.md](database.md), 인증·권한 체계는 [auth-permissions.md](auth-permissions.md), 공용 함수는 [lib-reference.md](lib-reference.md) 를 함께 참고하세요.

---

## 공통 관례

모든 라우트는 Next.js App Router의 Route Handler(`export async function GET/POST/...`)입니다. 도메인 표를 읽기 전에 공통 규약을 먼저 정리합니다.

### Runtime

- 거의 모든 라우트에 `export const runtime = 'nodejs'` 가 선언되어 Node 런타임에서 실행됩니다(Prisma `pg` adapter, `bcrypt`, `crypto` 사용 때문).
- `runtime` 선언이 **없는** 7개 라우트: `app/api/sign-up/route.ts`, `app/api/verify-email/route.ts`, `app/api/resend-verification/route.ts`, `app/api/check-email/route.ts`, `app/api/check-name/route.ts`, `app/api/todos/boards/route.ts`, `app/api/todos/boards/[boardId]/route.ts` (기본 런타임 사용).
- `app/api/exchange-rates/route.ts:5` 만 추가로 `export const revalidate = 1800` (30분 캐시)을 사용합니다.

### 인증 패턴 (getServerSession → email → user)

로그인 보호 라우트는 거의 동일한 3단계 패턴을 따릅니다.

```ts
const session = await getServerSession(authOptions)
if (!session?.user?.email)
  return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
const user = await prisma.user.findUnique({
  where: { email: session.user.email },
  select: { id: true },
})
if (!user) return NextResponse.json({ message: 'unauthorized' }, { status: 401 })
```

- 세션 전략은 JWT(`app/api/auth/[...nextauth]/options.ts:18`), Credentials provider 기반. 자세한 내용은 [auth-permissions.md](auth-permissions.md).
- 표의 **Auth** 열 표기:
  - `-` : 인증 불필요(공개)
  - `로그인` : 유효 세션 필요
  - `owner` : 리소스 소유자(`ownerId === user.id`)만
  - `작성자` : 글/댓글/거래 작성자(`authorId`/소유 holding)만
  - `ADMIN` : `user.role === 'ADMIN'`
  - `KIS` : 로그인 + 본인 `KisCredential` 등록 필요(미등록 시 `412`)
  - `unlock 쿠키` : 별도 비밀번호 unlock 쿠키 필요

### zod 검증

- JSON 본문은 `parseJsonWithSchema(req, schema)`(`app/lib/validation.ts:4`)로 파싱합니다. 본문이 JSON이 아니면 `null` 로 안전 처리.
- 실패 시 `badRequestFromZod(error, fallback)`(`app/lib/validation.ts:12`)가 첫 이슈 메시지(혹은 fallback)를 `{ message }` + `400` 으로 반환합니다.
- 대부분의 스키마는 `.strict()` 로 정의되어 미지정 키를 거부합니다.
- 일부 단순 라우트는 zod 대신 `await req.json().catch(() => null)` 후 수동 검증합니다(boards, watchlist, stock-note, stock-alarm, ledger/transfer, schedule-shares 등).

### 에러 응답 형태

- 표준 에러 바디는 `{ "message": string }` 단일 필드입니다.
- 클라이언트는 `toHumanHttpError(status, apiMessage)`(`app/lib/httpErrorText.ts:1`)로 `401`/`403`/`unauthorized`/`forbidden` 등을 한국어 메시지로 치환합니다.
- DB 연결 오류 식별은 `isDatabaseConnectionError(err)`(`app/lib/prismaError.ts:5`, 코드 `P1001`/`P1002`).

### 상태 코드 규약

| 코드 | 의미 | 사용 예 |
|---|---|---|
| `200` | 성공 | 대부분의 GET/PATCH/PUT/DELETE |
| `201` | 생성됨 | 게시판 글/댓글/help 글·답변 생성 |
| `400` | 잘못된 요청 | zod 실패, 필수값 누락, 잘못된 날짜/조합 |
| `401` | 미인증/비번 불일치 | 세션 없음, unlock 비번 틀림 |
| `403` | 권한 없음 | 소유자 아님, 운영진 아님 |
| `404` | 없음 | 리소스 미존재 |
| `409` | 충돌 | 이메일/닉네임 중복, 마지막 ADMIN 강등, 중복 공유요청 |
| `412` | 사전조건 실패 | KIS 자격증명 미등록 |
| `429` | 레이트리밋 | `Retry-After` 헤더 동반 |
| `500` | 서버 오류 | 예외, 환경변수 미설정 |
| `502` | 업스트림 오류 | KIS/Naver/Frankfurter 외부 호출 실패 |

### Rate Limit

- IP 기반 인메모리 고정 윈도우 카운터 `takeRateLimit(key, limit, windowMs)`(`app/lib/rateLimit.ts:37`, 키별 `{ count, resetAt }` 버킷이 윈도우 경계마다 리셋), IP는 `getClientIp(req)`(`x-forwarded-for` → `x-real-ip` → `unknown`).
- 적용 라우트: `sign-up`(8/10분), `resend-verification`(5/10분), `check-email`(40/10분), `check-name`(40/10분), `leesh/contact`(6/10분). 초과 시 `429` + `Retry-After`.

---

## 1) 인증 / 계정

`app/api/auth`, `sign-up`, `verify-email`, `resend-verification`, `check-email`, `check-name`. 상세: [auth-permissions.md](auth-permissions.md).

| Method | Endpoint | Auth | 용도 |
|---|---|---|---|
| `GET`,`POST` | `/api/auth/[...nextauth]` | - | NextAuth 핸들러(Credentials 로그인/세션/로그아웃) |
| `POST` | `/api/sign-up` | - | 회원가입 + 이메일 인증 토큰 발급/메일 발송 |
| `GET` | `/api/verify-email` | - | 이메일 인증 토큰 검증 (`?email=&token=`) |
| `POST` | `/api/resend-verification` | - | 인증 메일 재발송 |
| `GET` | `/api/check-email` | - | 이메일 중복 체크 (`?email=`) |
| `GET` | `/api/check-name` | - | 닉네임 중복 체크 (`?name=`, 대소문자 무시) |

**`POST /api/sign-up`** (`app/api/sign-up/route.ts`)
- Body(zod `.strict()`): `email`(string), `password`(string), `name?`(string|null). `EMAIL_REGEX` 형식 검증.
- 부수효과: `bcrypt.hash(pw,10)`로 User 생성(`emailVerified: null`), 기존 `VerificationToken` 삭제 후 24h 토큰(`hashVerificationToken`로 해시 저장) 생성, `sendMail`로 인증 링크 발송.
- 응답: `{ ok: true }`. 중복 이메일/닉네임 → `409`.

**`GET /api/verify-email`** (`app/api/verify-email/route.ts`)
- Query: `email`, `token`. 해시 토큰 우선 조회 후 평문 토큰 하위호환 조회. 만료 시 토큰 삭제 + `400`.
- 부수효과: `user.emailVerified = now()` 설정, 해당 identifier 토큰 일괄 삭제. 응답 `{ ok: true }`.

**`POST /api/resend-verification`** — Body `{ email }`. 이미 인증 시 `{ ok:true, message:'already verified' }`, 미존재 `404`.

**중복 체크** — `check-email`/`check-name` 응답 `{ available: boolean }`.

---

## 2) 권한 (Permission)

ADMIN 전용 권한 관리. 메뉴 권한 정책/사용자 role/사용자별 override를 다룹니다. 상세: [auth-permissions.md](auth-permissions.md).

| Method | Endpoint | Auth | 용도 |
|---|---|---|---|
| `GET` | `/api/permission` | - / ADMIN | 메뉴 목록 조회. 기본은 사이드바용 필터링 목록, `?mode=manage` 는 ADMIN만 전체 목록 |
| `PUT` | `/api/permission` | ADMIN | 메뉴 기본 권한 정책 일괄 upsert |
| `GET` | `/api/permission/users` | ADMIN | 전체 사용자 목록(id/email/name/role/createdAt) |
| `PUT` | `/api/permission/users/[userId]/role` | ADMIN | 사용자 role(USER/ADMIN) 변경 |
| `GET` | `/api/permission/users/[userId]/overrides` | ADMIN | 사용자별 메뉴 override 조회 |
| `PUT` | `/api/permission/users/[userId]/overrides` | ADMIN | 사용자별 메뉴 override 전체 동기화 |

- `GET /api/permission`(`app/api/permission/route.ts:163`): `seedIfEmpty()` 로 기본 메뉴(`home`,`dashboard`,`blog`,`docs`,`boards`,`todos`,`calendar`,`diary`,`ledger`,`help`,`permission`) 자동 시드 + 폐기 키(`accounting`) 정리. 일반 호출은 `visible`/`requireLogin`/`minRole` 로 필터링. `mode=manage` 비ADMIN → `403`.
- `PUT /api/permission` Body `{ items: PermissionRow[] }`, `key` 단위 upsert.
- `PUT .../role`(`app/api/permission/users/[userId]/role/route.ts:44`): 마지막 ADMIN의 자기 강등은 `409`("last admin cannot be demoted") 차단.
- `PUT .../overrides`: 기존 `UserMenuPermission` 전체 삭제 후 `{ overrides: { menuKey, mode: 'ALLOW'|'DENY' }[] }` 재생성.

---

## 3) 콘텐츠 — 블로그 (Blog)

`Board.type='BLOG'`. 목록/공개 조회는 서버 컴포넌트가 처리하고, 여기 라우트는 쓰기(생성/수정/삭제)만 제공합니다. 상세: [feature-content.md](feature-content.md).

| Method | Endpoint | Auth | 용도 |
|---|---|---|---|
| `POST` | `/api/blog/posts` | 로그인(owner 보드) | BLOG 글 생성(임시/발행, 비밀글, 스포일러, 리뷰 별점) |
| `PUT` | `/api/blog/posts/[postId]` | 작성자 | BLOG 글 수정 |
| `DELETE` | `/api/blog/posts/[postId]` | 작성자 | BLOG 글 삭제 |

**`POST /api/blog/posts`** (`app/api/blog/posts/route.ts:14`)
- Body(zod `.strict().superRefine`): `boardId`, `title`, `contentMd`, `blogCategory`(`BLOG_POST_TYPE_VALUES`), `reviewRatingHalf?`(int|null), `publish?`(기본 false), `isSecret?`, `secretPassword?`, `isSpoiler?`.
- 검증: 비밀글이면 비번 4자 이상; 별점은 0~5 0.5단위(`parseReviewRatingHalf`)이며 `REVIEW` 카테고리에서만 허용.
- 부수효과: 보드 소유·타입(`BLOG`) 확인, `slugify(title)` + 충돌 회피(`-2..-49`), 비밀글이면 `bcrypt` 해시. `status = publish ? 'DONE':'DOING'`. 응답 `{ id, slug }`.

**`PUT /api/blog/posts/[postId]`** — 동일 스키마 + `regenerateSlug?`. 작성자 + BLOG 보드 글만 수정. `isSecret` 해제 시 해시 제거, 유지+신규비번(≥4자) 시 갱신. 응답 `{ id, slug }`.

---

## 4) 콘텐츠 — Docs

`Board.type='DOCS'`. 블로그와 동일 구조(별점/스포일러/카테고리 없음). 상세: [feature-content.md](feature-content.md).

| Method | Endpoint | Auth | 용도 |
|---|---|---|---|
| `POST` | `/api/docs/posts` | 로그인(owner 보드) | DOCS 글 생성 |
| `PUT` | `/api/docs/posts/[postId]` | 작성자 | DOCS 글 수정 |
| `DELETE` | `/api/docs/posts/[postId]` | 작성자 | DOCS 글 삭제 |

- Body: `boardId`, `title`, `contentMd`, `publish?`, `isSecret?`, `secretPassword?` (+ PUT `regenerateSlug?`). 비밀글 비번 4자 이상. slug/해시 처리 블로그와 동일.

---

## 5) 콘텐츠 — 게시판 (Boards / General)

`Board.type='GENERAL'` 및 글/댓글/일정/비밀글 unlock. 상세: [feature-content.md](feature-content.md).

| Method | Endpoint | Auth | 용도 |
|---|---|---|---|
| `GET` | `/api/boards` | - | GENERAL 보드 목록(owner name/email 포함) |
| `POST` | `/api/boards` | 로그인 | GENERAL 보드 생성(단일 일정 옵션 포함) |
| `GET` | `/api/boards/[boardId]` | owner | 보드 단건 조회 |
| `PATCH` | `/api/boards/[boardId]` | owner | 보드명/설명 수정 (GENERAL/TODO만) |
| `DELETE` | `/api/boards/[boardId]` | owner | 보드 삭제 (GENERAL/TODO만) |
| `PATCH` | `/api/boards/[boardId]/schedule` | owner | 보드 단일 일정 설정 |
| `DELETE` | `/api/boards/[boardId]/schedule` | owner | 보드 단일 일정 해제(보드는 유지) |
| `GET` | `/api/boards/[boardId]/posts` | owner | 보드 글 목록 |
| `POST` | `/api/boards/[boardId]/posts` | owner | 보드 글 생성 |
| `GET` | `/api/boards/[boardId]/posts/[postId]` | owner | 글 상세(비밀글이면 `contentMd:''`, `locked:true`) |
| `PATCH` | `/api/boards/[boardId]/posts/[postId]` | 작성자 | 글 수정 |
| `DELETE` | `/api/boards/[boardId]/posts/[postId]` | 작성자 | 글 삭제 |
| `POST` | `/api/boards/[boardId]/posts/[postId]/unlock` | - | 비밀글 비번 검증 + unlock 쿠키 갱신 |
| `GET` | `/api/boards/[boardId]/posts/[postId]/comments` | 조건부 | 댓글 목록(보드 타입별 가독성 판정) |
| `POST` | `/api/boards/[boardId]/posts/[postId]/comments` | 조건부 | 댓글 작성 |
| `PATCH` | `/api/boards/[boardId]/posts/[postId]/comments/[commentId]` | 작성자 | 댓글 수정 |
| `DELETE` | `/api/boards/[boardId]/posts/[postId]/comments/[commentId]` | 작성자 | 댓글 삭제 |

- `POST /api/boards`(`app/api/boards/route.ts:47`): Body `name`(필수), `description?`, `singleSchedule?`, `scheduleStatus?`(TODO/DOING/DONE), `scheduleStartAt?`/`scheduleEndAt?`/`scheduleAllDay?`. `singleSchedule` 이면 `scheduleStartAt` 필수.
- `PATCH/DELETE /api/boards/[boardId]`: `MANAGEABLE_BOARD_TYPES = {GENERAL, TODO}` 외 타입은 `403`(BLOG/PORTFOLIO/HELP 등은 전용 페이지에서 관리).
- `POST /api/boards/[boardId]/posts`(`...posts/route.ts:102`): Body(zod) `title`, `contentMd?`, `status?`, `priority?`, `startAt?`/`endAt?`, `allDay?`, `isSecret?`, `secretPassword?`. `singleSchedule` 보드는 글 생성 `409`. 응답 `201 {id,slug}`.
- `PATCH .../posts/[postId]`(`...[postId]/route.ts:100`): Body 부분 갱신 `title/contentMd/status/allDay/startAt/endAt`, 전부 미지정 시 `400`. 날짜는 `toISOStringSafe`로 직렬화.
- `POST .../unlock`(`...unlock/route.ts`): Body `{ password }`. `id` 또는 `slug` 로 글 조회, `bcrypt.compare` 성공 시 세션 쿠키 `UNLOCK_COOKIE_NAME`에 글 id 추가(`buildUnlockedCookieValue`). 비밀글 아니면 `{unlocked:true}`, 비번 틀림 `401`.
- 댓글 가독성(`...comments/route.ts:17` `resolveReadablePost`): `GENERAL` 은 항상 허용, `TODO` 는 owner 또는 ACCEPTED `ScheduleShare(scope=TODO)`, `BLOG/DOCS` 는 발행(`DONE`) + 비밀글이면 작성자/owner/unlock 쿠키 필요. 외 타입 `404`.

---

## 6) 콘텐츠 — 고객센터 (Help)

`Board.type='HELP'` 단일 게시판(가장 먼저 가입한 사용자 = owner 가 운영진). 상세: [feature-content.md](feature-content.md).

| Method | Endpoint | Auth | 용도 |
|---|---|---|---|
| `GET` | `/api/help/posts` | - | 요청 목록(`hasOperatorAnswer` 포함) |
| `POST` | `/api/help/posts` | 로그인 | 요청 글 작성 |
| `GET` | `/api/help/posts/[postId]` | - | 요청 상세 + `canAnswer` |
| `GET` | `/api/help/posts/[postId]/answers` | - | 답변 목록 |
| `POST` | `/api/help/posts/[postId]/answers` | 운영진 | 답변 작성(ADMIN 또는 owner) |

- owner 결정: `getOwnerUserId()` = `createdAt` 최소 User. `getOrCreateHelpBoard()`가 "고객센터" HELP 보드를 보장 생성.
- `GET /api/help/posts`: 각 글에 `hasOperatorAnswer`(댓글 작성자가 ADMIN이거나 owner) 계산.
- `GET /api/help/posts/[postId]`: `canAnswer = me.role==='ADMIN' || me.id===ownerId`.
- `POST .../answers`: 비운영진 `403`("운영진만 답변할 수 있습니다."). 응답 `201 {id}`.

---

## 7) 생산성 — TODO

보드 기반 TODO(공유 지원) + 레거시 개인 TODO item API. 상세: [feature-productivity.md](feature-productivity.md).

| Method | Endpoint | Auth | 용도 |
|---|---|---|---|
| `GET` | `/api/todos/boards` | 로그인 | TODO 보드 목록(본인 + 공유 허용 owner) |
| `POST` | `/api/todos/boards` | 로그인 | TODO 보드 생성 |
| `PATCH` | `/api/todos/boards/[boardId]` | owner | TODO 보드 상태/단일일정 갱신 |
| `GET` | `/api/todos` | 로그인 | 개인 TODO 기본 보드 조회/자동생성 + item 목록 |
| `POST` | `/api/todos` | 로그인 | 개인 TODO item 생성 |
| `PATCH` | `/api/todos/[todoId]` | 작성자 | TODO item(=Post) 수정 |
| `DELETE` | `/api/todos/[todoId]` | 작성자 | TODO item 삭제 |

- `GET /api/todos/boards`(`app/api/todos/boards/route.ts:29`): `getReadableScheduleOwnerIds(me.id,'TODO')` 로 본인+ACCEPTED 공유 owner의 TODO 보드 반환. 각 항목 `ownerLabel`, `shared`, `canEdit`(owner===me) 표기.
- `POST /api/todos/boards`: Body `name`(필수), `description?`, `singleSchedule?`, `scheduleStartAt?`/`scheduleEndAt?`(유효 날짜), `scheduleAllDay?`.
- `PATCH /api/todos/boards/[boardId]`: owner만. `scheduleStatus/singleSchedule/scheduleStartAt/scheduleEndAt/scheduleAllDay` 부분 갱신. TODO 타입 아니면 `404`.
- `GET/POST /api/todos`(`app/api/todos/route.ts`): `getOrCreateTodoBoard(userId)` 로 개인 TODO 보드 보장. Item은 `Post`로 저장. POST Body(zod) `title`, `startAt?`/`endAt?`, `allDay?`(기본 true).
- `PATCH /api/todos/[todoId]`(zod): `status/title/allDay/startAt/endAt` 부분 갱신, 전부 미지정 시 `400`. 작성자 + `board.type='TODO'` 글만.

---

## 8) 생산성 — 캘린더 / 일기 / 일정 공유

상세: [feature-productivity.md](feature-productivity.md).

| Method | Endpoint | Auth | 용도 |
|---|---|---|---|
| `GET` | `/api/calendar` | 로그인 | 월별 일정(`?month=YYYY-MM`, Post+Board+한국 공휴일 병합) |
| `GET` | `/api/diary` | 로그인 | 특정 일자 일기 조회(`?date=YYYY-MM-DD`) |
| `PUT` | `/api/diary` | 로그인 | 일기 upsert(빈 내용이면 삭제) |
| `GET` | `/api/schedule-shares` | 로그인 | 공유 요청 목록(outgoing/incoming) |
| `POST` | `/api/schedule-shares` | 로그인 | 공유 요청 생성 |
| `PATCH` | `/api/schedule-shares/[shareId]` | owner(수신자) | 공유 요청 승인/거절 |
| `DELETE` | `/api/schedule-shares/[shareId]` | 당사자 | 공유 해제/요청 취소 |

- `GET /api/calendar`(`app/api/calendar/route.ts:58`): `month` 필수. `getReadableScheduleOwnerIds(user.id,'CALENDAR')` 의 모든 보드에서 ① Post 기반 일정 ② `singleSchedule` 보드 일정 ③ `getKoreanHolidayCalendarItems(month)` 를 병합·정렬. 각 항목 `kind`(POST/BOARD), `displayTitle`, `shared`, `canEdit`, `boardType` 등.
- `GET /api/diary`: `date`(YYYY-MM-DD, 실재 날짜 검증). 응답 `{ date, contentMd, updatedAt }`(없으면 `contentMd:''`).
- `PUT /api/diary`(zod): `{ date, contentMd(≤50000자) }`. 내용 공백이면 `deleteMany`로 빈 행 제거, 아니면 `upsert`(`userId_date` 유니크).
- `POST /api/schedule-shares`(`app/api/schedule-shares/route.ts:139`): Body `{ targetEmail, scope }`. `scope ∈ {CALENDAR, TODO, LEDGER, STOCK}`(`parseScheduleShareScope`). 자기 자신 `400`, 대상 미존재 `404`, 동일 아이디 중복 `409`, 기존 PENDING/ACCEPTED `409`. 없으면 PENDING 생성, REJECTED였으면 재요청. 직렬화 + `ownerLabel`.
- `PATCH .../[shareId]`: Body `{ action: 'ACCEPT'|'REJECT' }`. 수신 owner만(`403`). `status` 갱신 + `respondedAt`.
- `DELETE .../[shareId]`: requester 또는 owner 둘 다 가능. 공유 기능 미초기화 시 모든 핸들러가 `500`("`npx prisma migrate dev` ...").

---

## 9) 가계부 (Ledger & Accounts)

수입/지출 기입, 이체, 통계, 예산, 금융 계좌. 상세: [feature-ledger.md](feature-ledger.md).

| Method | Endpoint | Auth | 용도 |
|---|---|---|---|
| `GET` | `/api/ledger` | 로그인 | 기입 목록 + 계좌별 누적잔액 + 합계(본인/공유) |
| `POST` | `/api/ledger` | 로그인 | 기입 생성 |
| `PATCH` | `/api/ledger/[entryId]` | owner | 기입 수정 |
| `DELETE` | `/api/ledger/[entryId]` | owner | 기입 삭제 |
| `POST` | `/api/ledger/transfer` | 로그인 | 계좌간 이체(EXPENSE+INCOME 페어 트랜잭션) |
| `GET` | `/api/ledger/stats` | 로그인 | 통계 집계(계좌/카테고리/월·일·요일·시간/이체흐름) |
| `GET` | `/api/ledger/budgets` | 로그인 | 예산 목표 + 진행률 |
| `POST` | `/api/ledger/budgets` | 로그인 | 예산 목표 생성 |
| `PUT` | `/api/ledger/budgets/[id]` | owner | 예산 목표 수정 |
| `DELETE` | `/api/ledger/budgets/[id]` | owner | 예산 목표 삭제 |
| `GET` | `/api/accounts` | 로그인 | 금융 계좌 목록(+ 연결 건수) |
| `POST` | `/api/accounts` | 로그인 | 금융 계좌 생성 |
| `PATCH` | `/api/accounts/[accountId]` | owner | 계좌 수정 |
| `DELETE` | `/api/accounts/[accountId]` | owner | 계좌 삭제 |

- `GET /api/ledger`(`app/api/ledger/route.ts:78`): Query `start?`/`end?`(occurredAt 필터), `excludeOwners?`(콤마). `getReadableScheduleOwnerIds(user.id,'LEDGER')` 범위. 계좌별 `runningBalance`(initialBalance + 기간 이전 누적 + 시간순 누적, 이체 포함), `totals`(income/expense/balance, `excludeFromTotals=false` 만), `totalsByOwner`.
- `POST /api/ledger`(zod): `type`(INCOME/EXPENSE), `amount`(1~20억 int), `description`, `category`, `subcategory?`, `accountId?`, `excludeFromTotals?`, `occurredAt?`. 계좌 본인소유 검증, `isValidCategoryCombination(type,category,subcategory)` 검증(실패 `400`).
- `PATCH /api/ledger/[entryId]`(zod): 부분 갱신. owner 아니면 `403`. 변경 시 카테고리 조합 재검증.
- `POST /api/ledger/transfer`(`app/api/ledger/transfer/route.ts`): Body `{ fromAccountId, toAccountId, amount, description?, occurredAt? }`. 두 계좌 본인소유·상이 검증. `prisma.$transaction` 으로 출발 EXPENSE + 도착 INCOME 2건 생성(둘 다 `category='계좌이체'`, `excludeFromTotals=true`). 응답 `{ ok:true, ids:[...] }`.
- `GET /api/ledger/stats`(`app/api/ledger/stats/route.ts`): Query `start?`/`end?`. `excludeFromTotals=false` 항목으로 `byAccount/byAccountType/byCategoryIncome·Expense/bySubcategory.../byMonth/byDay/byWeekday(0~6)/byHour(0~23)/topIncome·topExpense(상위5)/categoryDiff...` 집계 + 직전 동일길이 기간 비교(`prevTotals`) + 이체흐름(`transferFlows`).
- `POST /api/ledger/budgets`(zod): `scope`(CATEGORY/SUBCATEGORY/ACCOUNT), `category?`/`subcategory?`/`accountId?`(scope별 필수), `amount`, `memo?`, `enabled?`. 목록은 `listBudgetsWithProgress(userId)`.
- `POST /api/accounts`(zod): `name`, `bankName?`, `types`(`ACCOUNT_TYPES` 배열, ≥1), `memo?`, `initialBalance?`(기본 0). `validateAccountTypes` 검증. GET은 `entryCount`/`holdingCount`(`_count`) 포함.

---

## 10) 투자 — 보유종목 (Holdings)

보유 종목 + 거래(BUY/SELL/DIVIDEND/FEE/TAX) + 시세/검색/체결마커. 가계부 자동 연동. 상세: [feature-investing.md](feature-investing.md).

| Method | Endpoint | Auth | 용도 |
|---|---|---|---|
| `GET` | `/api/holdings` | 로그인 | 보유 목록 + 집계(`aggregateHolding`) |
| `POST` | `/api/holdings` | 로그인 | 보유 종목 생성 |
| `GET` | `/api/holdings/[holdingId]` | 조회권한 | 보유 단건 + 거래 목록 + 집계 |
| `PATCH` | `/api/holdings/[holdingId]` | owner | 보유 수정 |
| `DELETE` | `/api/holdings/[holdingId]` | owner | 보유 삭제(+연동 가계부 정리) |
| `POST` | `/api/holdings/[holdingId]/transactions` | owner | 거래 생성(+가계부 연동) |
| `PATCH` | `/api/holdings/[holdingId]/transactions/[txId]` | owner | 거래 수정(+가계부 재동기화) |
| `DELETE` | `/api/holdings/[holdingId]/transactions/[txId]` | owner | 거래 삭제(+연동 가계부 삭제) |
| `GET` | `/api/holdings/quote` | 로그인 | 시세 조회(`?symbol=` 단일 / `?symbols=` 배치) |
| `GET` | `/api/holdings/search` | 로그인 | 종목 심볼 검색(`?q=`, Naver) |
| `GET` | `/api/holdings/trades` | 로그인 | 종목별 본인 BUY/SELL 거래(차트 마커, `?symbol=`) |

- `GET /api/holdings`(`app/api/holdings/route.ts:77`): `getReadableScheduleOwnerIds(user.id,'STOCK')` 범위, `excludeOwners?` 필터. 각 보유 `aggregate`(수량/평단/평가손익 등) + `shared`/`canEdit`/`txCount`.
- `POST /api/holdings`(zod): `name`, `symbol?`, `exchange?`, `currency?`(기본 KRW), `memo?`, `currentPrice?`, `accountId?`. 계좌 본인소유 검증.
- `GET /api/holdings/[holdingId]`: `getReadableScheduleOwnerIds(...,'STOCK')` 에 owner 포함되어야 조회 가능(아니면 `403`). 거래 각 `linked`(가계부 연동 여부).
- `POST .../transactions`(zod): `type`, `quantity?`, `pricePerUnit?`, `amount?`, `occurredAt?`, `memo?`, `linkToLedger?`. BUY/SELL은 수량·단가 필수(미입력 `400`), `amount` 명시 시 우선(소수점 매수/매도). DIVIDEND/FEE/TAX는 `amount` 필수. `syncTransactionToLedger(...)`로 가계부 연동, 연동 시 `ledgerEntryId` 기록. 응답 `{ id, ledgerEntryId }`.
- `PATCH .../transactions/[txId]`: 부분 갱신 후 가계부 재동기화(미지정 시 기존 연결 유지). `DELETE` 시 연동 `LedgerEntry`도 삭제. holding `DELETE`도 연동 가계부 일괄 정리.
- `GET /api/holdings/quote`(`app/api/holdings/quote/route.ts`): 한국 심볼 + 본인 KIS 등록 시 `getKisQuote`, 실패하면 `getNaverQuote` fallback. 배치는 최대 30개. 시세 실패 `502`.

---

## 11) 투자 — 워치리스트 / 메모 / 알람

종목 단위 부가 데이터. 상세: [feature-investing.md](feature-investing.md).

| Method | Endpoint | Auth | 용도 |
|---|---|---|---|
| `GET` | `/api/watchlist` | 로그인 | 관심종목 목록(position 정렬) |
| `POST` | `/api/watchlist` | 로그인 | 관심종목 추가(upsert, position 자동) |
| `DELETE` | `/api/watchlist` | 로그인 | 관심종목 삭제(`?market=&symbol=`) |
| `GET` | `/api/stock-note` | 로그인 | 종목 메모 조회(`?market=&symbol=`) |
| `PUT` | `/api/stock-note` | 로그인 | 종목 메모 저장(빈 내용이면 삭제) |
| `GET` | `/api/stock-alarm` | 로그인 | 가격 알람 목록(`?market=&symbol=` 필터 옵션) |
| `POST` | `/api/stock-alarm` | 로그인 | 가격 알람 생성 |
| `PATCH` | `/api/stock-alarm/[id]` | 소유자 | 알람 enabled/triggered 갱신 |
| `DELETE` | `/api/stock-alarm/[id]` | 소유자 | 알람 삭제 |

- 키 유니크: watchlist `userId_market_symbol`, stock-note `userId_market_symbol`.
- `POST /api/watchlist`: Body `{ market, symbol, name }`(전부 필수). `upsert` + `position = lastPosition+1`.
- `POST /api/stock-alarm`: Body `{ market, symbol, name?, target(>0), direction }`. `direction` 은 `BELOW` 이외 전부 `ABOVE`.
- `PATCH /api/stock-alarm/[id]`: Body `{ enabled?, triggered? }`. `triggered:true → triggeredAt=now`, `false → null`. 타인 소유 `404`.

---

## 12) 투자 — KIS 연동

한국투자증권(KIS) Open API 프록시. 모든 라우트 `GET`(자격증명 관리만 예외)이며 **로그인 + 본인 `KisCredential` 등록 필수**(미등록 시 `412` "KIS 자격증명이 등록되어 있지 않습니다."), 외부 호출 실패는 `502`. 상세: [integration-kis.md](integration-kis.md).

### 12-1) 자격증명 / 연결 테스트

| Method | Endpoint | Auth | 용도 |
|---|---|---|---|
| `GET` | `/api/kis/credentials` | 로그인 | 등록 상태 + 마스킹 키 반환(실값 비노출) |
| `PUT` | `/api/kis/credentials` | 로그인 | appKey/appSecret/계좌 등록·갱신(암호화 저장) |
| `DELETE` | `/api/kis/credentials` | 로그인 | 자격증명 삭제 |
| `POST` | `/api/kis/test` | 로그인 | 입력 키로 KIS 토큰 발급 테스트 |

- `PUT /api/kis/credentials`(zod, `app/api/kis/credentials/route.ts:73`): `appKey`, `appSecret`, `accountNumber`(8자리), `accountProductCode?`(2자리, 기본 `01`), `isLive?`. `encrypt()`로 암호화 저장, 키 변경 시 캐시 토큰 무효화. GET은 `maskSecret(decrypt(appKey))` 만 노출. 보안: [env-and-security.md](env-and-security.md).
- `POST /api/kis/test`: Body `{ appKey, appSecret, isLive? }`. `testKisCredentials()` 성공 `{ok:true}`, 실패 `400 {ok:false,message}`.

### 12-2) 국내 시장 데이터 (KISMarket)

모든 라우트 GET / Auth `KIS`. 응답은 대개 `{ items }` 또는 `{ type/market/..., items }`.

| Endpoint | 주요 Query | 용도 |
|---|---|---|
| `/api/kis/rankings` | `type=value\|volume\|rise\|fall`, `limit≤50` | 거래대금/거래량/상승/하락 랭킹 |
| `/api/kis/bulk-ranking` | `limit≤30` | 대량체결 랭킹 |
| `/api/kis/expected-ranking` | `type=rise\|fall`, `limit≤30` | 예상체결 등락 랭킹 |
| `/api/kis/power-ranking` | `limit≤30` | 체결강도 랭킹 |
| `/api/kis/supply-ranking` | `side=foreign\|inst`, `limit≤30` | 외국인/기관 순매수 랭킹 |
| `/api/kis/indices` | `codes=0001,1001` | 지수 현재가(기본 KOSPI/KOSDAQ) |
| `/api/kis/index-history` | `code`, `period=D\|W\|M\|Y` | 지수 기간 시세 |
| `/api/kis/index-minutes` | `code`, `gap=30\|60\|600\|3600` | 지수 분봉 |
| `/api/kis/sectors` | `market=KOSPI\|KOSDAQ` | 업종별 지수 |
| `/api/kis/market-investors` | `market=KOSPI\|KOSDAQ`, `limit≤30` | 투자자별 매매 동향 |
| `/api/kis/vi` | `market=ALL\|KOSPI\|KOSDAQ`, `limit≤50` | VI(변동성완화장치) 발동 현황 |
| `/api/kis/news` | `limit≤100` | 종합 시황 뉴스 |
| `/api/kis/fx-minutes` | `base=USD\|JPY\|EUR\|CNY\|HKD` | 환율 분봉(지원 외 통화 `400`) |

### 12-3) 국내 종목 상세 (`/api/kis/stock/[code]`)

모든 라우트 GET / Auth `KIS` / `code` 는 `^\d{6}$` 검증(불일치 `400`).

| Endpoint | 주요 Query | 용도 |
|---|---|---|
| `/api/kis/stock/[code]/daily` | `period=D\|W\|M` | 일/주/월봉 |
| `/api/kis/stock/[code]/history` | `period=D\|W\|M\|Y` | 장기 시세 |
| `/api/kis/stock/[code]/minutes` | `hour?`(기준시각) | 분봉 |
| `/api/kis/stock/[code]/meta` | - | 종목 기본정보 |
| `/api/kis/stock/[code]/orderbook` | - | 호가(실패 `502`) |
| `/api/kis/stock/[code]/investor` | - | 투자자별 매매 |
| `/api/kis/stock/[code]/members` | - | 회원사(증권사) 매매 |
| `/api/kis/stock/[code]/program` | - | 프로그램 매매 |
| `/api/kis/stock/[code]/overtime` | - | 시간외 단일가 |
| `/api/kis/stock/[code]/opinion` | - | 투자의견 |
| `/api/kis/stock/[code]/financial` | - | 재무비율 |
| `/api/kis/stock/[code]/profit` | - | 수익성비율 |
| `/api/kis/stock/[code]/stability` | - | 안정성비율 |

### 12-4) 해외 (`/api/kis/overseas`)

| Method | Endpoint | 주요 Query | 용도 |
|---|---|---|---|
| `GET` | `/api/kis/overseas` | `pairs=NAS:COMP,NYS:SPX`(≤10) | 해외 지수/종목 현재가 배치 |
| `GET` | `/api/kis/overseas/[exchange]/[symbol]/daily` | `period=D\|W\|M` | 해외 일/주/월봉 |
| `GET` | `/api/kis/overseas/[exchange]/[symbol]/minutes` | `gap=1~60` | 해외 분봉 |

### 12-5) 외부 데이터 (KIS 외)

| Method | Endpoint | Auth | 주요 Query | 용도 |
|---|---|---|---|---|
| `GET` | `/api/exchange-rates` | - | - | USD/JPY → KRW 현재 환율(Frankfurter, 30분 캐시) |
| `GET` | `/api/fx-history` | - | `base=USD`, `target=KRW`, `days=7~730` | 환율 일별 시계열(가짜 캔들화, Frankfurter) |
| `GET` | `/api/disclosure/[code]` | 로그인 | `limit=1~50` | 종목 공시 목록(Naver, `code`는 `^\d{6}$`) |

- `exchange-rates`/`fx-history` 는 인증 불필요한 공개 외부 프록시(`api.frankfurter.app`/`.dev`). 실패 `502`.
- `disclosure/[code]` 는 로그인 필요, `getNaverDisclosures(code, limit)`.

---

## 13) 기타 — 포트폴리오 (Leesh)

`Board.type='PORTFOLIO'` 단일 자기소개서. unlock 쿠키(`leesh_unlocked`) 기반. 상세: [feature-misc.md](feature-misc.md).

| Method | Endpoint | Auth | 용도 |
|---|---|---|---|
| `GET` | `/api/leesh` | - | 포트폴리오 본문 + `canEdit`(쿠키 기반) |
| `PATCH` | `/api/leesh` | unlock 쿠키 | 포트폴리오 본문(`contentMd`) 수정 |
| `POST` | `/api/leesh/unlock` | - | 비밀번호 검증 후 unlock 쿠키 설정(30일) |
| `POST` | `/api/leesh/contact` | - | 포트폴리오 문의 메일 발송 |

- owner = `createdAt` 최소 User. `getOrCreatePortfolioPost(ownerId)` 가 PORTFOLIO 보드 + `slug='leesh'` 글을 보장 생성.
- `GET /api/leesh`(`app/api/leesh/route.ts:78`): `cookie` 에 `leesh_unlocked=1` 포함 여부로 `unlocked`/`canEdit` 판정. 응답 `{ id, title, contentMd, updatedAt, unlocked, canEdit }`.
- `PATCH /api/leesh`: 쿠키 없으면 `401`. Body `{ contentMd: string }`(타입 불일치 `400`). 응답 갱신 글.
- `POST /api/leesh/unlock`: Body `{ password }`. `process.env.LEESH_PASSWORD` 와 비교(미설정 `500`, 불일치 `401`). 성공 시 `leesh_unlocked=1` httpOnly 쿠키 30일.
- `POST /api/leesh/contact`(zod, rate limit 6/10분): `{ name?, email, subject?, message(10~2000자) }`. `LEESH_CONTACT_TO`(없으면 `SMTP_USER`)로 `sendMail`, `replyTo=email`, 헤더 인젝션 방지(`sanitizeHeaderText`) + KST 시각 기록.

---

## 14) 미구현 / 빈 디렉터리

- `app/api/uploads/` 와 `app/api/auth/[...nextauth]/login/` 디렉터리는 존재하지만 **route.ts 가 없어 현재 동작 라우트가 아닙니다**(이미지 업로드 전용 엔드포인트는 미구현). 마크다운 본문은 클라이언트에서 직접 처리됩니다 — [frontend-and-ui.md](frontend-and-ui.md) 참고.

---

## 참고 문서

- 모델/스키마: [database.md](database.md)
- 인증·세션·권한: [auth-permissions.md](auth-permissions.md)
- 공용 함수(`validation`/`scheduleShare`/`holdingAggregate`/`ledgerCategories`/`kis*` 등): [lib-reference.md](lib-reference.md)
- 환경변수·보안(암호화/쿠키/레이트리밋): [env-and-security.md](env-and-security.md)
