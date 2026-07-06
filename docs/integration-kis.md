# 통합: 한국투자증권(KIS) Open API & 시세

`Leesh`의 시장/시세 기능은 사용자 본인의 **한국투자증권(KIS) Open API** 자격증명을 등록받아, 서버 측 프록시로 실시간 국내·해외 시세, 차트, 랭킹, 투자자 동향, 공시, 환율을 제공합니다. 이 문서는 자격증명 저장·암호화부터 OAuth 토큰 흐름, 레이트리밋·캐시 인프라, 데이터 모듈, 라우트, 비-KIS 외부 데이터(환율·공시·네이버 시세), 그리고 프론트엔드 페이지까지 KIS 연동 전반을 다룹니다.

> 작성 기준: 2026-06-24, `dev` 브랜치

상호 참조: [lib-reference.md](lib-reference.md) (모듈 export/시그니처 상세) · [api-reference.md](api-reference.md) (라우트 마스터 인덱스) · [database.md](database.md) (`KisCredential` 모델) · [env-and-security.md](env-and-security.md) (암호화·비밀값) · [feature-investing.md](feature-investing.md) (보유종목·관심종목에서의 시세 소비) · [architecture.md](architecture.md)

---

## 1. 한눈에 보기

```
브라우저 (app/ledger/market/*, /ledger/kis-settings)
   │  fetch /api/kis/**, /api/exchange-rates, /api/fx-history, /api/disclosure/[code]
   ▼
Next.js Route Handler (runtime='nodejs')
   │  ① 세션 검사(getServerSession)  ② User 조회  ③ KisCredential 존재 확인(없으면 412)
   ▼
데이터 모듈 (app/lib/kisQuote · kisStock · kisMarket · kisOverseas)
   │  kisCache.cached(key, ttl)  ──hit──▶ 즉시 반환 / in-flight dedup
   │  miss ▼
   │  getKisContext(userId)  ── 토큰 캐시 유효? ─yes─▶ 재사용
   │                          └ no ─▶ POST /oauth2/tokenP (kisRateLimit + 암호화 저장)
   │  kisRateLimit(userId)  → fetch KIS  → EGW00201 이면 rateLimitBackoff 재시도(최대 2회)
   ▼
한국투자증권 Open API (실전 :9443 / 모의 :29443)
```

핵심 설계 원칙:

- **사용자별 자격증명**: 글로벌 API 키가 아니라 각 사용자가 자기 KIS 앱키/앱시크릿/계좌를 등록(`KisCredential`, `userId @unique`). 미등록 사용자는 시장 데이터 라우트에서 `412`를 받습니다.
- **비밀값 암호화**: `appKey`/`appSecret`/`accessToken`은 DB에 평문이 아니라 AES-256-GCM 암호문으로 저장(`app/lib/cryptoUtil.ts`).
- **레이트리밋 준수**: KIS 실전 제한(1 req/sec)을 사용자별 직렬화 + 최소 인터벌 1.1초로 보장하고, 초과 응답(`EGW00201`)은 백오프 재시도.
- **캐시 + dedup**: 단일 Node 프로세스 메모리 TTL 캐시로 반복 호출과 동시 요청을 흡수(Redis 도입 전 quick win).

---

## 2. 자격증명 모델 `KisCredential`

`prisma/schema.prisma:259`

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `String @id @default(cuid())` | PK |
| `userId` | `String @unique` | 사용자당 1개. `User` 와 `onDelete: Cascade` 관계 |
| `appKey` | `String` | KIS 앱키 — **암호문** 저장 |
| `appSecret` | `String` | KIS 앱시크릿 — **암호문** 저장 |
| `accountNumber` | `String` | 계좌번호 앞 8자리(CANO) |
| `accountProductCode` | `String @default("01")` | 계좌상품코드 2자리 |
| `isLive` | `Boolean @default(true)` | 실전(`true`)/모의(`false`) 투자 구분 |
| `accessToken` | `String?` | 캐시된 OAuth 토큰 — **암호문** 저장 |
| `tokenExpiresAt` | `DateTime?` | 토큰 만료 시각 |
| `createdAt`/`updatedAt` | `DateTime` | 타임스탬프 |

스키마 상세는 [database.md](database.md) 참고.

---

## 3. 비밀값 암호화 (`app/lib/cryptoUtil.ts`)

