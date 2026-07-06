# Database — 데이터베이스 스키마

Leesh의 데이터 계층은 Prisma 7 + PostgreSQL로 구성되며, 모든 모델/enum 정의는 `prisma/schema.prisma`에 단일 파일로 모여 있습니다. 이 문서는 스키마의 모든 model·enum·필드·관계·인덱스·제약을 도메인별로 망라한 권위 레퍼런스입니다.

> 작성 기준: 2026-06-24, dev 브랜치

관련 문서: [auth-permissions.md](auth-permissions.md) · [feature-content.md](feature-content.md) · [feature-productivity.md](feature-productivity.md) · [feature-ledger.md](feature-ledger.md) · [feature-investing.md](feature-investing.md) · [integration-kis.md](integration-kis.md) · [architecture.md](architecture.md)

---

## 1. datasource / generator / 클라이언트

| 항목 | 값 | 위치 |
| --- | --- | --- |
| generator provider | `prisma-client-js` | `prisma/schema.prisma:8` |
| generator engineType | `library` | `prisma/schema.prisma:9` |
| datasource provider | `postgresql` | `prisma/schema.prisma:13` |
| 연결 문자열 | `DATABASE_URL` 환경변수 | `app/lib/prisma.ts:12` |
| DB 어댑터 | `@prisma/adapter-pg` (`PrismaPg`) + `pg` `Pool` | `app/lib/prisma.ts:1-29` |
| 로깅 | `log: ["error"]` | `app/lib/prisma.ts:35` |

`datasource db` 블록에는 `url`이 명시되어 있지 않고, 런타임에서 `Pool({ connectionString: process.env.DATABASE_URL })`로 직접 풀을 만들어 `PrismaPg` 어댑터에 주입합니다(`app/lib/prisma.ts:15-29`). `DATABASE_URL`이 없으면 모듈 로드 시점에 `throw new Error("DATABASE_URL is missing")` 합니다(`app/lib/prisma.ts:13`). 개발 모드에서는 `globalThis`에 `prisma`/`pgPool`을 캐싱해 HMR 중복 연결을 방지합니다(`app/lib/prisma.ts:38-41`).

환경변수 상세는 [env-and-security.md](env-and-security.md)를 참고하세요.

## 2. 시간대(KST) / 날짜 관례 — 반드시 숙지

데이터베이스 타임존은 커넥션마다 한국 표준시로 고정됩니다.

```ts
// app/lib/prisma.ts:21-27
pool.on("connect", (client) => {
  void client
    .query("SELECT set_config('TimeZone', $1, false)", [DB_TIMEZONE]) // DB_TIMEZONE = "Asia/Seoul"
    .catch((err) => { console.error("Failed to set DB timezone:", err); });
});
```

- 모든 `DateTime` 컬럼은 PostgreSQL `TIMESTAMP(3)`(밀리초)로 저장되며, 풀에서 새 커넥션이 생길 때마다 `TimeZone='Asia/Seoul'`로 설정됩니다(`app/lib/prisma.ts:5`,`21-27`).
- `@default(now())`/`@updatedAt`은 KST 기준 시각으로 기록됩니다. Prisma는 응답에서 `DateTime`을 ISO 문자열로 직렬화합니다.
- **문자열 날짜 관례**: 하루 단위 키가 필요한 모델은 `DateTime` 대신 `String "YYYY-MM-DD"`를 사용합니다. 현재 `DiaryEntry.date`가 유일한 예이며, "KST 기준 하루"를 의미합니다(`prisma/schema.prisma:499`). 이는 시간대 변환 없이 사용자가 보는 날짜와 1:1로 매칭하기 위함입니다.

## 3. 도메인 ER 개요 (텍스트)

`User`가 거의 모든 도메인의 루트입니다. 대부분의 종속 모델은 `ownerId`/`userId` → `User`로 연결되고 `onDelete: Cascade`이므로, 유저 삭제 시 데이터가 연쇄 삭제됩니다.

```text
User ─┬─ Account (1:N, Cascade)               // NextAuth
      ├─ Session (1:N, Cascade)               // NextAuth
      ├─ UserMenuPermission (1:N, Cascade) ── MenuPermission (menuKey → key, Cascade)
      ├─ Board (1:N, Cascade) ── Post (1:N, Cascade) ── Comment (1:N, Cascade)
      ├─ ScheduleShare  (requester 1:N / owner 1:N, 둘 다 Cascade)
      ├─ DiaryEntry (1:N, Cascade)
      ├─ FinancialAccount (1:N, Cascade)
      │     ├─ LedgerEntry      (accountId, SetNull)
      │     ├─ Holding          (accountId, SetNull)
      │     └─ BudgetTarget     (accountId, Cascade)
      ├─ LedgerEntry (owner 1:N, Cascade) ── HoldingTransaction (ledgerEntryId 1:1, SetNull)
      ├─ Holding (owner 1:N, Cascade) ── HoldingTransaction (holdingId 1:N, Cascade)
      ├─ BudgetTarget (owner 1:N, Cascade)
      ├─ Watchlist / StockNote / StockAlarm (각각 1:N, Cascade)
      └─ KisCredential (1:1, Cascade)

VerificationToken : User와 직접 관계 없음(독립 테이블, identifier로 논리적 연결)
```

