# 정산 대기함 — 청구 · 비상금 통합 트래커 설계

> 작성 기준: 2026-08-05, dev 브랜치
> 관련 문서: [feature-ledger.md](../../feature-ledger.md) · [database.md](../../database.md) · [api-reference.md](../../api-reference.md)

## 1. 배경 · 목적

다음 월급에 **정상화될 예정이라 지금 잔고가 어긋나 있는 돈**을 한 곳에서 추적·확인하는 기능. 두 종류를 다룬다.

- **청구(REIMBURSEMENT)** — 회사 관련 사정으로 개인카드로 결제하고 청구를 올려, 다음 월급에 함께 환급받아야 하는 돈. *받을 돈(receivable)*.
- **비상금(EMERGENCY)** — 급전이 없어 비상금 계좌에서 임시로 빼 쓴 돈. 다음 월급에 되갚아 채워야 하는 돈. *갚을 돈(payable)*.

둘 다 「미정산 → (다음 월급) → 정산완료」 라이프사이클을 가지며, 두 방향(받을/갚을)만 반대다. 사용자가 놓치지 않도록 **미정산 잔액을 눈에 띄게 보여주고, 정산 완료를 체크**하는 것이 목표다.

### 결정 사항 (사용자 확정)

1. **정산 처리 = 상태만 전환.** "정산 완료" 시 가계부에 실제 거래(환급 수입 / 비상금 되갚기 이체)를 **자동 생성하지 않는다.** 트래커는 체크리스트·확인용이며, 실제 돈 이동은 사용자가 기존 가계부 화면에서 직접 기입한다. → 이중 기입 위험 없음, 로직 단순.
2. **데이터 구조 = 단일 모델 + 종류 구분.** 청구/비상금을 하나의 `Settlement` 모델로 통합하고 `kind` 필드로 구분. 목록·정산 로직을 공유하고 화면에서 탭/필터로 나눈다.
3. **배치 = 전용 하위 페이지 + 메인 요약 카드.** `/ledger/settlements` 전용 페이지에서 상세 관리, 메인 `/ledger`에는 미정산 합계를 보여주는 컴팩트 요약 카드를 둔다.

## 2. 데이터 모델

`prisma/schema.prisma`에 enum 2개 + 모델 1개를 추가한다. 기존 `BudgetTarget`(`:463`) 스타일을 따르며 **본인 전용**(공유 대상 아님, 예산과 동일).

```prisma
enum SettlementKind {
  REIMBURSEMENT // 청구 (개인카드 대납 → 회사가 환급)
  EMERGENCY     // 비상금 사용 (비상금 계좌에서 임시 인출 → 되갚기)
}

enum SettlementStatus {
  PENDING // 미정산
  SETTLED // 정산완료
}

model Settlement {
  id String @id @default(cuid())

  ownerId String
  owner   User   @relation("SettlementOwner", fields: [ownerId], references: [id], onDelete: Cascade)

  // 참고용 연결 계좌 (비상금 출처 계좌 / 청구한 카드 등). 선택.
  accountId String?
  account   FinancialAccount? @relation("SettlementAccount", fields: [accountId], references: [id], onDelete: SetNull)

  kind   SettlementKind
  status SettlementStatus @default(PENDING)

  amount      Int    // 원 단위 정수
  description String // 사유 / 내역

  occurredAt DateTime  @default(now()) // 사용 / 청구 발생일
  settledAt  DateTime?                 // 정산 완료 시각 (SETTLED일 때만)

  memo String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([ownerId, status])
  @@index([ownerId, kind])
  @@index([accountId])
}
```

역관계 추가:
- `User` 모델에 `settlements Settlement[] @relation("SettlementOwner")`
- `FinancialAccount` 모델에 `settlements Settlement[] @relation("SettlementAccount")`

**Cascade 방향**: 사용자 삭제 → 정산 항목 함께 삭제(Cascade). 계좌 삭제 → 정산 항목의 `accountId`만 해제(SetNull), 항목 보존. (기존 `LedgerEntry.accountId`와 동일 관례.)

## 3. 라이브러리 — `app/lib/settlements.ts`

라우트와 클라이언트가 공유할 라벨·요약 유틸.

| export | 내용 |
|---|---|
| `SETTLEMENT_KINDS` | `[{ key:'REIMBURSEMENT', label:'청구' }, { key:'EMERGENCY', label:'비상금' }]` |
| `SETTLEMENT_KIND_LABEL` | `{ REIMBURSEMENT:'청구', EMERGENCY:'비상금' }` |
| `SETTLEMENT_STATUS_LABEL` | `{ PENDING:'미정산', SETTLED:'정산완료' }` |
| `summarizeSettlements(items)` | 미정산분만 합산해 `{ reimbursementPending, emergencyPending }` 반환 |

