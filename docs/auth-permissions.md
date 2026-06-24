# 인증 & 권한 (Auth & Permissions)

Leesh의 사용자 인증(NextAuth Credentials + JWT), 회원가입·이메일 인증 플로우, 역할(USER/ADMIN) 기반 메뉴 권한 시스템, 사용자별 권한 오버라이드, 일정/데이터 공유(ScheduleShare) 권한을 다루는 권위 레퍼런스입니다.

> 작성 기준: 2026-06-24, dev 브랜치

관련 문서: [database.md](database.md) · [api-reference.md](api-reference.md) · [env-and-security.md](env-and-security.md) · [lib-reference.md](lib-reference.md)

---

## 1. NextAuth 설정

기준 파일: `app/api/auth/[...nextauth]/options.ts`, `app/api/auth/[...nextauth]/route.ts`.

### 1.1 핸들러 & 런타임

```ts
// app/api/auth/[...nextauth]/route.ts:4-7
export const runtime = "nodejs";
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

- `runtime = "nodejs"` 지정(`bcrypt`, PrismaAdapter가 Node API에 의존하므로 Edge 불가).
- `/api/auth/*` 경로(signin/signout/session/csrf/callback)는 NextAuth가 자동 처리합니다.

### 1.2 authOptions 구성

| 항목 | 값 | 인용 |
| --- | --- | --- |
| `adapter` | `PrismaAdapter(prisma)` (`@auth/prisma-adapter`) | `options.ts:16` |
| `secret` | `process.env.NEXTAUTH_SECRET` | `options.ts:17` |
| `session.strategy` | `"jwt"` (DB 세션 미사용, 토큰 기반) | `options.ts:18` |
| `providers` | `Credentials` 1종 | `options.ts:19-55` |
| `pages.signIn` | `/login` | `options.ts:56` |

> 참고: `session.strategy === "jwt"`이므로 NextAuth의 `Session` 모델(`schema.prisma:77`)에는 실제로 세션 row가 적재되지 않습니다. PrismaAdapter는 주로 Credentials 외 계정/검증 토큰 모델 호환을 위해 연결되어 있습니다.

### 1.3 프로덕션 환경변수 가드

모듈 로드 시점에 프로덕션이면 필수 환경변수를 검사하고, 없으면 throw 합니다(`options.ts:7-13`).

| 조건 | 동작 |
| --- | --- |
| `isProd && !NEXTAUTH_SECRET` | `Error("NEXTAUTH_SECRET is required in production")` |
| `isProd && !NEXTAUTH_URL && !APP_URL` | `Error("NEXTAUTH_URL or APP_URL is required in production")` |

`isProd`는 `process.env.NODE_ENV === "production"` (`options.ts:7`).

### 1.4 Credentials provider `authorize`

자격 검증 로직(`options.ts:26-53`):

1. `email`은 trim, `password`는 기본값 `""`. 둘 중 하나라도 비어 있으면 `null` 반환(로그인 실패).
2. `prisma.user.findUnique({ where: { email } })`로 사용자 조회(`id, name, email, password, role, emailVerified` select).
3. `user?.password`가 없으면 `null`. 옵셔널 체이닝(`user?.`)이라 **사용자 미존재**(`findUnique`가 `null` 반환)와 **비밀번호 미설정**(소셜 전용 계정 등) 두 경우를 한 줄로 차단합니다(`options.ts:43`).
4. **이메일 미인증 차단**: `!user.emailVerified`이면 `throw new Error("EMAIL_NOT_VERIFIED")`. 이 에러 문자열은 클라이언트에서 인증 메일 재전송 트리거로 사용됩니다(아래 [4.2](#42-로그인-페이지)).
5. `bcrypt.compare(password, user.password)`로 해시 비교. 불일치 시 `null`.
6. 성공 시 `{ id, email, name }` 반환 → JWT에 주입.

> 보안: `role`은 `authorize` 반환값에 포함되지 않으며 JWT/세션 토큰에도 담기지 않습니다. 권한 판정이 필요한 서버 라우트는 매번 세션 이메일로 `prisma.user.findUnique({ select: { role } })`를 다시 조회합니다(아래 [5.4](#54-서버측-권한-판정-패턴)). 따라서 ADMIN 강등/승격이 즉시 반영됩니다(재로그인 불필요).

### 1.5 세션 형태

- `callbacks`는 **정의되어 있지 않습니다**(`jwt`/`session` 콜백 없음). 기본 NextAuth 동작에 따라 세션은 `session.user = { name, email, image }` 형태이며 `id`/`role`은 노출되지 않습니다.
- 클라이언트: `SessionProvider`로 앱 전체를 감쌉니다(`app/components/Providers.tsx:3-11`). `Sidebar`에서 `useSession()`으로 `session.user.name`/`email`을 읽어 라벨 표시(`app/components/Sidebar.tsx:83`, `101-106`).
- 서버: `getServerSession(authOptions)`로 세션을 읽고 `session.user.email`을 키로 사용합니다.

---

## 2. 데이터 모델 (인증/권한 관련)

기준 파일: `prisma/schema.prisma`. 자세한 전체 스키마는 [database.md](database.md) 참고.

### 2.1 `User` (`schema.prisma:21-56`)

| 필드 | 타입 | 비고 |
| --- | --- | --- |
| `id` | `String @id @default(cuid())` | |
| `name` | `String?` | 닉네임(선택). 대소문자 무시 유니크 정책은 앱 레벨에서만 검증(아래 [3.5](#35-중복-체크-check-email--check-name)) |
| `email` | `String? @unique` | 로그인 식별자 |
| `password` | `String?` | bcrypt 해시(cost 10). Credentials 전용 |
| `role` | `Role @default(USER)` | `USER` / `ADMIN` |
| `emailVerified` | `DateTime?` | `null`이면 미인증 → 로그인 차단 |
| `createdAt` / `updatedAt` | `DateTime` | |
| 관계 | `menuOverrides`, `outgoingScheduleShares`, `incomingScheduleShares` 등 | |

### 2.2 `VerificationToken` (`schema.prisma:86-92`)

| 필드 | 타입 | 비고 |
| --- | --- | --- |
| `identifier` | `String` | 대상 이메일 |
| `token` | `String @unique` | **SHA-256 해시값** 저장(평문 아님) |
| `expires` | `DateTime` | 발급 + 24h |
| 제약 | `@@unique([identifier, token])` | `findUnique({ identifier_token })` 조회 키 |

### 2.3 `MenuPermission` (`schema.prisma:508-521`)

사이드바 메뉴 1건 = row 1개. 기본 시드는 코드 상수(`DEFAULTS`)로 관리됩니다([5.1](#51-defaults--seedifempty)).

| 필드 | 타입 | 기본값 | 비고 |
| --- | --- | --- | --- |
| `key` | `String @unique` | — | 메뉴 식별자(`home`, `blog`, `permission` …) |
| `label` | `String` | — | 표시 이름 |
| `path` | `String` | — | 라우트 경로 |
| `requireLogin` | `Boolean` | `true` | 로그인 필요 여부 |
| `minRole` | `Role` | `USER` | 최소 역할 |
| `visible` | `Boolean` | `true` | 노출 여부 |
| `userOverrides` | `UserMenuPermission[]` | — | 사용자별 오버라이드 역참조 |

### 2.4 `UserMenuPermission` (`schema.prisma:379-393`)

사용자별 메뉴 오버라이드.

| 필드 | 타입 | 비고 |
| --- | --- | --- |
| `userId` | `String` | `User` FK, `onDelete: Cascade` |
| `menuKey` | `String` | `MenuPermission.key` FK, `onDelete: Cascade` |
| `mode` | `PermissionOverrideMode` | `ALLOW` / `DENY` |
| 제약 | `@@unique([userId, menuKey])` | 사용자·메뉴당 1건 |

### 2.5 `ScheduleShare` (`schema.prisma:359-377`)

데이터 공유 요청. requester가 owner의 데이터를 읽도록 요청 → owner 승인.

| 필드 | 타입 | 비고 |
| --- | --- | --- |
| `requesterId` | `String` | 요청자(=공유받는 쪽). `User` 관계 `ScheduleShareRequester` |
| `ownerId` | `String` | 데이터 소유자(=공유해주는 쪽). 관계 `ScheduleShareOwner` |
| `scope` | `ScheduleShareScope` | 공유 범위 |
| `status` | `ScheduleShareStatus @default(PENDING)` | 진행 상태 |
| `respondedAt` | `DateTime?` | 승인/거절 시각 |
| 제약 | `@@unique([requesterId, ownerId, scope])` | 동일 조합 1건 |
| 인덱스 | `@@index([requesterId, scope, status])`, `@@index([ownerId, scope, status])` | 조회 최적화 |

### 2.6 관련 enum

| enum | 값 | 인용 |
| --- | --- | --- |
| `Role` | `USER`, `ADMIN` | `schema.prisma:16-19` |
| `PermissionOverrideMode` | `ALLOW`, `DENY` | `schema.prisma:184-187` |
| `ScheduleShareStatus` | `PENDING`, `ACCEPTED`, `REJECTED` | `schema.prisma:189-193` |
| `ScheduleShareScope` | `CALENDAR`, `TODO`, `LEDGER`, `STOCK` | `schema.prisma:195-200` |

> 주의: `ScheduleShareScope`는 스키마(`schema.prisma:195-200`)·TS 타입(`app/lib/scheduleShare.ts:3-7`) 모두 `CALENDAR`/`TODO`/`LEDGER`/`STOCK` **4종**입니다(캘린더·TODO·가계부·주식).

---

## 3. 회원가입 → 이메일 인증 → 로그인 플로우

### 3.1 전체 흐름

```text
[sign-up 페이지]
  ├─ (선택) GET /api/check-email · GET /api/check-name 으로 중복 확인
  └─ POST /api/sign-up
        ├─ User 생성 (emailVerified=null, password=bcrypt)
        ├─ VerificationToken 생성 (sha256 해시, 24h)
        └─ sendMail(verify 링크)
                │
[메일의 링크 클릭] → /verify-email?email=&token=
        └─ GET /api/verify-email
              ├─ token 해시 매칭 + 만료 확인
              ├─ User.emailVerified = now()
              └─ 해당 identifier 토큰 전부 삭제
                │
[login 페이지] → signIn("credentials")
        └─ authorize(): emailVerified 없으면 EMAIL_NOT_VERIFIED throw
              → 페이지가 자동으로 POST /api/resend-verification 호출
```

### 3.2 `POST /api/sign-up`

기준: `app/api/sign-up/route.ts`.

| 항목 | 내용 |
| --- | --- |
| 인증 | 불필요(공개) |
| Rate limit | `sign-up:{ip}`, 10분당 8회(`SIGN_UP_LIMIT=8`, `SIGN_UP_WINDOW_MS=10*60*1000`). 초과 시 `429` + `Retry-After` 헤더 |
| 바디 스키마(zod) | `{ email: string(min1).trim, password: string(min1), name?: string|null }` `.strict()` (`route.ts:15-21`) |
| 추가 검증 | `EMAIL_REGEX` 형식 검사 → 실패 시 `400 invalid email format` |
| 응답 | 성공 `{ ok: true }` / 그 외 에러 코드 |

부수효과 및 분기:

1. 바디 파싱은 `parseJsonWithSchema` → 실패 시 `badRequestFromZod(err, 'invalid body')`(`400`).
2. `name`은 trim 후 빈 문자열이면 `null`로 정규화(`route.ts:48-49`).
3. 이메일 중복: `prisma.user.findUnique({ email })` 존재 시 `409 email already exists`(`route.ts:58-66`).
4. 닉네임 중복: name이 있으면 `findFirst({ name: { equals, mode:'insensitive' } })` → 존재 시 `409 name already exists`(`route.ts:68-85`).
5. 비밀번호 `bcrypt.hash(password, 10)`로 해시.
6. `prisma.user.create({ emailVerified: null })`.
7. 토큰: `crypto.randomBytes(32).toString('hex')` 평문 생성 → `hashVerificationToken`(SHA-256)로 해시, `expires = now + 24h`.
8. 재가입/재발송 대비 기존 토큰 `deleteMany({ identifier })` 후 새 토큰 create(`route.ts:104-113`).
9. 링크 = `${resolveAppUrl(req)}/verify-email?email=...&token={평문토큰}`. 메일 본문에 24h 만료 안내.
10. `try/catch` 전역, 예외 시 `500 server error` + `[SIGN-UP ERROR]` 로그.

### 3.3 `GET /api/verify-email`

기준: `app/api/verify-email/route.ts`.

| 항목 | 내용 |
| --- | --- |
| 인증 | 불필요(공개, 토큰 소지로 검증) |
| 쿼리 | `email`, `token`(둘 다 trim, 없으면 `400 email/token required`) |
| 응답 | 성공 `{ ok: true }` / `400 invalid token` / `400 token expired` |

검증 로직(`route.ts:14-42`):

1. `hashVerificationToken(token)`로 해시 후 `findUnique({ identifier_token: { identifier: email, token: tokenHash } })`.
2. 미일치 시 **평문 토큰 호환 조회** 1회 더 시도(과거 평문 저장 데이터 마이그레이션 호환, `route.ts:20-24`).
3. 둘 다 없으면 `400 invalid token`.
4. `vt.expires < now`면 해당 identifier 토큰 전부 삭제 후 `400 token expired`.
5. 성공: `prisma.user.update({ where: { email }, data: { emailVerified: new Date() } })`.
6. 인증 후 `verificationToken.deleteMany({ identifier: email })`로 1회용 처리.

> 이 라우트에는 rate limit이 없습니다(토큰 자체가 32바이트 랜덤 + 해시 저장이라 추측 비용이 높음).

### 3.4 `POST /api/resend-verification`

기준: `app/api/resend-verification/route.ts`.

| 항목 | 내용 |
| --- | --- |
| 인증 | 불필요(공개) |
| Rate limit | `resend-verification:{ip}`, 10분당 5회(`RESEND_LIMIT=5`). 초과 시 `429` + `Retry-After` |
| 바디 스키마(zod) | `{ email: string(min1).trim }` `.strict()` |
| 응답 | `{ ok: true }` / `{ ok: true, message: "already verified" }` / `404 not found` / `400` 계열 |

로직(`route.ts:20-71`):

1. 바디 파싱 → 실패 시 `badRequestFromZod`.
2. `EMAIL_REGEX` 검사.
3. Rate limit 적용.
4. 사용자 조회(`select: { emailVerified }`) → 없으면 `404 not found`.
5. 이미 인증됨(`emailVerified` truthy)이면 `{ ok: true, message: "already verified" }`로 조기 반환(메일 미발송).
6. 미인증이면 새 토큰 생성·기존 토큰 삭제·새 토큰 create(24h) 후 인증 메일 발송.

> 보안 관찰: `404 not found`로 미가입 이메일을 구분 가능합니다(계정 열거 가능성). 단 rate limit으로 완화.

### 3.5 중복 체크: `check-email` / `check-name`

| 라우트 | 메서드 | 쿼리 | 응답 | Rate limit |
| --- | --- | --- | --- | --- |
| `/api/check-email` | GET | `email`(trim, 필수) | `{ available: boolean }` | `check-email:{ip}` 10분 40회 |
| `/api/check-name` | GET | `name`(trim, 필수) | `{ available: boolean }` | `check-name:{ip}` 10분 40회 |

- `check-email`: `findUnique({ email })` 존재 여부로 `available` 결정(`app/api/check-email/route.ts:34-35`).
- `check-name`: `findFirst({ name: { equals, mode:'insensitive' } })` 존재 여부로 결정(`app/api/check-name/route.ts:33-43`). 즉 닉네임 유니크는 **대소문자 무시**.
- 둘 다 빈 값이면 `400 ... required`, 한도 초과 `429`, 예외 시 `500 server error` + 로그.

---

## 4. 인증 관련 페이지

### 4.1 회원가입 페이지

기준: `app/(auth)/sign-up/page.tsx` (client component).

- 입력: 닉네임(선택)/이메일/비밀번호. 비밀번호 placeholder는 "최소 8자 권장"(검증은 권장 수준, 서버는 `min(1)`만 강제).
- `onBlur` 및 "중복 확인" 버튼에서 `checkEmail`/`checkName` 호출 → `emailCheck`/`nameCheck` 상태(`idle|checking|available|taken`)로 안내 텍스트 표시(`page.tsx:22-78`).
- 제출 전 가드: `emailCheck === 'taken'` 또는 `nameCheck === 'taken'`이면 제출 차단(`page.tsx:80-89`).
- `POST /api/sign-up` 결과에 따라:
  - 성공: "가입완료! ... 메일함을 확인하세요!" + 재전송 버튼 노출(`showResend`).
  - `409`: 메시지에 `name` 포함 여부로 이메일/닉네임 중복 판정(`page.tsx:110-121`).
- "인증 메일 재전송" 버튼 → `POST /api/resend-verification`.

### 4.2 로그인 페이지

기준: `app/(auth)/login/page.tsx` (client component).

- `signIn('credentials', { email, password, redirect: false })` 호출(`page.tsx:21-25`).
- 성공(`res.ok`): `router.push('/')`.
- `res.error === 'EMAIL_NOT_VERIFIED'`(authorize의 throw가 전달됨)인 경우: 안내 메시지 + **자동으로** `POST /api/resend-verification` 호출, 그리고 "인증 메일 재전송" 버튼(`showResend`) 노출(`page.tsx:32-50`).
- 그 외 실패: "로그인 실패".

### 4.3 이메일 인증 처리 페이지

기준: `app/verify-email/page.tsx` (client component, `Suspense`로 감싼 `useSearchParams`).

- 마운트 시 쿼리의 `email`/`token`으로 `GET /api/verify-email` 호출(`page.tsx:11-25`).
- 성공: "이메일 인증 완료!" 후 800ms 뒤 `/login`으로 이동.
- 실패: `인증 실패: {message}` 표시.

---

## 5. 메뉴 권한 시스템 (역할 기반)

### 5.1 `DEFAULTS` & `seedIfEmpty`

기준: `app/api/permission/route.ts`.

`DEFAULTS` 상수(`route.ts:18-109`)가 기본 메뉴 시드입니다.

| key | label | path | requireLogin | minRole | visible |
| --- | --- | --- | --- | --- | --- |
| `home` | 메인 | `/` | false | USER | true |
| `dashboard` | 대시보드 | `/dashboard` | true | USER | true |
| `blog` | 블로그 | `/blog` | true | USER | true |
| `docs` | Docs | `/docs` | true | USER | true |
| `boards` | 게시판 | `/boards` | true | USER | true |
| `todos` | TODO | `/todos` | true | USER | true |
| `calendar` | 캘린더 | `/calendar` | true | USER | true |
| `diary` | 일기장 | `/diary` | true | USER | true |
| `ledger` | 가계부 | `/ledger` | true | USER | true |
| `help` | 고객 센터 | `/help` | true | USER | true |
| `permission` | 권한 관리 | `/permission` | true | **ADMIN** | true |

`seedIfEmpty()` 동작(`route.ts:111-148`):

1. `createMany({ data: DEFAULTS, skipDuplicates: true })` — 누락 메뉴만 추가.
2. `permission` 키는 별도 `upsert`로 항상 `minRole=ADMIN, visible=true`로 보정(과거 `visible=false` 데이터 정정).
3. 폐기 키 정리: `deleteMany({ key: { in: ['accounting'] } })` — `accounting → ledger` 개명 잔재 제거.

> `seedIfEmpty`는 `GET`(매 조회)·`PUT`(저장 전)에서 호출됩니다. DB가 비어 있어도 첫 호출 시 자동 시드됩니다.

### 5.2 `GET /api/permission`

기준: `route.ts:163-197`.

| 항목 | 내용 |
| --- | --- |
| 인증 | 선택(비로그인도 호출 가능) |
| 쿼리 | `mode`(옵션). `mode=manage`일 때만 ADMIN 전체 목록 |
| 응답(일반) | 사이드바용 필터링된 `PermissionRow[]` |
| 응답(`mode=manage`) | 전체 `PermissionRow[]` (ADMIN만, 아니면 `403 forbidden`) |

처리:

1. `seedIfEmpty()` 후 `menuPermission.findMany({ orderBy: { path: 'asc' } })`.
2. `getMeRole()`(`route.ts:150-161`): 세션 이메일 → `user.role` 조회(없으면 `null`). `isAdmin = role === 'ADMIN'`, `loggedIn = !!role`.
3. `mode === 'manage'`: `isAdmin` 아니면 `403`, 맞으면 전체 rows 반환.
4. 일반 모드: 사이드바용 필터 3단(`route.ts:191-194`):

```ts
const navRows = rows
  .filter((x) => x.visible)                              // 숨김 제외
  .filter((x) => (x.requireLogin ? loggedIn : true))     // 로그인 필요 시 로그인된 사용자만
  .filter((x) => (x.minRole === 'ADMIN' ? isAdmin : true)) // ADMIN 메뉴는 ADMIN만
```

### 5.3 `PUT /api/permission`

기준: `route.ts:199-246`.

| 항목 | 내용 |
| --- | --- |
| 인증 | 로그인 필수(없으면 `401 unauthorized`) |
| 권한 | ADMIN만(아니면 `403 forbidden`) |
| 바디 | `{ items: PermissionRow[] }`(배열 아니면 `400 bad request`) |
| 응답 | `{ ok: true }` |

- 저장 전 `seedIfEmpty()` 호출.
- `items`를 `key` 단위 `upsert`(`label/path/requireLogin/minRole/visible` 갱신, `requireLogin`·`visible`은 `!!` 불리언 강제).

### 5.4 서버측 권한 판정 패턴

권한이 필요한 라우트들은 공통적으로 아래 `requireAdmin` 패턴을 사용합니다(예: `app/api/permission/users/route.ts:7-18`).

```ts
async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email ?? null
  if (!email) return null
  const me = await prisma.user.findUnique({
    where: { email }, select: { id: true, role: true },
  })
  if (!me || me.role !== 'ADMIN') return null
  return me
}
```

- 세션에 role이 없으므로 **매 요청 DB 조회**로 최신 role을 가져옵니다.
- `/permission` **페이지**(`app/permission/page.tsx:9-22`)는 SSR 단계에서 `getServerSession` → role 확인 후 비로그인/비ADMIN이면 `redirect('/')`.

### 5.5 클라이언트 사이드바 연동

기준: `app/components/Sidebar.tsx`.

- 마운트 시 `GET /api/permission`(`cache:'no-store'`)으로 필터된 메뉴를 받아 `perms` 상태에 저장(`Sidebar.tsx:89-99`).
- 응답이 비거나 실패하면 하드코딩된 fallback nav를 사용(`Sidebar.tsx:108-`).
- 사용자 라벨은 `displayUserLabel(name, email, '비로그인')`(`app/lib/userLabel.ts`).

> **중요(현 구현의 한계)**: 메뉴 권한은 사이드바 **노출 필터링** 용도입니다. `middleware.ts`(`middleware.ts:1-33`)는 보안 헤더만 설정하고 **경로별 접근 인증을 강제하지 않습니다**. 따라서 개별 페이지/API의 실제 접근 통제는 각 라우트가 자체적으로 `getServerSession` + role/소유권 검사로 수행해야 합니다(메뉴 visible/minRole 자체가 URL 직접 접근을 막지는 않음).

---

## 6. 사용자별 권한 오버라이드

### 6.1 사용자 목록 — `GET /api/permission/users`

기준: `app/api/permission/users/route.ts`.

| 항목 | 내용 |
| --- | --- |
| 인증/권한 | ADMIN만(`requireAdmin`, 아니면 `403 forbidden`) |
| 응답 | `User[]` (`id, email, name, role, createdAt`), `createdAt asc` 정렬 |

### 6.2 오버라이드 조회/저장 — `/api/permission/users/[userId]/overrides`

기준: `app/api/permission/users/[userId]/overrides/route.ts`. `userId`는 `ctx.params`(Promise)로 await.

| 메서드 | 권한 | 요청 | 응답 | 부수효과 |
| --- | --- | --- | --- | --- |
| GET | ADMIN | — | `{ menuKey, mode }[]` (`menuKey asc`) | 없음 |
| PUT | ADMIN | `{ overrides: { menuKey, mode:'ALLOW'|'DENY' }[] }` | `{ ok: true }` | **통째 동기화** |

PUT 동기화 방식(`route.ts:60-71`): 해당 `userId`의 `userMenuPermission` 전부 `deleteMany` 후, `overrides`가 있으면 `createMany`로 재생성. 잘못된 바디(`overrides` 누락/비배열)는 `400 bad request`.

### 6.3 역할 변경 — `PUT /api/permission/users/[userId]/role`

기준: `app/api/permission/users/[userId]/role/route.ts`.

| 항목 | 내용 |
| --- | --- |
| 권한 | ADMIN만 |
| 바디 | `{ role: 'USER' | 'ADMIN' }` (그 외 값 `400 bad request`) |
| 응답 | 갱신된 `{ id, name, email, role, createdAt }` / `404 not found` / `409` |

핵심 안전장치 — **마지막 ADMIN 자기 강등 방지**(`route.ts:44-54`):

```ts
if (me.id === userId && role === 'USER') {
  const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
  if (adminCount <= 1) return Response.json(
    { message: 'last admin cannot be demoted' }, { status: 409 })
}
```

- 대상 미존재 시 `404 not found`.
- 성공 시 `user.update({ role })`.

### 6.4 오버라이드 적용 범위 (현 구현)

`PermissionOverrideMode`(`ALLOW`/`DENY`)와 `UserMenuPermission`은 **저장/관리 UI까지만** 구현되어 있습니다. 코드 전수 검색 결과, `userMenuPermission`/`menuOverrides`를 **읽어 런타임 메뉴 필터나 라우트 가드에 반영하는 코드는 없습니다**(읽기 사용처는 `overrides/route.ts`의 관리 조회뿐). 즉 현재 `GET /api/permission`의 nav 필터(`5.2`)는 사용자별 ALLOW/DENY를 적용하지 않습니다.

- UI 의미(`app/permission/PermissionClient.tsx:410-413`): `DEFAULT`=기본정책 그대로 / `ALLOW`=강제 허용 / `DENY`=강제 차단. `DEFAULT`로 바꿔 저장하면 해당 row 삭제(복귀).
- PermissionClient 저장 시 `mode !== 'DEFAULT'`인 항목만 payload로 전송(`PermissionClient.tsx:122-124`).

---

## 7. 권한 관리 UI

기준: `app/permission/page.tsx`(SSR 가드) + `app/permission/PermissionClient.tsx`(client).

- 진입 가드: 비로그인 또는 비ADMIN이면 `/`로 redirect(`page.tsx:11-22`).
- 탭 2개(`PermissionClient.tsx:30`):
  - **메뉴 기본 설정(MENU)**: `GET /api/permission?mode=manage`로 전체 로드 → `label/path/requireLogin/minRole/visible` 인라인 편집 → "저장"이 `PUT /api/permission`.
  - **사용자별 권한(USER)**: `GET /api/permission/users`로 유저 목록 로드 → 대상 유저 선택 시 `GET .../overrides` 로드. "역할 저장"은 `PUT .../role`, "선택 유저 권한 저장"은 `PUT .../overrides`.
- 로드 순서(effect 체인): 메뉴 로드 → (`menus.length` 변화) 유저 로드 → (`selectedUserId` 변화) 오버라이드 로드(`PermissionClient.tsx:168-198`).

---

## 8. 데이터 공유 권한 (ScheduleShare)

requester가 owner의 데이터를 **읽기 전용** 공유받는 시스템. 캘린더·TODO·가계부·주식 조회 API에서 활용됩니다.

### 8.1 라이브러리 — `app/lib/scheduleShare.ts`

| export | 시그니처 | 동작 |
| --- | --- | --- |
| `ScheduleShareScope` | `type = 'CALENDAR' | 'TODO' | 'LEDGER' | 'STOCK'` | 스코프 유니온 타입 |
| `getReadableScheduleOwnerIds(userId, scope)` | `Promise<string[]>` | 본인 + `ACCEPTED` 상태로 공유받은 ownerId들의 유니크 배열 반환 |
| `parseScheduleShareScope(v)` | `ScheduleShareScope | null` | 문자열 검증 파서 |
| `toUserLabel(name, email)` | `string` | name → email → `'알 수 없는 사용자'` 폴백 라벨 |

`getReadableScheduleOwnerIds`(`scheduleShare.ts:11-29`): `scheduleShare.findMany({ requesterId: userId, scope, status:'ACCEPTED' })` → `[userId, ...ownerIds]` 중복 제거. **try/catch로 감싸 공유 테이블 미마이그레이션 상태에서도 `[userId]`(본인 데이터)만 반환**해 조회가 깨지지 않도록 합니다.

소비처(공유받은 owner 데이터까지 조회): `app/api/calendar/route.ts:78`, `app/api/todos/boards/route.ts:39`, `app/api/ledger/route.ts:95`, `app/api/ledger/stats/route.ts:58`, `app/api/holdings/route.ts:82`, `app/api/holdings/[holdingId]/route.ts:109` 등.

### 8.2 `GET /api/schedule-shares`

기준: `app/api/schedule-shares/route.ts:52-137`.

| 항목 | 내용 |
| --- | --- |
| 인증 | 로그인 필수(`getMe()` null이면 `401 unauthorized`) |
| 응답 | `{ me, outgoing[], incoming[] }` |

- `me`: `{ id, name, email, label }`(label은 `toUserLabel`).
- `outgoing`: 내가 보낸 요청(`requesterId = me.id`), 모든 status, `owner` 정보 포함.
- `incoming`: 내게 온 요청(`ownerId = me.id`), **status가 `PENDING`/`ACCEPTED`만**(REJECTED 제외), `requester` 정보 포함.
- 정렬: 둘 다 `[{ status: 'asc' }, { updatedAt: 'desc' }]`. 날짜는 `toISOStringSafe`로 직렬화.
- 예외 시 `500` + "공유 기능 초기화가 필요합니다. `npx prisma migrate dev` ..." 안내 메시지.

### 8.3 `POST /api/schedule-shares` (공유 요청 생성)

기준: `route.ts:139-257`.

| 항목 | 내용 |
| --- | --- |
| 인증 | 로그인 필수 |
| 바디 | `{ targetEmail: string, scope: 'CALENDAR'|'TODO'|'LEDGER'|'STOCK' }` |
| 응답 | 생성/갱신된 공유 row(+`owner` 라벨) |

- `targetEmail`(trim) 없으면 `400`. `scope`는 `parseScheduleShareScope`로 검증, 실패 시 `400`.
- 자기 자신(이메일/이름 대소문자 무시 일치)에게 요청 시 `400 자기 자신에게는 요청할 수 없습니다`.
- 대상 조회: email **또는** name(둘 다 `insensitive`)로 `findMany(take:2)` (`route.ts:162-171`).
  - 0건 → `404 해당 이메일 또는 아이디의 계정을 찾을 수 없습니다`.
  - 2건(동일 닉네임 중복) → `409 동일한 아이디가 중복되어 있습니다. 이메일로 요청해 주세요`.
- 기존 공유(`requesterId_ownerId_scope` unique) 확인:
  - 기존이 `PENDING` → `409 이미 ... 공유 요청을 보냈습니다`.
  - 기존이 `ACCEPTED` → `409 이미 ... 공유가 허용된 계정입니다`.
  - 기존이 `REJECTED` 등이면 `update`로 `status='PENDING', respondedAt=null` 재요청. 없으면 `create`.

### 8.4 `PATCH /api/schedule-shares/[shareId]` (승인/거절)

기준: `app/api/schedule-shares/[shareId]/route.ts:22-79`. `shareId`는 params(Promise) await.

| 항목 | 내용 |
| --- | --- |
| 인증 | 로그인 필수 |
| 권한 | **owner만**(`share.ownerId !== me.id`이면 `403 forbidden`) |
| 바디 | `{ action: 'ACCEPT' | 'REJECT' }`(그 외 `400`) |
| 응답 | 갱신된 공유 row / `404 not found` |

- `ACCEPT` → `status='ACCEPTED'`, `REJECT` → `status='REJECTED'`, 둘 다 `respondedAt=now()`.

### 8.5 `DELETE /api/schedule-shares/[shareId]` (취소/삭제)

기준: `route.ts:81-109`.

| 항목 | 내용 |
| --- | --- |
| 인증 | 로그인 필수 |
| 권한 | requester **또는** owner(둘 다 아니면 `403 forbidden`) |
| 응답 | `{ ok: true }` / `404 not found` |

- requester가 보낸 요청 취소, owner가 받은 공유 철회 양쪽 모두 가능.

---

## 9. 인증 보조 라이브러리 요약

| 파일 | export | 역할 |
| --- | --- | --- |
| `app/lib/verificationToken.ts` | `hashVerificationToken(token)` | SHA-256 hex 해시(검증 토큰 저장용) |
| `app/lib/mailer.ts` | `sendMail({to,subject,text,replyTo?})` | SMTP env 없으면 콘솔 폴백(프로덕션은 throw), 있으면 `nodemailer` 동적 import 전송 |
| `app/lib/appUrl.ts` | `resolveAppUrl(req)` | `APP_URL`/`NEXTAUTH_URL` 또는 요청 origin → origin 문자열. 프로덕션은 https·non-localhost 강제 |
| `app/lib/userLabel.ts` | `maskEmail`, `displayUserLabel` | 이메일 마스킹, 표시 라벨(name → maskEmail → fallback) |
| `app/lib/rateLimit.ts` | `getClientIp`, `takeRateLimit` | 인메모리(글로벌 Map) IP 기반 윈도우 카운터 |
| `app/lib/scheduleShare.ts` | (위 [8.1](#81-라이브러리--applibschedulesharets)) | 공유 owner 해석/파서/라벨 |

### 9.1 mailer 환경변수

| 변수 | 용도 |
| --- | --- |
| `SMTP_HOST` / `SMTP_PORT` | SMTP 서버(`PORT` 기본 587, `465`면 `secure:true`) |
| `SMTP_USER` / `SMTP_PASS` | 인증 자격 |
| `SMTP_FROM` | 발신자(없으면 `SMTP_USER`로 대체) |

`host/user/pass/from` 중 하나라도 없을 때: 비프로덕션은 `[EMAIL:FALLBACK]`로 콘솔 출력, **프로덕션은 `Error("SMTP env is missing in production")` throw**(`mailer.ts:16-26`).

> 실제 비밀값은 `.env`로만 주입하며 본 문서/로그에 노출하지 않습니다. 환경변수 전체 목록은 [env-and-security.md](env-and-security.md) 참고.

### 9.2 rateLimit 동작

`takeRateLimit(key, limit, windowMs)`는 `globalThis.__leeshRateLimitBuckets` Map에 `{ count, resetAt }` 버킷을 유지합니다(`rateLimit.ts:6-16`). 윈도우 만료 시 리셋, 한도 초과 시 `{ ok:false, retryAfterSec }` 반환. `getClientIp`는 `x-forwarded-for`(첫 IP) → `x-real-ip` → `'unknown'` 순으로 해석(`rateLimit.ts:24-35`).

> 인메모리 카운터라 **다중 인스턴스/서버리스 환경에서는 인스턴스별로 독립**됩니다. 분산 환경에서는 한도가 인스턴스 수만큼 늘어날 수 있음에 유의.

---

## 10. 권한 매트릭스 (요약)

| 작업 | 비로그인 | USER | ADMIN |
| --- | --- | --- | --- |
| 회원가입/로그인/이메일 인증/중복체크 | 가능 | 가능 | 가능 |
| `GET /api/permission`(nav) | visible+로그인불요 메뉴만 | 본인 역할 기준 메뉴 | ADMIN 메뉴 포함 |
| `GET /api/permission?mode=manage` | `403` | `403` | 전체 |
| `PUT /api/permission` | `401` | `403` | 가능 |
| `/permission` 페이지 | redirect `/` | redirect `/` | 가능 |
| `GET /api/permission/users` | `403` | `403` | 가능 |
| 오버라이드 GET/PUT, role PUT | `403` | `403` | 가능 |
| ScheduleShare 생성/조회 | `401` | 본인 요청/수신 | 본인 요청/수신 |
| ScheduleShare 승인·거절(PATCH) | `401` | owner 본인만 | owner 본인만 |
| ScheduleShare 삭제(DELETE) | `401` | requester/owner 본인만 | requester/owner 본인만 |

> ADMIN도 ScheduleShare는 전역 관리 권한이 아니라 **본인이 당사자인 공유만** 다룰 수 있습니다(별도 관리자 우회 없음).