`appKey`/`appSecret`/`accessToken`은 저장 직전 `encrypt()`, 사용 직전 `decrypt()`를 거칩니다.

| 항목 | 내용 |
| --- | --- |
| 알고리즘 | `aes-256-gcm` |
| 키 소스 우선순위 | `KIS_ENCRYPTION_KEY` → `NEXTAUTH_SECRET` → 둘 다 없으면 `throw` (`cryptoUtil.ts:8-15`) |
| 키 파생 | 입력 키를 `SHA-256` 해시해 32바이트로 정규화 |
| IV | 매 암호화마다 `crypto.randomBytes(12)` |
| 저장 포맷 | `base64(iv).base64(tag).base64(ciphertext)` (점 구분) |
| 변조 탐지 | GCM `authTag` 저장·검증 |
| 표시용 마스킹 | `maskSecret(s, head=4, tail=2)` — 길이 ≤ 6이면 `••••` |

`GET /api/kis/credentials` 응답은 실제 앱키를 절대 평문으로 내보내지 않고 `maskSecret(decrypt(cred.appKey))`(앞 4·뒤 2자만) 으로만 노출하며, `appSecret`/`accessToken`은 아예 응답에 포함하지 않습니다(`app/api/kis/credentials/route.ts:48-69`). 암호화 정책 상세는 [env-and-security.md](env-and-security.md) §6 참고.

---

## 4. OAuth 토큰 흐름 (`app/lib/kisAuth.ts`)

KIS는 `client_credentials` 그랜트로 access_token을 발급합니다. `getKisContext(userId)`가 토큰 라이프사이클을 관리합니다.

| export | 내용 |
| --- | --- |
| `KIS_LIVE_BASE` | `https://openapi.koreainvestment.com:9443` (실전) |
| `KIS_MOCK_BASE` | `https://openapivts.koreainvestment.com:29443` (모의) |
| `KisContext` (type) | `baseUrl, appKey, appSecret, accessToken, accountNumber, accountProductCode, isLive` |
| `getKisCredential(userId)` | `prisma.kisCredential.findUnique` (미등록 시 `null`) |
| `getKisContext(userId): Promise<KisContext>` | 유효 토큰 확보 컨텍스트. 미설정 시 `throw new Error('KIS_NOT_CONFIGURED')` |
| `testKisCredentials({appKey,appSecret,isLive})` | DB 저장 없이 토큰만 검증 → `{ok:true}` 또는 `{ok:false,message}` |

**토큰 갱신 로직** (`kisAuth.ts:37-112`):

1. 자격증명을 조회하고 `appKey`/`appSecret`을 `decrypt()`. `isLive`로 `baseUrl` 선택.
2. 캐시된 `accessToken`이 있고 `tokenExpiresAt`가 **만료 30분 전(now + 30분)보다 미래**면 그대로 복호화해 재사용.
3. 아니면 `POST {baseUrl}/oauth2/tokenP` 로 신규 발급. body는 `{ grant_type:'client_credentials', appkey, appsecret }`, `cache:'no-store'`. 발급 직전 `kisRateLimit(userId)`로 레이트리밋 통과.
4. `expires_in` 미제공 시 기본 **86,400초**. 새 토큰을 `encrypt()`해 `accessToken`/`tokenExpiresAt`에 저장.
5. 동일 사용자의 동시 발급은 모듈 스코프 `tokenInFlight` Map으로 dedup → 여러 핸들러가 토큰 없는 상태로 동시에 들어와도 실제 fetch는 1회만 수행.

발급 실패 시 `KIS_TOKEN_ISSUE_FAILED: …` 에러를 던지며, 라우트는 이를 `502`로 변환합니다.

---

## 5. 공통 인프라 — 레이트리밋 · 캐시 · 재시도

> KIS 모듈 공통 패턴: 모든 호출은 `kisRateLimit`로 사용자별 직렬화 + 최소 인터벌(1.1초)을 보장하고, 응답 코드 `EGW00201`(초당 거래건수 초과)이면 `rateLimitBackoff`로 최대 `MAX_RETRIES=2`회 재시도한다. 조회 결과는 `kisCache.cached`로 TTL 캐시 + in-flight dedup된다. 인증 헤더는 `authorization: Bearer …`, `appkey`, `appsecret`, `tr_id`, (일부) `custtype:'P'`.

