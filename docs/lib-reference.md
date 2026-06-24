# `app/lib` 라이브러리 레퍼런스

`Leesh`의 `app/lib` 디렉터리에 있는 모든 공용 모듈(33개 파일)의 목적·export·핵심 로직·사용처를 망라한 권위 레퍼런스입니다. 코어(인프라/유틸), 도메인(가계부·투자·일정·블로그·공휴일), KIS(한국투자증권 Open API) 세 그룹으로 나눠 정리합니다.

> 작성 기준: 2026-06-24, `dev` 브랜치

관련 문서: [database.md](database.md) · [env-and-security.md](env-and-security.md) · [auth-permissions.md](auth-permissions.md) · [api-reference.md](api-reference.md) · [integration-kis.md](integration-kis.md) · [feature-ledger.md](feature-ledger.md) · [feature-investing.md](feature-investing.md)

---

## 모듈 한눈에 보기

| 그룹 | 모듈 | 한 줄 요약 | 주 사용처(import 수) |
| --- | --- | --- | --- |
| 코어 | `prisma.ts` | PrismaClient 싱글턴 + pg Pool, DB TZ=Asia/Seoul 강제 | 전역(101) |
| 코어 | `validation.ts` | zod 바디 파싱 + 400 응답 헬퍼 | API 라우트(26) |
| 코어 | `date.ts` | 안전한 ISO 문자열 변환 | API/페이지(25) |
| 코어 | `httpErrorText.ts` | HTTP 상태 → 한글 메시지 매핑 | 클라이언트(8) |
| 코어 | `prismaError.ts` | DB 연결 오류 판별 | 라우트/미들웨어(3) |
| 코어 | `appUrl.ts` | 요청 기준 앱 origin 해석(+https 검증) | 메일 링크(2) |
| 코어 | `userLabel.ts` | 이메일 마스킹·표시 라벨 | 공유/표시(5) |
| 코어 | `useAsyncLock.ts` | 중복 클릭 방지 클라이언트 훅 | 폼 버튼(13) |
| 코어 | `rateLimit.ts` | 인메모리 토큰버킷 레이트리밋 | 인증/공개 API(5) |
| 코어 | `markdown.ts` | rehype-sanitize 화이트리스트 스키마 | 마크다운 렌더(3) |
| 코어 | `mailer.ts` | nodemailer SMTP 발송(+콘솔 fallback) | 인증/문의 메일(3) |
| 코어 | `cryptoUtil.ts` | AES-256-GCM 암복호화·마스킹 | KIS 자격증명(2) |
| 코어 | `unlockCookie.ts` | HMAC 서명 비밀글 해제 쿠키 | 비밀글 해제(6) |
| 코어 | `verificationToken.ts` | 이메일 인증 토큰 SHA-256 해시 | 회원가입/인증(3) |
| 도메인 | `accountTypes.ts` | 계좌 유형 enum·검증·한글 라벨 | 가계부 계좌(4) |
| 도메인 | `ledgerCategories.ts` | 수입/지출 카테고리·하위분류 사전 | 가계부(4) |
| 도메인 | `budgetTargets.ts` | 머니챌린지 예산 진행률 계산 | 예산 API(1) |
| 도메인 | `holdingAggregate.ts` | 가중평균 보유종목 집계 | 투자(4) |
| 도메인 | `holdingLedgerSync.ts` | 종목 거래 → 가계부 자동 연동 | 투자 거래(2) |
| 도메인 | `fxRate.ts` | Frankfurter 환율 조회·KRW 환산 | 투자/연동(1) |
| 도메인 | `scheduleShare.ts` | 일정공유 권한·scope 헬퍼 | 캘린더/TODO/가계부/주식(9) |
| 도메인 | `blog.ts` | 블로그 글 유형·평점 유틸 | 블로그(8) |
| 도메인 | `koreanHolidayCalendar.ts` | 한국 공휴일 → 캘린더 아이템 변환 | 캘린더(1) |
| 도메인 | `koreanHolidayConstants.ts` | 공휴일 가상 보드/소유자 상수 | 캘린더(2) |
| KIS | `kisAuth.ts` | KIS 컨텍스트·OAuth 토큰 발급/캐시 | KIS 전체(5) |
| KIS | `kisCache.ts` | TTL 메모리 캐시 + in-flight dedup | KIS(4) |
| KIS | `kisRateLimit.ts` | 사용자별 직렬화·1.1초 인터벌·백오프 | KIS(5) |
| KIS | `kisQuote.ts` | 국내주식 현재가(코드 정규화 포함) | 시세(1) |
| KIS | `kisStock.ts` | 국내 종목 상세(호가·차트·재무·투자자 등 13종) | 종목 API(13) |
| KIS | `kisMarket.ts` | 시장 지수·랭킹·VI·뉴스 등 14종 | 마켓 API(13) |
| KIS | `kisOverseas.ts` | 해외 시세/분봉/일봉 | 해외 시세(3) |
| KIS | `naverFinance.ts` | 네이버 금융 검색·시세 어댑터 | 종목 검색(2) |
| KIS | `naverDisclosure.ts` | 네이버(DART 원천) 공시 조회 | 공시(1) |

> 그룹 합계: 코어 14 · 도메인 10 · KIS 9 = 33개 모듈. (`docs/README.md`의 "35개"는 개략 표기.)

---

## 코어 모듈 (인프라 · 유틸)

