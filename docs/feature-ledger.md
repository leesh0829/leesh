# 가계부 기능 (거래 · 계좌 · 예산 · 통계)

수입/지출 기입(`LedgerEntry`), 금융 계좌(`FinancialAccount`), 계좌간 이체, 월간 예산 목표(`BudgetTarget` — "머니 챌린지"), 통계/분석, 가계부 캘린더를 다루는 권위 레퍼런스입니다. 라우트·모델·페이지·KST 월 경계·계좌 누적잔액 계산·공유(LEDGER scope) 관례를 빠짐없이 정리합니다.

> 작성 기준: 2026-06-24, dev 브랜치

관련 문서: [database.md](database.md) · [api-reference.md](api-reference.md) · [auth-permissions.md](auth-permissions.md) · [feature-investing.md](feature-investing.md) · [feature-productivity.md](feature-productivity.md) · [lib-reference.md](lib-reference.md) · [frontend-and-ui.md](frontend-and-ui.md)

---

## 1. 개요

가계부 도메인의 핵심 모델은 `LedgerEntry`(거래 한 건) / `FinancialAccount`(금융 계좌) / `BudgetTarget`(월간 예산 목표) 세 가지입니다. 거래는 선택적으로 계좌에 연결되며, 같은 계좌는 [투자 — 보유종목](feature-investing.md)의 `Holding`과도 공유됩니다(주식 거래가 가계부 항목을 자동 생성). 모든 화면은 `/ledger` 아래에 있고 메뉴 권한 키는 `ledger`(`path:'/ledger'`, `requireLogin:true`, `minRole:USER`, `app/api/permission/route.ts:83`)입니다.

| 기능 | 프론트 페이지 | 주요 API | 데이터 |
|---|---|---|---|
| 거래 목록/기입/이체 | `app/ledger/page.tsx` → `LedgerClient` | `/api/ledger`, `/api/ledger/[entryId]`, `/api/ledger/transfer` | `LedgerEntry`, `FinancialAccount` |
| 계좌 관리 | `app/ledger/accounts/*` | `/api/accounts`, `/api/accounts/[accountId]` | `FinancialAccount` |
| 머니 챌린지(예산) | `app/ledger/budgets/*` | `/api/ledger/budgets`, `/api/ledger/budgets/[id]` | `BudgetTarget` |
| 통계 / 분석 | `app/ledger/stats/*` | `/api/ledger/stats` | `LedgerEntry`(집계) |
| 가계부 캘린더 | `app/ledger/calendar/*` | `/api/ledger`(재사용) | `LedgerEntry` |
| 정산 대기함(청구·비상금) | `app/ledger/settlements/*` | `/api/ledger/settlements`, `/api/ledger/settlements/[id]` | `Settlement` |

> 같은 `/ledger` 트리 아래에 투자(`stocks/*`, `market/*`, `kis-settings/*`) 화면도 있지만, 그쪽은 별도 도메인입니다([feature-investing.md](feature-investing.md) / [integration-kis.md](integration-kis.md) 참고). 이 문서는 거래·계좌·예산·통계만 다룹니다.

모든 API는 `runtime = 'nodejs'`이며 `getServerSession(authOptions)` 기반 인증을 요구합니다(가계부 캘린더 페이지만 `export const dynamic = 'force-dynamic'`). 날짜는 응답 직렬화 시 `toISOStringSafe()`로 ISO 문자열화됩니다(`app/lib/date.ts`).

---

## 2. 데이터 모델

`LedgerEntry`/`FinancialAccount`/`BudgetTarget` 및 관련 enum의 전체 정의는 [database.md](database.md) 참조. 여기서는 가계부가 사용하는 필드만 정리합니다.

> ⚠️ 이름 주의: NextAuth의 OAuth 계정 모델 `Account`(`prisma/schema.prisma:58`)와 가계부의 금융 계좌 `FinancialAccount`(`:278`)는 **완전히 다른 모델**입니다. 가계부에서 "계좌"는 항상 `FinancialAccount`를 가리킵니다.

### 2.1 LedgerEntry — `prisma/schema.prisma:207`