### 5.1 `app/lib/kisRateLimit.ts`

| export | 동작 |
| --- | --- |
| `isRateLimitedResponse({rt_cd,msg_cd})` | `rt_cd!=='0' && msg_cd==='EGW00201'` |
| `rateLimitBackoff(attempt)` | `1100 + attempt*500` ms 대기(1.1 / 1.6 / 2.1초) |
| `kisRateLimit(userId): Promise<void>` | 사용자별 큐(`queues` Map)로 직렬화, `MIN_INTERVAL_MS=1100` 보장 |

`kisRateLimit`은 사용자별로 이전 요청의 `pending` Promise에 체이닝하고, 직전 요청과의 경과 시간이 1.1초 미만이면 그 차이만큼 `setTimeout` 대기 → 같은 사용자의 KIS 호출이 1초당 1건을 넘지 않도록 강제합니다.

### 5.2 `app/lib/kisCache.ts`

| export | 동작 |
| --- | --- |
| `cached<T>(key, ttlMs, fetcher)` | 유효 캐시 즉시 반환 / 진행 중 동일 요청 piggyback(dedup) / 완료 시 `store`에 저장 |
| `invalidate(prefix)` | `prefix`로 시작하는 키 삭제 |
| `cacheStats()` | `{ size, inflight }` |

`store`(Map) 크기가 200 이상이면 `maybePrune()`로 만료 항목을 lazy 정리. 단일 Node 프로세스 메모리이므로 다중 인스턴스/서버리스 콜드스타트에는 공유되지 않습니다(한계는 §10).

### 5.3 재시도 패턴

각 데이터 모듈의 fetch 루프는 `for (attempt = 0..MAX_RETRIES)` 안에서 `kisRateLimit` → `fetch` → `isRateLimitedResponse` 검사를 돌고, 레이트리밋이면 `rateLimitBackoff(attempt)` 후 재시도합니다(`MAX_RETRIES=2`). 성공/비레이트리밋 응답이면 즉시 break.

---

## 6. 데이터 모듈

함수별 export 시그니처·TR ID·캐시 TTL의 전체 표는 [lib-reference.md](lib-reference.md) "KIS 연동 모듈"에 정리돼 있습니다. 여기서는 역할과 통합 관점만 요약합니다.

### 6.1 `app/lib/kisQuote.ts` — 국내 단일 현재가

- `getKisQuote(userId, symbol): Promise<KisQuote | null>` — TR `FHKST01010100`, 엔드포인트 `domestic-stock/v1/quotations/inquire-price`, `FID_COND_MRKT_DIV_CODE='J'`. 캐시 키 `q:{userId}:{code}`, TTL 10초.
- `normalizeKrCode(symbol)` — `.KS`/`.KQ` 접미 제거. `isKrSymbol(symbol)` — 정규화 후 6자리 숫자 여부.
- 6자리 코드가 아니면 `null`. 가격은 `parseInt`(원화 정수), `currency:'KRW'`.
- **소비처**: `GET /api/holdings/quote` — 한국 심볼이고 KIS 등록 시 `getKisQuote`, 실패 시 `getNaverQuote` fallback(`app/api/holdings/quote/route.ts`, [feature-investing.md](feature-investing.md) 참고).

### 6.2 `app/lib/kisStock.ts` — 국내 개별 종목 상세 13종

공통 헬퍼 `kisGet<T>(userId, pathWithQuery, trId)`로 GET + 재시도 + `cached` 캐싱. 모든 쿼리는 `FID_COND_MRKT_DIV_CODE='J'`. 응답 `rt_cd!=='0'`이면 콘솔 에러 후 `null` 반환. 제공 함수: 호가(`getOrderbook`), 장기시세(`getStockHistory`), 일/주/월봉(`getDailyPrice`), 분봉(`getMinuteBars`), 시간외(`getOvertimePrice`), 종목메타(`getStockMeta`), 안정성/수익성/재무비율(`getStabilityRatio`/`getProfitRatio`/`getFinancialRatio`), 프로그램매매(`getProgramTrade`), 거래원(`getMembers`), 투자의견(`getStockOpinion`), 투자자별(`getInvestor`).
- **소비처**: `app/api/kis/stock/[code]/*` 라우트 13개.

### 6.3 `app/lib/kisMarket.ts` — 시장 단위 데이터 14종

