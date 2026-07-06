# 환경변수 & 보안

Leesh가 사용하는 모든 환경변수와, 미들웨어 보안 헤더 / 자격증명 암호화 / 레이트리밋 / 잠금 쿠키 / 이메일 인증 토큰 / 세션 보안 / DB 연결 정책 등 런타임 보안 메커니즘을 코드 기준으로 정리한 레퍼런스입니다.

> 작성 기준: 2026-06-24, dev 브랜치

상호 참조: [database.md](database.md) · [auth-permissions.md](auth-permissions.md) · [setup-and-run.md](setup-and-run.md) · [integration-kis.md](integration-kis.md) · [lib-reference.md](lib-reference.md) · [operations-troubleshooting.md](operations-troubleshooting.md)

---

## 1. 환경변수 전체 목록

코드에서 실제로 `process.env`로 읽거나(`grep` 기준) `.env*` 파일에 선언된 키만 수록합니다. "필수" 열은 해당 기능을 사용할 때의 기준이며, "운영 필수"는 `NODE_ENV === "production"`에서 미설정 시 코드가 throw 하거나 동작이 멈추는 항목입니다.

`.env` 위치 열 표기:

- `example` = `.env.example` (커밋됨, 공개 템플릿)
- `dev` = `.env` (로컬 개발, `.gitignore` 제외)
- `prod` = `.env.prod` (운영 템플릿, `.gitignore` 제외)

| Key | 용도 | 필수 | example | dev | prod | 사용처 |
|---|---|---|:--:|:--:|:--:|---|
| `DATABASE_URL` | 런타임 PostgreSQL 연결 문자열(앱 어댑터 + 마이그레이션 fallback) | **필수** | O | O | O | `app/lib/prisma.ts:12`, `prisma.config.ts:15` |
| `DIRECT_URL` | 마이그레이션 전용 direct 연결(pgbouncer prepared-statement 회피) | 운영 권장 | X | O | O | `prisma.config.ts:15` |
| `NEXTAUTH_SECRET` | NextAuth JWT 서명 secret + 다수 보안 모듈의 기본 키 소스 | **운영 필수** | O | O | O | `app/api/auth/[...nextauth]/options.ts:8,17`, `app/lib/cryptoUtil.ts:9`, `app/lib/unlockCookie.ts:20` |
| `NEXTAUTH_URL` | NextAuth base URL / 절대 URL 보조 | 운영 권장 | O | O | O | `options.ts:11`, `app/lib/appUrl.ts:2` |
| `APP_URL` | 메일 링크 등 절대 URL 기준(우선순위 1순위) | 운영 권장 | O | O | O | `app/lib/appUrl.ts:2`, `options.ts:11` |
| `APP_SECRET` | unlock 쿠키 HMAC 서명 대체 secret(`NEXTAUTH_SECRET` 없을 때) | 선택 | O | X | X | `app/lib/unlockCookie.ts:20` |
| `KIS_ENCRYPTION_KEY` | KIS 자격증명 AES 암호화 키(우선순위 1순위) | 선택 | X | X | X | `app/lib/cryptoUtil.ts:9` |
| `SMTP_HOST` | 메일 발송 SMTP 호스트 | 메일 필수 | O | O | O | `app/lib/mailer.ts:10` |
| `SMTP_PORT` | SMTP 포트(미설정 시 `587`, `465`면 secure) | 메일 선택 | O | O | O | `app/lib/mailer.ts:13` |
| `SMTP_USER` | SMTP 인증 사용자(겸 contact 기본 수신자 fallback) | 메일 필수 | O | O | O | `app/lib/mailer.ts:11`, `app/api/leesh/contact/route.ts:86` |
| `SMTP_PASS` | SMTP 인증 비밀번호 | 메일 필수 | O | O | O | `app/lib/mailer.ts:12` |
| `SMTP_FROM` | 발신자 주소(미설정 시 `SMTP_USER`) | 메일 선택 | O | O | O | `app/lib/mailer.ts:14` |
| `LEESH_PASSWORD` | `/leesh` 포트폴리오 편집 잠금 해제 비밀번호(평문 비교) | `/leesh` 편집 시 필수 | O | O | O | `app/api/leesh/unlock/route.ts:7` |
| `LEESH_CONTACT_TO` | `/leesh` contact 폼 수신 이메일(미설정 시 `SMTP_USER`) | 선택 | X | X | X | `app/api/leesh/contact/route.ts:86` |
| `PRISMA_CLIENT_ENGINE_TYPE` | Prisma 클라이언트 엔진 타입 지정(CLI/클라이언트 내부 소비) | 선택 | X | O | O | `.env` 선언만(앱 코드 직접 참조 없음) |
| `NODE_ENV` | 실행 모드. 다수 보안 분기의 기준 | 자동 | - | - | - | middleware/쿠키/메일/URL 전반 |

