# Operations / Troubleshooting

## 1. `npm run dev` 시 `ENOENT package.json`

증상:

- `Could not read package.json`

원인:

- 프로젝트 루트가 아닌 상위 폴더에서 실행

해결:

```bash
cd <프로젝트 루트>/leesh
npm run dev
```

## 2. 빌드에서 TypeScript `implicitly has an 'any' type`

증상:

- `Parameter 'x' implicitly has an 'any' type`

원인:

- `map/filter` 콜백 매개변수 타입 미지정

해결:

- 콜백 매개변수 또는 원본 배열 타입 명시
- `type Row = ...; rows.map((r: Row) => ...)`

## 3. `@prisma/client` export 오류

증상:

- `Module "@prisma/client" has no exported member ...`

원인:

- Prisma Client 생성 불일치 / 설치 상태 꼬임

해결:

```bash
npx prisma generate
npm install
npm run build
```

## 4. `MenuPermission` unique 제약 에러(`P2002`)

증상:

- `Unique constraint failed on fields: (key)`

원인:

- `MenuPermission.key` 중복 insert

해결:

1. 최신 코드에서 `createMany({ skipDuplicates: true })` 반영 여부 확인
2. 중복 데이터 확인:

```sql
SELECT "key", COUNT(*)
FROM "MenuPermission"
GROUP BY "key"
HAVING COUNT(*) > 1;
```

3. 중복 정리 후 재실행

## 5. ADMIN인데 `/permission` 접근 불가

점검 순서:

1. DB role 확인

```sql
SELECT "email", "role" FROM "User" WHERE "email" = 'you@example.com';
```

2. 로그인 세션이 해당 계정인지 확인 (로그아웃 후 재로그인)
3. 배포 환경 변수(`NEXTAUTH_SECRET`, URL) 일치 여부 확인
4. 코드 기준 `/permission`은 비ADMIN 또는 비로그인 시 `/`로 redirect

## 6. 인증 이메일 링크가 localhost로 오는 문제

원인:

- `APP_URL`/`NEXTAUTH_URL` 미설정 또는 잘못 설정

해결:

1. 운영 환경 변수에 실제 HTTPS 도메인 설정
2. 재배포 후 `/api/sign-up` 또는 `/api/resend-verification` 재테스트
3. `resolveAppUrl()` 정책 위반(https 아님/localhost)시 서버 에러 확인

## 7. TODO/보드 수정 시 `403 forbidden`

원인:

- 현재 정책이 작성자/소유자만 수정 가능
- 공유받은 리소스는 읽기 전용

해결:

1. 요청 계정이 owner/author인지 확인
2. 공유 데이터라면 수정 대신 원소유자 계정에서 수정

## 8. 공유 기능 동작 안 함

점검:

1. `ScheduleShare` 테이블 마이그레이션 적용 여부
   - 미적용이면 `getReadableScheduleOwnerIds`(`app/lib/scheduleShare.ts`)가 예외를 잡고 본인 데이터만 반환(`[userId]`)하므로, 공유분만 조용히 빠짐
2. 요청 대상 이메일이 실제 사용자 이메일과 일치하는지
3. scope가 `CALENDAR`/`TODO`/`LEDGER`/`STOCK` 중 하나인지 (`parseScheduleShareScope` 허용값, `app/lib/scheduleShare.ts`)
4. 상태가 `ACCEPTED`인지 (기본값 `PENDING`이면 읽기 목록에 반영 안 됨)

## 9. KIS(한국투자증권) 시세/잔고 조회 실패

`/api/kis/*` 라우트(예: `/api/kis/rankings`, `/api/kis/stock/[code]/*`, `/api/kis/overseas/*`)가 데이터를 못 가져올 때.

증상별 원인/해결:

1. `401 unauthorized`
   - 로그인 세션 없음 → 로그인 후 재시도
2. `412` + `KIS 자격증명이 등록되어 있지 않습니다.`
   - `KisCredential` 미등록 상태(라우트가 `prisma.kisCredential.findUnique`로 선검사)
   - `PUT /api/kis/credentials`로 appKey/appSecret/accountNumber(8자리)/accountProductCode(2자리, 기본 `01`)/isLive 등록
   - 등록 여부/마스킹 정보는 `GET /api/kis/credentials`로 확인(실제 키 값은 노출 안 됨, AES-256-GCM 암호화 저장)
3. 토큰 발급 실패 (`KIS_TOKEN_ISSUE_FAILED` / `getKisContext`)
   - appKey/appSecret/isLive(실전/모의) 불일치가 대부분
   - 저장 없이 자격증명만 검증하려면 `POST /api/kis/test`(`testKisCredentials`) 사용
   - 실전 base는 `KIS_LIVE_BASE`, 모의는 `KIS_MOCK_BASE` (`app/lib/kisAuth.ts`)
   - 키를 바꾸면 `credentials` PUT이 `accessToken`/`tokenExpiresAt`를 `null`로 무효화 → 다음 호출에서 재발급
