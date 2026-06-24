# 설치 · 실행 · 마이그레이션

로컬 개발 환경 구성부터 의존성 설치, 환경변수 구성, Prisma 마이그레이션(개발/운영), 빌드·실행 스크립트까지의 전체 절차를 정리한 권위 레퍼런스입니다.

> 작성 기준: 2026-06-24, dev 브랜치

관련 문서: [환경변수·보안](env-and-security.md) · [데이터베이스 스키마](database.md) · [아키텍처](architecture.md) · [운영·트러블슈팅](operations-troubleshooting.md)

---

## 1. 사전 요구사항

| 항목 | 권장 버전 | 비고 |
| --- | --- | --- |
| Node.js | 20 LTS 이상 | `package.json`에 `engines` 미지정. `@types/node`가 `^20`(`package.json:37`)이라 20 계열 기준 |
| npm | 10+ | lockfile은 `package-lock.json` 사용 |
| PostgreSQL | 14+ 권장 | `prisma/schema.prisma`의 datasource provider가 `postgresql`. Neon 등 매니지드 PostgreSQL 사용 가능 |

- 런타임 DB 연결은 `pg` 어댑터(`@prisma/adapter-pg`)를 통해 이뤄지며, 커넥션 풀이 연결될 때마다 세션 타임존을 `Asia/Seoul`로 강제 설정합니다. (`app/lib/prisma.ts:21`)

```ts
// app/lib/prisma.ts:21-27
pool.on("connect", (client) => {
  void client
    .query("SELECT set_config('TimeZone', $1, false)", [DB_TIMEZONE])
    .catch((err) => { console.error("Failed to set DB timezone:", err); });
});
```

- `DATABASE_URL`이 비어 있으면 모듈 로드 시점에 즉시 throw 합니다. (`app/lib/prisma.ts:12-13`)

---

## 2. 의존성 설치

```bash
npm install
```

- 설치 직후 `postinstall` 훅이 자동으로 `prisma generate`를 실행합니다. (`package.json:6`)
- 따라서 별도로 `npx prisma generate`를 호출하지 않아도 Prisma Client가 생성됩니다(필요 시 수동 실행 가능).

---

## 3. 환경변수 구성

`.env.example`을 복사해 시작합니다. (프로젝트 루트 `README.md`의 "빠른 시작" 참조 — `docs/README.md`가 아닌 저장소 루트 README입니다.)

```bash
cp .env.example .env
```

> 비밀값은 저장소에 커밋하지 마세요. 여기서는 변수명과 용도만 다룹니다. 자세한 보안 정책은 [환경변수·보안](env-and-security.md)을 참고하세요.

### 3.1 변수 일람

| 변수 | 필수 | 용도 | 코드 근거 |
| --- | --- | --- | --- |
| `DATABASE_URL` | 필수 | 앱 런타임 DB 접속 문자열(`pg` Pool). 미설정 시 부팅 실패 | `app/lib/prisma.ts:12-13` |
| `DIRECT_URL` | 선택(권장) | 마이그레이션 전용 직접 연결 URL. pgbouncer의 prepared-statement 회피용. Prisma migrate가 우선 사용 | `prisma.config.ts:15` |
| `PRISMA_CLIENT_ENGINE_TYPE` | 선택 | Prisma 엔진 타입 지정. schema의 `engineType = "library"`와 정합(엔진 타입은 스키마에 이미 고정되어 있어 코드에서 이 env를 직접 참조하지는 않음) | `prisma/schema.prisma:9` |
| `NEXTAUTH_SECRET` | 필수 | NextAuth JWT 서명 secret. unlock 쿠키 서명에도 사용 | `app/api/auth/[...nextauth]/options.ts`, `app/lib/unlockCookie.ts:20` |
| `NEXTAUTH_URL` | 필수(둘 중 하나) | 인증 콜백/절대 URL 기준 | `app/api/auth/[...nextauth]/options.ts:11`, `app/lib/appUrl.ts:2` |
| `APP_URL` | 필수(둘 중 하나) | 앱 절대 URL. `APP_URL` 우선, 없으면 `NEXTAUTH_URL` fallback | `app/lib/appUrl.ts:2` |
| `SMTP_HOST` | 메일 사용 시 | SMTP 호스트(회원가입 이메일 인증). 프로덕션에서 SMTP env 누락 시 발송 시점에 throw | `app/lib/mailer.ts:10,17-18` |
| `SMTP_PORT` | 메일 사용 시 | SMTP 포트(미설정 시 `587`) | `app/lib/mailer.ts:13` |
| `SMTP_USER` | 메일 사용 시 | SMTP 계정 | `app/lib/mailer.ts:11` |
| `SMTP_PASS` | 메일 사용 시 | SMTP 비밀번호 | `app/lib/mailer.ts:12` |
| `SMTP_FROM` | 선택 | 발신자 표기. 없으면 `SMTP_USER` fallback | `app/lib/mailer.ts:14` |
| `LEESH_PASSWORD` | 선택 | `/leesh` 포트폴리오 잠금 해제용 비밀번호. 미설정 시 unlock API가 설정 오류 응답 | `app/api/leesh/unlock/route.ts:7,24` |
| `APP_SECRET` | 선택 | unlock 쿠키 서명 백업 secret. `NEXTAUTH_SECRET` 부재 시 fallback | `app/lib/unlockCookie.ts:20-23` |