### `prisma.ts`
- 목적: PrismaClient 싱글턴 제공. `@prisma/adapter-pg` + `pg.Pool`로 PostgreSQL에 연결하고, 새 커넥션마다 DB 세션 타임존을 `Asia/Seoul`로 설정한다.
- export: `prisma` (PrismaClient 인스턴스).
- 핵심: 개발 모드에서 HMR로 인한 커넥션 폭증을 막기 위해 `globalThis`에 `prisma`/`pgPool`을 캐시한다(`app/lib/prisma.ts:31-40`). `DATABASE_URL` 미설정 시 모듈 로드 시점에 throw(`app/lib/prisma.ts:12-13`). pool `connect` 이벤트에서 `SELECT set_config('TimeZone', 'Asia/Seoul', false)` 실행(`app/lib/prisma.ts:21-27`). 로그 레벨은 `["error"]`.
- 사용처: 사실상 모든 API 라우트·도메인 헬퍼(약 101개 import).

### `validation.ts`
- 목적: 요청 바디를 zod 스키마로 안전하게 파싱하고, 검증 실패 시 일관된 400 응답을 만든다.
- export:
  | 함수 | 시그니처 | 반환 |
  | --- | --- | --- |
  | `parseJsonWithSchema` | `<T extends z.ZodTypeAny>(req: Request, schema: T)` | `Promise<z.SafeParseReturnType>` |
  | `badRequestFromZod` | `(error: z.ZodError, fallbackMessage = 'invalid body')` | `NextResponse` (status 400) |
- 핵심: `req.json()`을 `.catch(() => null)`로 감싸 파싱 예외를 흡수(`app/lib/validation.ts:8`). `badRequestFromZod`는 첫 issue 메시지를 쓰되 `'Invalid input'`으로 시작하는 zod 기본 메시지면 `fallbackMessage`로 대체(`app/lib/validation.ts:16-21`).
- 사용처: 대부분의 POST/PATCH 라우트(약 26곳).

### `date.ts`
- 목적: `Date | string | number`를 ISO 문자열로 안전 변환(서버 응답 직렬화용).
- export:
  | 함수 | 동작 |
  | --- | --- |
  | `toISOStringSafe(value: unknown): string` | `Date`/유효한 string·number를 ISO로. 실패 시 `throw new Error('Invalid date value')` (`app/lib/date.ts:9`) |
  | `toISOStringNullable(value: unknown): string \| null` | `null`/`undefined`면 `null`, 아니면 `toISOStringSafe` |
- 사용처: 응답에서 Prisma `Date` 필드 직렬화(약 25곳).

### `httpErrorText.ts`
- 목적: HTTP 상태/기술 메시지를 사용자용 한글 메시지로 변환.
- export: `toHumanHttpError(status: number, apiMessage?: string | null): string | null`.
- 핵심: 401 → `"권한 없음 · 로그인이 필요합니다."`, 403 → `"권한 없음 · 접근할 수 없습니다."`, 메시지가 `unauthorized`/`forbidden`이면 `"권한 없음"`, 그 외엔 `null`을 반환해 호출부가 기본 메시지를 쓰게 한다(`app/lib/httpErrorText.ts:5-12`).
- 사용처: 클라이언트 fetch 에러 핸들링(8곳).

### `prismaError.ts`
- 목적: 예외가 DB "연결" 오류인지 판별(점검 페이지/재시도 분기용).
- export: `isDatabaseConnectionError(error: unknown): boolean`.
- 핵심: `PrismaClientInitializationError`, 또는 `PrismaClientKnownRequestError`의 코드가 `P1001`/`P1002`, 또는 메시지에 `"Can't reach database server"` 포함 시 `true`(`app/lib/prismaError.ts:3-15`).

### `appUrl.ts`
- 목적: 이메일 링크 등에 쓸 절대 origin을 요청·환경변수 기준으로 안전 해석.
- export: `resolveAppUrl(req: Request): string` (origin 문자열).
- 핵심: 우선순위 `APP_URL` → `NEXTAUTH_URL` → 요청 `req.url`의 origin(`app/lib/appUrl.ts:2-3`). production에서는 https가 아니거나 호스트가 `localhost`/`127.0.0.1`이면 throw(`app/lib/appUrl.ts:6-13`).
- 사용처: 인증 메일·문의 메일의 링크 생성(2곳).

### `userLabel.ts`
- 목적: 사용자 표시명/이메일 마스킹.
- export:
  | 함수 | 동작 |
  | --- | --- |
  | `maskEmail(email)` | 로컬파트 길이별 마스킹: 1자 `*@`, 2자 `x*@`, 그 외 `앞2자***@domain`(`app/lib/userLabel.ts:5-8`) |
  | `displayUserLabel(name, email, fallback='unknown')` | 이름 우선 → 마스킹 이메일 → fallback |
- 사용처: 공유 요청자/소유자 표시 등(5곳). (유사 함수 `toUserLabel`는 `scheduleShare.ts`에 별도 존재.)

### `useAsyncLock.ts`
- 목적: 동일 비동기 UI 액션의 동시/중복 실행 방지(클라이언트 훅, `'use client'`).
- export: `useAsyncLock()` → `{ pending: boolean, run: <T>(task) => Promise<T | undefined> }`.
- 핵심: `useRef` 락으로 진행 중이면 즉시 `undefined` 반환, `finally`에서 락 해제 및 `pending=false`(`app/lib/useAsyncLock.ts:16-27`).
- 사용처: 저장/삭제/제출 버튼(13곳).

