import assert from "node:assert/strict";
import test from "node:test";

import { normalizeKisMinuteHour } from "../app/lib/kisMinuteHour.ts";

test("normalizeKisMinuteHour accepts HHMMSS values", () => {
  assert.equal(normalizeKisMinuteHour(null), undefined);
  assert.equal(normalizeKisMinuteHour(undefined), undefined);
  assert.equal(normalizeKisMinuteHour(""), undefined);
  assert.equal(normalizeKisMinuteHour("093000"), "093000");
  assert.equal(normalizeKisMinuteHour("235959"), "235959");
});

test("normalizeKisMinuteHour rejects malformed or out-of-range values", () => {
  assert.equal(normalizeKisMinuteHour("093000&FID_INPUT_ISCD=000000"), null);
  assert.equal(normalizeKisMinuteHour("93000"), null);
  assert.equal(normalizeKisMinuteHour("240000"), null);
  assert.equal(normalizeKisMinuteHour("126000"), null);
  assert.equal(normalizeKisMinuteHour("126060"), null);
});