비고:

- `KIS_ENCRYPTION_KEY`, `APP_SECRET`, `LEESH_CONTACT_TO`는 어느 `.env*` 파일에도 선언돼 있지 않으며, 코드에서 옵셔널 fallback으로만 참조됩니다. 미설정 시 각각 `NEXTAUTH_SECRET`(암호화/쿠키 서명) 또는 `SMTP_USER`(contact 수신)로 대체됩니다.
- `.env.example`은 placeholder 값만 담긴 공개 템플릿이며, `DIRECT_URL` / `KIS_ENCRYPTION_KEY` / `LEESH_CONTACT_TO` / `PRISMA_CLIENT_ENGINE_TYPE` 키는 누락돼 있습니다(필요 시 직접 추가).
- `.env.prod`는 운영 값을 채워 넣는 운영 환경 템플릿이며(`.gitignore`로 추적 제외), 파일 주석에 "절대 커밋하지 마세요"라고 명시돼 있습니다(`.env.prod:7`).

---

## 2. 비밀 비노출 원칙

- 모든 `.env*` 파일은 `.gitignore`로 추적 제외됩니다(`.gitignore:34` `.env*`). 추적 예외 패턴은 `!.env.example`과 `!scripts/.env.prod.example` 두 개가 선언돼 있지만(`.gitignore:35-36`), 실제로 저장소에 커밋돼 있는 파일은 `.env.example` 하나뿐입니다. `scripts/.env.prod.example`은 화이트리스트만 걸려 있고 파일 자체는 존재하지 않습니다(현재 `scripts/`에는 `migrate-prod.ps1`만 있음).
- `*.pem`, `/app/generated/prisma`, `/public/uploads/`, `*.tsbuildinfo` 등도 추적 제외됩니다(`.gitignore`).
- 비밀값은 응답에 평문으로 노출되지 않습니다. KIS appKey 등은 조회 시 `maskSecret()`로 앞 4자·뒤 2자만 남기고 마스킹합니다(`app/api/kis/credentials/route.ts:63`).
- 본 문서를 포함한 docs/는 변수 "이름과 용도"만 기술하며, 실제 secret 값은 절대 기록하지 않습니다.

---

## 3. DB 연결 보안 (Prisma adapter)

런타임과 마이그레이션이 서로 다른 연결 경로를 사용합니다. 자세한 모델 정의는 [database.md](database.md) 참고.

| 경로 | 사용 URL | 비고 |
|---|---|---|
| 앱 런타임 | `DATABASE_URL` | `PrismaPg` 어댑터 + `pg.Pool` (`app/lib/prisma.ts:15-29`) |
| 마이그레이션 (`prisma migrate`) | `DIRECT_URL` → 없으면 `DATABASE_URL` | `prisma.config.ts:15` |

핵심 포인트:

```ts
// app/lib/prisma.ts:15-29
const pool = globalForPrisma.pgPool ?? new Pool({ connectionString });
pool.on("connect", (client) => {
  void client.query("SELECT set_config('TimeZone', $1, false)", [DB_TIMEZONE]) // Asia/Seoul
});
const adapter = new PrismaPg(pool);
```

- `DATABASE_URL` 미설정 시 즉시 throw (`app/lib/prisma.ts:13`).
- 모든 새 connection에서 세션 타임존을 `Asia/Seoul`로 고정(`app/lib/prisma.ts:5,21-27`).
- `PrismaClient`의 `log`는 `["error"]`로 제한해 쿼리/파라미터가 로그에 남지 않게 합니다(`app/lib/prisma.ts:35`).
- `DIRECT_URL`은 pgbouncer를 우회하는 직결 연결로, prepared-statement 충돌을 피하기 위해 마이그레이션에만 사용됩니다(`prisma.config.ts:12-15` 주석).
- 개발 모드에서는 HMR로 인한 커넥션 폭증을 막기 위해 `globalThis`에 `prisma`/`pgPool`을 캐시합니다(`app/lib/prisma.ts:38-41`).
- `.env.example`의 `DATABASE_URL` 템플릿은 `?sslmode=require`를 포함해 TLS 연결을 권장합니다.