| 필드 | 타입 | 기본값/비고 |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `ownerId` / `owner` | `String` / `User`(`LedgerEntryOwner`) | `onDelete: Cascade` |
| `accountId` / `account` | `String?` / `FinancialAccount?`(`LedgerAccount`) | **`onDelete: SetNull`** — 계좌 삭제 시 거래는 남고 연결만 해제 |
| `type` | `LedgerEntryType` | `INCOME` / `EXPENSE`(`:202`) |
| `amount` | `Int` | 원 단위 정수(소수 없음) |
| `description` | `String` | |
| `category` | `String` | 대분류(자유 문자열, 검증은 라이브러리에서) |
| `subcategory` | `String?` | 소분류 |
| `excludeFromTotals` | `Boolean @default(false)` | 합계(수입/지출)에서 제외(이체 등). **잔액 계산에는 반영** |
| `occurredAt` | `DateTime @default(now())` | 거래 발생 시각 |
| `createdAt` / `updatedAt` | `DateTime` | |
| `holdingTransaction` | `HoldingTransaction?`(`HoldingTxLedger`) | 주식 거래에서 자동 생성된 항목이면 역참조 존재 |
| 인덱스 | `@@index([ownerId, occurredAt])`, `@@index([ownerId, type])`, `@@index([accountId])` | |

### 2.2 FinancialAccount — `prisma/schema.prisma:278`

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `ownerId` / `owner` | `String` / `User`(`FinancialAccountOwner`) | `onDelete: Cascade` |
| `name` | `String` | 계좌 표시명 |
| `bankName` | `String?` | 은행/증권사명 |
| `types` | `AccountType[]` | 계좌 유형 배열(`:236`, 18종) |
| `memo` | `String?` | |
| `initialBalance` | `Int @default(0)` | 가계부 시작 시점 잔액. 수입에 잡히지 않고 잔액·내역 누적의 출발점 |
| `ledgerEntries` / `holdings` / `budgetTargets` | 역관계 | `LedgerEntry`·`Holding`·`BudgetTarget` |
| 인덱스 | `@@index([ownerId])` | |

> 삭제 시 cascade 방향: 계좌 삭제 → `LedgerEntry.accountId` **SetNull**(거래 보존), `Holding.accountId` **SetNull**, 그러나 `BudgetTarget.account`는 **`onDelete: Cascade`**(`:478`)라 **해당 계좌를 대상으로 한 예산 목표는 함께 삭제**됩니다. 계좌 삭제 확인창은 가계부 항목 보존만 안내하므로(`app/ledger/accounts/AccountsClient.tsx:243`), 예산 cascade는 코드 동작 기준입니다.

### 2.3 BudgetTarget — `prisma/schema.prisma:463`

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `ownerId` / `owner` | `String` / `User`(`BudgetTargetOwner`) | `onDelete: Cascade` |
| `scope` | `BudgetScope` | `CATEGORY` / `SUBCATEGORY` / `ACCOUNT`(`:457`) |
| `category` | `String?` | `scope=CATEGORY/SUBCATEGORY`에서 사용 |
| `subcategory` | `String?` | `scope=SUBCATEGORY`에서 사용 |
| `accountId` / `account` | `String?` / `FinancialAccount?`(`BudgetTargetAccount`) | `scope=ACCOUNT`. **`onDelete: Cascade`** |
| `amount` | `Int` | 월간 목표(원) |
| `memo` | `String?` | |
| `enabled` | `Boolean @default(true)` | |
| 인덱스 | `@@index([ownerId, enabled])`, `@@index([accountId])` | |

### 2.4 enum 정리

| enum | 값 | 인용 |
|---|---|---|
| `LedgerEntryType` | `INCOME`, `EXPENSE` | `prisma/schema.prisma:202` |
| `AccountType` | `SALARY, LIVING, CHECKING, SAVINGS, EMERGENCY, STOCK, ISA, PENSION, BUSINESS, SHARED, CORPORATE, FOREIGN_CURRENCY, SHOPPING, CEREMONIAL, CARD, FIXED_EXPENSE, TRANSPORT, OTHER` (18종) | `:236` |
| `BudgetScope` | `CATEGORY`, `SUBCATEGORY`, `ACCOUNT` | `:457` |
| `ScheduleShareScope` | `CALENDAR`, `TODO`, `LEDGER`, `STOCK` | `:195` — 가계부 공유는 `LEDGER` |

---

## 3. 라이브러리

### 3.1 `app/lib/ledgerCategories.ts` — 대분류/소분류 정의·검증

