import assert from "node:assert/strict";
import test from "node:test";

import { prepareHoldingLedgerSyncContext } from "../app/lib/holdingLedgerSyncContext.ts";

const baseContext = {
  userId: "user-1",
  holdingId: "holding-1",
  holdingName: "AAPL",
  holdingCurrency: "USD",
  type: "DIVIDEND" as const,
  quantity: null,
  pricePerUnit: null,
  amount: 10,
  occurredAt: new Date("2026-01-01T00:00:00.000Z"),
  memo: null,
};

test("prepareHoldingLedgerSyncContext skips rate lookup when ledger linking is disabled", async () => {
  let calls = 0;

  const result = await prepareHoldingLedgerSyncContext(
    baseContext,
    false,
    async () => {
      calls += 1;
      return 1320;
    },
  );

  assert.equal(calls, 0);
  assert.equal(result.krwRate, undefined);
});

test("prepareHoldingLedgerSyncContext skips rate lookup for BUY transactions", async () => {
  let calls = 0;

  const result = await prepareHoldingLedgerSyncContext(
    { ...baseContext, type: "BUY", quantity: 1, pricePerUnit: 100 },
    true,
    async () => {
      calls += 1;
      return 1320;
    },
  );

  assert.equal(calls, 0);
  assert.equal(result.krwRate, undefined);
});

test("prepareHoldingLedgerSyncContext uses rate 1 for KRW holdings", async () => {
  let calls = 0;

  const result = await prepareHoldingLedgerSyncContext(
    { ...baseContext, holdingCurrency: "KRW" },
    true,
    async () => {
      calls += 1;
      return 1320;
    },
  );

  assert.equal(calls, 0);
  assert.equal(result.krwRate, 1);
});

test("prepareHoldingLedgerSyncContext fetches one rate for linked non-KRW ledger transactions", async () => {
  const currencies: string[] = [];

  const result = await prepareHoldingLedgerSyncContext(
    baseContext,
    true,
    async (currency) => {
      currencies.push(currency);
      return 1320;
    },
  );

  assert.deepEqual(currencies, ["USD"]);
  assert.equal(result.krwRate, 1320);
});
