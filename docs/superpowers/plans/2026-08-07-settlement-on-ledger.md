# 정산(청구/비상금) 내역 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 청구/비상금을 별도 Settlement 테이블이 아닌 `LedgerEntry`의 정산 태그로 통합해, 가계부 내역에서 추가·수정하고 정산 대기함에서는 정산 여부만 체크하도록 바꾼다.

**Architecture:** `LedgerEntry`에 `settlementKind`/`settlementStatus`/`settledAt` 필드를 추가하고 `Settlement` 테이블을 제거한다. 생성·수정은 `/api/ledger` (+ `[entryId]`)로 일원화하고, `/api/ledger/settlements` GET은 태그 달린 내역 조회로 교체한다. UI는 가계부 폼/내역에 정산 태그 버튼·배지를 추가하고, 정산 대기함은 조회 + 상태 토글 전용으로 축소한다.

**Tech Stack:** Next.js 16 (App Router, runtime=nodejs), Prisma 7 + @prisma/adapter-pg, PostgreSQL, zod 4(.strict()), React 19, TypeScript. 테스트: `node --test tests/*.test.ts` (Node v24 네이티브 TS).

## Global Constraints

- zod 스키마는 `.strict()` 유지, 기존 파일 스타일(들여쓰기·에러 메시지 한국어) 준수
- 로컬 Postgres는 보통 미기동 → 마이그레이션은 **손으로 작성**하고 적용은 DB 기동 시 `npx prisma migrate deploy`로 (참고: memory `local-db-migrations`)
- 타입체크 통과 기준: `npx tsc --noEmit 2>&1 | grep -vE '^tests/' | grep -E 'error TS'` → 출력 0줄 (tests/의 `.ts` import 에러는 기존 노이즈)
- 가정 A: 청구·비상금은 지출(EXPENSE) 전용 — 태그 지정 시 type을 EXPENSE로 고정
- 가정 B: 청구·비상금도 합계에 정상 반영(자동 제외 안 함). 정산완료 시 자동 내역 생성 없음(상태만 변경)
- enum `SettlementKind`(REIMBURSEMENT/EMERGENCY), `SettlementStatus`(PENDING/SETTLED)는 유지·재사용
- 소유자 본인만 (정산 태그는 공유 대상 아님)

---

## File Structure

- `prisma/schema.prisma` — LedgerEntry에 3필드+인덱스 추가, Settlement 모델·관계 삭제 (Task 1)
- `prisma/migrations/20260807000000_settlement_on_ledger/migration.sql` — 신규 (Task 1)
- `app/api/ledger/route.ts` — POST 생성 시 정산 태그 처리, GET 응답에 필드 추가 (Task 2)
- `app/api/ledger/[entryId]/route.ts` — PATCH 정산 태그/상태 전이 (Task 3)
- `app/api/ledger/settlements/route.ts` — GET을 태그 달린 LedgerEntry 조회로 교체, POST 제거 (Task 4)
- `app/api/ledger/settlements/[id]/route.ts` — 삭제 (Task 4)
- `app/ledger/LedgerClient.tsx` — 추가/수정 폼 정산 버튼, 내역 배지, 요약 갱신 (Task 5)
- `app/ledger/settlements/SettlementsClient.tsx` — 조회+토글 전용으로 축소 (Task 6)
- `docs/feature-ledger.md` — 문서 갱신 + 최종 검증 (Task 7)

---

### Task 1: 스키마 + 마이그레이션 (데이터 모델)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260807000000_settlement_on_ledger/migration.sql`

**Interfaces:**
- Produces: `LedgerEntry.settlementKind: SettlementKind?`, `settlementStatus: SettlementStatus?`, `settledAt: DateTime?`

- [ ] **Step 1: LedgerEntry에 필드/인덱스 추가**

`prisma/schema.prisma`의 `model LedgerEntry` 안, `excludeFromTotals Boolean @default(false)` 다음 줄에 추가:

```prisma
  excludeFromTotals Boolean @default(false)

  settlementKind   SettlementKind?
  settlementStatus SettlementStatus?
  settledAt        DateTime?
```

그리고 같은 모델의 인덱스 블록에 한 줄 추가:

```prisma
  @@index([ownerId, occurredAt])
  @@index([ownerId, type])
  @@index([accountId])
  @@index([ownerId, settlementKind])
```

- [ ] **Step 2: Settlement 모델·관계 삭제**

`model Settlement { ... }` 블록 전체 삭제. 또한:
- `model User`에서 `settlements Settlement[] @relation("SettlementOwner")` 줄 삭제
- `model FinancialAccount`에서 `settlements   Settlement[]  @relation("SettlementAccount")` 줄 삭제

