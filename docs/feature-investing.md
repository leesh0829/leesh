# 투자 기능 (보유종목 · 포트폴리오 · 관심종목 · 알림)

`Leesh`의 투자 도메인은 가계부(ledger)에 부속된 기능으로, **보유 종목/거래 기록**(`Holding`/`HoldingTransaction`)을 중심으로 시세 조회·평가손익 집계·가계부 자동 연동·포트폴리오 분석·관심종목(`Watchlist`)·종목 메모(`StockNote`)·가격 알람(`StockAlarm`)을 제공합니다. 시세는 네이버 금융(비공식) 또는 한국투자증권(KIS) Open API에서 가져오며, 손익은 가중 평균 원가 방식으로 계산합니다.

> 작성 기준: 2026-06-24, dev 브랜치

관련 문서: [database.md](database.md) · [api-reference.md](api-reference.md) · [auth-permissions.md](auth-permissions.md) · [lib-reference.md](lib-reference.md) · [frontend-and-ui.md](frontend-and-ui.md) · [env-and-security.md](env-and-security.md) · [feature-productivity.md](feature-productivity.md) · [feature-content.md](feature-content.md)

---

## 1. 개요

핵심 모델은 `Holding`(보유 종목) / `HoldingTransaction`(거래) 두 가지이며, 보조 모델로 `Watchlist`(관심종목) / `StockNote`(종목 메모) / `StockAlarm`(가격 알람) / `KisCredential`(KIS 자격증명)이 있습니다. 보유 종목은 가계부 계좌(`FinancialAccount`)와 거래 항목(`LedgerEntry`)에 연결될 수 있습니다.

| 기능 | 프론트 페이지 | 주요 API | 데이터 |
|---|---|---|---|
| 보유 종목 관리 | `app/ledger/stocks` | `/api/holdings`, `/api/holdings/[holdingId]` | `Holding`, `HoldingTransaction` |
| 거래 기록(매수/매도/배당/수수료/세금) | 종목 상세 패널 | `/api/holdings/[holdingId]/transactions(/[txId])` | `HoldingTransaction`, `LedgerEntry` |
| 시세 조회·검색 | 위 페이지 + 시장 모달 | `/api/holdings/quote`, `/api/holdings/search`, `/api/holdings/trades` | Naver/KIS 외부 |
| 포트폴리오 분석 | `app/ledger/stocks/portfolio` | `/api/holdings`, `/api/exchange-rates` | `Holding`(집계) |
| 관심종목 | `app/ledger/market/*` 모달 | `/api/watchlist` | `Watchlist` |
| 종목 메모 | `app/ledger/market/StockDetailModal` | `/api/stock-note` | `StockNote` |
| 가격 알람 | `app/ledger/market/*` | `/api/stock-alarm`, `/api/stock-alarm/[id]` | `StockAlarm` |

모든 API는 `runtime = "nodejs"`이며 세션 인증(`getServerSession(authOptions)` → email로 `User` 조회)을 요구합니다. 날짜는 `holdings` 계열에서 `toISOStringSafe()`로 ISO 문자열화됩니다(`app/lib/date.ts:1`). KIS 연동 라우트(`/api/kis/...`) 자체는 본 문서 범위 밖이며 [api-reference.md](api-reference.md) "12) 투자 — KIS 연동" 표를 참조하세요. 시세 조회만 KIS를 사용합니다(5장).

---

## 2. 데이터 모델

전체 스키마·인덱스는 [database.md](database.md) "9. 투자 도메인" / "10. KIS 연동 도메인" 참조. 여기서는 투자 기능이 직접 쓰는 필드만 정리합니다.

### 2.1 Holding — `prisma/schema.prisma:310`

| 필드 | 타입 | 기본값/비고 |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `ownerId` / `owner` | `String` / `User` | 관계 `"HoldingOwner"`, `onDelete: Cascade` |
| `accountId` / `account` | `String?` / `FinancialAccount?` | 관계 `"HoldingAccount"`, `onDelete: SetNull` |
| `name` | `String` | 종목 표시 이름 |
| `symbol` | `String?` | 시세 조회용 심볼(예: `005930`, `AAPL.O`) |
| `exchange` | `String?` | 거래소 표시 |
| `currency` | `String` | `@default("KRW")` |
| `memo` | `String?` | |
| `currentPrice` | `Float?` | 마지막으로 저장된 현재가 |
| `priceUpdatedAt` | `DateTime?` | 현재가 갱신 시각 |
| `transactions` | `HoldingTransaction[]` | |
| `createdAt` / `updatedAt` | `DateTime` | |
| 인덱스 | `@@index([ownerId])`, `@@index([accountId])` | |