| export | 내용 | 인용 |
|---|---|---|
| `INCOME_CATEGORIES` | 수입 대분류 9종(월급·보너스·환급금·주식/이자·용돈·경조사비·수익·계좌이체·기타). 각 `{ key, label, subcategories[] }` | `:9` |
| `EXPENSE_CATEGORIES` | 지출 대분류 18종(주거·통신·보험·구독·학습·고정비 기타·식비·생활·쇼핑·교통·의료/건강·문화/여가·경조사/선물·자기계발·주식/이자·변동비 기타·계좌이체·기타) | `:45` |
| `getCategoriesByType(type)` | `INCOME`이면 수입, 아니면 지출 목록 | `:124` |
| `isValidCategoryCombination(type, category, subcategory)` | `category`가 해당 type 목록에 있고, `subcategory`가 비었거나(`null`) 그 대분류의 `subcategories`에 포함되면 `true` | `:128` |

> `계좌이체`/`기타` 등 일부 대분류는 `subcategories: []`라 소분류가 없습니다. `isValidCategoryCombination`은 소분류가 `null`이면 항상 통과시키므로, 소분류 없는 대분류에 `null` 소분류 조합이 정상입니다.

### 3.2 `app/lib/accountTypes.ts` — 계좌 유형·상호배타 규칙

| export | 내용 | 인용 |
|---|---|---|
| `ACCOUNT_TYPES` | 18종 `AccountType` 튜플 | `:1` |
| `STOCK_TYPES` | `['STOCK','ISA','PENSION']` — 단독 전용 타입 | `:25` |
| `isStockType(t)` / `hasStockType(types)` | 주식 계열 판정 | `:27`, `:31` |
| `validateAccountTypes(types)` | 빈 배열/중복/주식계열 혼합 검증. 위반 시 한국어 에러 문자열, 정상이면 `null` | `:39` |
| `TYPE_LABEL_KR` | `AccountType` → 한글 라벨 맵(예: `SALARY:'급여'`, `STOCK:'주식/종합'`) | `:52` |

`validateAccountTypes` 규칙: ① 최소 1개 ② 중복 불가 ③ `STOCK`/`ISA`/`PENSION`은 한 계좌에 하나만, 다른 유형과 혼합 불가. 클라이언트도 `toggleType`(`AccountsClient.tsx:42`)으로 같은 상호배타 규칙을 칩 UI에 선반영합니다.

### 3.3 `app/lib/budgetTargets.ts` — 월간 예산 진행률

| export | 내용 | 인용 |
|---|---|---|
| `BudgetScope` / `BudgetTargetRow` / `BudgetProgress` 타입 | 진행률 결과 형태 | `:7`~`:27` |
| `currentMonthRange(now=new Date())` | **KST(UTC+9)** 기준 이번 달 `[start, end)`와 `ym`(`YYYYMM`) 계산. KST 오프셋을 더해 연/월을 구한 뒤 UTC로 환산 | `:30` |
| `listBudgetsWithProgress(ownerId, now?)` | 본인 `BudgetTarget` 전체 + 이번 달 `EXPENSE`·`excludeFromTotals=false` 거래를 메모리 매칭해 진행률 계산. 반환 `{ ym, items }` | `:56` |

각 항목 진행률: `rate = spent / amount`(amount>0), `status`는 `rate>=1 → 'over'`, `rate>=0.8 → 'warning'`, 그 외 `'safe'`(`:122`). `spent`는 scope에 따라 카테고리 일치 / (카테고리+소분류) 일치 / 계좌 일치 합산. `label`은 `scopeLabel`로 생성(`:49`).

> 예산은 항상 **이번 달(KST)** 기준이며, 사용자가 기간을 고를 수 없습니다. `excludeFromTotals=true`(이체 등)와 `INCOME`은 사용액에서 제외됩니다.

---

## 4. 거래 목록·기입 (`/ledger`)

### 4.1 페이지 `app/ledger/page.tsx` → `LedgerClient`

`app/ledger/LedgerClient.tsx`(메인, ~2.3k줄) 핵심 동작:

- **기간 필터**: `periodStart`/`periodEnd`(기본 이번 달 1일~말일, `startOfMonth`/`endOfMonth`). 변경 시 `GET /api/ledger?start&end`로 재조회(`load` `:293`). "이번 달로 이동" 버튼 제공.
- **입력 모드 토글**(`formMode` `:236`): `entry`(일반 기입) ↔ `transfer`(계좌간 이체).
  - 일반 기입: 유형(수입/지출)·금액·설명·대분류·소분류·계좌·발생시각(`datetime-local`)·합계제외 체크 → `POST /api/ledger`(`create` `:501`, fetch `:541`). 금액은 숫자만 추출(`replace(/[^0-9]/g,'')`)해 정수화.
  - 이체: 출발/도착 계좌·금액·설명 → `POST /api/ledger/transfer`(`createTransfer` `:564`).
