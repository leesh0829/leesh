# 정산 대기함 (청구·비상금 트래커) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 다음 월급에 정상화할 청구(개인카드 대납)·비상금(임시 인출) 내역을 한 곳에서 등록·확인·정산 체크하는 기능을 가계부에 추가한다.

**Architecture:** 단일 `Settlement` 모델(kind: 청구/비상금, status: 미정산/정산완료, 본인 전용)을 추가한다. 정산은 상태만 전환하고 실제 거래는 자동 생성하지 않는다. `/api/ledger/settlements` 라우트 2개(GET+POST, PATCH+DELETE)는 기존 `/api/ledger/budgets` 라우트를 미러링한다. 전용 페이지 `/ledger/settlements`와 메인 가계부의 컴팩트 요약 카드로 노출한다.

**Tech Stack:** Next.js 16 (App Router, `runtime='nodejs'`), Prisma 7 (`@prisma/adapter-pg`, PostgreSQL), zod 4, React 19, TypeScript, `node:test` 유닛 테스트.

## Global Constraints

- 모든 API 라우트: `export const runtime = 'nodejs'`, `getCurrentUserId()`(`@/app/lib/serverAuth`)로 인증, 미인증 시 `401 { message: 'unauthorized' }`.
- zod 스키마는 `.strict()`. 요청 파싱은 `parseJsonWithSchema(req, schema)`, 실패 시 `badRequestFromZod(parsed.error, 'invalid body')`(둘 다 `@/app/lib/validation`).
- 금액은 원 단위 정수, 범위 `1 ~ 2_000_000_000`. 문자열 금액은 `replace(/[^0-9]/g, '')` 후 `parseInt`.
- 날짜 직렬화: `toISOStringSafe`/`toISOStringNullable`(`@/app/lib/date`).
- 데이터는 **본인(`ownerId`)만**. 공유(LEDGER scope) 대상 아님.
- 정산 완료 시 가계부 거래를 **자동 생성하지 않는다**(상태만 전환).
- 존재하는 CSS 유틸만 사용: `surface`, `card`, `card-pad`, `card-hover-border-only`, `btn`, `btn-primary`, `btn-outline`, `input`. (`chip` 클래스는 **존재하지 않음** — 사용 금지.)
- 통화 포맷: `SettlementsClient`는 자체 `fmtKRW`, `LedgerClient`는 기존 `formatKRW(:171)` 재사용.
- 테스트 실행: `node --test tests/<file>.test.ts` (Node v24, TS 네이티브 스트립). 타입 체크: `npx tsc --noEmit`.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `prisma/schema.prisma` | `SettlementKind`/`SettlementStatus` enum + `Settlement` model + `User`·`FinancialAccount` 역관계 |
| `app/lib/settlements.ts` | 클라이언트-세이프 라벨·타입·순수 로직(`summarizeSettlements`, `settledAtForStatus`). **zod 미포함** |
| `app/api/ledger/settlements/route.ts` | `GET`(목록+요약) / `POST`(생성) |
| `app/api/ledger/settlements/[id]/route.ts` | `PATCH`(수정·정산 토글) / `DELETE`(삭제) |
| `app/ledger/settlements/page.tsx` | thin wrapper |
| `app/ledger/settlements/SettlementsClient.tsx` | 전용 페이지 UI |
| `app/ledger/LedgerNavIcons.tsx` | `LedgerNavSettlements` 네비 버튼 추가 |
| `app/ledger/LedgerClient.tsx` | 네비 버튼 + 메인 요약 카드(최소 침습) |
| `tests/settlements.test.ts` | `summarizeSettlements`·`settledAtForStatus` 유닛 테스트 |
| `docs/feature-ledger.md` | 정산 대기함 섹션 추가 |

---

## Task 1: Prisma 스키마 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma` (enum/model 추가; `User` 모델 `:21`, `FinancialAccount` 모델 `:278`)
- Create: `prisma/migrations/<timestamp>_add_settlement/migration.sql` (자동 생성)

**Interfaces:**
- Produces: Prisma Client `prisma.settlement` (모델 `Settlement`), enum 값 `REIMBURSEMENT|EMERGENCY`, `PENDING|SETTLED`. 필드: `id, ownerId, accountId?, kind, status, amount, description, occurredAt, settledAt?, memo?, createdAt, updatedAt`.

- [ ] **Step 1: enum 2개 추가**

`prisma/schema.prisma`의 `LedgerEntryType` enum 근처(예: `enum LedgerEntryType { ... }` 블록 바로 뒤)에 추가:

```prisma
enum SettlementKind {
  REIMBURSEMENT // 청구 (개인카드 대납 → 회사 환급)
  EMERGENCY     // 비상금 사용 (비상금 계좌 임시 인출 → 되갚기)
}

enum SettlementStatus {
  PENDING // 미정산
  SETTLED // 정산완료
}
```

- [ ] **Step 2: `Settlement` model 추가**

`FinancialAccount` model 블록(`:278`~) 바로 뒤에 추가:

```prisma
model Settlement {
  id String @id @default(cuid())

  ownerId String
  owner   User   @relation("SettlementOwner", fields: [ownerId], references: [id], onDelete: Cascade)

  accountId String?
  account   FinancialAccount? @relation("SettlementAccount", fields: [accountId], references: [id], onDelete: SetNull)

  kind   SettlementKind
  status SettlementStatus @default(PENDING)

  amount      Int
  description String

  occurredAt DateTime  @default(now())
  settledAt  DateTime?

  memo String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([ownerId, status])
  @@index([ownerId, kind])
  @@index([accountId])
}
```

- [ ] **Step 3: 역관계 추가**

`User` model(`:21`) 안, `budgetTargets BudgetTarget[] @relation("BudgetTargetOwner")` 줄 아래에 추가:

```prisma
  settlements Settlement[] @relation("SettlementOwner")
```

`FinancialAccount` model 안, `budgetTargets BudgetTarget[] @relation("BudgetTargetAccount")` 줄 아래에 추가:

```prisma
  settlements Settlement[] @relation("SettlementAccount")
```

- [ ] **Step 4: 스키마 유효성 검증**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 5: 마이그레이션 생성 + 클라이언트 생성**

Run: `npx prisma migrate dev --name add_settlement`
Expected: 새 마이그레이션 폴더 생성 + `✔ Generated Prisma Client`. `Settlement` 테이블/enum 생성 SQL 포함.

> DB 연결이 안 되면(로컬 DB 미기동) 환경 한계로 기록하고, 최소한 `npx prisma generate`로 클라이언트만 갱신한 뒤 마이그레이션은 DB 접속 가능 시점으로 미룬다(CLAUDE.md 완료 기준의 "명확한 환경 한계").

- [ ] **Step 6: 타입 체크로 클라이언트 반영 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음(기존 코드가 새 모델과 충돌 없음).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "✨ /leesh 정산 대기함 — Settlement 모델·마이그레이션 추가"
```

---

## Task 2: settlements 라이브러리 (순수 로직 · TDD)

**Files:**
- Create: `app/lib/settlements.ts`
- Test: `tests/settlements.test.ts`

**Interfaces:**
- Produces:
  - `type SettlementKind = 'REIMBURSEMENT' | 'EMERGENCY'`
  - `type SettlementStatus = 'PENDING' | 'SETTLED'`
  - `SETTLEMENT_KINDS: { key: SettlementKind; label: string }[]`
  - `SETTLEMENT_KIND_LABEL: Record<SettlementKind, string>`
  - `SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string>`
  - `summarizeSettlements(items: { kind: SettlementKind; status: SettlementStatus; amount: number }[]): { reimbursementPending: number; emergencyPending: number }`
  - `settledAtForStatus(status: SettlementStatus, now: Date): Date | null`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/settlements.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  summarizeSettlements,
  settledAtForStatus,
  SETTLEMENT_KIND_LABEL,
} from "../app/lib/settlements.ts";

test("summarizeSettlements sums only PENDING items split by kind", () => {
  const result = summarizeSettlements([
    { kind: "REIMBURSEMENT", status: "PENDING", amount: 10000 },
    { kind: "REIMBURSEMENT", status: "PENDING", amount: 5000 },
    { kind: "EMERGENCY", status: "PENDING", amount: 30000 },
    { kind: "REIMBURSEMENT", status: "SETTLED", amount: 99999 },
    { kind: "EMERGENCY", status: "SETTLED", amount: 88888 },
  ]);
  assert.deepEqual(result, {
    reimbursementPending: 15000,
    emergencyPending: 30000,
  });
});

test("summarizeSettlements returns zeros for empty input", () => {
  assert.deepEqual(summarizeSettlements([]), {
    reimbursementPending: 0,
    emergencyPending: 0,
  });
});

test("settledAtForStatus returns now for SETTLED and null for PENDING", () => {
  const now = new Date("2026-08-06T00:00:00.000Z");
  assert.equal(settledAtForStatus("SETTLED", now), now);
  assert.equal(settledAtForStatus("PENDING", now), null);
});

test("labels are Korean", () => {
  assert.equal(SETTLEMENT_KIND_LABEL.REIMBURSEMENT, "청구");
  assert.equal(SETTLEMENT_KIND_LABEL.EMERGENCY, "비상금");
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test tests/settlements.test.ts`
Expected: FAIL — `Cannot find module '../app/lib/settlements.ts'`.