### 2.2 HoldingTransaction — `prisma/schema.prisma:336`

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `holdingId` / `holding` | `String` / `Holding` | `onDelete: Cascade` |
| `type` | `HoldingTransactionType` | `BUY`/`SELL`/`DIVIDEND`/`FEE`/`TAX` |
| `quantity` | `Float?` | BUY/SELL에서만 사용(소수점 수량 허용) |
| `pricePerUnit` | `Float?` | BUY/SELL 단가 |
| `amount` | `Float` | 결제/금액(BUY/SELL은 `qty*price` 또는 명시 결제금, 나머지는 입력 금액) |
| `occurredAt` | `DateTime @default(now())` | 거래 시각 |
| `memo` | `String?` | |
| `ledgerEntryId` / `ledgerEntry` | `String? @unique` / `LedgerEntry?` | 관계 `"HoldingTxLedger"`, `onDelete: SetNull` — 가계부 연동 항목 |
| `createdAt` / `updatedAt` | `DateTime` | |
| 인덱스 | `@@index([holdingId, occurredAt])` | |

> ⚠️ Prisma enum 이름은 **`HoldingTransactionType`**(`prisma/schema.prisma:302`)입니다. 라우트의 zod 스키마는 동일 값 집합을 `z.enum(['BUY','SELL','DIVIDEND','FEE','TAX'])`로, 집계 라이브러리는 TS 타입 별칭 `HoldingTxType`(`app/lib/holdingAggregate.ts:1`)으로 다룹니다.

### 2.3 Watchlist — `prisma/schema.prisma:396`

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `userId` / `user` | `String` / `User` | 관계 `"WatchlistOwner"`, `onDelete: Cascade` |
| `market` | `String` | `"KR"`(국내) / 해외 EXCD(`NAS`, `NYS`, `AMS`, `TYO` 등) |
| `symbol` | `String` | KR이면 6자리, 해외면 티커 |
| `name` | `String` | |
| `position` | `Int @default(0)` | 정렬 순서 |
| `createdAt` | `DateTime` | |
| 제약 | `@@unique([userId, market, symbol])`, `@@index([userId, position])` | |

### 2.4 StockNote — `prisma/schema.prisma:415`

`id`, `userId`/`user`(`"StockNoteOwner"`, Cascade), `market`, `symbol`, `note`(`String @db.Text`), `createdAt`/`updatedAt`. 제약 `@@unique([userId, market, symbol])` — 사용자·종목당 메모 1행.

### 2.5 StockAlarm — `prisma/schema.prisma:437`

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `userId` / `user` | `String` / `User` | 관계 `"StockAlarmOwner"`, `onDelete: Cascade` |
| `market` / `symbol` / `name` | `String` | |
| `target` | `Float` | 도달 목표가 |
| `direction` | `AlarmDirection` | `ABOVE`(이상) / `BELOW`(이하) — `prisma/schema.prisma:432` |
| `enabled` | `Boolean @default(true)` | |
| `triggeredAt` | `DateTime?` | 도달 알림이 울린 시각(미도달이면 null) |
| `createdAt` | `DateTime` | |
| 인덱스 | `@@index([userId, enabled])` | |

### 2.6 KisCredential — `prisma/schema.prisma:259`

사용자당 1개(`userId @unique`)의 한국투자증권 API 자격증명. `appKey`/`appSecret`/`accessToken`은 **AES-256-GCM 암호화 문자열**로 저장됩니다(스키마 주석 `:257`). `accountNumber`(CANO 앞 8자리), `accountProductCode @default("01")`, `isLive @default(true)`, `accessToken?`/`tokenExpiresAt?`. 시세 라우트는 이 자격증명 존재 여부만 확인하고(5.2), 실제 KIS 인증 컨텍스트는 `app/lib/kisAuth.ts`에서 해독·토큰 관리합니다([env-and-security.md](env-and-security.md) 참조).

