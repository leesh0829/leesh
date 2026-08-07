# 정산(청구/비상금) — 가계부 내역 통합 설계

- 날짜: 2026-08-07
- 상태: 승인됨
- 선행: `2026-08-05-settlement-tracker-design.md` (별도 Settlement 모델 기반, 본 문서로 대체)

## 배경 / 변경 동기

기존 정산 기능은 **별도 `Settlement` 테이블 + 전용 페이지에서 직접 생성**하는 구조였다.
사용자 피드백: 청구/비상금은 결국 "내가 실제로 쓴 돈"이므로 **가계부 내역(LedgerEntry)의 일부**여야 하고,

- 추가: 가계부 `항목 추가`에서 버튼으로
- 수정: 내역 인라인 수정에서 버튼으로
- 정산 대기함(`/ledger/settlements`)은 **추가하지 않고**, 태그 달린 내역만 모아 **정산/미정산 여부를 체크(토글)**만
- 내역 목록에도 **정산 여부를 작게** 표시

## 핵심 결정

- **데이터**: `Settlement` 별도 테이블 제거, `LedgerEntry`에 정산 태그 필드 추가 (사용자 승인)
- **가정 A**: 청구·비상금은 **지출(EXPENSE) 전용** — 태그 선택 시 type을 EXPENSE로 고정
- **가정 B**: 청구·비상금도 **가계부 합계에 정상 반영**(실제 나간 돈). 정산 여부는 회수/상환 추적 라벨일 뿐 합계와 무관. (기존 결정대로 정산완료 시 자동 내역 생성 없음 — 상태만 변경)
- 소유자 본인만 (공유 대상 아님)

## 데이터 모델

`LedgerEntry`에 추가:

```prisma
settlementKind   SettlementKind?    // null = 일반 내역, 값 있으면 청구/비상금
settlementStatus SettlementStatus?  // kind가 있을 때만 PENDING/SETTLED
settledAt        DateTime?          // 정산완료 처리 시각

@@index([ownerId, settlementKind])
```

- 불변식: `settlementStatus`는 `settlementKind`가 null이면 반드시 null, 값이 있으면 반드시 PENDING/SETTLED
- enum `SettlementKind`(REIMBURSEMENT/EMERGENCY), `SettlementStatus`(PENDING/SETTLED)는 **그대로 유지**하고 LedgerEntry가 사용
- `Settlement` 모델 및 User·FinancialAccount의 back-relation(`settlements`) **삭제**

### 마이그레이션

`prisma/migrations/20260807000000_settlement_on_ledger/migration.sql` (손으로 작성 — 로컬 DB 규칙):

1. `ALTER TABLE "LedgerEntry" ADD COLUMN "settlementKind" "SettlementKind"`, `ADD COLUMN "settlementStatus" "SettlementStatus"`, `ADD COLUMN "settledAt" TIMESTAMP(3)`
2. `CREATE INDEX "LedgerEntry_ownerId_settlementKind_idx" ON "LedgerEntry"("ownerId", "settlementKind")`
3. `DROP TABLE "Settlement"` (인덱스·FK 자동 제거). enum 타입은 유지.

- 운영(Neon): Settlement가 배포된 적 없음 → `20260806000000_add_settlement` 실행 후 본 마이그레이션이 DROP (forward-only, 안전)
- 로컬 dev: Settlement 존재하나 테스트용 빈 데이터 → DROP 안전

## API

### `POST /api/ledger` (route.ts)
- `entryCreateSchema`에 `settlementKind: z.enum(['REIMBURSEMENT','EMERGENCY']).nullable().optional()` 추가
- settlementKind 지정 시: `type` 강제 EXPENSE, `settlementStatus='PENDING'`, `settledAt=null`
- 미지정 시: 세 필드 모두 null

### `PATCH /api/ledger/[entryId]` (route.ts)
- `entryPatchSchema`에 `settlementKind`(nullable, 해제 허용), `settlementStatus`(enum optional, 대기함 토글용) 추가
- 전이 규칙:
  - kind: null→값 : status 없으면 PENDING으로 초기화 + `type` EXPENSE로 강제(가정 A)
  - kind: 값→null : status·settledAt 클리어
  - status 지정 시: `settledAt = settledAtForStatus(status, now)` (SETTLED면 now, PENDING이면 null)
  - status를 주었는데 대상 내역에 kind가 없으면(설정 중도 아님) 400
- GET select/응답 매핑에 세 필드 추가

### `GET /api/ledger/settlements` (route.ts)
- Settlement 대신 **`LedgerEntry` where `settlementKind != null`** 조회로 교체
- 선택 필터: `kind`, `status`
- 응답 `{ items, summary }` — summary는 `settlementStatus='PENDING'`을 kind별로 합산(별도 groupBy)
- **POST 제거** (생성은 내역에서)

### `/api/ledger/settlements/[id]/route.ts`
- **파일 삭제.** 상태 토글은 `PATCH /api/ledger/[entryId]` `{settlementStatus}` 재사용

## UI

### `app/lib/settlements.ts`
- 라벨·`settledAtForStatus`·`summarizeSettlements` 유지 (기존 테스트 계속 유효)

### `app/ledger/LedgerClient.tsx`
- `LedgerItem` 타입에 settlementKind/settlementStatus/settledAt 추가
- **항목 추가 폼**: `일반 / 청구 / 비상금` 버튼 3개 (state `formSettlementKind`). 청구·비상금 선택 시 type=EXPENSE 고정. create payload에 settlementKind 포함
- **인라인 수정 폼**: 동일 버튼 3개 (state `editSettlementKind`). saveEdit payload에 settlementKind 포함(해제는 null)
- **내역 카드**: settlementKind 있으면 작은 배지 `청구 · 미정산` / `비상금 · 정산완료` (청구=sky, 비상금=amber, 정산완료 흐리게)

### `app/ledger/settlements/SettlementsClient.tsx`
- 생성·수정·삭제 폼 **전부 제거**
- 요약 카드(받을 청구/갚을 비상금) + kind/status 필터 + 목록 유지
- 각 행에 `[정산 완료]`/`[미정산으로]` 토글만 → `PATCH /api/ledger/[entryId]` `{settlementStatus}`
- "추가·수정은 가계부 내역에서" 안내 + `/ledger` 링크

### 메인 페이지 요약 카드
- 기존대로 `GET /api/ledger/settlements`의 `.summary` 사용 — 교체된 엔드포인트로 그대로 동작

## 검증

- `node --test tests/settlements.test.ts` (라벨/summarize/settledAt)
- `npx tsc --noEmit 2>&1 | grep -vE '^tests/' | grep -E 'error TS'` → 0
- lint + build
- 마이그레이션은 손으로 작성 후 DB 기동 시 `migrate deploy`로 적용(로컬 DB 상시 미기동 가능)

## 영향 파일

1. `prisma/schema.prisma`
2. `prisma/migrations/20260807000000_settlement_on_ledger/migration.sql` (신규)
3. `app/api/ledger/route.ts`
4. `app/api/ledger/[entryId]/route.ts`
5. `app/api/ledger/settlements/route.ts`
6. `app/api/ledger/settlements/[id]/route.ts` (삭제)
7. `app/ledger/LedgerClient.tsx`
8. `app/ledger/settlements/SettlementsClient.tsx`
9. `docs/feature-ledger.md` (문서 갱신)