- **대분류 선택 시** 소분류 옵션은 `getCategoriesByType`로 동적 갱신.
- **합산/분리 보기**(`viewMode` `:231`, `ViewModeToggle`): `combined`은 전체 합산, `split`은 owner별 분리. 분리 시 `totalsByOwner` + `OwnerBreakdownList`/`OwnerStackBar`로 소유자별 잔액 표시.
- **목록 행**: 유형 색상·카테고리·계좌명·`runningBalance`(계좌 연결 항목에 "잔액 ₩…" 표시 `:1949`)·발생시각. 행 인라인 편집(`PATCH /api/ledger/[id]`)·삭제(`DELETE /api/ledger/[id]`, `remove` `:612`).
- **주식 연동 항목**(`linkedToHolding`): 삭제 시 "주식/투자 거래에서 자동 생성된 항목" 경고를 띄우되(`:614`), 가계부에서 삭제해도 원 거래에는 영향 없음.
- **클라이언트 필터/검색**(`:271`~): 정렬(occurredAt asc/desc), 유형·대분류·소분류·계좌(`ALL`/`NONE`/accountId)·날짜 범위·설명 검색(`searchText`).
- **공유 패널**: `scope='LEDGER'`로 `/api/schedule-shares` 요청/승인/거절/해제. `outgoing`/`incoming`은 `scope==='LEDGER'`만 필터(`:359`, `:362`). 승인된 공유 소유자는 파스텔 색(`getPastelColor`, FNV 해시 `:115`)·체크박스 표시 토글(`visibleOwners`)을 가지며, 꺼진 owner는 `excludeOwners` 쿼리로 서버 조회에서 제외(`:301`).

### 4.2 보조 컴포넌트

- `app/ledger/OwnerBreakdown.tsx`: `OwnerStackBar`(가로 색 비율 막대, `:11`), `OwnerBreakdownList`(소유자별 세로 리스트, `:48`), `ViewModeToggle`(합산/분리 칩, `:82`), 타입 `OwnerSegment`.
- `app/ledger/LedgerNavIcons.tsx`: 가계부 하위 페이지 이동 버튼 모음. `LedgerNavBack`(가계부로 `:181`), `LedgerNavStats`(`:189`), `LedgerNavCalendar`(`:197`), `LedgerNavPortfolio`(`:205`), `LedgerNavCompare`(`:213`), `LedgerNavAccounts`(`:221`), `LedgerNavStocks`(`:229`), `LedgerNavMarket`(`:257`), `LedgerNavBudgets`(머니 챌린지 `:283`), `LedgerNavKisSettings`(`:291`).

### 4.3 API — `/api/ledger`

#### `GET /api/ledger` — `app/api/ledger/route.ts:78`
- **인증**: 필수(401 `unauthorized`).
- **쿼리**: `start?`/`end?`(`occurredAt`의 `gte`/`lt`, 유효 Date만 적용), `excludeOwners?`(콤마 구분 ownerId).
- **범위**: `getReadableScheduleOwnerIds(user.id, 'LEDGER')`(내 id + ACCEPTED 공유 소유자)에서 `excludeOwners`를 뺀 `effectiveOwnerIds`.
- **계좌 누적잔액(`runningBalance`) 계산**(`:140`~): ① 계좌 `initialBalance`를 carry 시작값으로 ② `start` 이전 거래 합을 더해 기간 시작 직전 잔액 ③ 기간 내 거래를 `occurredAt`(동률은 `createdAt`) 오름차순으로 누적. **`excludeFromTotals=true`(이체)도 실제 현금 이동이므로 잔액에 반영**.
- **합계**(`:222`~): `totals.income/expense`는 `excludeFromTotals=false` 거래만 합산(기간 무관, 본인+공유). `balance = income - expense + Σ initialBalance`. `totalsByOwner`는 owner별 동일 계산.
- **응답**: `{ items[], totals, totalsByOwner }`. 각 item에 `ownerLabel`(`toUserLabel`)·`shared`(owner≠나)·`canEdit`(owner=나)·`accountName/accountBank/accountTypes`·`linkedToHolding`·`runningBalance`·날짜 ISO 포함.