관련 enum: `HoldingTransactionType { BUY, SELL, DIVIDEND, FEE, TAX }`(`:302`), `AlarmDirection { ABOVE, BELOW }`(`:432`), `ScheduleShareScope`의 `STOCK`(투자 공유 범위, `:195`).

---

## 3. 손익 집계 — `app/lib/holdingAggregate.ts`

거래 리스트를 **가중 평균 원가(weighted average cost)** 방식으로 집계합니다. 클라이언트가 아니라 서버 라우트(`/api/holdings`, `/api/holdings/[holdingId]`)에서 호출되어 응답에 `aggregate`로 포함됩니다.

### `aggregateHolding(txs, currentPrice = null)` — `app/lib/holdingAggregate.ts:26`

거래를 `occurredAt` 오름차순으로 정렬한 뒤 순회하며 집계합니다.

- `BUY`: `quantity += qty`, `costBasis += qty*price`, `totalInvested += qty*price`.
- `SELL`: 보유 수량 한도 내(`Math.min(qty, quantity)`)에서 평단(`costBasis/quantity`) 기준으로 `realizedPnL += proceeds - removedCost`, `costBasis`/`quantity` 차감.
- `DIVIDEND`/`FEE`/`TAX`: 각각 `dividendTotal`/`feeTotal`/`taxTotal`에 `amount` 누적(수량 변동 없음).

반환 `HoldingAggregate`(`:11`):

| 필드 | 의미 |
|---|---|
| `quantity` | 현재 보유 수량 |
| `avgCost` | 평단가(`quantity>0`이면 `costBasis/quantity`, 아니면 0) |
| `costBasis` | 현재 보유분 원가 합 |
| `totalInvested` | 누적 매수 원가(매도해도 감소 안 함) |
| `realizedPnL` | 실현 손익 |
| `dividendTotal` / `feeTotal` / `taxTotal` | 배당/수수료/세금 누적 |
| `marketValue` | `currentPrice && quantity>0`이면 `quantity*currentPrice`, 아니면 `null` |
| `unrealizedPnL` | `marketValue!=null`이면 `marketValue - costBasis`, 아니면 `null` |
| `totalReturn` | `unrealizedPnL!=null`이면 `realizedPnL + unrealizedPnL + dividendTotal - feeTotal - taxTotal`, 아니면 `null` |

### `avgCostBeforeTx(txs, targetTxIdx)` — `app/lib/holdingAggregate.ts:106`

특정 `SELL` 트랜잭션 **직전까지** 누적된 평단가를 계산합니다. 가계부 자동 연동(4장)에서 매도 실현손익을 산출할 때 사용합니다.

---

## 4. 가계부 자동 연동 — `app/lib/holdingLedgerSync.ts`

거래 생성/수정 시 `linkToLedger`가 켜져 있으면 대응하는 가계부 항목(`LedgerEntry`)을 1:1로 만들고, `HoldingTransaction.ledgerEntryId`에 연결합니다.

### `syncTransactionToLedger(ctx, link, existingLedgerEntryId)` — `app/lib/holdingLedgerSync.ts:126`

1. 기존 연결된 `ledgerEntry`가 있으면 먼저 `deleteMany({ id, ownerId })`로 삭제(재계산 전 정리).
2. `link === false`면 `null` 반환(연동 해제).
3. `deriveLedgerPayload(ctx)`(`:20`)로 가계부 항목 페이로드 계산. `null`이면 미생성.
4. 종목에 지정된 계좌(`holding.accountId`)가 있으면 그 계좌로 `LedgerEntry` 생성, 생성된 id 반환.

### 거래 유형별 가계부 매핑 — `deriveLedgerPayload` (`:20`)

| 거래 유형 | 가계부 type | category / subcategory | 설명 |
|---|---|---|---|
| `BUY` | (없음) | — | 자산 이동으로 보고 **연동 안 함**(`return null`) |
| `SELL` | `INCOME` 또는 `EXPENSE` | `주식/이자` / `투자 수익(실현손익)` 또는 `투자 손실(실현손익)` | `avgCostBeforeTx` 평단 기준 실현손익. 절댓값이 0.005 미만이거나 KRW 환산 0이면 미생성 |
| `DIVIDEND` | `INCOME` | `주식/이자` / `배당금` | `{종목명} 배당금` |
| `FEE` | `EXPENSE` | `주식/이자` / `거래 수수료` | `{종목명} 거래 수수료` |
| `TAX` | `EXPENSE` | `주식/이자` / `세금` | `{종목명} 세금` |