enum `SettlementKind`, `SettlementStatus` 정의는 **그대로 둔다**(LedgerEntry가 사용).

- [ ] **Step 3: 마이그레이션 SQL 작성**

`prisma/migrations/20260807000000_settlement_on_ledger/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "settlementKind" "SettlementKind",
ADD COLUMN     "settlementStatus" "SettlementStatus",
ADD COLUMN     "settledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "LedgerEntry_ownerId_settlementKind_idx" ON "LedgerEntry"("ownerId", "settlementKind");

-- DropTable
DROP TABLE "Settlement";
```

(enum 타입은 유지. Settlement 테이블의 FK는 DROP TABLE로 함께 제거됨. 운영엔 add_settlement 실행 후 이 마이그레이션이 DROP → forward-only 안전.)

- [ ] **Step 4: Prisma 클라이언트 재생성 + 검증**

Run: `npx prisma generate` (오프라인, 타입만)
Expected: 성공. 이어서 `npx prisma validate` → "The schema is valid".

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260807000000_settlement_on_ledger/
git commit -m "✨ 정산 필드를 LedgerEntry로 이전 (스키마·마이그레이션)"
```

---

### Task 2: `/api/ledger` POST/GET — 정산 태그 처리

**Files:**
- Modify: `app/api/ledger/route.ts`

**Interfaces:**
- Consumes: `LedgerEntry.settlementKind/settlementStatus/settledAt` (Task 1)
- Produces: POST가 `settlementKind` 입력을 받아 저장; GET items에 `settlementKind`/`settlementStatus`/`settledAt` 포함

- [ ] **Step 1: create 스키마에 settlementKind 추가**

`entryCreateSchema`의 `occurredAt` 필드 다음(닫는 `})` 직전)에 추가:

```ts
    occurredAt: z
      .union([z.string(), z.null()])
      .optional()
      .refine(
        (v) =>
          v === undefined ||
          v === null ||
          v === '' ||
          !Number.isNaN(new Date(v).getTime()),
        { message: 'invalid date' }
      ),
    settlementKind: z
      .enum(['REIMBURSEMENT', 'EMERGENCY'])
      .nullable()
      .optional(),
  })
  .strict()
```

- [ ] **Step 2: LedgerEntryRow 타입에 필드 추가**

`type LedgerEntryRow = { ... }`의 `updatedAt: Date` 다음에 추가:

```ts
  updatedAt: Date
  settlementKind: 'REIMBURSEMENT' | 'EMERGENCY' | null
  settlementStatus: 'PENDING' | 'SETTLED' | null
  settledAt: Date | null
```

- [ ] **Step 3: GET select + items 매핑에 필드 추가**

`prisma.ledgerEntry.findMany`의 `select`에서 `updatedAt: true,` 다음에 추가:

```ts
      updatedAt: true,
      settlementKind: true,
      settlementStatus: true,
      settledAt: true,
```

`const items = rows.map((row) => ({ ... }))`에서 `updatedAt: toISOStringSafe(row.updatedAt),` 다음에 추가:

```ts
    updatedAt: toISOStringSafe(row.updatedAt),
    settlementKind: row.settlementKind,
    settlementStatus: row.settlementStatus,
    settledAt: row.settledAt ? toISOStringSafe(row.settledAt) : null,
```

- [ ] **Step 4: POST 생성 로직 — 정산 태그 반영 + type 강제**

POST 본문에서 기존:

```ts
  const { type, amount, description, category } = parsed.data
  const subcategory = parsed.data.subcategory ?? null
  const excludeFromTotals = parsed.data.excludeFromTotals
  const accountId = parsed.data.accountId ?? null
```

을 다음으로 교체:

```ts
  const { amount, description, category } = parsed.data
  const subcategory = parsed.data.subcategory ?? null
  const excludeFromTotals = parsed.data.excludeFromTotals
  const accountId = parsed.data.accountId ?? null
  const settlementKind = parsed.data.settlementKind ?? null
  // 청구/비상금은 지출 전용 (가정 A)
  const type = settlementKind ? 'EXPENSE' : parsed.data.type
```

그리고 `prisma.ledgerEntry.create`의 `data`에서 `occurredAt,` 다음에 추가:

```ts
      occurredAt,
      settlementKind,
      settlementStatus: settlementKind ? 'PENDING' : null,
      settledAt: null,
```

(`isValidCategoryCombination(type, ...)`는 강제된 `type`으로 이미 검증되므로 그대로 둔다.)

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit 2>&1 | grep -vE '^tests/' | grep -E 'error TS'`
Expected: 출력 0줄