- `LedgerEntry` ↔ `HoldingTransaction`은 1:1 옵셔널 연결(매수/매도 거래가 가계부 지출/수입 1건과 짝지어질 수 있음). 관계명 `"HoldingTxLedger"`, FK는 `HoldingTransaction.ledgerEntryId @unique`(`prisma/schema.prisma:229`,`350-351`).
- `FinancialAccount` 삭제 시 그에 묶인 `LedgerEntry`/`Holding`은 `accountId`만 `NULL`로 풀리고(SetNull) 데이터 자체는 보존되지만, `BudgetTarget`은 함께 삭제됩니다(Cascade)(`prisma/schema.prisma:214`,`317`,`478`).

---

## 4. enum 전체 목록

| enum | 값 | 위치 |
| --- | --- | --- |
| `Role` | `USER`, `ADMIN` | `prisma/schema.prisma:16-19` |
| `PostStatus` | `TODO`, `DOING`, `DONE` | `prisma/schema.prisma:162-166` |
| `BoardType` | `GENERAL`, `BLOG`, `DOCS`, `PORTFOLIO`, `TODO`, `CALENDAR`, `HELP` | `prisma/schema.prisma:168-176` |
| `BlogPostCategory` | `INFO`, `REVIEW`, `DAILY` | `prisma/schema.prisma:178-182` |
| `PermissionOverrideMode` | `ALLOW`, `DENY` | `prisma/schema.prisma:184-187` |
| `ScheduleShareStatus` | `PENDING`, `ACCEPTED`, `REJECTED` | `prisma/schema.prisma:189-193` |
| `ScheduleShareScope` | `CALENDAR`, `TODO`, `LEDGER`, `STOCK` | `prisma/schema.prisma:195-200` |
| `LedgerEntryType` | `INCOME`, `EXPENSE` | `prisma/schema.prisma:202-205` |
| `AccountType` | `SALARY`, `LIVING`, `CHECKING`, `SAVINGS`, `EMERGENCY`, `STOCK`, `ISA`, `PENSION`, `BUSINESS`, `SHARED`, `CORPORATE`, `FOREIGN_CURRENCY`, `SHOPPING`, `CEREMONIAL`, `CARD`, `FIXED_EXPENSE`, `TRANSPORT`, `OTHER` (총 18개) | `prisma/schema.prisma:236-255` |
| `HoldingTransactionType` | `BUY`, `SELL`, `DIVIDEND`, `FEE`, `TAX` | `prisma/schema.prisma:302-308` |
| `AlarmDirection` | `ABOVE`(도달가 이상), `BELOW`(도달가 이하) | `prisma/schema.prisma:432-435` |
| `BudgetScope` | `CATEGORY`, `SUBCATEGORY`, `ACCOUNT` | `prisma/schema.prisma:457-461` |

---

## 5. Auth 도메인 — User / Account / Session / VerificationToken

NextAuth v4 Credentials/JWT 흐름에서 사용하는 표준 테이블입니다. 상세 로직은 [auth-permissions.md](auth-permissions.md) 참고.

### `User` (`prisma/schema.prisma:21-56`)

모든 도메인의 루트 엔티티.

| 필드 | 타입 | 기본값/옵션 | 비고 |
| --- | --- | --- | --- |
| `id` | `String` | `@id @default(cuid())` | PK |
| `name` | `String?` | | 표시 이름 |
| `email` | `String?` | `@unique` | 로그인 식별자 |
| `password` | `String?` | | credentials 비밀번호 해시(주석: "credentials 사용 시 필요") |
| `role` | `Role` | `@default(USER)` | 권한 등급 |
| `emailVerified` | `DateTime?` | | 이메일 인증 완료 시각 |
| `createdAt` | `DateTime` | `@default(now())` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

관계 필드: `accounts Account[]`, `sessions Session[]`, `boards Board[]`, `posts Post[]`, `comments Comment[]`, `menuOverrides UserMenuPermission[]`, `outgoingScheduleShares`(관계 `"ScheduleShareRequester"`), `incomingScheduleShares`(관계 `"ScheduleShareOwner"`), `ledgerEntries`(`"LedgerEntryOwner"`), `holdings`(`"HoldingOwner"`), `financialAccounts`(`"FinancialAccountOwner"`), `kisCredential KisCredential?`(1:1), `watchlistItems`(`"WatchlistOwner"`), `stockNotes`(`"StockNoteOwner"`), `stockAlarms`(`"StockAlarmOwner"`), `budgetTargets`(`"BudgetTargetOwner"`), `diaryEntries`(`"DiaryEntryOwner"`).

