import assert from "node:assert/strict";
import test from "node:test";

import { normalizeHoldingTransactionAmounts } from "../app/lib/holdingTransactionValidation.ts";

test("normalizeHoldingTransactionAmounts computes trade amount when explicit amount is absent", () => {
  assert.deepEqual(
    normalizeHoldingTransactionAmounts({
      type: "BUY",
      quantity: 3,
      pricePerUnit: 1200,
      amount: undefined,
    }),
    {
      ok: true,
      quantity: 3,
      pricePerUnit: 1200,
      amount: 3600,
    },
  );
});

test("normalizeHoldingTransactionAmounts preserves positive explicit trade amount", () => {
  assert.deepEqual(
    normalizeHoldingTransactionAmounts({
      type: "SELL",
      quantity: 2,
      pricePerUnit: 100,
      amount: 199.5,
    }),
    {
      ok: true,
      quantity: 2,
      pricePerUnit: 100,
      amount: 199.5,
    },
  );
});

test("normalizeHoldingTransactionAmounts rejects invalid trade quantity or price", () => {
  assert.deepEqual(
    normalizeHoldingTransactionAmounts({
      type: "BUY",
      quantity: 0,
      pricePerUnit: 100,
      amount: undefined,
    }),
    {
      ok: false,
      message: "수량과 단가를 입력해 주세요.",
    },
  );

  assert.deepEqual(
    normalizeHoldingTransactionAmounts({
      type: "SELL",
      quantity: 1,
      pricePerUnit: null,
      amount: undefined,
    }),
    {
      ok: false,
      message: "수량과 단가를 입력해 주세요.",
    },
  );
});

test("normalizeHoldingTransactionAmounts requires a positive non-trade amount", () => {
  assert.deepEqual(
    normalizeHoldingTransactionAmounts({
      type: "DIVIDEND",
      quantity: null,
      pricePerUnit: null,
      amount: 2500,
    }),
    {
      ok: true,
      quantity: null,
      pricePerUnit: null,
      amount: 2500,
    },
  );

  assert.deepEqual(
    normalizeHoldingTransactionAmounts({
      type: "FEE",
      quantity: null,
      pricePerUnit: null,
      amount: 0,
    }),
    {
      ok: false,
      message: "금액을 입력해 주세요.",
    },
  );
});