- 메모가 있으면 description 끝에 ` · {메모}`를 덧붙입니다(`memoSuffix`).
- **비-KRW 종목**은 `toKrw(nativeAmount, currency)`로 현재 환율 기준 KRW 환산 후 기록하며, 환산 금액은 최소 1원으로 보정(`Math.max(1, krw)`)합니다(SELL 손익 제외).
- 생성되는 `LedgerEntry`는 `excludeFromTotals: false`, `occurredAt = ctx.occurredAt`.

### 환율 — `app/lib/fxRate.ts`

| 함수 | 동작 | 인용 |
|---|---|---|
| `getKrwRate(fromCurrency)` | `KRW`면 1, 아니면 Frankfurter API(`https://api.frankfurter.app/latest?from=...&to=KRW`)에서 환율 조회. **서버 메모리 30분 캐시**(`TTL_MS`), 실패 시 캐시값 또는 1로 폴백 | `app/lib/fxRate.ts:9` |
| `toKrw(amount, fromCurrency)` | 금액 × 환율 → 정수 반올림(`Math.round`) | `:36` |

> Frankfurter는 공개 API(키 불필요)이며 `fetch`에 `next: { revalidate: 1800 }`을 함께 지정합니다. 포트폴리오 페이지·시장 화면이 쓰는 `/api/exchange-rates`는 별도 라우트로 USD/JPY→KRW 환율을 내려줍니다(본 문서 범위 밖, 9장 참조).

---

## 5. 시세 조회 / 종목 검색

### 5.1 `GET /api/holdings/search?q=...` — `app/api/holdings/search/route.ts:8`

- 인증 필수(401). `q` 없으면 `{ items: [] }`.
- `searchSymbols(q)`(`app/lib/naverFinance.ts:54`)로 **네이버 금융 autocomplete** 비공식 API를 호출, `category === 'stock'`이고 `reutersCode`가 있는 항목만 최대 15개 반환. 실패 시 502.
- 각 항목: `{ symbol(=reutersCode), name, exchange, type, currency }`. `currency`는 `nationCode`로 매핑(`KOR→KRW`, `USA→USD`, `JPN→JPY`, ...).

### 5.2 `GET /api/holdings/quote` — `app/api/holdings/quote/route.ts:50`

- 인증 필수(401). 쿼리: `symbol`(단일) **또는** `symbols`(콤마 구분 배치, 최대 30개). 둘 다 없으면 400.
- **KIS 우선, Naver 폴백**(`fetchOneQuote` `:29`): 사용자가 `KisCredential`을 등록했고(`userHasKis` `:20`) 심볼이 한국 6자리 코드면(`isKrSymbol`) `getKisQuote(userId, symbol)`(`app/lib/kisQuote.ts:50`)를 시도하고, 응답이 비거나 예외면 `getNaverQuote(symbol)`(`app/lib/naverFinance.ts:129`)로 폴백합니다.
- 단일 실패 시 502. 배치는 실패 항목을 `{ symbol, price: null, ... }` 자리표시자로 채워 `{ items: [...] }` 반환.
- KIS 시세는 10초 TTL 캐시(`kisQuote.ts:10` `QUOTE_TTL`), 레이트리밋·재시도(`MAX_RETRIES=2`) 처리. 네이버 시세는 모바일/해외 두 엔드포인트를 순차 시도(`naverFinance.ts:120`)하며 Yahoo 형식(`.KS`/`.KQ`)을 reutersCode로 변환합니다.

`Quote`/`KisQuote` 공통 형태: `{ symbol, price, prevClose, currency, exchange, name, marketTime }`.

### 5.3 `GET /api/holdings/trades?symbol=...` — `app/api/holdings/trades/route.ts:10`

- 인증 필수(401). `symbol` 없으면 400.
- 본인 소유 `Holding` 중 동일 `symbol`(여러 계좌 가능)의 `BUY`/`SELL` 거래를 `occurredAt` 오름차순으로 모아 차트 마커용으로 반환. 항목: `{ id, type, quantity, unitPrice(=pricePerUnit), date(YYYYMMDD) }`. 보유 없으면 `{ items: [] }`, 오류 502.

---

## 6. API — 보유 종목 (`/api/holdings`, `/api/holdings/[holdingId]`)