#### `POST /api/ledger` — `:285`
- **바디**(zod `entryCreateSchema`, `.strict()` `:13`): `type`(INCOME/EXPENSE), `amount`(정수 1~20억), `description`(1~200), `category`(1~40), `subcategory?`(≤40|null), `accountId?`(≤40|null), `excludeFromTotals?`(기본 false), `occurredAt?`(문자열|null, 유효 Date).
- **검증**: `accountId` 지정 시 **본인 소유** 확인(아니면 400 `유효하지 않은 계좌입니다.`). `isValidCategoryCombination(type, category, subcategory)` 실패 시 400. `occurredAt` 미지정/빈문자열이면 `new Date()`.
- **응답**: `{ id }`.

#### `PATCH /api/ledger/[entryId]` — `app/api/ledger/[entryId]/route.ts:54`
- **권한**: 거래 존재(없으면 404), `ownerId!==me`면 403. **공유받은 거래는 수정 불가**(본인만).
- **바디**(zod `entryPatchSchema`, 부분 갱신): 위 필드들 모두 optional. `type`/`category`/`subcategory` 중 하나라도 바뀌면 다음 값으로 카테고리 조합 재검증(`:96`). `accountId` 변경 시 본인 소유 검증. `occurredAt`이 `null`/`''`이면 `new Date()`로 대체.
- **응답**: `{ ok: true }`.

#### `DELETE /api/ledger/[entryId]` — `:147`
- 동일 권한(404/403) 후 삭제, `{ ok: true }`.

#### `POST /api/ledger/transfer` — `app/api/ledger/transfer/route.ts:10`
- **바디**(수동 파싱): `{ fromAccountId, toAccountId, amount, description?, occurredAt? }`. `amount`는 `Math.round`.
- **검증**: 두 계좌 모두 지정·상이·`amount>0`. 두 계좌가 모두 **본인 소유**여야 함(`findMany` 결과 2건 아니면 400).
- **부수효과**: `prisma.$transaction`으로 출발 계좌 `EXPENSE` + 도착 계좌 `INCOME` 2건 생성. 둘 다 `category='계좌이체'`, `subcategory=null`, `excludeFromTotals=true`, 같은 `occurredAt`. 설명 미입력 시 `"{from} → {to} 이체"`. 실패 시 500(`[LEDGER_TRANSFER_ERROR]` 로깅).
- **응답**: `{ ok: true, ids: [expenseId, incomeId] }`.

---

## 5. 계좌 관리 (`/ledger/accounts`)

### 5.1 페이지 `app/ledger/accounts/page.tsx` → `AccountsClient`

`app/ledger/accounts/AccountsClient.tsx` 동작:
- 계좌 생성/수정 폼: 이름·은행명·유형 칩(`ACCOUNT_TYPES`, `TYPE_LABEL_KR` 라벨)·메모·**초기 잔액**("가계부 시작 시점 금액 · 수입에 잡히지 않습니다", `:332`).
- 유형 칩 선택은 `toggleType`(`:42`)으로 STOCK/ISA/PENSION 단독 규칙을 즉시 반영.
- 목록 카드: 유형 배지·가계부 연결 건수(`entryCount`)·종목 수(`holdingCount`)·초기 잔액.
- 삭제: 확인창("연결된 가계부 항목들은 계좌 정보만 해제되고 그대로 남습니다", `:243`) → `DELETE /api/accounts/[id]`.

### 5.2 API — `/api/accounts`

#### `GET /api/accounts` — `app/api/accounts/route.ts:59`
- **인증**: 필수. 본인 계좌만(`ownerId=me`), `createdAt` 오름차순.
- **응답**: `{ items[] }`. 각 item에 `types`·`memo`·`initialBalance`·`entryCount`(`_count.ledgerEntries`)·`holdingCount`(`_count.holdings`)·날짜 ISO 포함.

#### `POST /api/accounts` — `:96`
- **바디**(zod `accountCreateSchema`, `.strict()`): `name`(1~60), `bankName?`(≤60|null), `types`(`ACCOUNT_TYPES` enum 배열, ≥1), `memo?`(≤500|null), `initialBalance?`(정수 -20억~20억, 기본 0).
- **검증**: `validateAccountTypes(types)` 위반 시 400(한국어 메시지). **응답**: `{ id }`.

#### `PATCH /api/accounts/[accountId]` — `app/api/accounts/[accountId]/route.ts:45`
- **권한**: 존재(404)·`ownerId===me`(아니면 403).
- **바디**(부분 갱신): `name?`/`bankName?`/`types?`/`memo?`/`initialBalance?`. `types` 변경 시 `validateAccountTypes` 재검증. **응답**: `{ ok: true }`.