### 3.2 URL 해석 규칙

- 절대 URL은 `APP_URL` → `NEXTAUTH_URL` 순으로 해석합니다. (`app/lib/appUrl.ts:2`)
- 프로덕션(`isProd`)에서 `NEXTAUTH_URL`과 `APP_URL`이 모두 없으면 NextAuth options 모듈이 오류를 발생시킵니다. (`app/api/auth/[...nextauth]/options.ts:11`)
- unlock 쿠키 서명 secret은 `NEXTAUTH_SECRET` → `APP_SECRET` 순이며, 프로덕션에서 둘 다 없으면 throw 합니다. (`app/lib/unlockCookie.ts:20-23`)

---

## 4. Prisma Client 생성

```bash
npx prisma generate
```

- `prisma.config.ts`가 `import "dotenv/config"`로 `.env`를 자동 로드합니다. (`prisma.config.ts`)
- schema 경로는 `prisma/schema.prisma`, 마이그레이션 경로는 `prisma/migrations`로 config에 고정되어 있습니다. (`prisma.config.ts`)
- `npm install`(postinstall)과 `npm run build`(`package.json:8`) 모두 내부적으로 `prisma generate`를 수행하므로, 별도 수동 실행은 스키마를 직접 수정한 직후에만 필요합니다.

---

## 5. 데이터베이스 마이그레이션

Prisma 7에서는 migrate가 사용하는 datasource URL을 `prisma.config.ts`의 `datasource.url`에서 가져옵니다. 우선순위는 `DIRECT_URL` → `DATABASE_URL`입니다. (`prisma.config.ts:15`)

```ts
// prisma.config.ts:15
url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
```

### 5.1 사전 점검 (status)

배포 전 항상 적용 상태를 먼저 확인합니다.

```bash
npx prisma migrate status
```

- 미적용 마이그레이션 / drift 여부를 리포트합니다. 운영 배포 전 필수 점검 단계입니다.

### 5.2 개발 환경 — 새 마이그레이션 작성

스키마를 변경하고 새 마이그레이션을 생성·적용할 때:

```bash
npx prisma migrate dev --name <설명>
```

- 새 마이그레이션 SQL 생성 + 로컬 DB 적용 + Prisma Client 재생성을 한 번에 수행합니다.

### 5.3 개발/스테이징 DB — 기존 마이그레이션 적용

이미 작성된 마이그레이션만 적용(생성 없음)할 때:

```bash
npx prisma migrate deploy
```

- `prisma.config.ts`가 `.env`를 로드하므로 `.env`의 `DIRECT_URL`/`DATABASE_URL`을 그대로 사용합니다.

### 5.4 운영 DB 마이그레이션

운영은 `.env`(개발)와 분리된 `.env.prod`를 사용하며, **프로젝트의 `.env` 파일을 건드리지 않는 것**이 원칙입니다.

#### (A) 크로스플랫폼 — DOTENV_CONFIG_PATH