### `rateLimit.ts`
- 목적: 인메모리 토큰버킷 레이트리밋(단일 프로세스).
- export:
  | 함수 | 동작 |
  | --- | --- |
  | `getClientIp(req)` | `x-forwarded-for` 첫 IP → `x-real-ip` → `'unknown'`(`app/lib/rateLimit.ts:24-35`) |
  | `takeRateLimit(key, limit, windowMs)` | `{ ok, retryAfterSec, remaining }` 반환 |
- 핵심: 버킷 Map을 `globalThis.__leeshRateLimitBuckets`에 보관(`app/lib/rateLimit.ts:6-16`). 호출마다 만료 버킷 cleanup, 윈도우 초과 시 `ok=false`와 `retryAfterSec`(최소 1초) 산출(`app/lib/rateLimit.ts:59-65`).
- 사용처: 로그인/회원가입/이메일 인증/공개 폼 등(5곳). 자세한 정책은 [env-and-security.md](env-and-security.md) 참고.

### `markdown.ts`
- 목적: `react-markdown` + `rehype-sanitize`용 허용 태그/속성 화이트리스트.
- export: `sanitizedMarkdownSchema` (rehype-sanitize 스키마 객체).
- 핵심: 기본 스키마에 `details`/`summary`/`div` 태그 추가, 속성으로 `a[name]`, `div[align]`, `img[width,height]`, `details[open]` 허용(`app/lib/markdown.ts:6-17`). (목차 앵커·접기/펼치기·이미지 크기 지정 지원 목적.)
- 사용처: 블로그/Docs/게시판 마크다운 렌더(3곳).

### `mailer.ts`
- 목적: SMTP 메일 발송. 설정이 없으면 개발 편의상 콘솔로 출력.
- export: `sendMail({ to, subject, text, replyTo? }): Promise<void>`.
- 사용 환경변수(값은 [env-and-security.md](env-and-security.md) 참고): `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_PORT`(기본 `587`), `SMTP_FROM`(없으면 `SMTP_USER`).
- 핵심: 필수값 결여 시 production이면 throw, 아니면 `[EMAIL:FALLBACK]` 콘솔 출력(`app/lib/mailer.ts:16-26`). `nodemailer`는 동적 import, `secure`는 `port === 465`일 때만 true(`app/lib/mailer.ts:29-44`).
- 사용처: 이메일 인증·재발송·문의 메일(3곳).

### `cryptoUtil.ts`
- 목적: KIS 자격증명 등 민감 문자열의 AES-256-GCM 암복호화.
- export:
  | 함수 | 동작 |
  | --- | --- |
  | `encrypt(plain): string` | `iv.tag.ciphertext`(각 base64, `.`구분) 반환(`app/lib/cryptoUtil.ts:17-29`) |
  | `decrypt(blob): string` | 형식 검증 후 복호화, 형식 불일치 시 throw |
  | `maskSecret(s, head=4, tail=2): string` | 앞 4·뒤 2자만 노출, 나머지 `•` |
- 핵심: 키 우선순위 `KIS_ENCRYPTION_KEY` → `NEXTAUTH_SECRET`(둘 다 없으면 throw), 입력 키를 SHA-256으로 32바이트 파생(`app/lib/cryptoUtil.ts:7-15`). IV 12바이트 랜덤.
- 사용처: `kisAuth.ts`의 appKey/appSecret/accessToken 저장·복호화(2곳).

### `unlockCookie.ts`
- 목적: 비밀글 해제 상태를 HMAC 서명 쿠키로 클라이언트에 보관.
- export:
  | 항목 | 동작 |
  | --- | --- |
  | `readUnlockedPostIds(cookieValue): string[]` | `payload.sig` 분리 → HMAC-SHA256 `timingSafeEqual` 검증 → ids 배열(`app/lib/unlockCookie.ts:30-49`) |
  | `buildUnlockedCookieValue(ids): string` | dedup 후 최대 200개로 잘라 서명(`app/lib/unlockCookie.ts:51-56`) |
  | `UnlockPayload` (type) | `{ ids: string[] }` |
  | `UNLOCK_COOKIE_NAME` | `"leesh_unlocked_posts"` |
- 핵심: 비밀키 `NEXTAUTH_SECRET` → `APP_SECRET`, production에서 둘 다 없으면 throw, 개발에선 `"dev-secret-change-me"` fallback(`app/lib/unlockCookie.ts:19-26`). base64url 인코딩 헬퍼 포함.
- 사용처: 블로그/게시판/leesh 비밀글 해제 흐름(6곳).

### `verificationToken.ts`
- 목적: 이메일 인증 토큰을 DB에 평문 대신 해시로 저장.
- export: `hashVerificationToken(token: string): string` — `sha256` hex(`app/lib/verificationToken.ts:3-5`).
- 사용처: 회원가입/인증/재발송(3곳).

---

## 도메인 모듈 (가계부 · 투자 · 일정 · 콘텐츠)

### `accountTypes.ts`
- 목적: 가계부 계좌 유형(enum) 정의·조합 검증·한글 라벨.
- export:
  | 항목 | 내용 |
  | --- | --- |
  | `ACCOUNT_TYPES` | 18종 const 튜플: SALARY, LIVING, CHECKING, SAVINGS, EMERGENCY, STOCK, ISA, PENSION, BUSINESS, SHARED, CORPORATE, FOREIGN_CURRENCY, SHOPPING, CEREMONIAL, CARD, FIXED_EXPENSE, TRANSPORT, OTHER |
  | `AccountType` (type) | `ACCOUNT_TYPES[number]` |
  | `STOCK_TYPES` | `['STOCK','ISA','PENSION']` |
  | `isStockType(t)` / `hasStockType(types)` | 주식계열 판별 |
  | `validateAccountTypes(types): string \| null` | 오류 메시지 또는 `null` |
  | `TYPE_LABEL_KR` | `Record<AccountType,string>` 한글 라벨 |
