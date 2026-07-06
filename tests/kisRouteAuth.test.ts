import assert from "node:assert/strict";
import test from "node:test";

import { resolveKisCredentialAuth } from "../app/lib/kisRouteAuthDecision.ts";

test("resolveKisCredentialAuth requires a signed-in user first", () => {
  assert.deepEqual(resolveKisCredentialAuth(null, false), {
    ok: false,
    status: 401,
    message: "unauthorized",
  });
});

test("resolveKisCredentialAuth returns 412 when KIS credentials are missing", () => {
  assert.deepEqual(resolveKisCredentialAuth("user-1", false), {
    ok: false,
    status: 412,
    message: "KIS 자격증명이 등록되어 있지 않습니다.",
  });
});

test("resolveKisCredentialAuth accepts users with KIS credentials", () => {
  assert.deepEqual(resolveKisCredentialAuth("user-1", true), {
    ok: true,
    userId: "user-1",
  });
});
