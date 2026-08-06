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