- 핵심 규칙(`app/lib/accountTypes.ts:39-49`): 최소 1개, 중복 불가, STOCK/ISA/PENSION은 한 계좌에 하나만이며 다른 유형과 혼합 불가.
- 사용처: 계좌 생성/수정 라우트·계좌 폼(4곳). 모델은 [database.md](database.md) 참고.

### `ledgerCategories.ts`
- 목적: 가계부 수입/지출 카테고리와 하위분류 사전, 조합 검증.
- export:
  | 항목 | 내용 |
  | --- | --- |
  | `LedgerEntryType` (type) | `'INCOME' \| 'EXPENSE'` |
  | `CategorySpec` (type) | `{ key, label, subcategories: string[] }` |
  | `INCOME_CATEGORIES` | 9개(월급·보너스·환급금·주식/이자·용돈·경조사비·수익·계좌이체·기타) |
  | `EXPENSE_CATEGORIES` | 18개(주거·통신·보험·구독·학습·고정비 기타·식비·생활·쇼핑·교통·의료/건강·문화/여가·경조사/선물·자기계발·주식/이자·변동비 기타·계좌이체·기타) |
  | `getCategoriesByType(type)` | 타입별 목록 반환 |
  | `isValidCategoryCombination(type, category, subcategory)` | 카테고리/하위분류 일치 검증(`app/lib/ledgerCategories.ts:128-138`) |
- 비고: `주식/이자` 하위분류(배당금·거래 수수료·세금·투자 수익/손실(실현손익))는 `holdingLedgerSync.ts`의 자동 연동 분류와 정확히 일치해야 한다.
- 사용처: 가계부 항목 라우트·입력 폼·예산(4곳).

### `budgetTargets.ts`
- 목적: "머니 챌린지" 예산 목표별 이번 달 사용액·진행률 계산.
- export:
  | 항목 | 내용 |
  | --- | --- |
  | `BudgetScope` (type) | `'CATEGORY' \| 'SUBCATEGORY' \| 'ACCOUNT'` |
  | `BudgetTargetRow`, `BudgetProgress` (type) | 진행률은 `spent`/`remaining`/`rate`/`status`/`label` 포함 |
  | `currentMonthRange(now=new Date())` | KST(UTC+9) 기준 이번 달 `{ start, end, ym }`(`app/lib/budgetTargets.ts:30-47`) |
  | `listBudgetsWithProgress(ownerId, now?)` | `Promise<{ ym, items: BudgetProgress[] }>` |
- 핵심: 이번 달 `EXPENSE` 항목 중 `excludeFromTotals=false`만 `occurredAt ∈ [start,end)`로 한 번에 조회 후 메모리에서 scope별 매칭 합산(`app/lib/budgetTargets.ts:79-120`). 상태 분류는 `rate>=1` → `over`, `>=0.8` → `warning`, 그 외 `safe`(`app/lib/budgetTargets.ts:122-123`).
- 사용처: 예산 진행률 API(1곳). [feature-ledger.md](feature-ledger.md) 참고.

### `holdingAggregate.ts`
- 목적: 보유종목 트랜잭션을 가중평균 원가 방식으로 집계.
- export:
  | 항목 | 내용 |
  | --- | --- |
  | `HoldingTxType` (type) | `'BUY' \| 'SELL' \| 'DIVIDEND' \| 'FEE' \| 'TAX'` |
  | `HoldingTxRow`, `HoldingAggregate` (type) | 집계 결과: quantity, avgCost, costBasis, totalInvested, realizedPnL, dividendTotal, feeTotal, taxTotal, marketValue, unrealizedPnL, totalReturn |
  | `aggregateHolding(txs, currentPrice=null)` | 시간순 정렬 후 누적 집계(`app/lib/holdingAggregate.ts:26-102`) |
  | `avgCostBeforeTx(txs, targetTxIdx)` | 특정 트랜잭션 직전까지의 가중평균 평단가(`app/lib/holdingAggregate.ts:106-139`) |
- 핵심: BUY는 수량·원가 가산, SELL은 보유수량 한도 내에서 `avg=costBasis/quantity` 기준 실현손익 계산(`app/lib/holdingAggregate.ts:55-66`). `totalReturn = realizedPnL + unrealizedPnL + dividendTotal − feeTotal − taxTotal`(현재가 있을 때만).
- 사용처: 포트폴리오/종목 상세 계산(4곳).

### `holdingLedgerSync.ts`
- 목적: 보유종목 거래(매도·배당·수수료·세금)를 가계부 항목으로 자동 생성/갱신/삭제.
- export:
  | 항목 | 내용 |
  | --- | --- |
  | `SyncContext` (type) | userId·holding 정보·txId·type·수량/단가/금액·occurredAt·memo |
  | `syncTransactionToLedger(ctx, link, existingLedgerEntryId)` | `Promise<string \| null>` (생성된 LedgerEntry id) |