### 6.1 `GET /api/holdings` — `app/api/holdings/route.ts:77`

- 인증 필수(401).
- **조회 범위**: `getReadableScheduleOwnerIds(user.id, 'STOCK')`(`:82`)로 [내 id + `ScheduleShare(scope=STOCK, ACCEPTED)` 소유자 id]를 구합니다([feature-productivity.md](feature-productivity.md) 8장).
- 쿼리 `excludeOwners`(콤마 구분 ownerId)가 있으면 해당 소유자를 제외(`effectiveOwnerIds`).
- `Holding(ownerId in ...)`을 최신순 조회, 각 보유의 모든 거래로 `aggregateHolding`을 계산해 `aggregate`로 포함.
- **응답** `{ items: [...] }`. 각 항목: `id`, `ownerId`, `ownerLabel`(`toUserLabel`), `shared`(`ownerId !== user.id`), `canEdit`(`ownerId === user.id`), `accountId`/`accountName`/`accountBank`/`accountTypes`, `name`, `symbol`, `exchange`, `currency`, `memo`, `currentPrice`, `priceUpdatedAt`(ISO|null), `createdAt`/`updatedAt`(ISO), `aggregate`, `txCount`.

### 6.2 `POST /api/holdings` — `app/api/holdings/route.ts:170`

- 인증 필수. 바디 zod `holdingCreateSchema`(`.strict()`, `:13`): `name`(필수, trim, 최대 60), `symbol?`/`exchange?`/`memo?`/`accountId?`(빈값→null), `currency?`(기본 `KRW`), `currentPrice?`(0~2조).
- `accountId`가 있으면 **본인 소유 `FinancialAccount`인지 검증**(아니면 400 `유효하지 않은 계좌입니다.`).
- `currentPrice`가 있으면 `priceUpdatedAt = now()`. 응답 `{ id }`.

### 6.3 `GET /api/holdings/[holdingId]` — `app/api/holdings/[holdingId]/route.ts:61`

- 인증 필수. 종목 없으면 404. `getReadableScheduleOwnerIds(...,'STOCK')`에 `ownerId`가 없으면 403(공유 안 된 타인 종목).
- 응답: 6.1 항목 형태 + `transactions`(거래 목록, `occurredAt` 내림차순). 각 거래: `{ id, type, quantity, pricePerUnit, amount, occurredAt(ISO), memo, linked(=!!ledgerEntryId), createdAt, updatedAt }`.

### 6.4 `PATCH /api/holdings/[holdingId]` — `:161`

- 인증 필수. 종목 없으면 404, `ownerId !== user.id`면 403(**소유자만 수정**).
- 바디 zod `holdingPatchSchema`(`.strict()`, `:13`, 부분 갱신): `name?`/`symbol?`/`exchange?`/`currency?`/`memo?`/`currentPrice?`/`accountId?`. `accountId` 지정 시 본인 소유 검증(400). `currentPrice`가 `null`이 아니면 `priceUpdatedAt = now()`, `null`이면 `priceUpdatedAt = null`.
- 응답 `{ ok: true }`.

### 6.5 `DELETE /api/holdings/[holdingId]` — `:226`

- 인증 필수. 없으면 404, 소유자 아니면 403.
- **연동 정리**: 이 종목 거래 중 `ledgerEntryId`가 있는 것들의 `LedgerEntry`를 먼저 `deleteMany({ id in ..., ownerId })`로 삭제한 뒤, `Holding`을 삭제합니다(거래는 `onDelete: Cascade`로 함께 삭제). 응답 `{ ok: true }`.

---

## 7. API — 거래 (`/api/holdings/[holdingId]/transactions(/[txId])`)

### 7.1 `POST .../transactions` — `app/api/holdings/[holdingId]/transactions/route.ts:49`

- 인증 + **소유자 전용**(종목 없으면 404, `ownerId !== user.id`면 403).
- 바디 zod `txCreateSchema`(`.strict()`, `:11`): `type`(필수, 5종 enum), `quantity?`/`pricePerUnit?`(0~상한), `amount?`, `occurredAt?`(ISO 문자열|빈값|null, 유효 날짜 검증), `memo?`, `linkToLedger?`(기본 `false`).
- **금액 규칙**:
  - `BUY`/`SELL`: `quantity > 0` 및 `pricePerUnit >= 0` 필수(아니면 400 `수량과 단가를 입력해 주세요.`). `amount`는 클라이언트가 `> 0`으로 명시하면 그 값(소수점매수/매도 실제 결제금 보존), 아니면 `quantity * pricePerUnit`.
  - `DIVIDEND`/`FEE`/`TAX`: `amount > 0` 필수(아니면 400 `금액을 입력해 주세요.`).
