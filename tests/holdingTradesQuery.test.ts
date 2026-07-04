import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHoldingTradesWhere,
  holdingTradesOrderBy,
  holdingTradesSelect,
  toHoldingTradeMarker,
} from "../app/lib/holdingTradesQuery.ts";

test("buildHoldingTradesWhere scopes trade markers through the holding owner and symbol", () => {
  assert.deepEqual(buildHoldingTradesWhere("user-1", "005930"), {
    holding: {
      ownerId: "user-1",
      symbol: "005930",
    },
    type: { in: ["BUY", "SELL"] },
  });
});

test("holding trade query only selects marker fields and orders deterministically", () => {
  assert.deepEqual(holdingTradesSelect, {
    id: true,
    type: true,
    quantity: true,
    pricePerUnit: true,
    occurredAt: true,
  });
  assert.deepEqual(holdingTradesOrderBy, [
    { occurredAt: "asc" },
    { createdAt: "asc" },
  ]);
});

test("toHoldingTradeMarker keeps the public response shape", () => {
  assert.deepEqual(
    toHoldingTradeMarker({
      id: "tx-1",
      type: "BUY",
      quantity: 3,
      pricePerUnit: 1200,
      occurredAt: new Date("2026-01-02T03:04:05.000Z"),
    }),
    {
      id: "tx-1",
      type: "BUY",
      quantity: 3,
      unitPrice: 1200,
      date: "20260102",
    },
  );
});