```bash
DOTENV_CONFIG_PATH=.env.prod npx prisma migrate deploy
```

- `prisma.config.ts`의 `import "dotenv/config"`가 `DOTENV_CONFIG_PATH`로 지정된 파일을 로드하므로, `.env.prod`의 운영 URL이 주입됩니다.
- 사전 점검도 동일 방식으로 가능합니다.

```bash
DOTENV_CONFIG_PATH=.env.prod npx prisma migrate status
```

#### (B) PowerShell 스크립트 — scripts/migrate-prod.ps1

Windows/PowerShell 환경에서는 가드가 내장된 전용 스크립트를 사용합니다. (`scripts/migrate-prod.ps1`)

```powershell
.\scripts\migrate-prod.ps1
```

동작 순서(스크립트 근거):

| 단계 | 동작 | 근거 |
| --- | --- | --- |
| 1 | `.env.prod` 존재 확인(없으면 안내 후 종료) | `scripts/migrate-prod.ps1` Test-Path |
| 2 | `.env.prod` 파싱(`KEY="value"`/`KEY=value`) → `DATABASE_URL`, `DIRECT_URL` 추출 | 정규식 파싱 블록 |
| 3 | 안전 가드: URL이 `localhost`/`127.0.0.1`이면 거부 | "운영 DB 전용" 체크 |
| 4 | 대상 호스트 출력 후 확인 프롬프트 — 정확히 `YES` 입력해야 진행 | `Read-Host` |
| 5 | 현재 PowerShell 세션에만 임시로 env 주입 → `npx prisma migrate deploy` 실행 | `try` 블록 |
| 6 | 완료/실패와 무관하게 `finally`에서 env 변수 즉시 제거(잔존 사고 방지) | `Remove-Item Env:*` |

> 참고: 스크립트 주석은 "`scripts/.env.prod.example`을 복사"하라고 안내하지만, 현재 저장소에는 해당 example 파일이 없습니다. 실제로는 **프로젝트 루트에 `.env.prod`를 직접 생성**해 운영용 `DATABASE_URL`/`DIRECT_URL`을 채우면 됩니다.

#### (C) PowerShell 수동 대체 명령

스크립트를 쓰지 않고 동일 효과를 내려면, 세션 한정으로 env를 주입한 뒤 실행합니다.

```powershell
$env:DOTENV_CONFIG_PATH = ".env.prod"
npx prisma migrate status   # 사전 점검
npx prisma migrate deploy
Remove-Item Env:DOTENV_CONFIG_PATH
```

### 5.5 마이그레이션 디렉터리

- 위치: `prisma/migrations/`
- lock 파일: `prisma/migrations/migration_lock.toml` (`provider = "postgresql"`)
- 현재 총 29개 마이그레이션이 존재합니다. 가장 오래된 것은 `20251226005850_auth`, 최신은 `20260623000000_add_diary_entry`입니다.

최신 마이그레이션 예시 — `DiaryEntry` 테이블 추가 (`prisma/migrations/20260623000000_add_diary_entry/migration.sql`):