---

## 4. NextAuth 세션 / JWT 보안

설정 파일은 `app/api/auth/[...nextauth]/options.ts`, 핸들러는 `app/api/auth/[...nextauth]/route.ts`(`runtime = "nodejs"`)입니다.

| 항목 | 값 | 위치 |
|---|---|---|
| 세션 전략 | `jwt` (DB 세션 미사용) | `options.ts:18` |
| 서명 secret | `NEXTAUTH_SECRET` | `options.ts:17` |
| Provider | `Credentials` (email + password) | `options.ts:20-54` |
| Adapter | `PrismaAdapter(prisma)` | `options.ts:16` |
| 로그인 페이지 | `/login` | `options.ts:56` |
| 비밀번호 검증 | `bcrypt.compare` | `options.ts:49` |

기동 시 강제 검증(운영):

```ts
// options.ts:8-13
if (isProd && !process.env.NEXTAUTH_SECRET) throw new Error("NEXTAUTH_SECRET is required in production");
if (isProd && !process.env.NEXTAUTH_URL && !process.env.APP_URL)
  throw new Error("NEXTAUTH_URL or APP_URL is required in production");
```

`authorize` 흐름(`options.ts:26-53`):

1. email/password 누락 시 `null` 반환(로그인 거부).
2. 사용자 조회 시 `select`로 필요한 컬럼만 가져옴(`id,name,email,password,role,emailVerified`).
3. `emailVerified`가 없으면 `throw new Error("EMAIL_NOT_VERIFIED")` — 미인증 계정 로그인 차단.
4. `bcrypt.compare` 실패 시 `null`.
5. 성공 시 `{ id, email, name }`만 반환(비밀번호/role은 토큰에 직접 싣지 않음).

비고:

- 커스텀 `jwt`/`session` 콜백이나 `session.maxAge` 오버라이드가 없으므로 NextAuth 기본값(JWT 만료 30일)이 적용됩니다.
- 세션 쿠키 자체의 보안 속성(httpOnly/secure 등)은 NextAuth가 기본 관리합니다. 권한/role 처리 상세는 [auth-permissions.md](auth-permissions.md) 참고.

---

## 5. 보안 미들웨어 헤더 (`middleware.ts`)

`middleware.ts`는 `_next/static`, `_next/image`, `favicon.ico`를 제외한 모든 경로에 응답 헤더를 부착합니다(`middleware.ts:31-33` matcher).

| 헤더 | 값 | 목적 |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | MIME 스니핑 차단 |
| `X-Frame-Options` | `DENY` | clickjacking 방지(iframe 임베드 금지) |
| `X-DNS-Prefetch-Control` | `off` | DNS prefetch로 인한 정보 누출 억제 |
| `X-Permitted-Cross-Domain-Policies` | `none` | Adobe 크로스도메인 정책 차단 |
| `Origin-Agent-Cluster` | `?1` | origin 단위 프로세스 격리 요청 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | 크로스오리진 referrer 최소화 |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | 카메라/마이크/위치 API 전면 차단 |
| `Cross-Origin-Opener-Policy` | `same-origin` | 교차출처 window 참조 격리 |
| `Cross-Origin-Resource-Policy` | `same-origin` | 동일 출처만 리소스 로드 허용 |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | **운영에서만** HTTPS 강제(2년) |

```ts
// middleware.ts:21-26 — 운영에서만 HSTS 부착
if (process.env.NODE_ENV === "production") {
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
}
```

비고: `Content-Security-Policy(CSP)` 헤더는 설정돼 있지 않습니다(미들웨어에 없음). 인라인 스크립트/스타일을 쓰는 Next.js 특성상 미적용 상태이며, 추가 hardening 시 후보입니다.

---

## 6. KIS 자격증명 암호화 (`app/lib/cryptoUtil.ts`)

KIS Open API의 `appKey`/`appSecret`/`accessToken`은 DB에 평문이 아니라 AES-256-GCM으로 암호화돼 저장됩니다. 저장 대상 모델은 `KisCredential`(`prisma/schema.prisma:259`, 필드 `appKey`/`appSecret`/`accessToken` 모두 암호문 문자열).