- 핵심 매핑(`deriveLedgerPayload`, `app/lib/holdingLedgerSync.ts:20-122`):
  | 거래 type | 가계부 type | 카테고리 · 하위분류 |
  | --- | --- | --- |
  | DIVIDEND | INCOME | 주식/이자 · 배당금 |
  | FEE | EXPENSE | 주식/이자 · 거래 수수료 |
  | TAX | EXPENSE | 주식/이자 · 세금 |
  | SELL(이익) | INCOME | 주식/이자 · 투자 수익(실현손익) |
  | SELL(손실) | EXPENSE | 주식/이자 · 투자 손실(실현손익) |
  | BUY | (연동 안 함) | — |
- 비-KRW 종목은 `fxRate.toKrw`로 현재 환율 환산해 기록(`app/lib/holdingLedgerSync.ts:32-33`). SELL은 `avgCostBeforeTx`로 그 시점 평단가 기준 손익 산정, `|손익| < 0.005`거나 환산 0이면 항목 생성 생략(`app/lib/holdingLedgerSync.ts:99-101`). 기존 연결 항목은 `link=false`거나 재계산 시 `deleteMany`로 정리 후 재생성(`app/lib/holdingLedgerSync.ts:131-138`). 종목에 지정된 `accountId`가 있으면 그 계좌로 연결.
- 사용처: 보유종목 거래 생성/수정 라우트(2곳).

### `fxRate.ts`
- 목적: 외화 → KRW 환율 조회·환산(Frankfurter 공개 API).
- export:
  | 함수 | 동작 |
  | --- | --- |
  | `getKrwRate(fromCurrency): Promise<number>` | `KRW`이면 1, 아니면 `frankfurter.app`에서 조회 |
  | `toKrw(amount, fromCurrency): Promise<number>` | 환산 후 정수 반올림 |
- 핵심: 서버 메모리 캐시 30분(`TTL_MS`), `fetch`에 `next.revalidate:1800`. 실패/비정상 응답 시 캐시값 또는 `1` fallback(`app/lib/fxRate.ts:21-32`).
- 사용처: `holdingLedgerSync.ts` 환산(1곳).

### `scheduleShare.ts`
- 목적: 일정공유(ScheduleShare) 권한 조회·scope 파싱·라벨 헬퍼.
- export:
  | 항목 | 동작 |
  | --- | --- |
  | `ScheduleShareScope` (type) | `'CALENDAR' \| 'TODO' \| 'LEDGER' \| 'STOCK'` |
  | `getReadableScheduleOwnerIds(userId, scope)` | 본인 + `status:'ACCEPTED'` 공유자의 ownerId 집합(`app/lib/scheduleShare.ts:11-29`) |
  | `parseScheduleShareScope(v): ScheduleShareScope \| null` | 문자열 검증 |
  | `toUserLabel(name, email)` | 이름→이메일→`'알 수 없는 사용자'` |
- 핵심: `scheduleShare` 테이블 조회 실패(미마이그레이션 등) 시에도 본인 데이터는 보이도록 `[userId]`만 반환하는 try/catch fallback(`app/lib/scheduleShare.ts:24-28`).
- 사용처: 캘린더·TODO·가계부·주식의 "공유 포함" 목록 조회(9곳). [auth-permissions.md](auth-permissions.md) 참고.

### `blog.ts`
- 목적: 블로그 글 유형/리뷰 평점 관련 상수·검증·표시 유틸.
- export:
  | 항목 | 내용 |
  | --- | --- |
  | `BLOG_POST_TYPE_VALUES` | `['INFO','REVIEW','DAILY']` |
  | `BlogPostType` (type) / `isBlogPostType` / `parseBlogPostType` | 유형 검증 |
  | `BLOG_POST_TYPE_OPTIONS` | 라벨: INFO→`정보` · REVIEW→`리뷰/후기` · DAILY→`일상` |
  | `BLOG_REVIEW_RATING_STEPS`, `BLOG_REVIEW_FILTER_STEPS` | 0~10 (0.5점 단위 × 2) |
  | `parseReviewRatingHalf(value, {allowZero?})` | 1(또는 0)~10 정수 검증(`app/lib/blog.ts:30-42`) |
  | `getBlogPostTypeLabel(type)` / `formatReviewRatingHalf(value)` | 표시(평점은 `value/2`를 소수1자리) |
- 사용처: 블로그 목록/작성/수정/상세·평점 입력(8곳).

### `koreanHolidayCalendar.ts`
- 목적: `korean-holidays` 패키지의 공휴일을 캘린더 아이템 형태로 변환.
- export:
  | 항목 | 내용 |
  | --- | --- |
  | `KoreanHolidayCalendarItem` (type) | 캘린더 항목과 동일한 형태(`kind:'HOLIDAY'`, `canEdit:false`, `allDay:true`, `isSubstituteHoliday`, `isLunarHoliday` 등) |
  | `getKoreanHolidayCalendarItems(month): KoreanHolidayCalendarItem[]` | `YYYY-MM` 형식 검증 후 해당 월 공휴일 배열 |
- 핵심: `Asia/Seoul` 기준 `en-CA` 포맷터로 날짜키 생성, 해당 월 필터·정렬 후 매핑(`app/lib/koreanHolidayCalendar.ts:51-91`). id는 `holiday:kr:{YYYY-MM-DD}:{이름}`.
- 사용처: 캘린더 조회 시 공휴일 머지(1곳).