### `Account` (`prisma/schema.prisma:58-75`)

NextAuth OAuth/credentials 계정 연결 테이블.

| 필드 | 타입 | 옵션 | 비고 |
| --- | --- | --- | --- |
| `id` | `String` | `@id @default(cuid())` | |
| `userId` | `String` | | FK |
| `type` | `String` | | |
| `provider` | `String` | | |
| `providerAccountId` | `String` | | |
| `refresh_token` | `String?` | | |
| `access_token` | `String?` | | |
| `expires_at` | `Int?` | | |
| `token_type` | `String?` | | |
| `scope` | `String?` | | |
| `id_token` | `String?` | | |
| `session_state` | `String?` | | |

- 관계: `user User @relation(fields: [userId], references: [id], onDelete: Cascade)`.
- 제약: `@@unique([provider, providerAccountId])`.

### `Session` (`prisma/schema.prisma:77-84`)

| 필드 | 타입 | 옵션 |
| --- | --- | --- |
| `id` | `String` | `@id @default(cuid())` |
| `sessionToken` | `String` | `@unique` |
| `userId` | `String` | FK |
| `expires` | `DateTime` | |

- 관계: `user`, `onDelete: Cascade`.
- (참고: 인증 전략은 JWT라 DB Session은 어댑터 표준 스키마로만 존재.)

### `VerificationToken` (`prisma/schema.prisma:86-92`)

이메일 인증/검증 토큰. `User`와 FK 관계 없이 `identifier`로 논리 연결.

| 필드 | 타입 | 옵션 |
| --- | --- | --- |
| `identifier` | `String` | |
| `token` | `String` | `@unique` |
| `expires` | `DateTime` | |

- 제약: `@@unique([identifier, token])`. 명시 PK 없음(복합 unique가 식별 역할).

---

## 6. 콘텐츠 도메인 — Board / Post / Comment

게시판·블로그·문서·포트폴리오·투두·캘린더·도움말을 모두 `Board` + `Post` 한 쌍으로 표현합니다(`type`으로 분기). 상세는 [feature-content.md](feature-content.md).

### `Board` (`prisma/schema.prisma:94-113`)

| 필드 | 타입 | 기본값/옵션 | 비고 |
| --- | --- | --- | --- |
| `id` | `String` | `@id @default(cuid())` | |
| `name` | `String` | | |
| `description` | `String?` | | |
| `type` | `BoardType` | `@default(GENERAL)` | 보드 종류 |
| `ownerId` | `String` | | FK → User |
| `singleSchedule` | `Boolean` | `@default(false)` | 단일 일정 보드 모드 |
| `scheduleStatus` | `PostStatus` | `@default(TODO)` | 단일 일정 상태 |
| `scheduleStartAt` | `DateTime?` | | 단일 일정 시작 |
| `scheduleEndAt` | `DateTime?` | | 단일 일정 종료 |
| `scheduleAllDay` | `Boolean` | `@default(false)` | 종일 여부 |
| `createdAt` | `DateTime` | `@default(now())` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

- 관계: `owner User @relation(...) onDelete: Cascade`, `posts Post[]`.
- `singleSchedule*` 필드군은 캘린더에서 보드 자체를 하나의 일정 블록으로 다룰 때 사용.

### `Post` (`prisma/schema.prisma:115-146`)

| 필드 | 타입 | 기본값/옵션 | 비고 |
| --- | --- | --- | --- |
| `id` | `String` | `@id @default(cuid())` | |
| `boardId` | `String` | | FK → Board |
| `authorId` | `String` | | FK → User |
| `title` | `String` | | |
| `contentMd` | `String` | | 마크다운 본문 |
| `status` | `PostStatus` | (기본값 없음, 필수) | 투두/일정 상태 |
| `priority` | `Int` | `@default(0)` | 정렬 우선순위 |
| `blogCategory` | `BlogPostCategory` | `@default(INFO)` | 블로그 분류 |
| `reviewRatingHalf` | `Int?` | | 리뷰 별점(0.5 단위 → 정수, 예: 9 = 4.5★) |
| `startAt` | `DateTime?` | | 일정 시작 |
| `endAt` | `DateTime?` | | 일정 종료 |
| `allDay` | `Boolean` | `@default(false)` | 종일 |
| `isSecret` | `Boolean` | `@default(false)` | 비밀글 |
| `secretPasswordHash` | `String?` | | 비밀글 해시 비밀번호 |
| `isSpoiler` | `Boolean` | `@default(false)` | 스포일러 표시 |
| `slug` | `String?` | | URL 슬러그 |
| `createdAt` | `DateTime` | `@default(now())` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