| 요소 | 내용 |
|---|---|
| 알고리즘 | `aes-256-gcm` (`cryptoUtil.ts:21`) |
| 키 소스 우선순위 | `KIS_ENCRYPTION_KEY` → `NEXTAUTH_SECRET` → 둘 다 없으면 throw (`cryptoUtil.ts:8-13`) |
| 키 파생 | 입력 키를 `SHA-256` 해시해 32바이트로 정규화 (`cryptoUtil.ts:14`) |
| IV | 매 암호화마다 `crypto.randomBytes(12)` (`cryptoUtil.ts:20`) |
| 저장 포맷 | `base64(iv).base64(tag).base64(ciphertext)` (점 구분, `cryptoUtil.ts:24-28`) |
| 인증 태그 | GCM `authTag` 저장·검증으로 변조 탐지 (`cryptoUtil.ts:23,40`) |

```ts
// cryptoUtil.ts:7-15 — 키 파생
function getKey(): Buffer {
  const k = process.env.KIS_ENCRYPTION_KEY ?? process.env.NEXTAUTH_SECRET ?? null
  if (!k) throw new Error('Missing KIS_ENCRYPTION_KEY or NEXTAUTH_SECRET env var for encryption')
  return crypto.createHash('sha256').update(k).digest()
}
```

함수:

| 함수 | 역할 |
|---|---|
| `encrypt(plain)` | 빈 문자열은 그대로 반환, 아니면 위 포맷 암호문 생성 (`cryptoUtil.ts:17`) |
| `decrypt(blob)` | 점 구분 3파트 파싱·복호화. 형식 불일치 시 throw (`cryptoUtil.ts:31`) |
| `maskSecret(s, head=4, tail=2)` | 표시용 마스킹. 길이 ≤ 6이면 `••••` (`cryptoUtil.ts:46`) |

사용 흐름:

- 저장: `/api/kis/credentials` POST가 `encrypt(appKey)`/`encrypt(appSecret)`로 upsert (`app/api/kis/credentials/route.ts:88-89,95-96`). 이 라우트는 `getServerSession`으로 로그인 사용자만 허용하며(`route.ts:12`) 미인증 시 401 (POST는 `route.ts:76`, GET `:46`, DELETE `:112`).
- 조회: 응답에는 `maskSecret(decrypt(cred.appKey))`만 노출 (`route.ts:63`).
- 토큰 캐싱: `getKisContext`가 발급한 `accessToken`을 `encrypt`해 DB 저장하고, 만료 30분 전부터 갱신, in-flight dedup으로 동시 발급 1회만 수행 (`app/lib/kisAuth.ts:46-90`).

> 키 운영 주의: `KIS_ENCRYPTION_KEY`를 따로 두지 않으면 암호화 키가 `NEXTAUTH_SECRET`에서 파생됩니다. 따라서 `NEXTAUTH_SECRET`을 교체하면 기존 KIS 암호문/캐시 토큰이 복호화 불가가 되어 재등록이 필요합니다. 자세한 KIS 연동은 [integration-kis.md](integration-kis.md) 참고.

---

## 7. 레이트리밋

### 7.1 인메모리 IP 레이트리밋 (`app/lib/rateLimit.ts`)

고정 윈도우(fixed-window) 카운터를 `globalThis`에 캐시한 `Map<string, Bucket>`으로 구현합니다(`rateLimit.ts:6-16`). 멀티 인스턴스 환경에서는 인스턴스 간 공유되지 않습니다.

- `getClientIp(req)`: `x-forwarded-for`의 첫 IP → `x-real-ip` → `'unknown'` 순으로 클라이언트 IP 추출 (`rateLimit.ts:24-35`).
- `takeRateLimit(key, limit, windowMs)`: 만료 버킷은 `cleanupExpired`로 정리하고, 한도 초과 시 `{ ok:false, retryAfterSec, remaining:0 }` 반환 (`rateLimit.ts:37-73`). 한도 초과 라우트는 HTTP 429 + `Retry-After` 헤더를 반환합니다.

적용 라우트 및 정책(모두 윈도우 10분 = `10 * 60 * 1000`):