4. `502` + `... 조회 중 오류가 발생했습니다.`
   - KIS 업스트림 오류/네트워크 → 잠시 후 재시도. 서버 로그의 `[KIS_*_API_ERROR]` 확인
5. 레이트리밋 (`EGW00201` "초당 거래건수 초과")
   - KIS 실전은 1 req/sec 제한. `kisRateLimit`(`app/lib/kisRateLimit.ts`)가 사용자별로 호출을 직렬화하고 최소 인터벌 `MIN_INTERVAL_MS = 1100`ms 보장
   - 응답 판별은 `isRateLimitedResponse`, 재시도 대기는 `rateLimitBackoff`(1.1s/1.6s/2.1s 점증)
   - 토큰은 만료 30분 전 선갱신 + 동일 사용자 in-flight dedup으로 동시 발급 1회만 수행

## 10. 운영 권장 점검 루틴

1. 배포 전 `npm run build`
2. 마이그레이션 적용 여부 점검
3. ADMIN 계정 최소 1개 유지
4. 최근 에러 로그에서 `401/403/412/429/500/502` 패턴 점검
   - `412` = KIS 자격증명 미등록, `429` = 레이트리밋(`takeRateLimit`), `502` = KIS 업스트림 오류
5. 메일 발송 테스트(회원가입/재전송) — 운영에서는 SMTP env 필수(13번 참고)

## 11. Next.js 경고: `middleware` convention deprecated

증상:

- 빌드 시 `The "middleware" file convention is deprecated. Please use "proxy" instead.`

의미:

- 현재는 동작하지만, 향후 버전에서 `proxy` 파일 전환이 권장됨

대응:

1. 단기: 경고로 인지하고 유지 가능
2. 중기: `middleware.ts`를 `proxy` 규칙에 맞게 마이그레이션 계획 수립

## 12. 운영 DB 마이그레이션(`scripts/migrate-prod.ps1`)

운영 DB에는 이 전용 스크립트로만 마이그레이션을 적용한다(로컬 `.env`를 건드리지 않음).

절차:

1. 프로젝트 루트에 `.env.prod` 생성 후 운영 `DATABASE_URL`(+ 선택 `DIRECT_URL`) 입력
   - 스크립트 주석은 `scripts/.env.prod.example` 복사를 안내하지만 현재 예제 파일은 없으므로 직접 만든다
2. PowerShell(Windows)에서 프로젝트 루트로 이동 후 `.\scripts\migrate-prod.ps1` 실행
3. 대상 호스트 확인 후 정확히 `YES` 입력해야 진행
4. 내부 동작: 이 세션에만 `DATABASE_URL`/`DIRECT_URL`을 주입 → `npx prisma migrate deploy` → 종료 시 env 변수 즉시 제거

주의/실패 처리:

- `localhost`/`127.0.0.1` URL은 스크립트가 거부(운영 전용 안전장치)
- 마이그레이션은 `prisma.config.ts`의 `datasource.url`을 사용하며 우선순위는 `DIRECT_URL` → `DATABASE_URL` (pgbouncer prepared-statement 회피 목적의 direct 연결)
- 이 스크립트는 Windows PowerShell 전용. WSL/리눅스에서는 셸에서 직접 `DATABASE_URL`/`DIRECT_URL`을 export 후 `npx prisma migrate deploy` 실행

## 13. 운영 메일(SMTP) 발송 실패(`app/lib/mailer.ts`)

증상:

- 운영에서 `SMTP env is missing in production` 에러
- 개발에서는 메일이 안 가고 콘솔에 `[EMAIL:FALLBACK]`만 출력됨

원인/해결:

- `sendMail`은 `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`(미설정 시 `SMTP_USER`로 대체) 중 하나라도 없으면, `NODE_ENV=production`에서는 throw, 그 외엔 콘솔 폴백
- 운영 환경 변수에 위 값과 `SMTP_PORT`(기본 `587`, `465`면 secure 연결) 설정 후 재배포
- 메일 본문 링크가 localhost로 오는 문제는 6번 참고(`resolveAppUrl`)

## 14. DB 연결/타임존(`app/lib/prisma.ts`)

증상/원인:

- 부팅 즉시 `DATABASE_URL is missing` → 환경 변수 누락
- 시간 값이 KST와 어긋남

해결/참고:

- 런타임은 `@prisma/adapter-pg`(`PrismaPg`) + `pg` `Pool` 어댑터로 `DATABASE_URL`에 연결
- 새 커넥션마다 `SELECT set_config('TimeZone', 'Asia/Seoul', false)` 실행으로 세션 타임존을 KST로 고정(`pool.on('connect', ...)`)
- 개발 모드에서는 `globalThis`에 Prisma/Pool 인스턴스를 캐시(HMR 중복 연결 방지), 운영은 캐시하지 않음
- 마이그레이션 경로의 연결 설정은 런타임과 별개(12번 / `prisma.config.ts` 참고)
