import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_KIS_INDEX_CODES,
  MAX_KIS_INDEX_CODES,
  normalizeKisIndexCodeList,
} from "../app/lib/kisIndexCodes.ts";

test("normalizeKisIndexCodeList returns defaults for missing input", () => {
  assert.deepEqual(normalizeKisIndexCodeList(null), DEFAULT_KIS_INDEX_CODES);
  assert.deepEqual(normalizeKisIndexCodeList(""), DEFAULT_KIS_INDEX_CODES);
});

test("normalizeKisIndexCodeList accepts 4 digit codes, dedupes, and caps fanout", () => {
  const raw = ["0001", "1001", "0001", "2001", "0006", "9999"].join(",");

  assert.deepEqual(normalizeKisIndexCodeList(raw, 3), ["0001", "1001", "2001"]);
  assert.equal(MAX_KIS_INDEX_CODES, 12);
});

test("normalizeKisIndexCodeList rejects malformed code lists", () => {
  assert.equal(normalizeKisIndexCodeList("0001,abcd"), null);
  assert.equal(normalizeKisIndexCodeList("0001,10010"), null);
  assert.equal(normalizeKisIndexCodeList("0001,1001&x=1"), null);
});