- `occurredAt` 미지정/빈값이면 `now()`.
- 거래 생성 후 `syncTransactionToLedger(ctx, linkToLedger, null)`(4장)로 가계부 연동, 생성된 `ledgerEntryId`를 거래에 기록. 응답 `{ id, ledgerEntryId }`.

### 7.2 `PATCH .../transactions/[txId]` — `app/api/holdings/[holdingId]/transactions/[txId]/route.ts:49`

- 인증. 거래 없거나 `holdingId` 불일치면 404, 종목 소유자 아니면 403.
- 바디 zod `txPatchSchema`(`.strict()`, `:11`, 부분 갱신): 미지정 필드는 기존값 유지. BUY/SELL은 `quantity`/`pricePerUnit`이 `null`이면 400. `amount`를 `> 0`으로 명시하면 우선, 아니면 `qty*price`.
- **가계부 재동기화**: `linkToLedger`가 명시되면 그 값, 아니면 기존 연결 유무(`!!existing.ledgerEntryId`)를 유지하며 `syncTransactionToLedger`로 기존 항목을 삭제·재생성하고 새 `ledgerEntryId`로 갱신. 응답 `{ ok: true, ledgerEntryId }`.

### 7.3 `DELETE .../transactions/[txId]` — `:160`

- 인증 + 소유자 검사(404/403). 연결된 `LedgerEntry`가 있으면 `deleteMany({ id, ownerId })`로 먼저 삭제, 거래 삭제 후 `{ ok: true }`.

---

## 8. API — 관심종목 / 메모 / 알람

이 세 모델은 `Holding`과 달리 **공유(STOCK scope) 대상이 아니며** 항상 본인(`userId`) 데이터만 다룹니다. 키는 `(userId, market, symbol)`로 식별합니다.

### 8.1 관심종목 `/api/watchlist` — `app/api/watchlist/route.ts`

| 메서드 | 라인 | 동작 |
|---|---|---|
| `GET` | `:18` | 본인 관심종목 전체. 정렬 `position asc, createdAt asc`. `{ items }` |
| `POST` | `:29` | `{ market, symbol, name }`(전부 필수, 빈값 400). `upsert(userId_market_symbol)` — 신규는 `position = (마지막 position) + 1`, 기존은 `name`만 갱신. `{ item }`. 오류 500 |
| `DELETE` | `:69` | 쿼리 `?market=&symbol=`(없으면 400). `deleteMany({ userId, market, symbol })` → `{ ok: true }` |

### 8.2 종목 메모 `/api/stock-note` — `app/api/stock-note/route.ts`

| 메서드 | 라인 | 동작 |
|---|---|---|
| `GET` | `:18` | 쿼리 `?market=&symbol=`(없으면 400). `findUnique(userId_market_symbol)` → `{ note }`(없으면 null) |
| `PUT` | `:33` | 바디 `{ market, symbol, note }`. `note.trim()`이 비면 `deleteMany`로 삭제 후 `{ note: null }`, 있으면 `upsert` → `{ note }`. 오류 500 |

> `stock-note`/`watchlist`/`stock-alarm`은 zod 대신 `await req.json()` 후 수동 검증합니다([api-reference.md](api-reference.md) §1 참조).

### 8.3 가격 알람 `/api/stock-alarm`, `/api/stock-alarm/[id]`

| 메서드 · 경로 | 라인 | 동작 |
|---|---|---|
| `GET /api/stock-alarm` | `route.ts:19` | 본인 알람 목록(최신순). `?market=&symbol=`로 선택 필터 |
| `POST /api/stock-alarm` | `route.ts:36` | `{ market, symbol, name?, target(>0), direction }`. `direction`은 `'BELOW'` 외 전부 `ABOVE`로 정규화. 잘못된 입력 400, 오류 500. `{ item }` |
| `PATCH /api/stock-alarm/[id]` | `[id]/route.ts:18` | 소유자만(타인/없음 404). `{ enabled?, triggered? }` — `triggered:true → triggeredAt=now()`, `false → null`. `{ item }` |
| `DELETE /api/stock-alarm/[id]` | `[id]/route.ts:41` | 소유자만(404). 삭제 후 `{ ok: true }` |