- [ ] **Step 6: Commit**

```bash
git add app/api/ledger/route.ts
git commit -m "✨ /api/ledger — 정산 태그(settlementKind) 생성·조회 지원"
```

---

### Task 3: `/api/ledger/[entryId]` PATCH — 정산 태그/상태 전이

**Files:**
- Modify: `app/api/ledger/[entryId]/route.ts`

**Interfaces:**
- Consumes: `settledAtForStatus` from `@/app/lib/settlements`
- Produces: PATCH가 `{ settlementKind?, settlementStatus? }`를 받아 태그 부여/해제·상태 토글 처리

- [ ] **Step 1: import 추가**

파일 상단 import 블록에 추가:

```ts
import { settledAtForStatus } from '@/app/lib/settlements'
```

- [ ] **Step 2: patch 스키마에 필드 추가**

`entryPatchSchema`의 `occurredAt` 필드 다음(닫는 `})` 직전)에 추가:

```ts
    settlementKind: z
      .union([z.enum(['REIMBURSEMENT', 'EMERGENCY']), z.null()])
      .optional(),
    settlementStatus: z.enum(['PENDING', 'SETTLED']).optional(),
  })
  .strict()
```

- [ ] **Step 3: existing select에 정산 필드 추가**

`prisma.ledgerEntry.findUnique`의 select를 교체:

```ts
    select: {
      id: true,
      ownerId: true,
      type: true,
      category: true,
      subcategory: true,
      settlementKind: true,
      settlementStatus: true,
    },
```

- [ ] **Step 4: 전이 계산 + type 강제**

기존 `const nextType = parsed.data.type ?? existing.type` 줄을 다음 블록으로 교체:

```ts
  // 정산 태그/상태 전이
  const kindProvided = parsed.data.settlementKind !== undefined
  const nextKind = kindProvided
    ? parsed.data.settlementKind
    : existing.settlementKind
  const statusProvided = parsed.data.settlementStatus !== undefined

  if (statusProvided && !nextKind) {
    return NextResponse.json(
      { message: '정산 항목이 아닙니다.' },
      { status: 400 }
    )
  }

  let nextStatus: 'PENDING' | 'SETTLED' | null
  if (!nextKind) {
    nextStatus = null
  } else if (statusProvided) {
    nextStatus = parsed.data.settlementStatus!
  } else if (kindProvided && !existing.settlementKind) {
    nextStatus = 'PENDING'
  } else {
    nextStatus = existing.settlementStatus ?? 'PENDING'
  }
  const nextSettledAt = nextStatus
    ? settledAtForStatus(nextStatus, new Date())
    : null

  // 청구/비상금은 지출 전용 (가정 A)
  const nextType = nextKind ? 'EXPENSE' : (parsed.data.type ?? existing.type)
```

- [ ] **Step 5: 카테고리 검증 조건 확장**

기존 카테고리 검증 블록의 조건 `if (parsed.data.type !== undefined || parsed.data.category !== undefined || parsed.data.subcategory !== undefined) {` 을 교체:

```ts
  if (
    nextType !== existing.type ||
    parsed.data.category !== undefined ||
    parsed.data.subcategory !== undefined
  ) {
    if (!isValidCategoryCombination(nextType, nextCategory, nextSubcategory)) {
      return NextResponse.json(
        { message: '대분류/소분류 조합이 올바르지 않습니다.' },
        { status: 400 }
      )
    }
  }
```

- [ ] **Step 6: update data에 정산 필드 + type 반영**

`prisma.ledgerEntry.update`의 `data`에서 기존 `...(parsed.data.type !== undefined ? { type: parsed.data.type } : {}),` 줄을 `type: nextType,`로 교체하고, `occurredAt` 처리 다음(닫는 `},` 직전)에 세 필드 추가:

```ts
    data: {
      type: nextType,
      ...(parsed.data.amount !== undefined
        ? { amount: parsed.data.amount }
        : {}),
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description }
        : {}),
      ...(parsed.data.category !== undefined
        ? { category: parsed.data.category }
        : {}),
      ...(parsed.data.subcategory !== undefined
        ? { subcategory: parsed.data.subcategory }
        : {}),
      ...(parsed.data.excludeFromTotals !== undefined
        ? { excludeFromTotals: parsed.data.excludeFromTotals }
        : {}),
      ...(parsed.data.accountId !== undefined
        ? { accountId: parsed.data.accountId }
        : {}),
      ...(occurredAt !== undefined
        ? { occurredAt: occurredAt ?? new Date() }
        : {}),
      settlementKind: nextKind,
      settlementStatus: nextStatus,
      settledAt: nextSettledAt,
    },
```

