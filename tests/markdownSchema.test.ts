import assert from "node:assert/strict";
import test from "node:test";

import { sanitizedMarkdownSchema } from "../app/lib/markdown.ts";

test("sanitizedMarkdownSchema only allows expected link and image protocols", () => {
  assert.deepEqual(sanitizedMarkdownSchema.protocols?.href, [
    "http",
    "https",
    "mailto",
  ]);
  assert.deepEqual(sanitizedMarkdownSchema.protocols?.src, ["http", "https"]);

  assert.equal(
    sanitizedMarkdownSchema.protocols?.href?.includes("javascript"),
    false,
  );
  assert.equal(sanitizedMarkdownSchema.protocols?.href?.includes("irc"), false);
  assert.equal(sanitizedMarkdownSchema.protocols?.href?.includes("xmpp"), false);
});