- [ ] **Step 3: 라이브러리 구현**

Create `app/lib/settlements.ts`:

```ts
export type SettlementKind = 'REIMBURSEMENT' | 'EMERGENCY'
export type SettlementStatus = 'PENDING' | 'SETTLED'

export const SETTLEMENT_KINDS: { key: SettlementKind; label: string }[] = [
  { key: 'REIMBURSEMENT', label: '청구' },
  { key: 'EMERGENCY', label: '비상금' },
]

export const SETTLEMENT_KIND_LABEL: Record<SettlementKind, string> = {
  REIMBURSEMENT: '청구',
  EMERGENCY: '비상금',
}

export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  PENDING: '미정산',
  SETTLED: '정산완료',
}

export type SettlementSummary = {
  reimbursementPending: number
  emergencyPending: number
}

export function summarizeSettlements(
  items: { kind: SettlementKind; status: SettlementStatus; amount: number }[]
): SettlementSummary {
  let reimbursementPending = 0
  let emergencyPending = 0
  for (const it of items) {
    if (it.status !== 'PENDING') continue
    if (it.kind === 'REIMBURSEMENT') reimbursementPending += it.amount
    else if (it.kind === 'EMERGENCY') emergencyPending += it.amount
  }
  return { reimbursementPending, emergencyPending }
}

export function settledAtForStatus(
  status: SettlementStatus,
  now: Date
): Date | null {
  return status === 'SETTLED' ? now : null
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tests/settlements.test.ts`
Expected: PASS — `pass 4`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add app/lib/settlements.ts tests/settlements.test.ts
git commit -m "✨ /leesh 정산 대기함 — settlements 라벨·요약 라이브러리 + 테스트"
```

---

## Task 3: 목록·생성 라우트 (`GET`/`POST`)

**Files:**
- Create: `app/api/ledger/settlements/route.ts`

**Interfaces:**
- Consumes: `getCurrentUserId`, `parseJsonWithSchema`, `badRequestFromZod`, `toISOStringSafe`, `toISOStringNullable`, `summarizeSettlements`, `prisma.settlement`, `prisma.financialAccount`.
- Produces:
  - `GET /api/ledger/settlements?kind=&status=` → `{ items: SettlementRow[], summary: { reimbursementPending, emergencyPending } }` where `SettlementRow = { id, kind, status, amount, description, accountId, accountName, memo, occurredAt, settledAt, createdAt }` (날짜는 ISO 문자열, `settledAt`은 `string|null`).
  - `POST /api/ledger/settlements` body `{ kind, amount, description, occurredAt?, accountId?, memo? }` → `{ id }`.

- [ ] **Step 1: 라우트 구현**

Create `app/api/ledger/settlements/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { toISOStringSafe, toISOStringNullable } from '@/app/lib/date'
import { summarizeSettlements } from '@/app/lib/settlements'

export const runtime = 'nodejs'

const createSchema = z
  .object({
    kind: z.enum(['REIMBURSEMENT', 'EMERGENCY']),
    amount: z.number().int().min(1).max(2_000_000_000),
    description: z.string().trim().min(1).max(200),
    occurredAt: z.union([z.string(), z.null()]).optional(),
    accountId: z.union([z.string().trim().max(40), z.null()]).optional(),
    memo: z.union([z.string().trim().max(200), z.null()]).optional(),
  })
  .strict()

export async function GET(req: Request) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const kindParam = searchParams.get('kind')
  const statusParam = searchParams.get('status')

  const where: {
    ownerId: string
    kind?: 'REIMBURSEMENT' | 'EMERGENCY'
    status?: 'PENDING' | 'SETTLED'
  } = { ownerId: userId }
  if (kindParam === 'REIMBURSEMENT' || kindParam === 'EMERGENCY')
    where.kind = kindParam
  if (statusParam === 'PENDING' || statusParam === 'SETTLED')
    where.status = statusParam

  const [rows, pending] = await Promise.all([
    prisma.settlement.findMany({
      where,
      orderBy: [{ status: 'asc' }, { occurredAt: 'desc' }],
      include: { account: { select: { name: true } } },
    }),
    prisma.settlement.findMany({
      where: { ownerId: userId, status: 'PENDING' },
      select: { kind: true, status: true, amount: true },
    }),
  ])

  const items = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    amount: r.amount,
    description: r.description,
    accountId: r.accountId,
    accountName: r.account?.name ?? null,
    memo: r.memo,
    occurredAt: toISOStringSafe(r.occurredAt),
    settledAt: toISOStringNullable(r.settledAt),
    createdAt: toISOStringSafe(r.createdAt),
  }))

  const summary = summarizeSettlements(pending)
  return NextResponse.json({ items, summary })
}