- [ ] **Step 7: 타입체크**

Run: `npx tsc --noEmit 2>&1 | grep -vE '^tests/' | grep -E 'error TS'`
Expected: 출력 0줄

- [ ] **Step 8: Commit**

```bash
git add app/api/ledger/[entryId]/route.ts
git commit -m "✨ /api/ledger/[entryId] — 정산 태그 부여·해제·상태 토글"
```

---

### Task 4: `/api/ledger/settlements` GET 교체 + `[id]` 라우트 삭제

**Files:**
- Modify: `app/api/ledger/settlements/route.ts` (전체 교체)
- Delete: `app/api/ledger/settlements/[id]/route.ts`

**Interfaces:**
- Consumes: `summarizeSettlements`, `SettlementKind`, `SettlementStatus` (기존 lib)
- Produces: `GET /api/ledger/settlements?kind=&status=` → `{ items: SettlementItem[], summary }`. `SettlementItem` = `{ id, accountId, accountName, accountBank, amount, description, kind, status, occurredAt, settledAt }`

- [ ] **Step 1: settlements/route.ts 전체 교체**

`app/api/ledger/settlements/route.ts`를 다음으로 완전 교체(POST 제거):

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { toISOStringSafe, toISOStringNullable } from '@/app/lib/date'
import {
  summarizeSettlements,
  type SettlementKind,
  type SettlementStatus,
} from '@/app/lib/settlements'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const kindParam = searchParams.get('kind')
  const statusParam = searchParams.get('status')

  const kind: SettlementKind | undefined =
    kindParam === 'REIMBURSEMENT' || kindParam === 'EMERGENCY'
      ? kindParam
      : undefined
  const status: SettlementStatus | undefined =
    statusParam === 'PENDING' || statusParam === 'SETTLED'
      ? statusParam
      : undefined

  const [rows, pending] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: {
        ownerId: userId,
        settlementKind: kind ?? { not: null },
        ...(status ? { settlementStatus: status } : {}),
      },
      orderBy: [{ settlementStatus: 'asc' }, { occurredAt: 'desc' }],
      select: {
        id: true,
        accountId: true,
        amount: true,
        description: true,
        settlementKind: true,
        settlementStatus: true,
        occurredAt: true,
        settledAt: true,
        account: { select: { name: true, bankName: true } },
      },
    }),
    prisma.ledgerEntry.findMany({
      where: {
        ownerId: userId,
        settlementKind: { not: null },
        settlementStatus: 'PENDING',
      },
      select: { settlementKind: true, settlementStatus: true, amount: true },
    }),
  ])

  const items = rows.map((r) => ({
    id: r.id,
    accountId: r.accountId,
    accountName: r.account?.name ?? null,
    accountBank: r.account?.bankName ?? null,
    amount: r.amount,
    description: r.description,
    kind: r.settlementKind as SettlementKind,
    status: r.settlementStatus as SettlementStatus,
    occurredAt: toISOStringSafe(r.occurredAt),
    settledAt: toISOStringNullable(r.settledAt),
  }))

  const summary = summarizeSettlements(
    pending.map((p) => ({
      kind: p.settlementKind as SettlementKind,
      status: p.settlementStatus as SettlementStatus,
      amount: p.amount,
    }))
  )

  return NextResponse.json({ items, summary })
}
```

- [ ] **Step 2: `[id]` 라우트 삭제**

Run: `git rm app/api/ledger/settlements/[id]/route.ts`
(상태 토글은 `PATCH /api/ledger/[entryId]` `{ settlementStatus }`로 대체됨)

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit 2>&1 | grep -vE '^tests/' | grep -E 'error TS'`
Expected: 출력 0줄

- [ ] **Step 4: Commit**

```bash
git add app/api/ledger/settlements/route.ts
git commit -m "♻️ /api/ledger/settlements — 태그 달린 내역 조회로 교체, 생성/[id] 제거"
```

---

### Task 5: LedgerClient — 항목 추가/수정 정산 버튼 + 내역 배지

**Files:**
- Modify: `app/ledger/LedgerClient.tsx`

**Interfaces:**
- Consumes: `GET /api/ledger` items의 settlementKind/status (Task 2); `POST /api/ledger` settlementKind (Task 2); `PATCH /api/ledger/[entryId]` settlementKind (Task 3)
- Produces: 없음 (최종 화면)

- [ ] **Step 1: import — 정산 라벨/타입**

`ledgerCategories` import 블록 다음에 추가:

```ts
import {
  SETTLEMENT_KIND_LABEL,
  type SettlementKind,
} from '@/app/lib/settlements'
```

