import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import ts from "typescript";

const calls = {
  getMinuteBars: 0,
  getIndices: 0,
  getOverseasQuotes: 0,
};

globalThis.__kisRouteContractCalls = calls;

const projectRootPath = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const projectRootUrl = pathToFileURL(`${projectRootPath}${path.sep}`).href;

const realAliases = new Map([
  ["@/app/lib/kisDomesticCode", "app/lib/kisDomesticCode.ts"],
  ["@/app/lib/kisMinuteHour", "app/lib/kisMinuteHour.ts"],
  ["@/app/lib/kisIndexCodes", "app/lib/kisIndexCodes.ts"],
  ["@/app/lib/kisOverseasSymbol", "app/lib/kisOverseasSymbol.ts"],
]);

const shimSources = new Map([
  [
    "next/server",
    `
      export const NextResponse = {
        json(body, init = {}) {
          const headers = new Headers(init.headers);
          if (!headers.has("content-type")) {
            headers.set("content-type", "application/json");
          }
          return new Response(JSON.stringify(body), { ...init, headers });
        },
      };
    `,
  ],
  [
    "@/app/lib/kisRouteAuth",
    `
      export async function requireKisCredential() {
        return { ok: true, userId: "user-1" };
      }
    `,
  ],
  [
    "@/app/lib/kisStock",
    `
      export async function getMinuteBars() {
        globalThis.__kisRouteContractCalls.getMinuteBars += 1;
        throw new Error("getMinuteBars should not be called for invalid input");
      }
    `,
  ],
  [
    "@/app/lib/kisMarket",
    `
      export async function getIndices() {
        globalThis.__kisRouteContractCalls.getIndices += 1;
        throw new Error("getIndices should not be called for invalid input");
      }
    `,
  ],
  [
    "@/app/lib/kisOverseas",
    `
      export async function getOverseasQuotes() {
        globalThis.__kisRouteContractCalls.getOverseasQuotes += 1;
        throw new Error("getOverseasQuotes should not be called for invalid input");
      }
    `,
  ],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const realAlias = realAliases.get(specifier);
    if (realAlias) {
      return {
        format: "module",
        shortCircuit: true,
        url: routeUrl(realAlias),
      };
    }

    const shimSource = shimSources.get(specifier);
    if (shimSource) {
      return {
        format: "module",
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(shimSource)}`,
      };
    }

    if (specifier.startsWith(projectRootUrl) && specifier.endsWith(".ts")) {
      return {
        format: "module",
        shortCircuit: true,
        url: specifier,
      };
    }

    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith(projectRootUrl) && url.endsWith(".ts")) {
      const filePath = fileURLToPath(url);
      const source = fs.readFileSync(filePath, "utf8");

      return {
        format: "module",
        shortCircuit: true,
        source: ts.transpileModule(source, {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
          fileName: filePath,
        }).outputText,
      };
    }

    return nextLoad(url, context);
  },
});

function resetCalls() {
  calls.getMinuteBars = 0;
  calls.getIndices = 0;
  calls.getOverseasQuotes = 0;
}

function routeUrl(relativePath: string) {
  return pathToFileURL(path.join(projectRootPath, relativePath)).href;
}

test("stock minutes rejects invalid hour before fetching KIS data", async () => {
  resetCalls();
  const { GET } = await import(
    routeUrl("app/api/kis/stock/[code]/minutes/route.ts")
  );

  const response = await GET(
    new Request("http://localhost/api/kis/stock/005930.KS/minutes?hour=240000"),
    { params: Promise.resolve({ code: "005930.KS" }) },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: "invalid hour" });
  assert.equal(calls.getMinuteBars, 0);
});

test("indices rejects invalid codes before fetching KIS data", async () => {
  resetCalls();
  const { GET } = await import(routeUrl("app/api/kis/indices/route.ts"));

  const response = await GET(
    new Request("http://localhost/api/kis/indices?codes=0001,abcd"),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: "invalid codes" });
  assert.equal(calls.getIndices, 0);
});

test("overseas rejects malformed pairs before fetching KIS data", async () => {
  resetCalls();
  const { GET } = await import(routeUrl("app/api/kis/overseas/route.ts"));

  const response = await GET(
    new Request(
      "http://localhost/api/kis/overseas?pairs=NAS:AAPL,NYS:BAD/SYMBOL",
    ),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: "invalid pairs" });
  assert.equal(calls.getOverseasQuotes, 0);
});