| 라우트 | 키 prefix | limit | window | 위치 |
|---|---|:--:|:--:|---|
| `POST /api/sign-up` | `sign-up:{ip}` | 8 | 10분 | `app/api/sign-up/route.ts:12-13,26` |
| `POST /api/resend-verification` | `resend-verification:{ip}` | 5 | 10분 | `app/api/resend-verification/route.ts:11-12,34` |
| `POST /api/check-email` | (ip 기반) | 40 | 10분 | `app/api/check-email/route.ts:6-7,12` |
| `POST /api/check-name` | (ip 기반) | 40 | 10분 | `app/api/check-name/route.ts:5-6,11` |
| `POST /api/leesh/contact` | `leesh-contact:{ip}` | 6 | 10분 | `app/api/leesh/contact/route.ts:9-10,54` |

> 한계: 프로세스 메모리 기반이라 인스턴스 스케일아웃·재시작 시 카운터가 리셋·분산됩니다. 분산 환경에서는 Redis 등 외부 스토어 기반 레이트리밋으로 대체를 권장합니다(`operations-troubleshooting.md` 참고).

### 7.2 KIS 호출 레이트리밋 (`app/lib/kisRateLimit.ts`)

KIS 공식 제한(실전 1 req/sec)을 준수하기 위해 사용자별로 호출을 직렬화합니다.

| 요소 | 내용 |
|---|---|
| `kisRateLimit(userId)` | 사용자별 큐(`Map<string, QueueEntry>`)로 이전 호출 Promise 체이닝 후 최소 인터벌 보장 (`kisRateLimit.ts:27-49`) |
| `MIN_INTERVAL_MS` | `1100`ms — 1초/건 규정에 안전 마진 (`kisRateLimit.ts:25`) |
| `isRateLimitedResponse(data)` | `rt_cd !== '0' && msg_cd === 'EGW00201'`("초당 거래건수 초과") 감지 (`kisRateLimit.ts:6-11`) |
| `rateLimitBackoff(attempt)` | `1100 + attempt*500`ms 대기(1.1s/1.6s/2.1s — attempt당 +500ms 선형 증가 백오프) (`kisRateLimit.ts:14-17`) |

이 3개 함수는 `kisAuth`/`kisMarket`/`kisOverseas`/`kisQuote`/`kisStock` 전반에서 호출 직전 직렬화 + 429류 응답 재시도에 사용됩니다.

---

## 8. 잠금 쿠키 (unlock cookies)

두 가지 독립적인 잠금 쿠키 체계가 있습니다.

### 8.1 비밀글 unlock 쿠키 (`app/lib/unlockCookie.ts`)

비밀글(`isSecret`) 해제 상태를 HMAC 서명된 쿠키에 누적 기록합니다. boards/blog/docs/todos 게시글이 공유합니다.

| 요소 | 내용 |
|---|---|
| 쿠키 이름 | `leesh_unlocked_posts` (`UNLOCK_COOKIE_NAME`, `unlockCookie.ts:3,58`) |
| 페이로드 | `{ ids: string[] }`를 JSON 직렬화, 중복 제거 후 최대 200개로 절단 (`unlockCookie.ts:51-52`) |
| 서명 | `HMAC-SHA256(secret, payload)`, 값 포맷 `base64url(payload).base64url(sig)` (`unlockCookie.ts:54-55`) |
| secret 우선순위 | `NEXTAUTH_SECRET` → `APP_SECRET` → (운영이면 throw) → dev fallback `"dev-secret-change-me"` (`unlockCookie.ts:19-26`) |
| 검증 | 길이 비교 후 `crypto.timingSafeEqual`로 timing-safe 비교, 실패 시 빈 배열 (`unlockCookie.ts:40`) |

해제 라우트 `POST /api/boards/[boardId]/posts/[postId]/unlock`:

- 글 존재 확인 후 비밀글이 아니면 그대로 `{ unlocked:true }`, 비번 미설정이면 400 (`unlock/route.ts:43-50`).
- `bcrypt.compare(password, post.secretPasswordHash)` 실패 시 401 (`unlock/route.ts:52-53`).
- 성공 시 기존 해제 ID에 현재 글 id를 합쳐 새 쿠키 발급 (`unlock/route.ts:57-58`).

```ts
// app/api/boards/[boardId]/posts/[postId]/unlock/route.ts:61-67
res.cookies.set(UNLOCK_COOKIE_NAME, nextValue, {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  // expires/maxAge 안 줌 => 브라우저 세션 동안만 유지
});
```