- 관계: `board`(Cascade), `author`(Cascade), `comments Comment[]`.
- 제약: `@@unique([boardId, slug])` — 같은 보드 내 slug 중복 불가. 슬러그가 `NULL`이면 충돌 없음.

### `Comment` (`prisma/schema.prisma:148-160`)

| 필드 | 타입 | 옵션 |
| --- | --- | --- |
| `id` | `String` | `@id @default(cuid())` |
| `postId` | `String` | FK → Post (Cascade) |
| `authorId` | `String` | FK → User (Cascade) |
| `content` | `String` | |
| `createdAt` | `DateTime` | `@default(now())` |

- `updatedAt` 없음(댓글 수정 시각 미추적).

---

## 7. 생산성 도메인 — ScheduleShare / DiaryEntry

### `ScheduleShare` (`prisma/schema.prisma:359-377`)

캘린더/투두/가계부/주식 데이터의 사용자 간 공유 요청. 상세는 [feature-productivity.md](feature-productivity.md).

| 필드 | 타입 | 기본값/옵션 | 비고 |
| --- | --- | --- | --- |
| `id` | `String` | `@id @default(cuid())` | |
| `requesterId` | `String` | | 요청자(데이터를 보겠다는 쪽) FK |
| `ownerId` | `String` | | 데이터 소유자 FK |
| `scope` | `ScheduleShareScope` | (필수) | 공유 범위 |
| `status` | `ScheduleShareStatus` | `@default(PENDING)` | |
| `respondedAt` | `DateTime?` | | 수락/거절 시각 |
| `createdAt` | `DateTime` | `@default(now())` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

- 관계: `requester`(관계명 `"ScheduleShareRequester"`, Cascade), `owner`(관계명 `"ScheduleShareOwner"`, Cascade).
- 제약: `@@unique([requesterId, ownerId, scope])` — 같은 (요청자, 소유자, 범위) 조합 중복 불가.
- 인덱스: `@@index([requesterId, scope, status])`, `@@index([ownerId, scope, status])`.

### `DiaryEntry` (`prisma/schema.prisma:493-506`)

계정별 일별 마크다운 메모(공유 없음, 본인만 조회). 주석: "일기장 — 계정별 일별 마크다운 메모".

| 필드 | 타입 | 기본값/옵션 | 비고 |
| --- | --- | --- | --- |
| `id` | `String` | `@id @default(cuid())` | |
| `userId` | `String` | | FK → User (Cascade) |
| `date` | `String` | | **`"YYYY-MM-DD"` (KST 기준 하루)** |
| `contentMd` | `String` | `@db.Text` | 마크다운 본문 |
| `createdAt` | `DateTime` | `@default(now())` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

- 제약: `@@unique([userId, date])` — 사용자 1명당 날짜별 1건. upsert 키로 사용.
- `date`가 `DateTime`이 아닌 문자열인 점에 주의(2절 날짜 관례 참조).

---

## 8. 가계부 도메인 — FinancialAccount / LedgerEntry / BudgetTarget

가계부 상세 로직/카테고리는 [feature-ledger.md](feature-ledger.md).

### `FinancialAccount` (`prisma/schema.prisma:278-300`)

자산/지출 계좌. 한 계좌가 여러 `AccountType`을 가질 수 있도록 배열로 보관.

| 필드 | 타입 | 기본값/옵션 | 비고 |
| --- | --- | --- | --- |
| `id` | `String` | `@id @default(cuid())` | |
| `ownerId` | `String` | | FK → User (Cascade) |
| `name` | `String` | | |
| `bankName` | `String?` | | |
| `types` | `AccountType[]` | (배열) | 계좌 분류 다중 부여. 주식류(STOCK/ISA/PENSION)는 단독 운용 관례 |
| `memo` | `String?` | | |
| `initialBalance` | `Int` | `@default(0)` | 가계부 시작 시점 잔액(수입에 잡히지 않는 출발점) |
| `createdAt` | `DateTime` | `@default(now())` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

- 관계: `owner`(`"FinancialAccountOwner"`, Cascade), `ledgerEntries`(`"LedgerAccount"`), `holdings`(`"HoldingAccount"`), `budgetTargets`(`"BudgetTargetAccount"`).
- 인덱스: `@@index([ownerId])`.

### `LedgerEntry` (`prisma/schema.prisma:207-234`)

가계부 단건 거래(수입/지출).

| 필드 | 타입 | 기본값/옵션 | 비고 |
| --- | --- | --- | --- |
| `id` | `String` | `@id @default(cuid())` | |
| `ownerId` | `String` | | FK → User (Cascade) |
| `accountId` | `String?` | | FK → FinancialAccount (**SetNull**) |
| `type` | `LedgerEntryType` | (필수) | INCOME/EXPENSE |
| `amount` | `Int` | (필수) | 금액(원, 정수) |
| `description` | `String` | | |
| `category` | `String` | | 대분류 |
| `subcategory` | `String?` | | 소분류 |
| `excludeFromTotals` | `Boolean` | `@default(false)` | 합계 제외(이체·정산 등) |
| `occurredAt` | `DateTime` | `@default(now())` | 거래 발생 시각 |
| `createdAt` | `DateTime` | `@default(now())` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