지수 현재가(`getIndices`, 기본 `['0001','1001']`=코스피/코스닥), 업종지수(`getCategoryIndices`), 지수 기간/분봉(`getIndexHistory`/`getIndexMinutes`), 환율 분봉(`getFxMinutes`), 각종 랭킹(거래대금·등락·외국인/기관 순매수·대량체결·예상체결·체결강도), VI 현황(`getViStatus`), 시장별 투자자 동향(`getMarketInvestorDaily`), 시황 뉴스(`getKisNews`). 지수 부호는 `prdy_vrss_sign`(4/5=하락)으로 보정.
- **소비처**: `app/api/kis/{indices,sectors,index-history,index-minutes,fx-minutes,rankings,supply-ranking,bulk-ranking,expected-ranking,power-ranking,vi,market-investors,news}` 라우트 13개.

### 6.4 `app/lib/kisOverseas.ts` — 해외 시세·차트

`getOverseasQuote`/`getOverseasQuotes`(현재가, TTL 30초), `getOverseasMinute`(분봉, TTL 30초, 최대 120건), `getOverseasDaily`(일/주/월봉, TTL 5분, 최대 100건). 소수점 자리수는 응답 `zdiv`(기본 2), 부호 보정은 `sign`(4/5=하락). 분봉 응답은 최신→과거 순이라 `reverse()`로 오름차순화.
- **소비처**: `app/api/kis/overseas`, `app/api/kis/overseas/[exchange]/[symbol]/{daily,minutes}` 라우트 3개.

---

## 7. 라우트 카탈로그 (`app/api/kis/**`)

KIS 라우트는 총 **31개**(자격증명 2 + 시장 13 + 종목상세 13 + 해외 3). 전부 `export const runtime = 'nodejs'`.

**공통 가드 패턴**(데이터 라우트): ① `getServerSession` 세션 검사(없으면 `401`) → ② `prisma.user.findUnique`로 User 조회(없으면 `401`) → ③ `prisma.kisCredential.findUnique`로 등록 확인(**없으면 `412` "KIS 자격증명이 등록되어 있지 않습니다."**) → ④ 데이터 모듈 호출, 외부 호출 실패 시 `catch`에서 `502`. 종목/해외 라우트의 `code`는 `^\d{6}$` 검증(불일치 `400`).

### 7.1 자격증명 / 연결 테스트

| Method | Endpoint | 동작 |
| --- | --- | --- |
| `GET` | `/api/kis/credentials` | 등록 상태 + 마스킹 앱키·계좌·`isLive`·`tokenExpiresAt`·`updatedAt` 반환(실값 비노출). 미등록 시 `{registered:false}` |
| `PUT` | `/api/kis/credentials` | zod 검증 후 `upsert`(암호화 저장). 키 변경 시 `accessToken`/`tokenExpiresAt`를 `null`로 무효화 |
| `DELETE` | `/api/kis/credentials` | `deleteMany({where:{userId}})` |
| `POST` | `/api/kis/test` | 입력 `{appKey,appSecret,isLive?}`로 `testKisCredentials()` 토큰 발급 테스트. 성공 `{ok:true}`, 실패 `400 {ok:false,message}` |

`PUT` zod 스키마(`app/api/kis/credentials/route.ts:20-40`): `appKey`(1~200), `appSecret`(1~500), `accountNumber`(`^\d{8}$`), `accountProductCode?`(`^\d{2}$`, 기본 `'01'`), `isLive?`(기본 `true`). `.strict()`.

### 7.2 국내 시장 데이터 (주요 Query)

`/api/kis/rankings`(`type=value|volume|rise|fall`, `limit≤50`), `/api/kis/bulk-ranking`·`/api/kis/power-ranking`(`limit≤30`), `/api/kis/expected-ranking`(`type=rise|fall`), `/api/kis/supply-ranking`(`side=foreign|inst`), `/api/kis/indices`(`codes=0001,1001`), `/api/kis/index-history`(`code`, `period=D|W|M|Y`), `/api/kis/index-minutes`(`code`, `gap∈{30,60,600,3600}` 기본 60), `/api/kis/sectors`·`/api/kis/market-investors`(`market=KOSPI|KOSDAQ`), `/api/kis/vi`(`market=ALL|KOSPI|KOSDAQ`, `limit≤50`), `/api/kis/news`(`limit≤100`), `/api/kis/fx-minutes`(`base=USD|JPY|EUR|CNY|HKD`).

