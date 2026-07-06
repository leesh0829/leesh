import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPrevLedgerGroupByArgs,
  summarizePrevLedgerGroups,
} from "../app/lib/ledgerStatsPrev.ts";

test("buildPrevLedgerGroupByArgs groups previous ledger period by type and category", () => {
  const prevStart = new Date("2026-01-01T00:00:00.000Z");
  const prevEnd = new Date("2026-02-01T00:00:00.000Z");

  assert.deepEqual(buildPrevLedgerGroupByArgs(["u1", "u2"], prevStart, prevEnd), {
    by: ["type", "category"],
    where: {
      ownerId: { in: ["u1", "u2"] },
      excludeFromTotals: false,
      occurredAt: { gte: prevStart, lt: prevEnd },
    },
    _sum: { amount: true },
  });
});

test("summarizePrevLedgerGroups builds totals and category maps from grouped rows", () => {
  const result = summarizePrevLedgerGroups([
    { type: "INCOME", category: "급여", _sum: { amount: 3_000_000 } },
    { type: "INCOME", category: "부수입", _sum: { amount: null } },
    { type: "EXPENSE", category: "식비", _sum: { amount: 400_000 } },
    { type: "EXPENSE", category: "교통", _sum: { amount: 100_000 } },
  ]);

  assert.deepEqual(result.prevTotals, {
    income: 3_000_000,
    expense: 500_000,
    net: 2_500_000,
  });
  assert.deepEqual(Array.from(result.prevByCategoryIncome.entries()), [
    ["급여", 3_000_000],
    ["부수입", 0],
  ]);
  assert.deepEqual(Array.from(result.prevByCategoryExpense.entries()), [
    ["식비", 400_000],
    ["교통", 100_000],
  ]);
});
