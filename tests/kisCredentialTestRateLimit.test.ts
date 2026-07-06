import assert from "node:assert/strict";
import test from "node:test";

import {
  KIS_CREDENTIAL_TEST_LIMIT,
  KIS_CREDENTIAL_TEST_WINDOW_MS,
  buildKisCredentialTestRateLimitKey,
} from "../app/lib/kisCredentialTestRateLimit.ts";

test("buildKisCredentialTestRateLimitKey separates users and client IPs", () => {
  assert.equal(
    buildKisCredentialTestRateLimitKey("user-1", "203.0.113.10"),
    "kis-credential-test:user-1:203.0.113.10"
  );
});

test("KIS credential test rate limit allows only a small burst", () => {
  assert.equal(KIS_CREDENTIAL_TEST_LIMIT, 5);
  assert.equal(KIS_CREDENTIAL_TEST_WINDOW_MS, 10 * 60 * 1000);
});