### `koreanHolidayConstants.ts`
- 목적: 공휴일용 가상 보드/소유자 상수.
- export: `KOREA_HOLIDAY_OWNER_ID = 'builtin:kr-holidays'`, `KOREA_HOLIDAY_BOARD_ID = 'builtin:kr-holidays'`, `KOREA_HOLIDAY_LABEL = '대한민국 공휴일'`(`app/lib/koreanHolidayConstants.ts:1-3`).
- 사용처: `koreanHolidayCalendar.ts` 및 캘린더 필터(2곳).

---

## KIS 연동 모듈 (한국투자증권 Open API)

> KIS 모듈 공통 패턴: 모든 호출은 `kisRateLimit`로 사용자별 직렬화 + 최소 인터벌(1.1초)을 보장하고, 응답 코드 `EGW00201`(초당 거래건수 초과)이면 `rateLimitBackoff`로 최대 `MAX_RETRIES=2`회 재시도한다. 조회 결과는 `kisCache.cached`로 TTL 캐시 + in-flight dedup된다. 인증 헤더는 `authorization: Bearer …`, `appkey`, `appsecret`, `tr_id`, `custtype:'P'`(단 `kisQuote.ts`는 `custtype`을 생략). 자세한 통합은 [integration-kis.md](integration-kis.md) 참고.

### `kisAuth.ts`
- 목적: 사용자별 KIS 컨텍스트(자격증명 + 유효 access_token) 확보. OAuth 토큰 발급/캐시/암호화 저장.
- export:
  | 항목 | 내용 |
  | --- | --- |
  | `KIS_LIVE_BASE` / `KIS_MOCK_BASE` | 실전 `…:9443` / 모의 `…:29443` 호스트 |
  | `KisContext` (type) | `baseUrl, appKey, appSecret, accessToken, accountNumber, accountProductCode, isLive` |
  | `getKisCredential(userId)` | `prisma.kisCredential.findUnique` (없으면 null) |
  | `getKisContext(userId): Promise<KisContext>` | 미설정 시 `throw new Error('KIS_NOT_CONFIGURED')` |
  | `testKisCredentials({appKey,appSecret,isLive})` | DB 저장 없이 토큰만 검증 → `{ok:true} \| {ok:false,message}` |
- 핵심: appKey/appSecret/accessToken은 `cryptoUtil.decrypt/encrypt`로 처리. 캐시 토큰이 만료 30분 이전이면 재사용, 아니면 `POST /oauth2/tokenP`로 재발급해 암호화 저장(`app/lib/kisAuth.ts:45-93`). 동일 사용자의 동시 발급은 `tokenInFlight` Map으로 dedup해 1회만 실제 fetch(`app/lib/kisAuth.ts:62-100`). `expires_in` 미제공 시 기본 86,400초.
- 사용처: 모든 KIS 데이터 모듈(`kisQuote`/`kisStock`/`kisMarket`/`kisOverseas`) 및 KIS 설정 라우트(5곳).

### `kisCache.ts`
- 목적: 단일 Node 프로세스용 TTL 메모리 캐시 + 동시요청 dedup(Redis 도입 전 quick win).
- export:
  | 함수 | 동작 |
  | --- | --- |
  | `cached<T>(key, ttlMs, fetcher): Promise<T>` | 유효 캐시 즉시 반환, 진행 중 동일 요청 piggyback, 완료 시 저장(`app/lib/kisCache.ts:25-47`) |
  | `invalidate(prefix)` | prefix로 시작하는 키 삭제 |
  | `cacheStats()` | `{ size, inflight }` |
- 핵심: `store` Map이 200개 이상일 때 lazy prune(`app/lib/kisCache.ts:13-19`).
- 사용처: `kisQuote`/`kisStock`/`kisMarket`/`kisOverseas`(4곳).

### `kisRateLimit.ts`
- 목적: KIS 호출 빈도 제어(공식 1 req/sec). 사용자별 직렬화 + 최소 인터벌, 백오프.
- export:
  | 함수 | 동작 |
  | --- | --- |
  | `isRateLimitedResponse({rt_cd,msg_cd})` | `rt_cd!=='0' && msg_cd==='EGW00201'`(`app/lib/kisRateLimit.ts:6-11`) |
  | `rateLimitBackoff(attempt)` | `1100 + attempt*500` ms 대기(1.1/1.6/2.1초) |
  | `kisRateLimit(userId): Promise<void>` | 사용자별 큐로 직렬화, `MIN_INTERVAL_MS=1100` 보장(`app/lib/kisRateLimit.ts:27-49`) |
- 사용처: KIS auth/data 모듈(5곳).

### `kisQuote.ts`
- 목적: 국내주식 현재가(TR `FHKST01010100`).
- export:
  | 항목 | 내용 |
  | --- | --- |
  | `KisQuote` (type) | `symbol, price, prevClose, currency('KRW'), exchange, name, marketTime` |
  | `normalizeKrCode(symbol)` | `.KS`/`.KQ` 접미 제거(`app/lib/kisQuote.ts:37-42`) |
  | `isKrSymbol(symbol)` | 6자리 숫자 여부 |
  | `getKisQuote(userId, symbol): Promise<KisQuote \| null>` | 캐시 TTL 10초(`q:` 키) |
- 핵심: `inquire-price` 엔드포인트, 6자리 코드가 아니면 `null`. 가격은 `parseInt`(원화 정수).
- 사용처: 국내 단일 시세 조회(1곳).