읽기 측: 서버 페이지(`app/boards/[boardId]/[postId]/page.tsx:56`, `app/blog/[slug]/page.tsx:163`, `app/docs/[slug]/page.tsx:138`, `app/todos/[boardId]/[postId]/page.tsx:73`)와 댓글 라우트(`app/api/boards/[boardId]/posts/[postId]/comments/route.ts:84`)에서 `readUnlockedPostIds`로 해제 여부를 판정합니다.

### 8.2 `/leesh` 포트폴리오 편집 잠금 쿠키

별도 단순 쿠키로 포트폴리오 편집 권한만 게이트합니다.

| 요소 | 내용 |
|---|---|
| 쿠키 이름 | `leesh_unlocked`, 값 `"1"` (`app/api/leesh/unlock/route.ts:8,41`) |
| 검증 | 입력 비번을 `LEESH_PASSWORD`와 **평문 비교**(`pw !== PASSWORD` 시 401) (`unlock/route.ts:29-34`) |
| 미설정 처리 | `LEESH_PASSWORD` 없으면 500 반환 (`unlock/route.ts:22-27`) |
| 쿠키 속성 | `httpOnly`, `sameSite:"lax"`, `secure`(운영만), `path:"/"`, `maxAge` 30일 (`unlock/route.ts:39-47`) |
| 편집 게이트 | `app/api/leesh/route.ts`에서 `cookie.includes("leesh_unlocked=1")`로 `canEdit` 결정(GET `:80`, PUT `:114`) |

> 주의: 8.2의 잠금은 서명/해시 없이 단일 공유 비밀번호를 평문 비교하는 단순 게이트입니다(서명 쿠키인 8.1과 다름). 단일 사용자(포트폴리오 소유자) 편집 보호 용도로 설계됐습니다.

---

## 9. 이메일 인증 토큰 (`app/lib/verificationToken.ts`)

회원가입/재발송 시 발급되는 이메일 인증 토큰은 평문이 아니라 SHA-256 해시로 DB에 저장됩니다. 저장 모델은 `VerificationToken`(`prisma/schema.prisma:86`, 필드 `identifier`/`token`/`expires`).

| 요소 | 내용 |
|---|---|
| 토큰 생성 | `crypto.randomBytes(32).toString('hex')` (`app/api/sign-up/route.ts:99`) |
| 저장 형태 | `hashVerificationToken(token)` = `SHA-256` hex (`verificationToken.ts:3-5`) |
| 만료 | 발급 시각 + 24시간 (`sign-up/route.ts:101`, `resend-verification/route.ts:55`) |
| 메일 링크 | `${resolveAppUrl(req)}/verify-email?email=...&token=...`(평문 토큰은 메일로만 전달) (`sign-up/route.ts:115-116`) |

검증 라우트 `GET /api/verify-email`(`app/api/verify-email/route.ts`):

1. 받은 평문 토큰을 해시해 `(identifier,email)+token` 복합키로 조회 (`verify-email/route.ts:15-18`).
2. 미발견 시 평문 토큰으로도 한 번 더 조회(과거 평문 저장 데이터 임시 호환) (`verify-email/route.ts:20-24`).
3. 만료(`expires < now`)면 해당 email의 토큰 전부 삭제 후 400 (`verify-email/route.ts:30-33`).
4. 성공 시 `user.emailVerified = now` 설정 후 토큰 일괄 삭제(1회용) (`verify-email/route.ts:35-40`).

재발송 라우트 `POST /api/resend-verification`: 7.1 레이트리밋(5/10분) 적용, 이미 인증된 계정은 그대로 ok 반환, 기존 토큰 `deleteMany` 후 신규 발급 (`resend-verification/route.ts:51-59`).

---

## 10. 비밀번호 해싱 (bcrypt)

사용자 비밀번호와 게시글 비밀글 비번 모두 bcrypt(cost factor 10)로 해싱됩니다. 코드베이스는 `bcrypt`(네이티브)와 `bcryptjs`(순수 JS)를 혼용합니다.