**알람 도달 판정은 클라이언트 측**입니다. 시장 화면(`app/ledger/market/MarketClient.tsx:579`)이 주기적으로 활성·미트리거 알람을 불러와 `/api/holdings/quote`로 현재가를 조회하고, `ABOVE && price>=target` 또는 `BELOW && price<=target`이면 토스트를 띄운 뒤 `PATCH .../[id]` 로 `triggered:true`를 기록합니다. 서버 측 푸시/크론은 없습니다.

---

## 9. 프론트엔드 페이지

### 9.1 보유 종목 — `app/ledger/stocks` → `StocksClient`

- `app/ledger/stocks/page.tsx:4`(서버, `runtime='nodejs'`) → `app/ledger/stocks/StocksClient.tsx`(클라이언트, 약 2,950줄, `export default` `:304`).
- **상단**: 시장 개장 상태 칩 `MarketStatus`(`app/ledger/stocks/MarketStatus.tsx`) — 국장(KRX)/미장(NYSE·NASDAQ)의 개장/동시호가/시간외/휴장 상태를 타임존·공휴일(`korean-holidays` + 내장 미국 공휴일)로 계산하고, 국장 휴장 시 다음 거래일을 안내. 30초마다 리렌더.
- **종목 추가 폼**: 이름/심볼/거래소/통화/메모/계좌. 심볼은 `/api/holdings/search`로 디바운스(300ms) 자동완성(`:439`), 선택 시 통화·거래소 자동 채움. 생성 직후 심볼이 있으면 `/api/holdings/quote`로 시세 1회 조회 후 `PATCH`로 `currentPrice` 반영(`:682`). 계좌 드롭다운은 `/api/accounts` 중 타입이 `STOCK`/`ISA`/`PENSION`인 계좌만 노출(`:485`).
- **목록/집계**: `/api/holdings`(필요 시 `excludeOwners`)로 로드(`:383`). 통화별 환산은 `/api/exchange-rates`로 보강. 종목 행을 펼치면 `/api/holdings/[holdingId]`로 상세(거래 목록·평가손익) 로드.
- **시세 갱신**: 개별(`refreshSingle`)·일괄(`refreshAll` `:784`) 새로고침은 본인 소유 + 심볼 있는 종목만 대상으로 `quote → PATCH currentPrice`. **자동 새로고침**(기본 on)은 탭이 보이는 동안 15초마다 조용히 일괄 갱신(`:824`).
- **거래 기록**: 상세 패널에서 매수/매도/배당/수수료/세금 추가(`createTx` `:876`). BUY/SELL은 "수량+단가" 또는 "금액+단가(소수점매수/매도, 수량 자동계산)" 두 입력 모드 지원. `linkToLedger` 토글로 가계부 연동 여부 선택. 인라인 수정/삭제 지원.
- **공유 패널**: `/api/schedule-shares`로 `scope='STOCK'` 요청/승인/거절/해제(`:538`, `:578`, `:602`, `:627`). 소유자별 파스텔 색(`getPastelColor`, FNV 해시 `:140`)과 표시 토글(`visibleOwners` → `excludeOwners`).
- **시장 상세 모달 내장**: 종목 행에서 국내 종목은 `StockDetailModal`, 해외 종목은 `OverseasDetailModal`(둘 다 `app/ledger/market/`)을 열어 차트·관심종목·메모·알람을 다룹니다(8장 소비처).
- 공유받은 종목(`canEdit=false`)은 시세 갱신·거래·계좌 변경·삭제가 비활성(읽기 전용).

### 9.2 포트폴리오 분석 — `app/ledger/stocks/portfolio` → `PortfolioClient`

- `app/ledger/stocks/portfolio/page.tsx:5`(`export const dynamic = 'force-dynamic'`) → `PortfolioClient.tsx:62`.
- 마운트 시 `/api/holdings` + `/api/exchange-rates`를 병렬 로드. 각 보유의 `aggregate.marketValue`(없으면 `totalInvested`)에 통화별 환율(USD/JPY/KRW)을 곱해 KRW 평가금액을 구함.
- 도넛 차트 4종(`DonutChart`, `app/ledger/market/DonutChart`): **종목별 비중(TOP 10 + 기타)**, **통화별**, **계좌별**, **계좌 유형별**(복수 유형이면 첫 번째 유형 기준 집계). 총 평가금액·보유 종목 수·환율 헤더 표시.
- 보유 종목이 없으면 `/ledger/stocks`로 안내하는 빈 상태 카드.

