import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const routeContractState = {
  currentUserId: null as string | null,
  fakeBoards: [] as unknown[],
  findManyArgs: undefined as unknown,
  findManyCallCount: 0,
};

(globalThis as typeof globalThis & {
  __boardsRouteContract?: typeof routeContractState;
}).__boardsRouteContract = routeContractState;

function moduleUrl(source: string) {
  return `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
}

const nextServerUrl = moduleUrl(`
  export const NextResponse = {
    json(body, init = {}) {
      const headers = new Headers(init.headers);
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
      return new Response(JSON.stringify(body), { ...init, headers });
    },
  };
`);

const serverAuthUrl = moduleUrl(`
  export async function getCurrentUserId() {
    return globalThis.__boardsRouteContract.currentUserId;
  }
`);

const prismaUrl = moduleUrl(`
  export const prisma = {
    board: {
      async findMany(args) {
        const state = globalThis.__boardsRouteContract;
        state.findManyArgs = args;
        state.findManyCallCount += 1;
        return state.fakeBoards;
      },
    },
  };
`);

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return { shortCircuit: true, url: nextServerUrl };
    }

    if (specifier === "@/app/lib/serverAuth") {
      return { shortCircuit: true, url: serverAuthUrl };
    }

    if (specifier === "@/app/lib/prisma") {
      return { shortCircuit: true, url: prismaUrl };
    }

    if (specifier.startsWith("@/")) {
      return {
        shortCircuit: true,
        url: new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href,
      };
    }

    return nextResolve(specifier, context);
  },
});

const { GET } = await import("../app/api/boards/route.ts");

test.after(() => {
  hooks.deregister();
  delete (globalThis as typeof globalThis & {
    __boardsRouteContract?: typeof routeContractState;
  }).__boardsRouteContract;
});

test.beforeEach(() => {
  routeContractState.currentUserId = null;
  routeContractState.fakeBoards = [];
  routeContractState.findManyArgs = undefined;
  routeContractState.findManyCallCount = 0;
});

test("GET returns 401 when there is no current user", async () => {
  const response = await GET();

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { message: "unauthorized" });
  assert.equal(routeContractState.findManyCallCount, 0);
});

test("GET finds general boards owned by the current user", async () => {
  const fakeBoards = [
    {
      id: "board-1",
      name: "General board",
      type: "GENERAL",
      ownerId: "user-1",
    },
  ];
  routeContractState.currentUserId = "user-1";
  routeContractState.fakeBoards = fakeBoards;

  const response = await GET();

  assert.equal(response.status, 200);
  assert.equal(routeContractState.findManyCallCount, 1);
  assert.deepEqual(
    (routeContractState.findManyArgs as { where?: unknown }).where,
    { type: "GENERAL", ownerId: "user-1" },
  );
  assert.deepEqual(await response.json(), fakeBoards);
});