#### `DELETE /api/accounts/[accountId]` — `:94`
- 동일 권한 후 삭제, `{ ok: true }`. (cascade 방향은 2.2 참조)

---

## 6. 머니 챌린지 — 예산 (`/ledger/budgets`)

카테고리/소분류/계좌별 **월간(KST) 지출 목표**를 등록하고 이번 달 사용액·진행률을 추적합니다.

### 6.1 페이지 `app/ledger/budgets/page.tsx` → `BudgetsClient`

`app/ledger/budgets/BudgetsClient.tsx` 동작:
- 마운트 시 `GET /api/ledger/budgets`(+`/api/accounts`로 계좌 옵션)로 `{ ym, items }` 로드(`:123`).
- 생성/수정 폼: `scope`(CATEGORY/SUBCATEGORY/ACCOUNT) 선택에 따라 대분류·소분류(`EXPENSE_CATEGORIES` 기반) 또는 계좌 선택, 목표 금액·메모. 클라이언트도 scope별 필수값을 선검증(`:204`~).
- 항목 카드: 진행 막대(safe=emerald/warning=amber/over=red, `statusBar`/`statusColor`), 사용액·남은 금액·`rate%`, 상태 메시지(`statusMessage`).
- 진행률 임계치(80%/100%) 통과 시 토스트 알림(상태를 `ym`별 `thresholds`로 기억해 중복 방지, `:146`~).
- 저장: 신규는 `POST /api/ledger/budgets`, 수정은 `PUT /api/ledger/budgets/[id]`(금액·메모·enabled만), 삭제는 `DELETE /api/ledger/budgets/[id]`.

### 6.2 API — `/api/ledger/budgets`

#### `GET /api/ledger/budgets` — `app/api/ledger/budgets/route.ts:56`
- **인증**: 필수. `listBudgetsWithProgress(userId)` 결과(`{ ym, items }`) 반환. 오류 시 500(`[BUDGETS_LIST_ERROR]`).

#### `POST /api/ledger/budgets` — `:70`
- **바디**(zod `createSchema`, `.strict()` + `superRefine` `:22`): `scope`, `category?`/`subcategory?`/`accountId?`, `amount`(정수 1~20억), `memo?`, `enabled?`(기본 true).
- **scope별 필수**: `CATEGORY`→`category`, `SUBCATEGORY`→`category`+`subcategory`, `ACCOUNT`→`accountId`(미충족 시 400). `ACCOUNT`이면 계좌 본인 소유 확인(아니면 404 `account not found`).
- **정규화**: 저장 시 `scope`에 맞지 않는 필드는 `null`로 정리(`:93`~). **응답**: `{ id }`.

#### `PUT /api/ledger/budgets/[id]` — `app/api/ledger/budgets/[id]/route.ts:28`
- **권한**: `findFirst({ id, ownerId })` 없으면 404. **바디**: `amount?`/`memo?`/`enabled?`만(scope·대상은 불변). **응답**: `{ id }`.

#### `DELETE /api/ledger/budgets/[id]` — `:61`
- 동일 권한 후 삭제, `{ ok: true }`.

---

## 7. 통계 / 분석 (`/ledger/stats`)

### 7.1 페이지 `app/ledger/stats/page.tsx` → `StatsClient`

`app/ledger/stats/StatsClient.tsx`(~2k줄)는 기간을 골라 `GET /api/ledger/stats?start&end`(`:161`)로 집계 데이터를 받아 다양한 차트로 표시합니다.
- `DonutChart`(`../market/DonutChart`)·`ChartTooltip`/`useChartHover`(`@/app/components/ChartTooltip`) 사용([frontend-and-ui.md](frontend-and-ui.md)).
- 카드: 합계(수입/지출/순액/건수, 전기 대비 `prevTotals`), 카테고리별 도넛, 소분류 분해, 월별/일별 추이, **요일별 평균**(`WeekdayBarChart`, `:611`), **시간별 패턴(0h~23h)**(`HourBarChart`, `:625`), 계좌별·**계좌 유형별**(`TYPE_LABEL_KR` 라벨, `:1063`), Top 거래, 전기 대비 카테고리 hot list, **이체 흐름**(`transferFlows`, `:962`).