```sql
CREATE TABLE "DiaryEntry" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "contentMd" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiaryEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DiaryEntry_userId_date_key" ON "DiaryEntry"("userId", "date");
ALTER TABLE "DiaryEntry" ADD CONSTRAINT "DiaryEntry_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

전체 마이그레이션 타임라인(시간순):

| 타임스탬프 | 마이그레이션 | 주요 변경 |
| --- | --- | --- |
| 20251226005850 | `_auth` | 인증 기반 스키마 |
| 20260102013811 | `_boards_posts_comments` | 게시판/글/댓글 |
| 20260107015552 | `_add_board_type_and_post_slug` | board type, post slug |
| 20260119032030 | `_leesh` | 포트폴리오 |
| 20260121063620 | (suffix 없음) | `BoardType`에 `HELP` 추가 + Post slug 보드별 유니크(`Post_boardId_slug_key`) |
| 20260121235031 | `_add_menu_permission` | 메뉴 권한 |
| 20260122001357 | `_add_user_menu_permission` | 사용자별 메뉴 오버라이드 |
| 20260123052505 | `_add_board_single_schedule` | 게시판 단일 일정 |
| 20260209021000 | `_add_schedule_share` | 일정 공유 |
| 20260209033000 | `_split_schedule_share_scope` | 공유 scope 분리 |
| 20260409090000 | `_add_docs_board_type` | docs board type |
| 20260409093000 | `_add_blog_post_meta` | 블로그 메타 |
| 20260513014226 | `_leesh_20260513` | leesh 개편 |
| 20260513020000 | `_add_ledger_entry` | 가계부 entry |
| 20260513030000 | `_add_ledger_exclude_from_totals` | 합계 제외 플래그 |
| 20260513040000 | `_add_holdings` | 보유 종목 |
| 20260513050000 | `_add_stock_share_scope` | 주식 공유 scope |
| 20260513060000 | `_holding_float_exchange` | 소수점/환율 |
| 20260513070000 | `_add_financial_account` | 금융 계좌 |
| 20260513080000 | `_account_type_overhaul` | 계좌 타입 개편 |
| 20260513090000 | `_holding_account` | 보유-계좌 연결 |
| 20260513100000 | `_add_checking_account_type` | checking 타입 |
| 20260513110000 | `_account_types_array` | 계좌 타입 배열화 |
| 20260513120000 | `_add_kis_credential` | KIS 자격증명 |
| 20260515000000 | `_add_watchlist_notes_alarms` | 관심종목 메모/알람 |
| 20260518000000 | `_add_post_is_spoiler` | 스포일러 플래그 |
| 20260520000000 | `_add_budget_target` | 예산 목표 |
| 20260520010000 | `_add_account_initial_balance` | 계좌 초기 잔액 |
| 20260623000000 | `_add_diary_entry` | 다이어리 |

---

## 6. 실행 및 빌드 스크립트

`package.json:5-11` 기준.

| 스크립트 | 명령 | 설명 |
| --- | --- | --- |
| `npm run dev` | `next dev` | 개발 서버(`http://localhost:3000`) |
| `npm run build` | `prisma generate && next build` | Prisma Client 생성 후 Next.js 프로덕션 빌드 |
| `npm run start` | `next start` | 빌드 산출물로 프로덕션 서버 실행(사전 `build` 필요) |
| `npm run lint` | `eslint` | ESLint 검사 |
| `postinstall` | `prisma generate` | `npm install` 직후 자동 실행 |

### 6.1 로컬 개발

```bash
npm run dev
# http://localhost:3000
```

### 6.2 프로덕션 빌드 확인

```bash
npm run build
npm run start
```

### 6.3 린트

```bash
npm run lint
```

---

## 7. 첫 ADMIN 계정 설정

회원가입으로 계정을 만든 뒤, DB에서 role을 변경합니다.

```sql
UPDATE "User" SET "role" = 'ADMIN' WHERE "email" = 'admin@example.com';
```

확인:

```sql
SELECT "id", "email", "role" FROM "User" ORDER BY "createdAt" ASC;
```

권한 모델 상세는 [인증·권한](auth-permissions.md)을 참고하세요.

---

## 8. 운영 배포 전 체크리스트

1. `APP_URL` / `NEXTAUTH_URL`이 실제 도메인으로 설정되어 있는지 (`app/lib/appUrl.ts:2`, `app/api/auth/[...nextauth]/options.ts:11`)
2. 프로덕션 HTTPS 강제 / HSTS 동작 확인
3. SMTP 계정 정상 발송 확인
4. `NEXTAUTH_SECRET` 강도 확인(또는 `APP_SECRET` 백업 존재)
5. `.env.prod`의 DB URL이 `localhost`가 아닌지(스크립트 가드로도 차단됨)
6. `npx prisma migrate status`로 미적용 마이그레이션 없는지 사전 점검
7. `npm run build` 성공 확인

---

## 9. WSL/OS 호환 메모

- 위 모든 명령(`npm`, `npx prisma ...`)은 Linux/WSL/크로스플랫폼에서 동작합니다.
- `scripts/migrate-prod.ps1`은 **PowerShell 전용**입니다. WSL/Linux에서는 5.4 (A)의 `DOTENV_CONFIG_PATH=.env.prod npx prisma migrate deploy`를 동등 대체로 사용하세요.
