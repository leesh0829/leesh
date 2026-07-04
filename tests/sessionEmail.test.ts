import assert from "node:assert/strict";
import test from "node:test";

import { getSessionEmail } from "../app/lib/sessionEmail.ts";

test("getSessionEmail trims valid session email", () => {
  assert.equal(
    getSessionEmail({ user: { email: "  user@example.com  " } }),
    "user@example.com",
  );
});

test("getSessionEmail returns null for missing or blank emails", () => {
  assert.equal(getSessionEmail(null), null);
  assert.equal(getSessionEmail({ user: { email: "" } }), null);
  assert.equal(getSessionEmail({ user: { email: "   " } }), null);
});
