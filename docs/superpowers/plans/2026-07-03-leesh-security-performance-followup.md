# Leesh Security Performance Followup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining high-value security, authorization, validation, and query-performance cleanup without broad rewrites.

**Architecture:** Keep changes small and route-compatible. Extract pure helpers for risky logic, cover them with Node tests, then wire route handlers to those helpers. Use parallel agents only for independent audit domains; final code integration happens in small, validated patches.

**Tech Stack:** Next.js App Router route handlers, React 19, TypeScript strict, Prisma 7, PostgreSQL, NextAuth v4, zod, Node test runner.

---

### Task 1: Finish Ledger Stats Query Reduction

**Files:**
- Modify: `app/api/ledger/stats/route.ts`
- Create: `app/lib/ledgerStatsCurrent.ts`
- Test: `tests/ledgerStatsCurrent.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLedgerStatsGroupByArgs,
  summarizeLedgerStatGroups,
} from "../app/lib/ledgerStatsCurrent.ts";

test("buildLedgerStatsGroupByArgs scopes grouped totals to readable owners and date filter", () => {
  const gte = new Date("2026-01-01T00:00:00.000Z");
  const lt = new Date("2026-02-01T00:00:00.000Z");

  assert.deepEqual(buildLedgerStatsGroupByArgs(["u1", "u2"], { gte, lt }), {
    by: ["type", "category"],
    where: {
      ownerId: { in: ["u1", "u2"] },
      excludeFromTotals: false,
      occurredAt: { gte, lt },
    },
    _sum: { amount: true },
    _count: { _all: true },
  });
});

test("summarizeLedgerStatGroups builds totals and category counts from grouped rows", () => {
  const result = summarizeLedgerStatGroups([
    { type: "INCOME", category: "급여", _sum: { amount: 3000 }, _count: { _all: 1 } },
    { type: "EXPENSE", category: "식비", _sum: { amount: 700 }, _count: { _all: 2 } },
  ]);

  assert.equal(result.income, 3000);
  assert.equal(result.expense, 700);
  assert.deepEqual(Array.from(result.byCategoryIncome.entries()), [["급여", { total: 3000, count: 1 }]]);
  assert.deepEqual(Array.from(result.byCategoryExpense.entries()), [["식비", { total: 700, count: 2 }]]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ledgerStatsCurrent.test.ts`
Expected: FAIL because `app/lib/ledgerStatsCurrent.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `app/lib/ledgerStatsCurrent.ts` with grouped query args and summary reducer matching the test.

- [ ] **Step 4: Wire route handler**

Use `prisma.ledgerEntry.groupBy(buildLedgerStatsGroupByArgs(...))` for current total and category summary. Keep row queries only for views that still need entry-level details such as account, month, day, weekday, hour, and transfers.

- [ ] **Step 5: Validate**

Run: `node --test tests/ledgerStatsCurrent.test.ts tests/ledgerStatsPrev.test.ts`
Expected: PASS.

### Task 2: Parallel KIS Security Audit

**Files:**
- Read: `app/api/kis/**/route.ts`
- Read: `app/lib/kis*.ts`
- Read: `app/lib/rateLimit.ts`

- [ ] **Step 1: Run read-only agent audit**

Ask an explorer agent to list remaining KIS routes that do not use shared auth, normalized symbols, timeout fetch, user-scoped cache keys, or consistent 412 handling.

- [ ] **Step 2: Patch one bounded cluster**

Patch only a disjoint cluster reported by the agent, preferably one route family with the same pattern.

- [ ] **Step 3: Validate**

Run: `node --test tests/kisRouteAuth.test.ts tests/stockQuery.test.ts tests/fetchWithTimeout.test.ts` and then `npm run lint`.

### Task 3: Parallel Owner Authorization Audit

**Files:**
- Read: `app/api/**/route.ts`
- Read: `app/lib/serverAuth.ts`
- Read: `app/lib/scheduleShare.ts`

- [ ] **Step 1: Run read-only agent audit**

Ask an explorer agent to list update/delete routes where `ownerId`, `authorId`, or shared scope may be missing from Prisma `where` clauses.

- [ ] **Step 2: Patch one bounded cluster**

Patch only routes where the ownership bug is concrete and response shape remains `{ message: string }`.

- [ ] **Step 3: Validate**

Run the relevant Node tests plus `npm run lint`.

### Task 4: Parallel Request Validation Audit

**Files:**
- Read: `app/api/**/route.ts`
- Read: `app/lib/**/*.ts`

- [ ] **Step 1: Run read-only agent audit**

Ask an explorer agent to find zod object schemas that accept unknown keys where `.strict()` is expected for mutation endpoints.

- [ ] **Step 2: Patch one bounded cluster**

Add strict schemas or helper extraction for one cluster only, with tests for reject/accept behavior.

- [ ] **Step 3: Validate**

Run the new focused test and `npm run lint`.

### Task 5: Final Verification

**Files:**
- Read: `package.json`
- Read: `tests/**/*.test.ts`

- [ ] **Step 1: Run focused Node tests**

Run all currently added Node tests:
`node --test tests/prismaLazyImport.test.ts tests/signedCookie.test.ts tests/fetchWithTimeout.test.ts tests/sessionEmail.test.ts tests/kisRouteAuth.test.ts tests/holdingLedgerPayload.test.ts tests/holdingTransactionValidation.test.ts tests/holdingTransactionMutation.test.ts tests/holdingLedgerSyncContext.test.ts tests/markdownSchema.test.ts tests/stockQuery.test.ts tests/holdingTradesQuery.test.ts tests/ledgerStatsPrev.test.ts tests/ledgerStatsCurrent.test.ts`

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: exit code 0.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: exit code 0.
