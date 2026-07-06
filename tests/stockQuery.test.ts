import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeStockSearchQuery,
  normalizeStockSymbol,
  normalizeStockSymbolList,
} from "../app/lib/stockQuery.ts";

test("normalizeStockSearchQuery trims and caps safe search terms", () => {
  assert.equal(normalizeStockSearchQuery("  삼성전자  "), "삼성전자");
  assert.equal(normalizeStockSearchQuery(""), null);
  assert.equal(normalizeStockSearchQuery(" ".repeat(10)), null);
  assert.equal(normalizeStockSearchQuery("a".repeat(81)), null);
});

test("normalizeStockSymbol accepts common market symbols", () => {
  assert.equal(normalizeStockSymbol(" 005930.KS "), "005930.KS");
  assert.equal(normalizeStockSymbol("AAPL.O"), "AAPL.O");
  assert.equal(normalizeStockSymbol("BRK.B"), "BRK.B");
});

test("normalizeStockSymbol rejects empty, oversized, or unsafe symbols", () => {
  assert.equal(normalizeStockSymbol(""), null);
  assert.equal(normalizeStockSymbol("A".repeat(41)), null);
  assert.equal(normalizeStockSymbol("AAPL/O"), null);
  assert.equal(normalizeStockSymbol("AAPL?x=1"), null);
  assert.equal(normalizeStockSymbol("삼성전자"), null);
});

test("normalizeStockSymbolList deduplicates and limits batch symbols", () => {
  const raw = [
    "005930",
    "AAPL.O",
    "005930",
    "bad/symbol",
    ...Array.from({ length: 40 }, (_, i) => `SYM${i}`),
  ].join(",");

  const result = normalizeStockSymbolList(raw, 5);

  assert.deepEqual(result, ["005930", "AAPL.O", "SYM0", "SYM1", "SYM2"]);
});
