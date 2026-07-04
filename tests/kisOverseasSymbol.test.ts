import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_KIS_OVERSEAS_PAIRS,
  normalizeKisOverseasPair,
  normalizeKisOverseasPairsParam,
} from "../app/lib/kisOverseasSymbol.ts";

test("normalizeKisOverseasPair accepts common exchange and symbol shapes", () => {
  assert.deepEqual(normalizeKisOverseasPair(" nas ", " aapl "), {
    exchange: "NAS",
    symbol: "AAPL",
  });
  assert.deepEqual(normalizeKisOverseasPair("NYS", ".DJI"), {
    exchange: "NYS",
    symbol: ".DJI",
  });
  assert.deepEqual(normalizeKisOverseasPair("NYS", "BRK.B"), {
    exchange: "NYS",
    symbol: "BRK.B",
  });
});

test("normalizeKisOverseasPair rejects unsafe exchange and symbol values", () => {
  assert.equal(normalizeKisOverseasPair("NAS&x=1", "AAPL"), null);
  assert.equal(normalizeKisOverseasPair("NAS", "AAPL/S"), null);
  assert.equal(normalizeKisOverseasPair("NAS", "AAPL?x=1"), null);
  assert.equal(normalizeKisOverseasPair("", "AAPL"), null);
  assert.equal(normalizeKisOverseasPair("NAS", ""), null);
});

test("normalizeKisOverseasPairsParam parses, dedupes, and caps pairs", () => {
  const raw = [
    "NAS:AAPL",
    "nas:aapl",
    "NYS:.DJI",
    "NYS:BRK.B",
    ...Array.from({ length: 20 }, (_, i) => `NAS:SYM${i}`),
  ].join(",");

  assert.deepEqual(normalizeKisOverseasPairsParam(raw, 3), [
    { exchange: "NAS", symbol: "AAPL" },
    { exchange: "NYS", symbol: ".DJI" },
    { exchange: "NYS", symbol: "BRK.B" },
  ]);
  assert.equal(MAX_KIS_OVERSEAS_PAIRS, 10);
});

test("normalizeKisOverseasPairsParam rejects malformed pairs", () => {
  assert.equal(normalizeKisOverseasPairsParam(null), null);
  assert.equal(normalizeKisOverseasPairsParam("NAS:AAPL:EXTRA"), null);
  assert.equal(normalizeKisOverseasPairsParam("NAS:AAPL,NYS:BAD/SYMBOL"), null);
});
