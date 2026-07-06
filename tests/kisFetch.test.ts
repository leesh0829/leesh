import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

import { FetchTimeoutError } from "../app/lib/fetchWithTimeout.ts";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "./fetchWithTimeout" &&
      context.parentURL?.endsWith("/app/lib/kisFetch.ts")
    ) {
      return {
        shortCircuit: true,
        url: new URL("../app/lib/fetchWithTimeout.ts", import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { fetchKis } = await import("../app/lib/kisFetch.ts");

const originalFetch = globalThis.fetch;

test.after(() => {
  hooks.deregister();
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("fetchKis preserves request init when fetch succeeds", async () => {
  const response = new Response(JSON.stringify({ ok: true }), { status: 200 });
  let capturedInput: Parameters<typeof fetch>[0] | undefined;
  let capturedInit: Parameters<typeof fetch>[1] | undefined;

  globalThis.fetch = (async (input, init) => {
    capturedInput = input;
    capturedInit = init;
    return response;
  }) as typeof fetch;

  const init: RequestInit = {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      authorization: "Bearer token",
      appkey: "app-key",
      appsecret: "app-secret",
      tr_id: "FHKST01010100",
    },
    cache: "no-store",
  };

  const result = await fetchKis("https://example.invalid/kis", init);

  assert.equal(result, response);
  assert.equal(capturedInput, "https://example.invalid/kis");
  assert.equal(capturedInit?.cache, "no-store");
  assert.deepEqual(capturedInit?.headers, init.headers);
  assert.ok(capturedInit?.signal instanceof AbortSignal);
});

test("fetchKis uses the shared 8000ms KIS timeout", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let capturedDelay: number | undefined;

  globalThis.setTimeout = ((callback: () => void, delay?: number) => {
    capturedDelay = delay;
    queueMicrotask(callback);
    return 1 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = (() => undefined) as typeof clearTimeout;
  globalThis.fetch = ((_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      });
    })) as typeof fetch;

  try {
    await assert.rejects(
      fetchKis("https://example.invalid/kis"),
      FetchTimeoutError,
    );
    assert.equal(capturedDelay, 8_000);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
