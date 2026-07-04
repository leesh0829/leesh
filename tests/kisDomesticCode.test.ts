import assert from "node:assert/strict";
import test from "node:test";

import { normalizeKisDomesticCode } from "../app/lib/kisDomesticCode.ts";

test("normalizeKisDomesticCode accepts KIS domestic codes and common market suffixes", () => {
  assert.equal(normalizeKisDomesticCode("005930"), "005930");
  assert.equal(normalizeKisDomesticCode("005930.KS"), "005930");
  assert.equal(normalizeKisDomesticCode(" 005930.kq "), "005930");
});

test("normalizeKisDomesticCode rejects malformed or unsafe values", () => {
  assert.equal(normalizeKisDomesticCode("00593"), null);
  assert.equal(normalizeKisDomesticCode("0059300"), null);
  assert.equal(normalizeKisDomesticCode("005930.KS?period=D"), null);
  assert.equal(normalizeKisDomesticCode("005930&code=000660"), null);
});
