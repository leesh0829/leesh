import assert from "node:assert/strict";
import test from "node:test";

import {
  FetchTimeoutError,
  fetchWithTimeout,
} from "../app/lib/fetchWithTimeout.ts";

test("fetchWithTimeout rejects when the request exceeds the timeout", async () => {
  const fetcher: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      });
    });

  await assert.rejects(
    fetchWithTimeout("https://example.invalid", {}, { fetcher, timeoutMs: 1 }),
    FetchTimeoutError,
  );
});

test("fetchWithTimeout returns the fetch response before timeout", async () => {
  const response = new Response(JSON.stringify({ ok: true }), { status: 200 });
  const fetcher: typeof fetch = async () => response;

  const result = await fetchWithTimeout(
    "https://example.invalid",
    {},
    { fetcher, timeoutMs: 1_000 },
  );

  assert.equal(result, response);
});