### 7.2 API — `GET /api/ledger/stats` — `app/api/ledger/stats/route.ts:43`
- **인증**: 필수. **쿼리**: `start?`/`end?`(`occurredAt` `gte`/`lt`). 범위는 `getReadableScheduleOwnerIds(user.id, 'LEDGER')`.
- **집계 대상**: `excludeFromTotals=false` 거래(`rows`). 이체 흐름용으로 `excludeFromTotals=true`+`category='계좌이체'` 거래(`transferRows`)를 별도 조회(`:82`).
- **전기 비교**: `start`/`end`가 모두 유효하면 같은 길이의 직전 기간을 조회해 `prevTotals` 및 카테고리별 증감(`:101`~).
- **시간 버킷 규약**: `byMonth`(`YYYY-MM`)·`byDay`(`YYYY-MM-DD`)·`byWeekday`(0=일~6=토, `d.getDay()`)·`byHour`(0~23, `d.getHours()`)는 **서버 로컬 타임존** 기준입니다. 서버 `TZ=Asia/Seoul`이므로 사실상 KST([feature-productivity.md](feature-productivity.md)의 KST 관례 참고).
- **이체 흐름 매칭**(`:395`~): `transferRows`를 `occurredAt+amount` 키로 EXPENSE↔INCOME 페어를 묶어 `from → to`별 합계/건수를 만듭니다(`transferFlows`).
- **응답 키**: `totals{income,expense,net,count}`, `prevTotals`, `byAccount`, `byAccountType`, `byCategoryIncome`/`byCategoryExpense`, `bySubcategoryIncome`/`bySubcategoryExpense`, `byMonth`, `byDay`, `byWeekday`, `byHour`, `topIncome`/`topExpense`(상위 5건), `categoryDiffIncome`/`categoryDiffExpense`, `transferFlows`.

---

## 7-b. 정산 대기함 (`/ledger/settlements`)

다음 월급에 정상화할 항목을 추적합니다. `Settlement` 모델(`prisma/schema.prisma`) 하나에 `kind`(`REIMBURSEMENT` 청구 — 개인카드 대납 / `EMERGENCY` 비상금 — 임시 인출)와 `status`(`PENDING` 미정산 / `SETTLED` 정산완료)로 구분합니다. **본인 전용**(공유 비대상, 예산과 동일), 정산은 **상태만 전환**하며 가계부 거래(`LedgerEntry`)를 자동 생성하지 않습니다 — 실제 환급 수입/되갚기 이체는 사용자가 가계부에서 직접 기입합니다.

- **모델 `Settlement`**: `ownerId`(Cascade)·`accountId?`(참고용 계좌, SetNull)·`kind`·`status`·`amount`·`description`·`occurredAt`·`settledAt?`·`memo?`. 인덱스 `@@index([ownerId, status])`/`([ownerId, kind])`/`([accountId])`.
- **라이브러리 `app/lib/settlements.ts`**: `SETTLEMENT_KIND_LABEL`/`SETTLEMENT_STATUS_LABEL` 라벨, `summarizeSettlements(items)`(미정산분만 `{ reimbursementPending, emergencyPending }` 집계), `settledAtForStatus(status, now)`(`SETTLED`이면 `now`, 아니면 `null`).
- **페이지** `app/ledger/settlements/page.tsx` → `SettlementsClient`: 상단 요약(받을 청구/갚을 비상금 미정산 합계), 종류·상태 클라이언트 필터, 생성/수정 폼(종류·금액·내역·발생일·계좌·메모), 항목별 `[정산 완료]`/`[미정산으로]` 토글·수정·삭제.
- **API** `GET /api/ledger/settlements?kind=&status=`(본인 항목 + `summary`, 미정산 우선 정렬), `POST`(생성), `PATCH /api/ledger/settlements/[id]`(수정·정산 토글 — `status`→`SETTLED` 시 `settledAt` 세팅, `PENDING` 시 해제), `DELETE`. 모두 `runtime='nodejs'`·본인 인증. `accountId` 지정 시 본인 소유 검증(아니면 404).
- **메인 `/ledger` 요약 카드**: `LedgerClient`가 마운트 시 `GET /api/ledger/settlements`의 `summary`만 가볍게 불러와, 미정산 합계가 있을 때만 카드를 노출하고 클릭 시 이 페이지로 이동합니다. 네비 버튼 `LedgerNavSettlements`(`LedgerNavIcons.tsx`).
- **권한**: 하위 페이지는 기존 `ledger` 메뉴 권한 키에 포함(별도 엔트리 없음). 다른 하위 페이지와 동일.