> 라벨 방향 문구: 청구 = "받을 청구", 비상금 = "갚을 비상금". 요약 카드/페이지에서 사용.

## 4. API — `/api/ledger/settlements`

`/api/ledger/budgets` 라우트 3종을 그대로 미러링한다. 모두 `runtime = 'nodejs'`, `getCurrentUserId()` 인증, `parseJsonWithSchema` + `badRequestFromZod`, zod `.strict()`.

### 4.1 `GET /api/ledger/settlements` — `app/api/ledger/settlements/route.ts`
- **인증**: 필수(401 `unauthorized`).
- **쿼리(옵션)**: `kind`(`REIMBURSEMENT`|`EMERGENCY`), `status`(`PENDING`|`SETTLED`). 유효값만 `where`에 적용.
- **범위**: 본인(`ownerId=userId`)만. 공유 없음.
- **정렬**: 미정산 우선, 그다음 `occurredAt` 내림차순. (구현: `orderBy: [{ status: 'asc' }, { occurredAt: 'desc' }]` — `PENDING` < `SETTLED` 알파벳 순으로 미정산이 먼저.)
- **응답**: `{ items: [...], summary: { reimbursementPending, emergencyPending } }`. `summary`는 **필터와 무관하게 전체 미정산** 기준(요약 카드가 필터에 흔들리지 않도록 별도 집계). 각 item은 날짜 `toISOStringSafe()` 직렬화.

### 4.2 `POST /api/ledger/settlements` — 생성
- **바디**(zod `.strict()`): `kind`(enum), `amount`(int 1~2,000,000,000), `description`(1~200), `occurredAt?`(문자열|null, 유효 Date만; 없으면 `new Date()`), `accountId?`(≤40|null), `memo?`(≤200|null). `status`는 항상 `PENDING`으로 생성(바디로 받지 않음).
- **검증**: `accountId` 지정 시 **본인 소유** 확인(아니면 404 `account not found`).
- **응답**: `{ id }`.

### 4.3 `PATCH /api/ledger/settlements/[id]` — 수정 겸 정산 토글
- **권한**: `findFirst({ id, ownerId })` 없으면 404.
- **바디**(부분 갱신, `.strict()`): `kind?`, `amount?`, `description?`, `occurredAt?`, `accountId?`, `memo?`, `status?`.
- **정산 규칙**: `status`가 `SETTLED`로 바뀌면 `settledAt = new Date()` 세팅. `PENDING`으로 되돌리면 `settledAt = null`. `status` 미포함이면 `settledAt` 불변.
- **검증**: `accountId` 변경 시 본인 소유 확인. `occurredAt`은 유효한 Date 문자열이면 갱신, `''`/`null`/미포함이면 **변경 안 함**(현재값 유지).
- **응답**: `{ ok: true }`.

### 4.4 `DELETE /api/ledger/settlements/[id]` — 삭제
- 동일 권한(404) 후 삭제, `{ ok: true }`.

## 5. 프론트 — 전용 페이지 `/ledger/settlements`

### 5.1 `app/ledger/settlements/page.tsx`
Thin wrapper (기존 `budgets/page.tsx`와 동일):
```tsx
import SettlementsClient from './SettlementsClient'
export const runtime = 'nodejs'
export default function SettlementsPage() { return <SettlementsClient /> }
```

### 5.2 `app/ledger/settlements/SettlementsClient.tsx`
- 마운트 시 `GET /api/ledger/settlements`(+ `GET /api/accounts`로 계좌 옵션) 로드. `useAsyncLock`으로 중복 요청 방지(기존 관례).
- **상단 요약**: 「받을 청구 ₩X」「갚을 비상금 ₩Y」 (미정산 합계, `summary` 사용).
- **필터 바**: 종류(전체/청구/비상금) · 상태(전체/미정산/정산완료). **클라이언트 사이드 필터**(로드된 `items` 배열을 메모리 필터링, 재요청 없음).
- **입력 폼**: 종류(라디오/칩) · 금액(숫자만 추출) · 내역 · 발생일(`datetime-local`) · 계좌(선택 드롭다운) · 메모 → `POST`.
- **목록 카드/행**: 종류 배지(청구/비상금 색 구분) · 금액 · 내역 · 발생일 · 상태 배지 · 미정산이면 `[정산 완료]` 버튼(→ `PATCH status=SETTLED`) · 정산완료면 `[되돌리기]` · 인라인 수정 · 삭제. 삭제/정산은 확인 후 실행.
- **네비**: 페이지 헤더에 `LedgerNavBack` + 기타 하위 네비 버튼(기존 `BudgetsClient` 헤더 패턴 참고).

