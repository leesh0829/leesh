import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSignedCookieValue,
  getCookieValue,
  readSignedCookieValue,
} from "../app/lib/signedCookie.ts";

const secret = "test-secret";

test("signed cookies round-trip trusted values", () => {
  const cookie = buildSignedCookieValue("1", { secret });

  assert.equal(readSignedCookieValue(cookie, { secret }), "1");
});

test("signed cookies reject unsigned or tampered values", () => {
  const cookie = buildSignedCookieValue("1", { secret });
  const tampered = cookie.replace(/.$/, (ch) => (ch === "a" ? "b" : "a"));

  assert.equal(readSignedCookieValue("1", { secret }), null);
  assert.equal(readSignedCookieValue(tampered, { secret }), null);
  assert.equal(readSignedCookieValue(cookie, { secret: "wrong-secret" }), null);
});

test("cookie header parsing is exact and decodes values", () => {
  const signed = buildSignedCookieValue("1", { secret });
  const header = `other=1; leesh_unlocked_extra=1; leesh_unlocked=${encodeURIComponent(signed)}`;

  assert.equal(getCookieValue(header, "leesh_unlocked"), signed);
  assert.equal(getCookieValue(header, "missing"), undefined);
});