### `kisStock.ts`
- 목적: 국내 개별 종목 상세 데이터 13종. 공통 헬퍼 `kisGet<T>(userId, pathWithQuery, trId)`로 GET + retry, 결과는 대부분 `cached`로 캐싱한다(단 `getFinancialRatio`는 캐시 미적용 — `TTL.FINANCIAL` 상수는 정의되어 있으나 사용되지 않음).
- export 함수(모두 `(userId, code, …)` 시그니처):
  | 함수 | TR ID | 엔드포인트(quotations/finance) | 캐시 TTL | 반환 |
  | --- | --- | --- | --- | --- |
  | `getOrderbook` | FHKST01010200 | inquire-asking-price-exp-ccn | 8s | `Orderbook \| null`(호가 10단계·예상체결) |
  | `getStockHistory(…, period='D'\|'W'\|'M'\|'Y')` | FHKST03010100 | inquire-daily-itemchartprice | 1m/10m | `StockChartBar[]` |
  | `getDailyPrice(…, period='D'\|'W'\|'M')` | FHKST01010400 | inquire-daily-price | 5m | `DailyBar[]` |
  | `getMinuteBars(…, hour?)` | FHKST03010230 | inquire-time-dailychartprice | 15s | `MinuteChart \| null` |
  | `getOvertimePrice` | FHPST02300000 | inquire-overtime-price | 15s | `Overtime \| null` |
  | `getStockMeta` | FHKST01010100 | inquire-price | 5m | `StockMeta \| null`(시총/PER/PBR 등) |
  | `getStabilityRatio` | FHKST66430600 | finance/stability-ratio | 1h | `StabilityRow[]` |
  | `getProfitRatio` | FHKST66430400 | finance/profit-ratio | 1h | `ProfitRow[]` |
  | `getProgramTrade` | FHPPG04650101 | program-trade-by-stock | 20s | `ProgramTradeRow[]` |
  | `getMembers` | FHKST01010600 | inquire-member | 30s | `Members \| null`(거래원 매수/매도) |
  | `getFinancialRatio` | FHKST66430300 | finance/financial-ratio | 캐시 없음 | `FinancialRow[]` |
  | `getStockOpinion(…, daysBack=180)` | FHKST663300C0 | invest-opinion | 30m | `Opinion[]` |
  | `getInvestor` | FHKST01010900 | inquire-investor | 1m | `InvestorRow[]` |
- export 타입: `OrderbookLevel`, `Orderbook`, `StockChartBar`, `DailyBar`, `MinuteBar`, `MinuteChart`, `Overtime`, `StockMeta`, `StabilityRow`, `ProfitRow`, `ProgramTradeRow`, `MemberSide`, `Members`, `FinancialRow`, `Opinion`, `InvestorRow`.
- 핵심: `kisGet`은 `rt_cd!=='0'`이면 콘솔 에러 후 `null` 반환(`app/lib/kisStock.ts:55-61`). 모든 쿼리는 `FID_COND_MRKT_DIV_CODE=J`(주식).
- 사용처: `app/api/kis/stock/[code]/*` 라우트 13개. [api-reference.md](api-reference.md) 참고.

### `kisMarket.ts`
- 목적: 시장 단위 데이터 14종(지수·랭킹·VI·투자자·뉴스 등).
- export 함수:
  | 함수 | TR ID | 엔드포인트 | 반환 |
  | --- | --- | --- | --- |
  | `getIndices(userId, codes=['0001','1001'])` | FHPUP02100000 | inquire-index-price | `IndexQuote[]` (코스피/코스닥/코스피200 라벨) |
  | `getCategoryIndices(userId, market='KOSPI'\|'KOSDAQ')` | FHPUP02140000 | inquire-index-category-price | `SectorIndex[]` |
  | `getIndexHistory(userId, code, period='D'\|'W'\|'M'\|'Y')` | FHKUP03500100 | inquire-daily-indexchartprice | `IndexBar[]` |
  | `getIndexMinutes(userId, code, gapSeconds=60)` | FHKUP03500200 | inquire-time-indexchartprice | `IndexMinuteBar[]` |
  | `getFxMinutes(userId, marketDiv:'N'\|'X'\|'KX', symbol)` | FHKST03030200 | (overseas)inquire-time-indexchartprice | `FxMinuteBar[]` (캐시 TTL 30s) |
  | `getVolumeRanking(userId, byValue=true, limit=10)` | FHPST01710000 | volume-rank | `RankingRow[]` |
  | `getRiseRanking(userId, rising=true, limit=10)` | FHPST01700000 | ranking/fluctuation | `RankingRow[]` |
  | `getSupplyRanking(userId, side:'foreign'\|'inst', limit=10)` | FHPTJ04400000 | foreign-institution-total | `SupplyRankRow[]` |
  | `getBulkTransRanking(userId, limit=15)` | FHKST190900C0 | ranking/bulk-trans-num | `BulkTransRow[]` |
  | `getExpectedTransRanking(userId, rising=true, limit=15)` | FHPST01820000 | ranking/exp-trans-updown | `ExpectedRankRow[]` |
  | `getVolumePowerRanking(userId, limit=15)` | FHPST01680000 | ranking/volume-power | `PowerRow[]` |
  | `getViStatus(userId, market='ALL'\|'KOSPI'\|'KOSDAQ', limit=20)` | FHPST01390000 | inquire-vi-status | `ViItem[]` |
  | `getMarketInvestorDaily(userId, market='KOSPI'\|'KOSDAQ', limit=10)` | FHPTJ04040000 | inquire-investor-daily-by-market | `MarketInvestorRow[]` |
  | `getKisNews(userId, limit=15)` | FHKST01011800 | news-title | `NewsItem[]` |