- 관계: `owner`(`"LedgerEntryOwner"`, Cascade), `account`(`"LedgerAccount"`, SetNull), `holdingTransaction HoldingTransaction?`(역방향, 관계 `"HoldingTxLedger"`).
- 인덱스: `@@index([ownerId, occurredAt])`, `@@index([ownerId, type])`, `@@index([accountId])`.

### `BudgetTarget` (`prisma/schema.prisma:463-490`)

머니 챌린지 — 카테고리/소분류/계좌별 월간 지출 목표.

| 필드 | 타입 | 기본값/옵션 | 비고 |
| --- | --- | --- | --- |
| `id` | `String` | `@id @default(cuid())` | |
| `ownerId` | `String` | | FK → User (Cascade) |
| `scope` | `BudgetScope` | (필수) | CATEGORY / SUBCATEGORY / ACCOUNT |
| `category` | `String?` | | scope=CATEGORY/SUBCATEGORY 시 필수(앱 레벨) |
| `subcategory` | `String?` | | scope=SUBCATEGORY 시 필수(앱 레벨) |
| `accountId` | `String?` | | FK → FinancialAccount (**Cascade**). scope=ACCOUNT 시 필수 |
| `amount` | `Int` | (필수) | 월간 목표(원) |
| `memo` | `String?` | | |
| `enabled` | `Boolean` | `@default(true)` | |
| `createdAt` | `DateTime` | `@default(now())` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

- scope별 필수 필드 조합은 DB 제약이 아니라 애플리케이션 검증(스키마 주석 `prisma/schema.prisma:471-473`).
- 관계: `owner`(`"BudgetTargetOwner"`, Cascade), `account`(`"BudgetTargetAccount"`, **Cascade** — 계좌 삭제 시 목표도 삭제).
- 인덱스: `@@index([ownerId, enabled])`, `@@index([accountId])`.

---

## 9. 투자 도메인 — Holding / HoldingTransaction / Watchlist / StockNote / StockAlarm

투자/포트폴리오 상세는 [feature-investing.md](feature-investing.md).

### `Holding` (`prisma/schema.prisma:310-334`)

보유 종목(증권사 계좌에 묶일 수 있음).

| 필드 | 타입 | 기본값/옵션 | 비고 |
| --- | --- | --- | --- |
| `id` | `String` | `@id @default(cuid())` | |
| `ownerId` | `String` | | FK → User (Cascade) |
| `accountId` | `String?` | | FK → FinancialAccount (**SetNull**) |
| `name` | `String` | | 종목명 |
| `symbol` | `String?` | | 티커/종목코드 |
| `exchange` | `String?` | | 거래소 |
| `currency` | `String` | `@default("KRW")` | 통화 |
| `memo` | `String?` | | |
| `currentPrice` | `Float?` | | 현재가(시세) |
| `priceUpdatedAt` | `DateTime?` | | 시세 갱신 시각 |
| `createdAt` | `DateTime` | `@default(now())` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

- 관계: `owner`(`"HoldingOwner"`, Cascade), `account`(`"HoldingAccount"`, SetNull), `transactions HoldingTransaction[]`.
- 인덱스: `@@index([ownerId])`, `@@index([accountId])`.

### `HoldingTransaction` (`prisma/schema.prisma:336-357`)

종목 매매/배당/수수료/세금 거래. 가계부 `LedgerEntry` 1건과 1:1 연동 가능.

| 필드 | 타입 | 기본값/옵션 | 비고 |
| --- | --- | --- | --- |
| `id` | `String` | `@id @default(cuid())` | |
| `holdingId` | `String` | | FK → Holding (Cascade) |
| `type` | `HoldingTransactionType` | (필수) | BUY/SELL/DIVIDEND/FEE/TAX |
| `quantity` | `Float?` | | 수량(소수점 매매 지원) |
| `pricePerUnit` | `Float?` | | 단가 |
| `amount` | `Float` | (필수) | 거래 총액 |
| `occurredAt` | `DateTime` | `@default(now())` | |
| `memo` | `String?` | | |
| `ledgerEntryId` | `String?` | `@unique` | 연동 가계부 거래 FK (**SetNull**) |
| `createdAt` | `DateTime` | `@default(now())` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

- 관계: `holding`(Cascade), `ledgerEntry LedgerEntry?`(`"HoldingTxLedger"`, SetNull).
- 인덱스: `@@index([holdingId, occurredAt])`. `ledgerEntryId`는 `@unique`라 가계부 거래당 매매거래 최대 1건.

### `Watchlist` (`prisma/schema.prisma:396-412`)