- [ ] **Step 2: LedgerItem 타입 확장**

`type LedgerItem = { ... }`의 `updatedAt: string` 다음에 추가:

```ts
  updatedAt: string
  settlementKind: SettlementKind | null
  settlementStatus: 'PENDING' | 'SETTLED' | null
  settledAt: string | null
```

- [ ] **Step 3: 폼/수정 상태 추가**

`const [formAccountId, setFormAccountId] = useState<string>('')` 다음에:

```ts
  const [formSettlementKind, setFormSettlementKind] =
    useState<SettlementKind | null>(null)
```

`const [editAccountId, setEditAccountId] = useState<string>('')` 다음에:

```ts
  const [editSettlementKind, setEditSettlementKind] =
    useState<SettlementKind | null>(null)
```

- [ ] **Step 4: 정산 요약 재조회 콜백 + 태그 변경 핸들러**

기존 정산 요약 `useEffect`(`fetch('/api/ledger/settlements')` 포함)를 다음으로 교체:

```ts
  const loadSettlementSummary = useCallback(async () => {
    try {
      const r = await fetch('/api/ledger/settlements', { cache: 'no-store' })
      if (!r.ok) return
      const j = (await r.json()) as {
        summary?: { reimbursementPending: number; emergencyPending: number }
      }
      if (j?.summary) setSettlementSummary(j.summary)
    } catch {}
  }, [])

  useEffect(() => {
    void loadSettlementSummary()
  }, [loadSettlementSummary])
```

`toggleFormType` 함수 다음에 추가:

```ts
  const changeFormSettlementKind = (next: SettlementKind | null) => {
    setFormSettlementKind(next)
    if (next && formType !== 'EXPENSE') {
      const list = getCategoriesByType('EXPENSE')
      setFormType('EXPENSE')
      setFormCategory(list[0]?.key ?? '')
      setFormSubcategory('')
    }
  }
```

`toggleEditType` 함수 다음에 추가:

```ts
  const changeEditSettlementKind = (next: SettlementKind | null) => {
    setEditSettlementKind(next)
    if (next && editType !== 'EXPENSE') {
      const list = getCategoriesByType('EXPENSE')
      setEditType('EXPENSE')
      setEditCategory(list[0]?.key ?? '')
      setEditSubcategory('')
    }
  }
```

- [ ] **Step 5: create payload + reset에 반영**

`create`의 payload 객체에서 `occurredAt: isoFromDatetimeLocal(formOccurredAt) ?? null,` 다음에 추가:

```ts
        occurredAt: isoFromDatetimeLocal(formOccurredAt) ?? null,
        settlementKind: formSettlementKind,
```

같은 함수 성공 처리부 `await load()` 앞에 요약 재조회, reset에 태그 초기화 추가:

```ts
      setFormAmount('')
      setFormDesc('')
      setFormOccurredAt(dateTimeLocalNow())
      setFormExcludeFromTotals(false)
      setFormSettlementKind(null)
      await load()
      void loadSettlementSummary()
      toast.success('항목을 저장했습니다.')
```

- [ ] **Step 6: startEdit / saveEdit에 반영**

`startEdit`의 `setEditAccountId(it.accountId ?? '')` 다음에:

```ts
    setEditAccountId(it.accountId ?? '')
    setEditSettlementKind(it.settlementKind)
```

`saveEdit`의 payload에서 `occurredAt: isoFromDatetimeLocal(editOccurredAt) ?? null,` 다음에:

```ts
      occurredAt: isoFromDatetimeLocal(editOccurredAt) ?? null,
      settlementKind: editSettlementKind,
```

`saveEdit` 성공부 `await load()` 다음에:

```ts
    setEditingId(null)
    await load()
    void loadSettlementSummary()
    toast.success('항목을 수정했습니다.')
```

- [ ] **Step 7: 항목 추가 폼에 정산 버튼 행 추가**

추가 폼 `formMode === 'entry'` 블록 안, 계좌 select `</select>` 다음(그 블록을 닫는 `</>` 직전)에 삽입:

```tsx
              <div className="flex flex-wrap items-center gap-1">
                <span
                  className="mr-1 text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  정산
                </span>
                {(
                  [
                    { key: null, label: '일반' },
                    { key: 'REIMBURSEMENT', label: '청구' },
                    { key: 'EMERGENCY', label: '비상금' },
                  ] as { key: SettlementKind | null; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    className={
                      'btn text-xs ' +
                      (formSettlementKind === opt.key
                        ? 'btn-primary'
                        : 'btn-outline')
                    }
                    onClick={() => changeFormSettlementKind(opt.key)}
                    disabled={creating}
                    title={
                      opt.key
                        ? '청구/비상금은 지출로 기록되고 정산 대기함에 모여요'
                        : '일반 내역'
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
```