- export 타입: `IndexQuote`, `SectorIndex`, `IndexBar`, `IndexMinuteBar`, `FxMinuteBar`, `RankingRow`, `SupplyRankRow`, `BulkTransRow`, `ExpectedRankRow`, `PowerRow`, `ViItem`, `MarketInvestorRow`, `NewsItem`.
- 핵심: 지수 부호는 `prdy_vrss_sign`(4/5=하락)으로 보정. `getKisNews`는 여러 빌드 전략(strategy)으로 `news-title`을 순차 시도하고, `news_ofer_entp_code`/`news_lrdv_code`를 한글 언론사·분류명으로 매핑(`NEWS_ENTP_NAMES`/`NEWS_LRDV_NAMES` 사전 + 행 매핑 `app/lib/kisMarket.ts:1658-1672`). 단 응답에 `dorg`(언론사 한글명)가 있으면 우선 사용.
- 사용처: `app/api/kis/{indices,sectors,index-history,index-minutes,fx-minutes,rankings,supply-ranking,bulk-ranking,expected-ranking,power-ranking,vi,market-investors,news}` 라우트 13개.

### `kisOverseas.ts`
- 목적: 해외 주식/지수 시세·분봉·일봉.
- export:
  | 함수 | TR ID | 엔드포인트 | 반환 |
  | --- | --- | --- | --- |
  | `getOverseasQuote(userId, exchange, symbol)` | HHDFS00000300 | overseas-price/…/price | `OverseasQuote \| null` |
  | `getOverseasQuotes(userId, pairs[])` | (위 묶음) | — | `OverseasQuote[]`(null 제외) |
  | `getOverseasMinute(userId, exchange, symbol, gapMinutes=1)` | HHDFS76950200 | inquire-time-itemchartprice | `OverseasMinute \| null`(최대 120건, 오름차순) |
  | `getOverseasDaily(userId, exchange, symbol, period='D'\|'W'\|'M')` | HHDFS76240000 | dailyprice | `OverseasDaily \| null`(최대 100건) |
- export 타입: `OverseasQuote`, `OverseasMinuteBar`, `OverseasMinute`, `OverseasDailyBar`, `OverseasDaily`.
- 핵심: 캐시 TTL는 현재가 30s·분봉 30s·일봉 5m(`app/lib/kisOverseas.ts:11-15`). 소수점 자리수는 응답 `zdiv`(기본 2). 부호 보정은 `sign`(4/5=하락). 분봉은 응답이 최신→과거이므로 `reverse()`로 오름차순화(`app/lib/kisOverseas.ts:236-247`).
- 사용처: 해외 시세/차트 라우트(3곳).

### `naverFinance.ts`
- 목적: 네이버 금융 비공식 API 어댑터(글로벌 종목 검색 + 시세).
- export:
  | 함수 | 동작 |
  | --- | --- |
  | `searchSymbols(query): Promise<SearchHit[]>` | autoComplete로 한글/영문/심볼 검색(`category==='stock'`만, 최대 15)(`app/lib/naverFinance.ts:54-82`) |
  | `getQuote(symbol): Promise<Quote \| null>` | 모바일/일반 호스트 후보를 순차 시도해 `basic` 시세 조회(`app/lib/naverFinance.ts:129-166`) |
  | `SearchHit`, `Quote` (type) | — |
- 핵심: `nationCode`/`nationType`을 통화로 매핑(`currencyForNation`, KOR=KRW, USA=USD …). `.KS`/`.KQ` 접미를 reutersCode로 변환. 모두 `User-Agent` 헤더와 `next.revalidate`(검색 60s) 사용.
- 사용처: 종목 검색·KIS 미설정 시 시세 fallback(2곳).

### `naverDisclosure.ts`
- 목적: 종목별 공시(네이버 금융 비공식, DART 원천) 조회.
- export:
  | 항목 | 내용 |
  | --- | --- |
  | `DisclosureItem` (type) | `title, filedAt, filer, url(DART 링크)` |
  | `getNaverDisclosures(stockCode, limit=30): Promise<DisclosureItem[]>` | 6자리 코드만, 비정상 시 `[]` |
- 핵심: `m.stock.naver.com/api/stock/{code}/disclosure` 호출(`next.revalidate:600`, 10분 캐시), `filingDate`/`filingTime`을 ISO로 조립, `rcpNo`로 `dart.fss.or.kr` 원문 링크 생성(`app/lib/naverDisclosure.ts:47-62`).
- 사용처: 종목 상세 공시 탭(1곳).

---

## 횡단 관심사 메모

- 환경변수 의존: `prisma`(`DATABASE_URL`), `appUrl`(`APP_URL`/`NEXTAUTH_URL`), `mailer`(`SMTP_*`), `cryptoUtil`(`KIS_ENCRYPTION_KEY`/`NEXTAUTH_SECRET`), `unlockCookie`(`NEXTAUTH_SECRET`/`APP_SECRET`). 값·정책은 [env-and-security.md](env-and-security.md) 참고.
- 인메모리 상태(단일 프로세스 가정, 수평 확장 시 한계): `rateLimit`의 버킷 Map, `kisCache`의 store/inflight, `kisRateLimit`의 사용자 큐, `fxRate`의 환율 캐시, `kisAuth`의 `tokenInFlight`.
- 시간대: DB 세션은 `Asia/Seoul`(`prisma.ts`), 예산/공휴일 계산은 코드에서 KST 오프셋·`Asia/Seoul` 포맷터를 직접 적용한다.
</content>
</invoke>
