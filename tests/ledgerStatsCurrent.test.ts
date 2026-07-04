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

test("buildLedgerStatsGroupByArgs omits empty date filters", () => {
  assert.deepEqual(buildLedgerStatsGroupByArgs(["u1"], {}), {
    by: ["type", "category"],
    where: {
      ownerId: { in: ["u1"] },
      excludeFromTotals: false,
    },
    _sum: { amount: true },
    _count: { _all: true },
  });
});

test("summarizeLedgerStatGroups builds totals and category counts from grouped rows", () => {
  const result = summarizeLedgerStatGroups([
    { type: "INCOME", category: "급여", _sum: { amount: 3_000 }, _count: { _all: 1 } },
    { type: "INCOME", category: "부수입", _sum: { amount: null }, _count: { _all: 1 } },
    { type: "EXPENSE", category: "식비", _sum: { amount: 700 }, _count: { _all: 2 } },
    { type: "EXPENSE", category: "교통", _sum: { amount: 300 }, _count: { _all: 1 } },
  ]);

  assert.equal(result.income, 3_000);
  assert.equal(result.expense, 1_000);
  assert.equal(result.count, 5);
  assert.deepEqual(Array.from(result.byCategoryIncome.entries()), [
    ["급여", { total: 3_000, count: 1 }],
    ["부수입", { total: 0, count: 1 }],
  ]);
  assert.deepEqual(Array.from(result.byCategoryExpense.entries()), [
    ["식비", { total: 700, count: 2 }],
    ["교통", { total: 300, count: 1 }],
  ]);
});