## 8. 가계부 캘린더 (`/ledger/calendar`)

### 8.1 페이지 `app/ledger/calendar/page.tsx` → `LedgerCalendarClient`

- `export const dynamic = 'force-dynamic'`(`page.tsx:3`).
- `app/ledger/calendar/LedgerCalendarClient.tsx`: 월간 그리드로 날짜별 수입/지출/잔액/건수와 주식 연동 여부(`hasStock`)를 표시. `GET /api/ledger?start&end`(`:95`)로 해당 월 거래를 받아 클라이언트에서 일별 집계(`DayCell`).
- **필터**: 계좌(`ALL`/`NONE`/accountId)·대분류(`ALL`/category). 옵션은 로드된 거래에서 동적 생성(`:112`, `:123`).
- **공휴일/주말 강조**: `korean-holidays`의 `isHoliday`(`:4`)와 요일로 공휴일·주말 표시(`WEEKDAYS=['일'..'토']`).

---

## 9. 공유 (LEDGER scope)

가계부 데이터 공유는 [feature-productivity.md](feature-productivity.md)의 `ScheduleShare` 메커니즘을 `scope='LEDGER'`로 재사용합니다.

- 조회 라우트(`GET /api/ledger`, `GET /api/ledger/stats`)는 `getReadableScheduleOwnerIds(user.id, 'LEDGER')`(`app/lib/scheduleShare.ts`)로 [내 id + ACCEPTED 공유 소유자]를 구해 조회 범위를 정합니다. 테이블 미마이그레이션 등 예외 시 `[userId]`로 폴백.
- 응답의 `shared`(owner≠나)·`canEdit`(owner=나)·`ownerLabel`로 클라이언트가 색상·읽기전용을 적용합니다. **공유받은 거래는 PATCH/DELETE 불가**(소유자만, `[entryId]/route.ts`에서 403).
- 공유 요청/승인/해제 UI는 `LedgerClient`의 공유 패널에서 `POST/PATCH/DELETE /api/schedule-shares[...]`(`scope:'LEDGER'`)로 수행합니다. 라우트 상세는 [api-reference.md](api-reference.md) 참조.
- 예산(`/api/ledger/budgets`)·계좌(`/api/accounts`)는 **공유 대상이 아니며 항상 본인 데이터만** 다룹니다.

---

## 10. 투자(주식) 연동

주식 거래는 가계부 항목을 자동 생성/동기화합니다. `HoldingTransaction.ledgerEntry`(`HoldingTxLedger`, `prisma/schema.prisma:350`)로 1:1 연결되며, 동기화 로직은 `app/lib/holdingLedgerSync.ts`에 있습니다(비-KRW는 현재 환율로 KRW 환산 기록). 가계부 화면에서는 이런 항목이 `linkedToHolding=true`로 내려오고, 삭제 시 "원 거래에는 영향 없음" 경고를 띄웁니다(4.1 참조). 거래 동기화·집계의 상세는 [feature-investing.md](feature-investing.md) / [integration-kis.md](integration-kis.md) 참조.

---

## 11. 권한 요약 (가계부 전반)

| 행위 | 요구 권한 |
|---|---|
| 거래 목록/통계 조회 | 로그인 + 본인 또는 `ScheduleShare(scope=LEDGER, ACCEPTED)` 공유 소유자 |
| 거래 기입/이체 | 로그인(본인 데이터로 생성) |
| 거래 수정/삭제 | 거래 소유자 본인(공유받은 거래 불가) |
| 계좌 생성 | 로그인 |
| 계좌 조회/수정/삭제 | 계좌 소유자 본인 |
| 거래·이체·예산의 계좌 지정 | 본인 소유 계좌만 |
| 예산 생성/수정/삭제 | 본인(예산은 공유 비대상) |

---

## 12. 상호 참조

- 모델 전체 스키마: [database.md](database.md)
- 전체 라우트 표/공통 에러 코드: [api-reference.md](api-reference.md)
- 인증·권한 정책, 공유(`ScheduleShare`): [auth-permissions.md](auth-permissions.md) · [feature-productivity.md](feature-productivity.md)
- 투자/보유종목·KIS 연동: [feature-investing.md](feature-investing.md) · [integration-kis.md](integration-kis.md)
- `useAsyncLock`·`httpErrorText`·`validation`·차트 컴포넌트: [lib-reference.md](lib-reference.md) · [frontend-and-ui.md](frontend-and-ui.md)
</content>
</invoke>