### 5.3 나머지 하위 페이지 네비 노출
`app/ledger/LedgerNavIcons.tsx`에 `LedgerNavSettlements`(신규 아이콘 + `href="/ledger/settlements"`, `label="정산 대기함"`)를 추가하고, 기존 네비 클러스터가 있는 화면들(최소 `LedgerClient`, 필요 시 `SettlementsClient`)에 버튼을 노출한다.

## 6. 프론트 — 메인 요약 카드 (`LedgerClient`)

- `app/ledger/LedgerClient.tsx` 네비 클러스터(`:1158` `flex shrink-0 …`)에 `LedgerNavSettlements` 버튼 추가.
- 메인 상단에 **컴팩트 요약 카드** 1개 추가: 「미정산 청구 ₩X · 갚을 비상금 ₩Y」, 클릭 시 `/ledger/settlements` 이동. 미정산 0원이면 카드 숨김(또는 "정산 대기 없음" 표기).
- 데이터는 `GET /api/ledger/settlements`의 `summary`만 가볍게 호출(별도 `useEffect`, 기존 대형 로직에 최소 침습). 2.3k줄 파일이므로 **삽입은 최소 범위**로 제한.

## 7. 권한

- 하위 페이지 `/ledger/settlements`는 기존 `ledger` 메뉴 권한 키(`app/api/permission/route.ts`, `path:'/ledger'`, `requireLogin:true`, `minRole:USER`)에 포함된다. 다른 하위 페이지(`accounts`/`budgets`/`stats`/`calendar`)와 동일하게 **별도 권한 엔트리 불필요**.
- 모든 API는 로그인 필수, 본인 데이터만. 공유 대상 아님.

## 8. 테스트 · 마이그레이션 · 검증

- **유닛 테스트**: `tests/settlementValidation.test.ts` — POST/PATCH zod 스키마(경계값: amount 0/음수/초과, description 길이, kind enum, status 전환 시 settledAt 규칙)와 `summarizeSettlements` 집계를 검증. 기존 `tests/holdingTransactionValidation.test.ts` 스타일.
- **마이그레이션**: `prisma migrate dev --name add_settlement` 로 `Settlement` 테이블 + enum 생성. (프로덕션은 `scripts/migrate-prod.ps1` 관례 — Windows fallback.)
- **검증 절차**: `prisma generate` → `npm run build`(또는 `tsc`) → 관련 테스트 실행 중 최소 1개(빌드 + settlement 테스트). CLAUDE.md 완료 기준 준수.

## 9. 범위 밖 (YAGNI)

요청에 없어 제외한다.
- 정산 완료 시 가계부 거래 자동 생성 (사용자 결정: 상태만 전환).
- 정산 항목 공유(LEDGER scope) — 본인 전용.
- 예상 정산월/디데이 필드, 알림/리마인더.
- 통계(`/ledger/stats`) 연동, 예산(`BudgetTarget`) 연동.
- 가계부 항목(`LedgerEntry`)과의 하드 링크(정산 ↔ 특정 거래 매핑). `accountId` 소프트 참조까지만.

## 10. 파일 변경 요약

| 파일 | 변경 |
|---|---|
| `prisma/schema.prisma` | enum `SettlementKind`/`SettlementStatus` + model `Settlement` 추가, `User`·`FinancialAccount` 역관계 추가 |
| `prisma/migrations/*` | 신규 마이그레이션 |
| `app/lib/settlements.ts` | 신규 — 라벨·요약 유틸 |
| `app/api/ledger/settlements/route.ts` | 신규 — GET/POST |
| `app/api/ledger/settlements/[id]/route.ts` | 신규 — PATCH/DELETE |
| `app/ledger/settlements/page.tsx` | 신규 — wrapper |
| `app/ledger/settlements/SettlementsClient.tsx` | 신규 — 메인 클라이언트 |
| `app/ledger/LedgerNavIcons.tsx` | `LedgerNavSettlements` 추가 |
| `app/ledger/LedgerClient.tsx` | 네비 버튼 + 요약 카드(최소 침습) |
| `tests/settlementValidation.test.ts` | 신규 — 유닛 테스트 |
| `docs/feature-ledger.md` | (선택) 정산 대기함 섹션 추가 |
</content>
