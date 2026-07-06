import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

type BoardUpdateArgs = {
  where: { id: string };
  data: {
    singleSchedule: boolean;
    scheduleStatus: "TODO" | "DOING" | "DONE";
    scheduleStartAt: Date | null;
    scheduleEndAt: Date | null;
    scheduleAllDay: boolean;
  };
};

const state = {
  userId: "user-1" as string | null,
  updateCalls: [] as BoardUpdateArgs[],
  findUnique: async () => ({ id: "board-1", ownerId: "user-1" }),
  update: async (args: BoardUpdateArgs) => {
    state.updateCalls.push(args);
    return { id: args.where.id, ...args.data };
  },
};

(globalThis as typeof globalThis & {
  __boardScheduleRouteContractState?: typeof state;
}).__boardScheduleRouteContractState = state;

const nextServerShimUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(`
export const NextResponse = {
  json(body, init) {
    return Response.json(body, init);
  },
};
`)}`;

const serverAuthShimUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(`
export async function getCurrentUserId() {
  return globalThis.__boardScheduleRouteContractState.userId;
}
`)}`;

const prismaShimUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(`
export const prisma = {
  board: {
    findUnique(args) {
      return globalThis.__boardScheduleRouteContractState.findUnique(args);
    },
    update(args) {
      return globalThis.__boardScheduleRouteContractState.update(args);
    },
  },
};
`)}`;

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return { shortCircuit: true, url: nextServerShimUrl };
    }
    if (specifier === "@/app/lib/serverAuth") {
      return { shortCircuit: true, url: serverAuthShimUrl };
    }
    if (specifier === "@/app/lib/prisma") {
      return { shortCircuit: true, url: prismaShimUrl };
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

const { PATCH } = await import("../app/api/boards/[boardId]/schedule/route.ts");

async function callPatch(body: unknown) {
  return PATCH(
    new Request("https://example.test/api/boards/board-1/schedule", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ boardId: "board-1" }) },
  );
}

test.after(() => {
  hooks.deregister();
  delete (globalThis as typeof globalThis & {
    __boardScheduleRouteContractState?: typeof state;
  }).__boardScheduleRouteContractState;
});

test.beforeEach(() => {
  state.userId = "user-1";
  state.updateCalls = [];
});

test("PATCH rejects string singleSchedule values", async () => {
  const response = await callPatch({ singleSchedule: "false" });

  assert.equal(response.status, 400);
  assert.equal(state.updateCalls.length, 0);
});

test("PATCH rejects unknown body keys", async () => {
  const response = await callPatch({
    singleSchedule: false,
    unexpected: true,
  });

  assert.equal(response.status, 400);
  assert.equal(state.updateCalls.length, 0);
});

test("PATCH accepts a disabled schedule and clears schedule data", async () => {
  const response = await callPatch({
    singleSchedule: false,
    scheduleStatus: "DONE",
    scheduleStartAt: "2026-01-01T00:00:00.000Z",
    scheduleAllDay: true,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(state.updateCalls, [
    {
      where: { id: "board-1" },
      data: {
        singleSchedule: false,
        scheduleStatus: "DONE",
        scheduleStartAt: null,
        scheduleEndAt: null,
        scheduleAllDay: false,
      },
    },
  ]);
});