`fx-minutes`는 `FX_SYMBOLS` 매핑(`app/api/kis/fx-minutes/route.ts:11-17`)으로 통화→KIS 심볼을 변환: `USD→{div:'KX',symbol:'FX@KRW'}`, `JPY→FX@JPY`, `EUR→FX@EUR`, `CNY→FX@CNY`, `HKD→FX@HKD`. 매핑에 없는 통화는 `400 지원하지 않는 통화`.

### 7.3 국내 종목 상세 `/api/kis/stock/[code]/*`

`daily`(`period=D|W|M`), `history`(`period=D|W|M|Y`), `minutes`(`hour?` 기준시각), `meta`, `orderbook`, `investor`, `members`, `program`, `overtime`, `opinion`, `financial`, `profit`, `stability`. 전부 `code` `^\d{6}$` 검증.

### 7.4 해외 `/api/kis/overseas`

| Endpoint | 주요 Query |
| --- | --- |
| `/api/kis/overseas` | `pairs=NAS:COMP,NYS:SPX`(콤마 구분, `EXCHANGE:SYMBOL`, 최대 10쌍). `pairs` 없으면 `400` |
| `/api/kis/overseas/[exchange]/[symbol]/daily` | `period=D|W|M` |
| `/api/kis/overseas/[exchange]/[symbol]/minutes` | `gap=1~60`(기본 1) |

전체 라우트 표·응답 형태는 [api-reference.md](api-reference.md) §12 참고.

---

## 8. 비-KIS 외부 데이터

시장 화면이 함께 쓰는 KIS 외 외부 소스입니다.

### 8.1 환율 — Frankfurter

| 라우트 | Auth | 설명 |
| --- | --- | --- |
| `GET /api/exchange-rates` | 없음 | USD/JPY → KRW 현재 환율. `api.frankfurter.app/latest`, `export const revalidate = 1800`(30분), 응답 `{usdKrw, jpyKrw, updatedAt}` |
| `GET /api/fx-history` | 없음 | `base`(기본 USD)·`target`(기본 KRW)·`days`(7~730, 기본 180) 일별 시계열. `api.frankfurter.dev/v1/{from}..{to}`, `revalidate:600`. 환율엔 캔들이 없으므로 `open=이전 close, high/low=두 값의 max/min`로 **가짜 캔들** 변환. 실패 `502` |

두 라우트는 인증 불필요한 공개 프록시이며 KIS와 무관합니다.

### 8.2 공시 — Naver(DART 원천)

- `GET /api/disclosure/[code]` — **로그인 필요**, `code` `^\d{6}$`, `limit=1~50`(기본 30). `getNaverDisclosures(code, limit)` 호출, 외부 실패 `502`.
- `app/lib/naverDisclosure.ts` — DART corp_code 매핑 복잡성을 우회해 네이버 금융 비공식 엔드포인트(`m.stock.naver.com/api/stock/{code}/disclosure`)를 조회(`next: { revalidate: 600 }`). API 키 없음. `filingDate`(YYYYMMDD)+`filingTime`(HHMMSS)을 ISO로 합치고, `rcpNo`가 있으면 원문 링크 `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=…` 생성. 실패 시 빈 배열.

### 8.3 네이버 금융 시세 — `app/lib/naverFinance.ts`

KIS를 등록하지 않은 사용자(또는 글로벌 종목)를 위한 비공식 어댑터. `searchSymbols(query)`(autoComplete, `category==='stock'`만, 최대 15)와 `getQuote(symbol)`(모바일/일반 호스트 순차 시도). **소비처는 KIS 시장 화면이 아니라 보유종목 기능**: `GET /api/holdings/search`(검색), `GET /api/holdings/quote`(KIS 실패 시 fallback 시세). 상세는 [feature-investing.md](feature-investing.md).

---

## 9. 프론트엔드 페이지

모든 페이지는 `export const runtime = 'nodejs'`(서버 컴포넌트가 얇은 래퍼, 실제 로직은 클라이언트 컴포넌트).

### 9.1 `/ledger/kis-settings` — 자격증명 설정

`app/ledger/kis-settings/page.tsx` → `KisSettingsClient.tsx`. 동작:

- 마운트 시 `GET /api/kis/credentials`(`cache:'no-store'`)로 등록 상태·마스킹 키·계좌·`isLive` 로드.
- 입력 폼: `appKey`, `appSecret`(표시 토글 `showSecret`), `accountNumber`(8자리), `accountProductCode`(2자리, 기본 `01`), `isLive` 토글.
- "연결 테스트": `POST /api/kis/test`로 토큰 발급만 검증.
- 저장: 클라이언트에서 `^\d{8}$`/`^\d{2}$` 선검증 후 `PUT /api/kis/credentials`.
- 삭제: `DELETE /api/kis/credentials`.

### 9.2 `/ledger/market` — 시장 대시보드

`app/ledger/market/page.tsx` → `MarketClient.tsx`. KIS 등록 여부를 `GET /api/kis/credentials`로 확인하고, 지수(`/api/kis/indices`)·랭킹(`/api/kis/rankings`)·뉴스(`/api/kis/news`)·업종(`/api/kis/sectors`)·VI(`/api/kis/vi`)·투자자(`/api/kis/market-investors`)·체결강도/예상체결/대량체결/순매수 랭킹·해외 지수(`/api/kis/overseas`)와 환율(`/api/exchange-rates`)을 조합해 표시. 상세 모달 컴포넌트: `StockDetailModal`·`OverseasDetailModal`·`IndexDetailModal`·`FxDetailModal`(차트는 `CandleChart`, 비중은 `DonutChart`), 검색은 `StockSearchBox`.

### 9.3 종목/해외 상세 · 비교 페이지

| 경로 | 컴포넌트 |
| --- | --- |
| `/ledger/market/stock/[code]` | `StockDetailPageClient` — 국내 종목 상세(호가·차트·투자자·재무 등 `/api/kis/stock/[code]/*` 소비) |
| `/ledger/market/overseas/[exchange]/[symbol]` | `OverseasDetailPageClient` — 해외 종목 상세 |
| `/ledger/market/compare` | `CompareClient` — 종목 비교 |

`market`/`stocks`/`kis-settings` 페이지는 별도 사이드바 키 없이 모두 `/ledger` 하위 경로라 **`ledger` 메뉴 권한으로 함께 게이트**됩니다. 메뉴 권한 체계와 enforcement는 [auth-permissions.md](auth-permissions.md) · [features.md](features.md) 참고.

---

## 10. 보안 · 운영 주의 · 한계

- **비밀값 비노출**: 응답 어디에도 `appSecret`/`accessToken` 평문이 나가지 않으며, `appKey`는 `maskSecret`로만 표시됩니다. DB 저장값도 전부 암호문입니다.
- **키 변경 시 토큰 무효화**: `PUT`으로 키를 갱신하면 캐시 토큰을 `null`로 비워 다음 호출에서 재발급하도록 합니다.
- **레이트리밋은 in-process**: `kisRateLimit`·`kisCache`·`tokenInFlight`는 모두 단일 Node 프로세스 메모리 기반입니다. 다중 인스턴스/수평 확장 또는 서버리스 다중 람다 환경에서는 사용자별 1 req/sec 보장이 깨질 수 있어, 운영 확장 시 Redis 등 공유 저장소로 이전이 필요합니다(코드 주석에도 "Redis 도입 전 quick win"으로 명시).
- **모의투자 한계**: `isLive=false`(모의)는 일부 TR이 미지원이거나 데이터가 제한적일 수 있습니다.
- **외부 의존성**: 환율(Frankfurter)·공시/시세(Naver 비공식)는 서드파티 엔드포인트로, 스펙 변경 시 깨질 수 있고 실패는 `502`/빈 배열로 graceful 처리됩니다.
- **암호화 키 운영**: `KIS_ENCRYPTION_KEY` 미설정 시 `NEXTAUTH_SECRET`을 키로 사용하므로, `NEXTAUTH_SECRET`을 교체하면 기존 KIS 암호문을 복호화할 수 없습니다(재등록 필요). 운영에서는 `KIS_ENCRYPTION_KEY`를 별도 고정 권장.

---

관련 문서: [lib-reference.md](lib-reference.md) · [api-reference.md](api-reference.md) · [database.md](database.md) · [env-and-security.md](env-and-security.md) · [feature-investing.md](feature-investing.md) · [README.md](README.md)