☆ 관심목록.

| 필드 | 타입 | 기본값/옵션 | 비고 |
| --- | --- | --- | --- |
| `id` | `String` | `@id @default(cuid())` | |
| `userId` | `String` | | FK → User (Cascade) |
| `market` | `String` | | "KR","NAS","NYS","AMS","TYO" 등 |
| `symbol` | `String` | | KR=6자리 / 해외=티커 |
| `name` | `String` | | |
| `position` | `Int` | `@default(0)` | 정렬 순서 |
| `createdAt` | `DateTime` | `@default(now())` | |

- 관계: `user`(`"WatchlistOwner"`, Cascade).
- 제약: `@@unique([userId, market, symbol])`. 인덱스: `@@index([userId, position])`.

### `StockNote` (`prisma/schema.prisma:415-429`)

종목별 사용자 메모.

| 필드 | 타입 | 기본값/옵션 | 비고 |
| --- | --- | --- | --- |
| `id` | `String` | `@id @default(cuid())` | |
| `userId` | `String` | | FK → User (Cascade) |
| `market` | `String` | | "KR" / 해외 EXCD |
| `symbol` | `String` | | |
| `note` | `String` | `@db.Text` | 메모 본문 |
| `createdAt` | `DateTime` | `@default(now())` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

- 관계: `user`(`"StockNoteOwner"`, Cascade).
- 제약: `@@unique([userId, market, symbol])` — 종목당 메모 1건(upsert 키).

### `StockAlarm` (`prisma/schema.prisma:437-454`)

가격 도달 알람.

| 필드 | 타입 | 기본값/옵션 | 비고 |
| --- | --- | --- | --- |
| `id` | `String` | `@id @default(cuid())` | |
| `userId` | `String` | | FK → User (Cascade) |
| `market` | `String` | | |
| `symbol` | `String` | | |
| `name` | `String` | | |
| `target` | `Float` | (필수) | 도달 목표가 |
| `direction` | `AlarmDirection` | (필수) | ABOVE/BELOW |
| `enabled` | `Boolean` | `@default(true)` | |
| `triggeredAt` | `DateTime?` | | 마지막 발동 시각 |
| `createdAt` | `DateTime` | `@default(now())` | |

- 관계: `user`(`"StockAlarmOwner"`, Cascade).
- 인덱스: `@@index([userId, enabled])`.

---

## 10. KIS 연동 도메인 — KisCredential

한국투자증권 API 자격증명(사용자당 1개). 상세는 [integration-kis.md](integration-kis.md).

### `KisCredential` (`prisma/schema.prisma:259-276`)

| 필드 | 타입 | 기본값/옵션 | 비고 |
| --- | --- | --- | --- |
| `id` | `String` | `@id @default(cuid())` | |
| `userId` | `String` | `@unique` | FK → User (Cascade), 1:1 |
| `appKey` | `String` | | **AES-256-GCM 암호화 문자열로 저장** |
| `appSecret` | `String` | | **AES-256-GCM 암호화 문자열로 저장** |
| `accountNumber` | `String` | | CANO(앞 8자리) |
| `accountProductCode` | `String` | `@default("01")` | 계좌상품코드 |
| `isLive` | `Boolean` | `@default(true)` | 실전/모의 구분 |
| `accessToken` | `String?` | | 발급 토큰(**암호화 저장**) |
| `tokenExpiresAt` | `DateTime?` | | 토큰 만료 |
| `createdAt` | `DateTime` | `@default(now())` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

- 스키마 주석(`prisma/schema.prisma:257-258`): "appKey/appSecret/accessToken은 AES-256-GCM 암호화된 문자열로 저장". 실제 키/시크릿/토큰 평문은 DB에 저장되지 않습니다.
- `userId @unique`로 1:1 보장(`User.kisCredential KisCredential?`).

---

## 11. 권한 도메인 — MenuPermission / UserMenuPermission

메뉴별 접근 정책 + 사용자별 오버라이드. 상세는 [auth-permissions.md](auth-permissions.md).

### `MenuPermission` (`prisma/schema.prisma:508-521`)

메뉴 단위 기본 접근 정책.

| 필드 | 타입 | 기본값/옵션 | 비고 |
| --- | --- | --- | --- |
| `id` | `String` | `@id @default(cuid())` | |
| `key` | `String` | `@unique` | 메뉴 식별 키 |
| `label` | `String` | | 표시명 |
| `path` | `String` | | 경로 |
| `requireLogin` | `Boolean` | `@default(true)` | 로그인 필요 여부 |
| `minRole` | `Role` | `@default(USER)` | 최소 권한 |
| `visible` | `Boolean` | `@default(true)` | 노출 여부 |
| `createdAt` | `DateTime` | `@default(now())` | |
| `updatedAt` | `DateTime` | `@updatedAt` | |

