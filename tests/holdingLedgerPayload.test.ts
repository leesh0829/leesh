import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveNonTradeHoldingLedgerPayload,
  deriveSellHoldingLedgerPayload,
} from "../app/lib/holdingLedgerPayload.ts";

test("deriveNonTradeHoldingLedgerPayload maps dividend to income", () => {
  assert.deepEqual(
    deriveNonTradeHoldingLedgerPayload({
      type: "DIVIDEND",
      holdingName: "AAPL",
      amountKrw: 1250,
      memo: "분기 배당",
    }),
    {
      type: "INCOME",
      amount: 1250,
      description: "AAPL 배당금 · 분기 배당",
      category: "주식/이자",
      subcategory: "배당금",
    },
  );
});

test("deriveNonTradeHoldingLedgerPayload maps fees and taxes to expense", () => {
  assert.deepEqual(
    deriveNonTradeHoldingLedgerPayload({
      type: "FEE",
      holdingName: "005930",
      amountKrw: 0,
      memo: null,
    }),
    {
      type: "EXPENSE",
      amount: 1,
      description: "005930 거래 수수료",
      category: "주식/이자",
      subcategory: "거래 수수료",
    },
  );

  assert.deepEqual(
    deriveNonTradeHoldingLedgerPayload({
      type: "TAX",
      holdingName: "005930",
      amountKrw: 300,
      memo: "원천징수",
    }),
    {
      type: "EXPENSE",
      amount: 300,
      description: "005930 세금 · 원천징수",
      category: "주식/이자",
      subcategory: "세금",
    },
  );
});

test("deriveSellHoldingLedgerPayload maps realized gain and loss", () => {
  assert.deepEqual(
    deriveSellHoldingLedgerPayload({
      holdingName: "AAPL",
      quantity: 2,
      pricePerUnit: 120,
      avgCost: 100,
      amountKrw: 54_000,
      memo: "분할 매도",
    }),
    {
      type: "INCOME",
      amount: 54000,
      description: "AAPL 매도 수익 · 분할 매도",
      category: "주식/이자",
      subcategory: "투자 수익(실현손익)",
    },
  );

  assert.deepEqual(
    deriveSellHoldingLedgerPayload({
      holdingName: "AAPL",
      quantity: 2,
      pricePerUnit: 90,
      avgCost: 100,
      amountKrw: 27_000,
      memo: null,
    }),
    {
      type: "EXPENSE",
      amount: 27000,
      description: "AAPL 매도 손실",
      category: "주식/이자",
      subcategory: "투자 손실(실현손익)",
    },
  );
});

test("deriveSellHoldingLedgerPayload skips zero or dust realized pnl", () => {
  assert.equal(
    deriveSellHoldingLedgerPayload({
      holdingName: "AAPL",
      quantity: 1,
      pricePerUnit: 100.003,
      avgCost: 100,
      amountKrw: 4,
      memo: null,
    }),
    null,
  );

  assert.equal(
    deriveSellHoldingLedgerPayload({
      holdingName: "AAPL",
      quantity: 1,
      pricePerUnit: 120,
      avgCost: 100,
      amountKrw: 0,
      memo: null,
    }),
    null,
  );
});