### 9.3 시장/시세 화면(관심종목·알람 소비처) — `app/ledger/market/*`

본 문서의 보조 모델(관심종목/메모/알람)을 실제로 쓰는 UI는 시장 화면에 있습니다: `MarketClient.tsx`(시세 브라우징 + 알람 도달 체크), `StockDetailModal.tsx`(국내 종목 상세 — 워치리스트 토글, 메모 저장 `:781`, 알람 추가 `:847`, 본인 거래 마커 `/api/holdings/trades`), `OverseasDetailModal.tsx`(해외 종목 — 워치리스트). `StocksClient`가 이 모달들을 재사용합니다(9.1).

---

## 10. 공유(STOCK scope) 및 권한 요약

`Holding`은 `ScheduleShare`의 `scope='STOCK'`을 통해 다른 사용자에게 **읽기 전용**으로 공유됩니다. 공유 메커니즘(요청/승인/거절, `getReadableScheduleOwnerIds`)은 캘린더/TODO와 동일하며 [feature-productivity.md](feature-productivity.md) 8장에 상세합니다.

| 행위 | 요구 권한 |
|---|---|
| 보유 종목 목록/단건 조회(API) | 본인 또는 `ScheduleShare(scope=STOCK, ACCEPTED)` 소유자 |
| 보유 종목 생성/수정/삭제 | 본인(소유자)만 |
| 거래 생성/수정/삭제 | 종목 소유자만 |
| 시세/검색/거래마커 조회 | 로그인 |
| 관심종목/메모/알람 | 본인 데이터만(공유 없음) |
| KIS 시세 사용 | 본인 `KisCredential` 등록 시 |

- 공유 응답에는 `shared`/`canEdit`/`ownerLabel`이 포함되어 클라이언트가 색상·읽기전용을 일관 적용합니다.
- `excludeOwners`는 클라이언트 표시 토글용 필터일 뿐 권한 경계가 아닙니다(여전히 본인+ACCEPTED 범위 내).

---

## 11. 보안 / 외부 의존성 노트

- **KIS 자격증명**은 `KisCredential`에 AES-256-GCM 암호화 저장됩니다(`prisma/schema.prisma:257`). 시세 라우트는 자격증명 **존재 여부만** 확인하며 평문 키를 응답에 노출하지 않습니다. 복호화·토큰 관리는 `app/lib/kisAuth.ts`/`kisQuote.ts`에 격리됩니다([env-and-security.md](env-and-security.md)).
- **네이버 금융**은 비공식 엔드포인트로, 브라우저 `User-Agent` 헤더를 붙여 호출합니다(`app/lib/naverFinance.ts:5`). API 키가 없으며 실패는 502로 처리.
- **Frankfurter 환율** API는 공개(키 불필요), 30분 메모리 캐시 + `revalidate` 사용.
- 가계부 연동 시 `LedgerEntry`/`Holding` 삭제는 항상 `ownerId` 조건을 함께 걸어 타인 데이터 변조를 방지합니다(6.5, 7.3, `holdingLedgerSync.ts:133`).

---

## 12. 상호 참조

- 모델 전체 스키마·인덱스: [database.md](database.md) (9. 투자 도메인 / 10. KIS 연동 도메인)
- 전체 라우트 표·공통 에러 코드: [api-reference.md](api-reference.md) (10·11·12 투자 섹션)
- 공유(ScheduleShare)·권한 정책: [feature-productivity.md](feature-productivity.md) · [auth-permissions.md](auth-permissions.md)
- `holdingAggregate`/`holdingLedgerSync`/`fxRate`/`naverFinance`/`kisQuote` 등 라이브러리: [lib-reference.md](lib-reference.md)
- KIS 암호화·환경변수: [env-and-security.md](env-and-security.md)
- 가계부 계좌/항목(`FinancialAccount`/`LedgerEntry`)과의 연결: [database.md](database.md)
</content>
</invoke>