- 관계: `userOverrides UserMenuPermission[]`.
- `key`가 unique이므로 중복 insert 시 `P2002` 발생 가능.

### `UserMenuPermission` (`prisma/schema.prisma:379-393`)

사용자별 메뉴 허용/차단 오버라이드.

| 필드 | 타입 | 기본값/옵션 | 비고 |
| --- | --- | --- | --- |
| `id` | `String` | `@id @default(cuid())` | |
| `userId` | `String` | | FK → User (Cascade) |
| `menuKey` | `String` | | FK → MenuPermission.`key` (Cascade) |
| `mode` | `PermissionOverrideMode` | (필수) | ALLOW / DENY |
| `createdAt` | `DateTime` | `@default(now())` | |

- 관계: `user`(Cascade), `menu MenuPermission @relation(fields: [menuKey], references: [key], onDelete: Cascade)` — **참조 키가 `id`가 아니라 `key`인 점에 주의**.
- 제약: `@@unique([userId, menuKey])` — 유저-메뉴당 오버라이드 1건.

---

## 12. 제약/인덱스 요약

| 모델 | unique 제약 | 인덱스 |
| --- | --- | --- |
| `User` | `email` | — |
| `Account` | `[provider, providerAccountId]` | — |
| `Session` | `sessionToken` | — |
| `VerificationToken` | `token`, `[identifier, token]` | — |
| `Post` | `[boardId, slug]` | — |
| `ScheduleShare` | `[requesterId, ownerId, scope]` | `[requesterId, scope, status]`, `[ownerId, scope, status]` |
| `DiaryEntry` | `[userId, date]` | — |
| `FinancialAccount` | — | `[ownerId]` |
| `LedgerEntry` | — | `[ownerId, occurredAt]`, `[ownerId, type]`, `[accountId]` |
| `BudgetTarget` | — | `[ownerId, enabled]`, `[accountId]` |
| `Holding` | — | `[ownerId]`, `[accountId]` |
| `HoldingTransaction` | `ledgerEntryId` | `[holdingId, occurredAt]` |
| `Watchlist` | `[userId, market, symbol]` | `[userId, position]` |
| `StockNote` | `[userId, market, symbol]` | — |
| `StockAlarm` | — | `[userId, enabled]` |
| `KisCredential` | `userId` | — |
| `MenuPermission` | `key` | — |
| `UserMenuPermission` | `[userId, menuKey]` | — |

### onDelete 동작 요약

| 자식 모델(FK) | 부모 | onDelete |
| --- | --- | --- |
| `Account.userId`, `Session.userId` | User | Cascade |
| `Board.ownerId` | User | Cascade |
| `Post.boardId` / `Post.authorId` | Board / User | Cascade |
| `Comment.postId` / `Comment.authorId` | Post / User | Cascade |
| `ScheduleShare.requesterId` / `.ownerId` | User | Cascade |
| `DiaryEntry.userId` | User | Cascade |
| `FinancialAccount.ownerId` | User | Cascade |
| `LedgerEntry.ownerId` | User | Cascade |
| `LedgerEntry.accountId` | FinancialAccount | **SetNull** |
| `BudgetTarget.ownerId` | User | Cascade |
| `BudgetTarget.accountId` | FinancialAccount | **Cascade** |
| `Holding.ownerId` | User | Cascade |
| `Holding.accountId` | FinancialAccount | **SetNull** |
| `HoldingTransaction.holdingId` | Holding | Cascade |
| `HoldingTransaction.ledgerEntryId` | LedgerEntry | **SetNull** |
| `Watchlist/StockNote/StockAlarm.userId` | User | Cascade |
| `KisCredential.userId` | User | Cascade |
| `UserMenuPermission.userId` | User | Cascade |
| `UserMenuPermission.menuKey` | MenuPermission(`key`) | Cascade |

---

## 13. 마이그레이션 히스토리

`prisma/migrations/`의 디렉터리 순서(타임스탬프 = 적용 순서). `migration_lock.toml`의 provider는 `postgresql`.