export async function POST(req: Request) {
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const parsed = await parseJsonWithSchema(req, createSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid body')
  const v = parsed.data

  if (v.accountId) {
    const acc = await prisma.financialAccount.findFirst({
      where: { id: v.accountId, ownerId: userId },
      select: { id: true },
    })
    if (!acc)
      return NextResponse.json({ message: 'account not found' }, { status: 404 })
  }

  const occurredAt =
    v.occurredAt && !Number.isNaN(new Date(v.occurredAt).getTime())
      ? new Date(v.occurredAt)
      : new Date()

  const created = await prisma.settlement.create({
    data: {
      ownerId: userId,
      kind: v.kind,
      amount: v.amount,
      description: v.description,
      occurredAt,
      accountId: v.accountId ?? null,
      memo: v.memo ?? null,
    },
    select: { id: true },
  })

  return NextResponse.json(created)
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add app/api/ledger/settlements/route.ts
git commit -m "✨ /leesh 정산 대기함 — 목록·생성 API(GET/POST)"
```

---

## Task 4: 수정·삭제 라우트 (`PATCH`/`DELETE`)

**Files:**
- Create: `app/api/ledger/settlements/[id]/route.ts`

**Interfaces:**
- Consumes: `settledAtForStatus`, `getCurrentUserId`, `parseJsonWithSchema`, `badRequestFromZod`, `prisma.settlement`, `prisma.financialAccount`.
- Produces:
  - `PATCH /api/ledger/settlements/[id]` body(부분) `{ kind?, amount?, description?, occurredAt?, accountId?, memo?, status? }` → `{ ok: true }`. `status` 포함 시 `settledAt` 자동 세팅/해제.
  - `DELETE /api/ledger/settlements/[id]` → `{ ok: true }`.

- [ ] **Step 1: 라우트 구현**

Create `app/api/ledger/settlements/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { prisma } from '@/app/lib/prisma'
import { z } from 'zod'
import { badRequestFromZod, parseJsonWithSchema } from '@/app/lib/validation'
import { getCurrentUserId } from '@/app/lib/serverAuth'
import { settledAtForStatus } from '@/app/lib/settlements'

export const runtime = 'nodejs'

const updateSchema = z
  .object({
    kind: z.enum(['REIMBURSEMENT', 'EMERGENCY']).optional(),
    amount: z.number().int().min(1).max(2_000_000_000).optional(),
    description: z.string().trim().min(1).max(200).optional(),
    occurredAt: z.union([z.string(), z.null()]).optional(),
    accountId: z.union([z.string().trim().max(40), z.null()]).optional(),
    memo: z.union([z.string().trim().max(200), z.null()]).optional(),
    status: z.enum(['PENDING', 'SETTLED']).optional(),
  })
  .strict()

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const existing = await prisma.settlement.findFirst({
    where: { id, ownerId: userId },
    select: { id: true },
  })
  if (!existing)
    return NextResponse.json({ message: 'not found' }, { status: 404 })

  const parsed = await parseJsonWithSchema(req, updateSchema)
  if (!parsed.success) return badRequestFromZod(parsed.error, 'invalid body')
  const v = parsed.data

  if (v.accountId) {
    const acc = await prisma.financialAccount.findFirst({
      where: { id: v.accountId, ownerId: userId },
      select: { id: true },
    })
    if (!acc)
      return NextResponse.json({ message: 'account not found' }, { status: 404 })
  }

  const data: Record<string, unknown> = {}
  if (v.kind !== undefined) data.kind = v.kind
  if (v.amount !== undefined) data.amount = v.amount
  if (v.description !== undefined) data.description = v.description
  if (v.accountId !== undefined) data.accountId = v.accountId
  if (v.memo !== undefined) data.memo = v.memo
  if (
    v.occurredAt !== undefined &&
    v.occurredAt &&
    !Number.isNaN(new Date(v.occurredAt).getTime())
  )
    data.occurredAt = new Date(v.occurredAt)
  if (v.status !== undefined) {
    data.status = v.status
    data.settledAt = settledAtForStatus(v.status, new Date())
  }

  await prisma.settlement.update({ where: { id }, data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const userId = await getCurrentUserId()
  if (!userId)
    return NextResponse.json({ message: 'unauthorized' }, { status: 401 })

  const existing = await prisma.settlement.findFirst({
    where: { id, ownerId: userId },
    select: { id: true },
  })
  if (!existing)
    return NextResponse.json({ message: 'not found' }, { status: 404 })

  await prisma.settlement.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add app/api/ledger/settlements/[id]/route.ts
git commit -m "✨ /leesh 정산 대기함 — 수정·삭제·정산 토글 API(PATCH/DELETE)"
```

---

## Task 5: 네비 버튼 아이콘

**Files:**
- Modify: `app/ledger/LedgerNavIcons.tsx` (`LedgerNavBudgets`(`:283`) 정의 뒤에 추가)

**Interfaces:**
- Produces: `LedgerNavSettlements()` — `<NavButton href="/ledger/settlements" label="정산 대기함">` 컴포넌트. `NavButton`·`IconProps`는 같은 파일에 이미 존재.

- [ ] **Step 1: 아이콘 + 네비 컴포넌트 추가**

`app/ledger/LedgerNavIcons.tsx`에서 `export function LedgerNavKisSettings()` 정의 위(또는 `LedgerNavBudgets` 뒤)에 추가:

```tsx
function ReceiptIcon({ className }: IconProps) {
  // 정산 대기함 (영수증)
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 3h12v18l-2-1.2L14 21l-2-1.2L10 21l-2-1.2L6 21V3Z" strokeLinejoin="round" />
      <path d="M9 8h6M9 12h6" strokeLinecap="round" />
    </svg>
  )
}

export function LedgerNavSettlements() {
  return (
    <NavButton href="/ledger/settlements" label="정산 대기함">
      <ReceiptIcon className="h-4 w-4" />
    </NavButton>
  )
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add app/ledger/LedgerNavIcons.tsx
git commit -m "✨ /leesh 정산 대기함 — 네비 버튼 아이콘 추가"
```

---

## Task 6: 전용 페이지 + 클라이언트

**Files:**
- Create: `app/ledger/settlements/page.tsx`
- Create: `app/ledger/settlements/SettlementsClient.tsx`

**Interfaces:**
- Consumes: `useToast`(`@/app/components/ToastProvider`), `LedgerNavBack`/`LedgerNavStats`/`LedgerNavAccounts`(`../LedgerNavIcons`), `SETTLEMENT_KIND_LABEL`/`SETTLEMENT_STATUS_LABEL`/타입(`@/app/lib/settlements`), Task 3·4 API.
- Produces: `/ledger/settlements` 페이지.

- [ ] **Step 1: page.tsx 작성**

Create `app/ledger/settlements/page.tsx`:

```tsx
import SettlementsClient from './SettlementsClient'

export const runtime = 'nodejs'

export default function SettlementsPage() {
  return <SettlementsClient />
}
```

- [ ] **Step 2: SettlementsClient.tsx 작성**

Create `app/ledger/settlements/SettlementsClient.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '@/app/components/ToastProvider'
import {
  LedgerNavBack,
  LedgerNavStats,
  LedgerNavAccounts,
} from '../LedgerNavIcons'
import {
  SETTLEMENT_KIND_LABEL,
  SETTLEMENT_STATUS_LABEL,
  type SettlementKind,
  type SettlementStatus,
} from '@/app/lib/settlements'

type SettlementItem = {
  id: string
  kind: SettlementKind
  status: SettlementStatus
  amount: number
  description: string
  accountId: string | null
  accountName: string | null
  memo: string | null
  occurredAt: string
  settledAt: string | null
  createdAt: string
}

type Summary = { reimbursementPending: number; emergencyPending: number }
type AccountOption = { id: string; name: string; bankName: string | null }
type KindFilter = 'ALL' | SettlementKind
type StatusFilter = 'ALL' | SettlementStatus

function fmtKRW(n: number): string {
  const sign = n < 0 ? '-' : ''
  return `${sign}₩${Math.abs(Math.round(n)).toLocaleString('ko-KR')}`
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [loading, setLoading] = useState(true)

  const [kindFilter, setKindFilter] = useState<KindFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING')

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [kind, setKind] = useState<SettlementKind>('REIMBURSEMENT')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [occurredAt, setOccurredAt] = useState('')
  const [accountId, setAccountId] = useState('')
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)

  const resetForm = useCallback(() => {
    setEditingId(null)
    setKind('REIMBURSEMENT')
    setAmount('')
    setDescription('')
    setOccurredAt('')
    setAccountId('')
    setMemo('')
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sRes, aRes] = await Promise.all([
        fetch('/api/ledger/settlements', { cache: 'no-store' }),
        fetch('/api/accounts', { cache: 'no-store' }),
      ])
      if (sRes.ok) {
        const j = (await sRes.json()) as {
          items: SettlementItem[]
          summary: Summary
        }
        setItems(j.items)
        setSummary(j.summary)
      }
      if (aRes.ok) {
        const j = (await aRes.json()) as { items: AccountOption[] }
        setAccounts(j.items)
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

  function openCreate() {
    resetForm()
    setShowForm(true)
  }

  function openEdit(it: SettlementItem) {
    setEditingId(it.id)
    setKind(it.kind)
    setAmount(String(it.amount))
    setDescription(it.description)
    setOccurredAt(toLocalInput(it.occurredAt))
    setAccountId(it.accountId ?? '')
    setMemo(it.memo ?? '')
    setShowForm(true)
  }

  async function save() {
    const amt = parseInt(amount.replace(/[^0-9]/g, ''), 10)
    if (!Number.isFinite(amt) || amt < 1) {
      toast.error('금액을 1원 이상 입력해주세요.')
      return
    }
    if (!description.trim()) {
      toast.error('내역을 입력해주세요.')
      return
    }
    setSaving(true)
    try {
      const body = {
        kind,
        amount: amt,
        description: description.trim(),
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : null,
        accountId: accountId || null,
        memo: memo.trim() || null,
      }
      const url = editingId
        ? `/api/ledger/settlements/${editingId}`
        : '/api/ledger/settlements'
      const method = editingId ? 'PATCH' : 'POST'
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => null)
        toast.error(j?.message ?? (editingId ? '수정 실패' : '저장 실패'))
        return
      }
      setShowForm(false)
      resetForm()
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function settle(it: SettlementItem, next: SettlementStatus) {
    const r = await fetch(`/api/ledger/settlements/${it.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    if (r.ok) {
      toast.info(
        next === 'SETTLED' ? '정산 완료로 표시했어요.' : '미정산으로 되돌렸어요.'
      )
      await load()
    } else {
      toast.error('처리 실패')
    }
  }

  async function remove(id: string) {
    if (!confirm('이 항목을 삭제할까요?')) return
    const r = await fetch(`/api/ledger/settlements/${id}`, { method: 'DELETE' })
    if (r.ok) {
      toast.info('삭제했어요.')
      await load()
    } else {
      toast.error('삭제 실패')
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
        </div>

        {/* 필터 + 폼 */}
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
            <button className="btn btn-primary ml-auto" onClick={openCreate}>
              + 항목 추가
            </button>
          </div>

          {showForm && (
            <div className="mt-4 grid gap-3 card p-4">
              <div className="flex flex-wrap gap-2">
                {(['REIMBURSEMENT', 'EMERGENCY'] as SettlementKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={k === kind ? 'btn btn-primary' : 'btn btn-outline'}
                  >
                    {SETTLEMENT_KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              <input
                className="input"
                placeholder="금액 (원)"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <input
                className="input"
                placeholder="내역 / 사유"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <input
                className="input"
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
              <select
                className="input"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">계좌 선택 안 함</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.bankName ? ` (${a.bankName})` : ''}
                  </option>
                ))}
              </select>
              <input
                className="input"
                placeholder="메모 (선택)"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  className="btn btn-primary"
                  disabled={saving}
                  onClick={save}
                >
                  {editingId ? '수정' : '저장'}
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setShowForm(false)
                    resetForm()
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 목록 */}
        <div className="grid gap-3">
          {loading ? (
            <div
              className="surface card-pad text-sm"
              style={{ color: 'var(--muted)' }}
            >
              불러오는 중…
            </div>
          ) : filtered.length === 0 ? (
            <div
              className="surface card-pad text-sm"
              style={{ color: 'var(--muted)' }}
            >
              표시할 정산 항목이 없어요.
            </div>
          ) : (
            filtered.map((it) => (
              <div
                key={it.id}
                className="surface card-pad card-hover-border-only"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-bold ${kindBadge(it.kind)}`}
                  >
                    {SETTLEMENT_KIND_LABEL[it.kind]}
                  </span>
                  <span
                    className="rounded px-2 py-0.5 text-xs"
                    style={{
                      color:
                        it.status === 'SETTLED' ? 'var(--muted)' : 'inherit',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {SETTLEMENT_STATUS_LABEL[it.status]}
                  </span>
                  <span className="text-lg font-extrabold">
                    {fmtKRW(it.amount)}
                  </span>
                  <span
                    className="ml-auto text-xs"
                    style={{ color: 'var(--muted)' }}
                  >
                    {it.occurredAt.slice(0, 10)}
                  </span>
                </div>
                <div className="mt-2 text-sm">{it.description}</div>
                {(it.accountName || it.memo) && (
                  <div
                    className="mt-1 text-xs"
                    style={{ color: 'var(--muted)' }}
                  >
                    {it.accountName ? `계좌: ${it.accountName}` : ''}
                    {it.accountName && it.memo ? ' · ' : ''}
                    {it.memo ?? ''}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {it.status === 'PENDING' ? (
                    <button
                      className="btn btn-primary"
                      onClick={() => settle(it, 'SETTLED')}
                    >
                      정산 완료
                    </button>
                  ) : (
                    <button className="btn" onClick={() => settle(it, 'PENDING')}>
                      미정산으로
                    </button>
                  )}
                  <button className="btn" onClick={() => openEdit(it)}>
                    수정
                  </button>
                  <button className="btn" onClick={() => remove(it.id)}>
                    삭제
                  </button>
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

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add app/ledger/settlements/page.tsx app/ledger/settlements/SettlementsClient.tsx
git commit -m "✨ /leesh 정산 대기함 — 전용 페이지·클라이언트 UI"
```

---

## Task 7: 메인 가계부 네비 버튼 + 요약 카드

**Files:**
- Modify: `app/ledger/LedgerClient.tsx` (import 블록 `:3~11`, 네비 클러스터 `:1158~1165`, 헤더 카드 내부 `:1168~1172` 부근)

**Interfaces:**
- Consumes: Task 5의 `LedgerNavSettlements`, Task 3의 `GET /api/ledger/settlements`(요약만 사용), 기존 `formatKRW`(`:171`).

- [ ] **Step 1: import에 `LedgerNavSettlements`와 `Link` 추가**

`app/ledger/LedgerClient.tsx`의 네비 import 블록(`:4~11`)에 `LedgerNavSettlements`를 추가:

```tsx
import {
  LedgerNavAccounts,
  LedgerNavBudgets,
  LedgerNavCalendar,
  LedgerNavMarket,
  LedgerNavSettlements,
  LedgerNavStats,
  LedgerNavStocks,
} from './LedgerNavIcons'
```

그리고 파일 최상단 import들 사이(`'use client'` 아래, 예: `import { useCallback... } from 'react'` 다음 줄)에 추가:

```tsx
import Link from 'next/link'
```

- [ ] **Step 2: 요약 상태 + 로드 이펙트 추가**

`LedgerClient` 컴포넌트 본문의 다른 `useState` 선언들 근처에 추가:

```tsx
  const [settlementSummary, setSettlementSummary] = useState<{
    reimbursementPending: number
    emergencyPending: number
  } | null>(null)
```

그리고 컴포넌트 본문의 다른 `useEffect`들 근처에 추가:

```tsx
  useEffect(() => {
    let alive = true
    fetch('/api/ledger/settlements', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j?.summary) setSettlementSummary(j.summary)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
```

- [ ] **Step 3: 네비 클러스터에 버튼 추가**

`:1158~1165` 네비 클러스터에서 `<LedgerNavBudgets />` 다음 줄에 추가:

```tsx
                <LedgerNavBudgets />
                <LedgerNavSettlements />
```

- [ ] **Step 4: 요약 카드 JSX 추가**

헤더 카드 내부의 에러 블록(아래 앵커)을 찾는다:

```tsx
            {err ? (
              <div className="mt-4 card p-3" style={{ color: 'crimson' }}>
                {err}
              </div>
            ) : null}
```

이 블록 **바로 아래**에 요약 카드를 추가:

```tsx
            {settlementSummary &&
            (settlementSummary.reimbursementPending > 0 ||
              settlementSummary.emergencyPending > 0) ? (
              <Link
                href="/ledger/settlements"
                className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 card p-3 card-hover-border-only text-sm"
              >
                <span className="font-bold">정산 대기</span>
                <span className="text-sky-500">
                  받을 청구 {formatKRW(settlementSummary.reimbursementPending)}
                </span>
                <span className="text-amber-500">
                  갚을 비상금 {formatKRW(settlementSummary.emergencyPending)}
                </span>
                <span
                  className="ml-auto text-xs"
                  style={{ color: 'var(--muted)' }}
                >
                  정산 대기함 →
                </span>
              </Link>
            ) : null}
```

- [ ] **Step 5: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 6: Commit**

```bash
git add app/ledger/LedgerClient.tsx
git commit -m "✨ /leesh 정산 대기함 — 메인 가계부 네비 버튼·미정산 요약 카드"
```

---

## Task 8: 문서 갱신 + 최종 QA

**Files:**
- Modify: `docs/feature-ledger.md` (섹션 추가)

**Interfaces:**
- 없음(문서/검증 전용).

- [ ] **Step 1: feature-ledger.md에 섹션 추가**

`docs/feature-ledger.md`의 개요 표(`:15~22`)에 행 추가:

```markdown
| 정산 대기함(청구·비상금) | `app/ledger/settlements/*` | `/api/ledger/settlements`, `/api/ledger/settlements/[id]` | `Settlement` |
```

그리고 "## 8. 가계부 캘린더" 섹션 앞에 새 섹션을 삽입:

```markdown
## 7-b. 정산 대기함 (`/ledger/settlements`)

다음 월급에 정상화할 항목을 추적한다. `Settlement` 모델 하나에 `kind`(`REIMBURSEMENT` 청구 / `EMERGENCY` 비상금)와 `status`(`PENDING` 미정산 / `SETTLED` 정산완료)로 구분한다. **본인 전용**(공유 비대상), 정산은 **상태만 전환**하며 가계부 거래를 자동 생성하지 않는다.

- 페이지 `app/ledger/settlements/page.tsx` → `SettlementsClient`. 상단 요약(받을 청구/갚을 비상금 미정산 합계), 종류·상태 클라이언트 필터, 생성/수정 폼, `[정산 완료]`/`[되돌리기]` 토글.
- API `/api/ledger/settlements`: `GET`(본인 항목 + `summary`), `POST`(생성). `/api/ledger/settlements/[id]`: `PATCH`(수정·정산 토글, `status`→`SETTLED` 시 `settledAt` 세팅), `DELETE`.
- 메인 `/ledger`에는 미정산 합계가 있을 때만 요약 카드가 노출되고 클릭 시 이 페이지로 이동한다.
- 라이브러리 `app/lib/settlements.ts`: 라벨·`summarizeSettlements`·`settledAtForStatus`.
```

- [ ] **Step 2: 전체 유닛 테스트 실행**

Run: `node --test tests/settlements.test.ts`
Expected: `pass 4`, `fail 0`.

- [ ] **Step 3: 린트**

Run: `npm run lint`
Expected: 새 파일 관련 에러 없음(경고 무방).

- [ ] **Step 4: 프로덕션 빌드**

Run: `npm run build`
Expected: `prisma generate` + `next build` 성공. `/ledger/settlements` 라우트가 빌드 출력에 포함.

- [ ] **Step 5: Commit**

```bash
git add docs/feature-ledger.md
git commit -m "📝 /leesh 정산 대기함 — feature-ledger 문서 갱신"
```

---

## Self-Review 결과

**Spec coverage:**
- 데이터 모델(§2) → Task 1 ✅
- 라이브러리(§3) → Task 2 ✅
- API GET/POST/PATCH/DELETE(§4) → Task 3·4 ✅
- 전용 페이지(§5) + 네비(§5.3) → Task 5·6 ✅
- 메인 요약 카드(§6) → Task 7 ✅
- 권한(§7) → 별도 권한 엔트리 불필요(Global Constraints·본문 반영) ✅
- 테스트·마이그레이션·검증(§8) → Task 1(마이그레이션)·Task 2(테스트)·Task 8(빌드/린트) ✅
- 문서 → Task 8 ✅
- 범위 밖(§9) → 어떤 태스크에도 자동 거래 생성/공유/알림 없음 ✅

**Type consistency:** `SettlementKind`/`SettlementStatus`/`SettlementSummary`가 lib·route·client 전반에서 동일. `summarizeSettlements` 입력 `{kind,status,amount}[]`가 route의 `pending`(select 동일 필드)·test와 일치. `settledAtForStatus(status, now)` 시그니처가 route PATCH 호출과 일치. 요약 필드명 `reimbursementPending`/`emergencyPending`가 lib·route·client·LedgerClient에서 동일.

**Placeholder scan:** TBD/TODO 없음. 모든 코드 스텝에 실제 코드 포함.
</content>