| 대상 | 동작 | 위치 |
|---|---|---|
| 회원 가입 비번 | `bcrypt.hash(pw, 10)` | `app/api/sign-up/route.ts:87` |
| 로그인 검증 | `bcrypt.compare` | `app/api/auth/[...nextauth]/options.ts:49` |
| boards 비밀글 | `bcrypt.hash(secretPassword, 10)` | `app/api/boards/[boardId]/posts/route.ts:145` |
| blog 비밀글 | `bcryptjs.hash(..., 10)` | `app/api/blog/posts/route.ts:107`, `.../[postId]/route.ts:155` |
| docs 비밀글 | `bcryptjs.hash(..., 10)` | `app/api/docs/posts/route.ts:77`, `.../[postId]/route.ts:119` |
| 비밀글 해제 검증 | `bcryptjs.compare` | `app/api/boards/[boardId]/posts/[postId]/unlock/route.ts:52` |

비밀글 비번 해시는 모델의 `secretPasswordHash` 필드에 저장되며, 평문 비번은 응답에 노출되지 않습니다.

---

## 11. URL 정책 (`app/lib/appUrl.ts`)

메일 인증 링크 등 절대 URL 생성 시 `resolveAppUrl(req)`를 사용합니다.

```ts
// app/lib/appUrl.ts:1-16
const fromEnv = process.env.APP_URL?.trim() || process.env.NEXTAUTH_URL?.trim()
const raw = fromEnv || new URL(req.url).origin
const url = new URL(raw)
if (process.env.NODE_ENV === "production") {
  if (url.protocol !== "https:") throw new Error("APP_URL/NEXTAUTH_URL must use https in production")
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    throw new Error("APP_URL/NEXTAUTH_URL must not be localhost in production")
}
return url.origin
```

- 우선순위: `APP_URL` → `NEXTAUTH_URL` → 요청 origin (`appUrl.ts:2-3`).
- 운영에서는 `https://` 강제, `localhost`/`127.0.0.1` 금지(메일 링크가 잘못된 호스트로 나가는 것 방지) (`appUrl.ts:6-13`).

---

## 12. 메일 발송 보안 (`app/lib/mailer.ts`)

- SMTP 설정(`SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`)이 하나라도 없으면, 운영에서는 `throw new Error("SMTP env is missing in production")`, 개발에서는 콘솔 fallback 출력만 합니다(`mailer.ts:16-26`).
- 포트 `465`일 때만 `secure: true`로 TLS 직결, 그 외는 STARTTLS 587 기본 (`mailer.ts:13,34`).
- `/leesh` contact 라우트는 헤더 인젝션 방지를 위해 사용자 입력의 `\r\n`을 공백으로 치환(`sanitizeHeaderText`)하고, 본문에 발신 IP/KST 시각을 기록합니다(`app/api/leesh/contact/route.ts:29-31,97-112`).

---

## 13. 운영 보안 체크리스트

1. `NEXTAUTH_SECRET`을 충분히 긴 랜덤 값으로 설정했는가(JWT 서명 + 암호화/쿠키 서명 기본 키 소스). 교체 시 KIS 암호문/unlock 쿠키 무효화 영향 확인.
2. KIS를 쓰는 경우 `KIS_ENCRYPTION_KEY`를 별도 지정해 `NEXTAUTH_SECRET` 의존성을 끊었는가.
3. `APP_URL`/`NEXTAUTH_URL`이 운영 HTTPS 도메인인가(`resolveAppUrl`가 localhost/http를 거부).
4. `DATABASE_URL`이 TLS(`sslmode=require`)를 사용하는가. 마이그레이션용 `DIRECT_URL`을 분리했는가.
5. SMTP가 전용 계정이며 `SMTP_*`가 모두 설정됐는가(운영 미설정 시 가입 메일 발송이 throw).
6. `.env`/`.env.prod`가 버전관리에서 제외되는가(`.gitignore`로 보장되나 신규 키 추가 시 재확인).
7. 운영 빌드에서 미들웨어 HSTS와 쿠키 `secure` 플래그가 켜지도록 `NODE_ENV=production`인가.
8. 관리자/권한(role)을 최소화하고 정기 점검하는가([auth-permissions.md](auth-permissions.md)).
9. 멀티 인스턴스 운영 시 인메모리 레이트리밋의 한계를 인지하고 분산 대안을 검토했는가.
10. 에러 로그에 비밀번호/토큰/secret이 남지 않는가(Prisma `log:["error"]`, 라우트 catch는 `console.error`로 메시지만 기록).