| # | 마이그레이션 | 주요 변경 |
| --- | --- | --- |
| 1 | `20251226005850_auth` | `Role` enum, `User`/`Account`/`Session`/`VerificationToken` 생성 |
| 2 | `20260102013811_boards_posts_comments` | `PostStatus` enum, `Board`/`Post`/`Comment` 추가 |
| 3 | `20260107015552_add_board_type_and_post_slug` | `BoardType` enum, `Post.slug` 추가 |
| 4 | `20260119032030_leesh` | `User.emailVerified` 컬럼 추가 |
| 5 | `20260121063620` | `BoardType += HELP`, `Post` slug 단일 unique → `[boardId, slug]` 복합 unique 전환 |
| 6 | `20260121235031_add_menu_permission` | `MenuPermission` 추가 |
| 7 | `20260122001357_add_user_menu_permission` | `PermissionOverrideMode` enum, `UserMenuPermission` 추가 |
| 8 | `20260123052505_add_board_single_schedule` | `Board.singleSchedule`/`scheduleStatus`/`scheduleStartAt`/`scheduleEndAt`/`scheduleAllDay` 추가 |
| 9 | `20260209021000_add_schedule_share` | `ScheduleShareStatus` enum + `ScheduleShare` 테이블 추가(이 시점엔 `scope` 컬럼 없이 `[requesterId, ownerId]` 단일 unique) |
| 10 | `20260209033000_split_schedule_share_scope` | `ScheduleShareScope` enum(CALENDAR/TODO) 신설 + `ScheduleShare.scope` 컬럼 추가, unique를 `[requesterId, ownerId, scope]`로 전환(기존 공유를 TODO 범위로 백필) |
| 11 | `20260409090000_add_docs_board_type` | `BoardType += DOCS` |
| 12 | `20260409093000_add_blog_post_meta` | `BlogPostCategory` enum, `Post.blogCategory`/`reviewRatingHalf` 추가 |
| 13 | `20260513014226_leesh_20260513` | 블로그 메타 관련 인덱스 정리(`Post_blogCategory_reviewRatingHalf_idx` drop) |
| 14 | `20260513020000_add_ledger_entry` | `LedgerEntryType` enum, `LedgerEntry` 추가, `ScheduleShareScope += LEDGER` |
| 15 | `20260513030000_add_ledger_exclude_from_totals` | `LedgerEntry.excludeFromTotals` 추가 |
| 16 | `20260513040000_add_holdings` | `HoldingTransactionType` enum, `Holding`/`HoldingTransaction` 추가 |
| 17 | `20260513050000_add_stock_share_scope` | `ScheduleShareScope += STOCK` |
| 18 | `20260513060000_holding_float_exchange` | `Holding.exchange`/`priceUpdatedAt` 추가, 수량/가격 Int → Float 전환 |
| 19 | `20260513070000_add_financial_account` | `AccountType` enum, `FinancialAccount` 추가 |
| 20 | `20260513080000_account_type_overhaul` | `AccountType` enum 전면 재구성(타입 swap, CASH/CHECKING→LIVING, CRYPTO→OTHER 매핑) |
| 21 | `20260513090000_holding_account` | `Holding.accountId`(계좌 지정) 추가, 단일 주식계좌 partial unique 제거 |
| 22 | `20260513100000_add_checking_account_type` | `AccountType += CHECKING` (SAVINGS 앞에 삽입) |
| 23 | `20260513110000_account_types_array` | `FinancialAccount.type`(단일) → `types AccountType[]`(배열) 전환 |
| 24 | `20260513120000_add_kis_credential` | `KisCredential` 추가 |
| 25 | `20260515000000_add_watchlist_notes_alarms` | `Watchlist`/`StockNote`/`StockAlarm` + `AlarmDirection` enum 추가 |
| 26 | `20260518000000_add_post_is_spoiler` | `Post.isSpoiler` 추가 |
| 27 | `20260520000000_add_budget_target` | `BudgetScope` enum, `BudgetTarget` 추가 |
| 28 | `20260520010000_add_account_initial_balance` | `FinancialAccount.initialBalance` 추가 |
| 29 | `20260623000000_add_diary_entry` | `DiaryEntry` 추가(문자열 `date` 키) |

> PostgreSQL은 enum 값 삭제가 불가하므로, `AccountType` 재구성(#20)은 새 타입을 만들어 컬럼을 swap하는 패턴을 사용합니다(`prisma/migrations/20260513080000_account_type_overhaul/migration.sql`).

---

## 14. 주의사항 / 운영 메모

1. `MenuPermission.key`, `User.email`, `Session.sessionToken` 등 unique 컬럼은 중복 insert 시 Prisma `P2002` 발생.
2. `UserMenuPermission`은 FK가 `MenuPermission.id`가 아닌 `key`를 참조한다(`prisma/schema.prisma:386`). 메뉴 key를 바꾸면 오버라이드가 끊긴다.
3. `BudgetTarget.accountId`는 Cascade, `LedgerEntry.accountId`/`Holding.accountId`는 SetNull — 계좌 삭제 시 동작이 다르므로 정산 로직에서 유의.
4. `DiaryEntry.date`, `Watchlist/StockNote/StockAlarm.market/symbol`는 문자열 식별자라 입력 정규화(대소문자/포맷)가 unique 충돌에 직접 영향.
5. 금액 필드 단위 혼재: `LedgerEntry.amount`/`BudgetTarget.amount`/`FinancialAccount.initialBalance`는 `Int`(원), `Holding`/`HoldingTransaction`의 가격·수량·금액은 `Float`(소수점 매매·해외통화 대응).
6. 모든 시각 컬럼은 KST 기준(`app/lib/prisma.ts`의 커넥션 타임존 설정에 의존).
