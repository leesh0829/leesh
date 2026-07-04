import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCurrencyCode } from "../app/lib/currencyCode.ts";

test("normalizeCurrencyCode accepts uppercase 3-letter currency codes", () => {
  assert.equal(normalizeCurrencyCode(" usd "), "USD");
  assert.equal(normalizeCurrencyCode("KRW"), "KRW");
});

test("normalizeCurrencyCode rejects malformed currency codes", () => {
  assert.equal(normalizeCurrencyCode("US"), null);
  assert.equal(normalizeCurrencyCode("USDD"), null);
  assert.equal(normalizeCurrencyCode("US1"), null);
  assert.equal(normalizeCurrencyCode("USD&symbols=KRW"), null);
  assert.equal(normalizeCurrencyCode(null), null);
});