같은 폼의 수입/지출 토글 버튼(`onClick={toggleFormType}`)의 `disabled`를 정산 태그 선택 시 잠금:

```tsx
                    disabled={creating || formSettlementKind !== null}
```

(해당 버튼에 disabled가 없으면 새로 추가.)

- [ ] **Step 8: 인라인 수정 폼에 정산 버튼 행 추가**

수정 폼 블록(`editingId === it.id` 내부), 계좌 select `</select>` 다음에 동일 패턴 삽입(edit 상태 사용):

```tsx
                          <div className="flex flex-wrap items-center gap-1">
                            <span
                              className="mr-1 text-xs"
                              style={{ color: 'var(--muted)' }}
                            >
                              정산
                            </span>
                            {(
                              [
                                { key: null, label: '일반' },
                                { key: 'REIMBURSEMENT', label: '청구' },
                                { key: 'EMERGENCY', label: '비상금' },
                              ] as {
                                key: SettlementKind | null
                                label: string
                              }[]
                            ).map((opt) => (
                              <button
                                key={opt.label}
                                type="button"
                                className={
                                  'btn text-xs ' +
                                  (editSettlementKind === opt.key
                                    ? 'btn-primary'
                                    : 'btn-outline')
                                }
                                onClick={() =>
                                  changeEditSettlementKind(opt.key)
                                }
                                disabled={editSaving}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
```

수정 폼의 수입/지출 토글 버튼(`onClick={toggleEditType}`)에 disabled 추가:

```tsx
                              disabled={editSaving || editSettlementKind !== null}
```

- [ ] **Step 9: 내역 카드에 정산 배지**

내역 카드 배지 행에서 `합계 제외` 배지 블록(`{it.excludeFromTotals ? (...) : null}`) 다음에 삽입:

```tsx
                            {it.settlementKind ? (
                              <span
                                className="badge"
                                title={`${SETTLEMENT_KIND_LABEL[it.settlementKind]} · ${
                                  it.settlementStatus === 'SETTLED'
                                    ? '정산완료'
                                    : '미정산'
                                }`}
                                style={{
                                  background:
                                    it.settlementStatus === 'SETTLED'
                                      ? 'color-mix(in srgb, var(--foreground) 6%, var(--card))'
                                      : it.settlementKind === 'REIMBURSEMENT'
                                        ? 'color-mix(in srgb, #0ea5e9 16%, var(--card))'
                                        : 'color-mix(in srgb, #f59e0b 16%, var(--card))',
                                  borderColor:
                                    it.settlementStatus === 'SETTLED'
                                      ? 'var(--border)'
                                      : it.settlementKind === 'REIMBURSEMENT'
                                        ? 'color-mix(in srgb, #0ea5e9 50%, var(--border))'
                                        : 'color-mix(in srgb, #f59e0b 50%, var(--border))',
                                  opacity:
                                    it.settlementStatus === 'SETTLED' ? 0.65 : 1,
                                }}
                              >
                                {SETTLEMENT_KIND_LABEL[it.settlementKind]} ·{' '}
                                {it.settlementStatus === 'SETTLED'
                                  ? '정산완료'
                                  : '미정산'}
                              </span>
                            ) : null}
```

- [ ] **Step 10: 타입체크**

Run: `npx tsc --noEmit 2>&1 | grep -vE '^tests/' | grep -E 'error TS'`
Expected: 출력 0줄

- [ ] **Step 11: Commit**

```bash
git add app/ledger/LedgerClient.tsx
git commit -m "✨ 가계부 내역 — 정산 태그 추가·수정 버튼 + 정산 여부 배지"
```

---

### Task 6: SettlementsClient — 조회 + 상태 토글 전용

**Files:**
- Modify: `app/ledger/settlements/SettlementsClient.tsx` (전체 교체)

**Interfaces:**
- Consumes: `GET /api/ledger/settlements` (Task 4); `PATCH /api/ledger/[entryId]` `{ settlementStatus }` (Task 3)

- [ ] **Step 1: SettlementsClient.tsx 전체 교체**

생성·수정·삭제 폼을 제거하고 조회+토글 전용으로 교체:

```tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useToast } from '@/app/components/ToastProvider'
import { LedgerNavBack, LedgerNavStats, LedgerNavAccounts } from '../LedgerNavIcons'
import {
  SETTLEMENT_KIND_LABEL,
  SETTLEMENT_STATUS_LABEL,
  type SettlementKind,
  type SettlementStatus,
} from '@/app/lib/settlements'

type SettlementItem = {
  id: string
  accountId: string | null
  accountName: string | null
  accountBank: string | null
  amount: number
  description: string
  kind: SettlementKind
  status: SettlementStatus
  occurredAt: string
  settledAt: string | null
}

type Summary = { reimbursementPending: number; emergencyPending: number }
type KindFilter = 'ALL' | SettlementKind
type StatusFilter = 'ALL' | SettlementStatus

function fmtKRW(n: number): string {
  const sign = n < 0 ? '-' : ''
  return `${sign}₩${Math.abs(Math.round(n)).toLocaleString('ko-KR')}`
}

function kindBadge(kind: SettlementKind): string {
  return kind === 'REIMBURSEMENT'
    ? 'bg-sky-500/15 text-sky-500'
    : 'bg-amber-500/15 text-amber-500'
}

export default function SettlementsClient() {
  const toast = useToast()
  const [items, setItems] = useState<SettlementItem[]>([])
  const [summary, setSummary] = useState<Summary>({
    reimbursementPending: 0,
    emergencyPending: 0,
  })
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [kindFilter, setKindFilter] = useState<KindFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/ledger/settlements', { cache: 'no-store' })
      if (r.ok) {
        const j = (await r.json()) as { items: SettlementItem[]; summary: Summary }
        setItems(j.items)
        setSummary(j.summary)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(
    () =>
      items.filter(
        (it) =>
          (kindFilter === 'ALL' || it.kind === kindFilter) &&
          (statusFilter === 'ALL' || it.status === statusFilter)
      ),
    [items, kindFilter, statusFilter]
  )

  async function settle(it: SettlementItem, next: SettlementStatus) {
    setBusyId(it.id)
    try {
      const r = await fetch(`/api/ledger/${it.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settlementStatus: next }),
      })
      if (r.ok) {
        toast.info(
          next === 'SETTLED' ? '정산 완료로 표시했어요.' : '미정산으로 되돌렸어요.'
        )
        await load()
      } else {
        toast.error('처리 실패')
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="w-full px-3 py-6 sm:px-4 lg:px-6">
      <div className="grid gap-6">
        {/* 헤더 + 요약 */}
        <div className="surface card-pad card-hover-border-only">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">정산 대기함</h1>
              <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                다음 월급에 정상화할 청구·비상금 내역을 모아 확인해요
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LedgerNavStats />
              <LedgerNavAccounts />
              <LedgerNavBack />
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="card p-3 card-hover-border-only">
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                받을 청구 (미정산)
              </div>
              <div className="mt-1 text-lg font-extrabold text-sky-500">
                {fmtKRW(summary.reimbursementPending)}
              </div>
            </div>
            <div className="card p-3 card-hover-border-only">
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                갚을 비상금 (미정산)
              </div>
              <div className="mt-1 text-lg font-extrabold text-amber-500">
                {fmtKRW(summary.emergencyPending)}
              </div>
            </div>
          </div>

          <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
            항목 추가·수정·삭제는{' '}
            <Link href="/ledger" className="underline">
              가계부 내역
            </Link>
            에서 하세요. 여기서는 정산 여부만 체크해요.
          </p>
        </div>

        {/* 필터 */}
        <div className="surface card-pad">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as KindFilter)}
              className="input"
            >
              <option value="ALL">전체 종류</option>
              <option value="REIMBURSEMENT">청구</option>
              <option value="EMERGENCY">비상금</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="input"
            >
              <option value="ALL">전체 상태</option>
              <option value="PENDING">미정산</option>
              <option value="SETTLED">정산완료</option>
            </select>
          </div>
        </div>

        {/* 목록 */}
        <div className="grid gap-3">
          {loading ? (
            <div className="surface card-pad text-sm" style={{ color: 'var(--muted)' }}>
              불러오는 중…
            </div>
          ) : filtered.length === 0 ? (
            <div className="surface card-pad text-sm" style={{ color: 'var(--muted)' }}>
              표시할 정산 항목이 없어요.
            </div>
          ) : (
            filtered.map((it) => (
              <div key={it.id} className="surface card-pad card-hover-border-only">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-bold ${kindBadge(it.kind)}`}
                  >
                    {SETTLEMENT_KIND_LABEL[it.kind]}
                  </span>
                  <span
                    className="rounded px-2 py-0.5 text-xs"
                    style={{
                      color: it.status === 'SETTLED' ? 'var(--muted)' : 'inherit',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {SETTLEMENT_STATUS_LABEL[it.status]}
                  </span>
                  <span className="text-lg font-extrabold">{fmtKRW(it.amount)}</span>
                  <span className="ml-auto text-xs" style={{ color: 'var(--muted)' }}>
                    {it.occurredAt.slice(0, 10)}
                  </span>
                </div>
                <div className="mt-2 text-sm">{it.description}</div>
                {it.accountName ? (
                  <div className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                    계좌: {it.accountName}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {it.status === 'PENDING' ? (
                    <button
                      className="btn btn-primary"
                      disabled={busyId === it.id}
                      onClick={() => settle(it, 'SETTLED')}
                    >
                      정산 완료
                    </button>
                  ) : (
                    <button
                      className="btn"
                      disabled={busyId === it.id}
                      onClick={() => settle(it, 'PENDING')}
                    >
                      미정산으로
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit 2>&1 | grep -vE '^tests/' | grep -E 'error TS'`
Expected: 출력 0줄

- [ ] **Step 3: Commit**

```bash
git add app/ledger/settlements/SettlementsClient.tsx
git commit -m "♻️ 정산 대기함 — 조회+상태 토글 전용(추가/수정/삭제 제거)"
```

---

### Task 7: 문서 갱신 + 최종 검증

**Files:**
- Modify: `docs/feature-ledger.md`

- [ ] **Step 1: feature-ledger.md의 "7-b. 정산 대기함" 섹션 갱신**

`docs/feature-ledger.md`를 열어 정산 대기함 섹션을, 새 구조에 맞게 수정한다(핵심만):
- 청구/비상금은 `LedgerEntry`의 `settlementKind`/`settlementStatus` 태그이며 **가계부 항목 추가/수정에서** 등록·변경
- 정산 대기함(`/ledger/settlements`)은 태그 달린 내역을 모아 **정산/미정산 토글만** (추가·수정·삭제 없음)
- 내역 목록에 정산 여부 배지 표시
- 별도 Settlement 테이블 언급이 있으면 제거

- [ ] **Step 2: 기존 정산 테스트 회귀 확인**

Run: `node --test tests/settlements.test.ts`
Expected: 4 tests pass (라벨/summarize/settledAt — 로직 미변경)

- [ ] **Step 3: 전체 타입체크**

Run: `npx tsc --noEmit 2>&1 | grep -vE '^tests/' | grep -E 'error TS'`
Expected: 출력 0줄

- [ ] **Step 4: 린트 + 빌드**

Run: `npm run lint && npm run build`
Expected: 린트 통과, 빌드 성공 (DB 없이 빌드되는 기존 동작 기준; 빌드 중 DB 접속 오류가 나면 로컬 DB 기동 후 재시도)

- [ ] **Step 5: Commit**

```bash
git add docs/feature-ledger.md
git commit -m "📝 정산 대기함 — 내역 통합 구조로 문서 갱신"
```

- [ ] **Step 6: 마이그레이션 적용 안내**

DB 기동 상태에서 로컬/운영에 적용:

```bash
npx prisma migrate deploy          # 로컬(.env)
# 운영(Neon): .\scripts\migrate-prod.ps1  (YES 확인)
```

(로컬 DB 미기동이면 이 단계는 사용자에게 안내하고 보류 — 코드/타입/빌드 검증은 위에서 완료.)

---

## Self-Review

**Spec coverage:**
- 데이터 모델(필드 추가/테이블 제거/마이그레이션) → Task 1 ✅
- POST 생성 태그 + GET 필드 → Task 2 ✅
- PATCH 태그 부여/해제/상태 토글 + settledAt → Task 3 ✅
- settlements GET 교체 + POST 제거 + [id] 삭제 → Task 4 ✅
- 항목 추가/수정 정산 버튼 + 내역 배지 + 요약 갱신 → Task 5 ✅
- 정산 대기함 조회+토글 전용 → Task 6 ✅
- 가정 A(EXPENSE 강제): Task 2 Step 4, Task 3 Step 4 / 가정 B(합계 반영, 자동 제외 없음): 별도 제외 로직 없음으로 충족 ✅
- 문서 + 검증 → Task 7 ✅

**Placeholder scan:** 모든 스텝에 실제 코드/명령 포함, TBD/TODO 없음 ✅

**Type consistency:**
- `SettlementItem` 필드(id/accountId/accountName/accountBank/amount/description/kind/status/occurredAt/settledAt) — Task 4 생산 = Task 6 소비 일치 ✅
- `settlementKind`/`settlementStatus`/`settledAt` 필드명 — Task 1~5 전체 일치 ✅
- `settledAtForStatus(status, now)` 시그니처 — 기존 lib과 Task 3 사용 일치 ✅
- `summarizeSettlements({kind,status,amount}[])` — 기존 lib과 Task 4 사용 일치 ✅
