import assert from "node:assert/strict";
import test from "node:test";

import {
  createHoldingTransactionWithLedgerSync,
  updateHoldingTransactionWithLedgerSync,
} from "../app/lib/holdingTransactionMutation.ts";

const baseSyncContext = {
  userId: "user-1",
  holdingId: "holding-1",
  holdingName: "AAPL",
  holdingCurrency: "KRW",
  type: "BUY" as const,
  quantity: 2,
  pricePerUnit: 100,
  amount: 200,
  occurredAt: new Date("2026-01-01T00:00:00.000Z"),
  memo: null,
};

test("createHoldingTransactionWithLedgerSync creates, syncs, and links inside one transaction client", async () => {
  const events: string[] = [];
  const data = {
    holdingId: "holding-1",
    type: "BUY" as const,
    quantity: 2,
    pricePerUnit: 100,
    amount: 200,
    occurredAt: new Date("2026-01-01T00:00:00.000Z"),
    memo: null,
  };

  const txClient = {
    holdingTransaction: {
      create: async (args: unknown) => {
        events.push("create");
        assert.deepEqual(args, { data, select: { id: true } });
        return { id: "tx-1" };
      },
      update: async (args: unknown) => {
        events.push("link");
        assert.deepEqual(args, {
          where: { id: "tx-1" },
          data: { ledgerEntryId: "ledger-1" },
        });
        return { id: "tx-1" };
      },
    },
  };

  const db = {
    $transaction: async (fn: (tx: typeof txClient) => Promise<unknown>) => {
      events.push("start");
      const result = await fn(txClient);
      events.push("end");
      return result;
    },
  } as unknown as Parameters<typeof createHoldingTransactionWithLedgerSync>[1];

  const sync: Parameters<typeof createHoldingTransactionWithLedgerSync>[2] =
    async (ctx, link, existingLedgerEntryId, client) => {
      events.push("sync");
      assert.equal(client, txClient);
      assert.equal(ctx.txId, "tx-1");
      assert.equal(link, true);
      assert.equal(existingLedgerEntryId, null);
      return "ledger-1";
    };

  const result = await createHoldingTransactionWithLedgerSync(
    {
      data,
      syncContext: baseSyncContext,
      linkToLedger: true,
    },
    db,
    sync,
  );

  assert.deepEqual(result, { id: "tx-1", ledgerEntryId: "ledger-1" });
  assert.deepEqual(events, ["start", "create", "sync", "link", "end"]);
});

test("createHoldingTransactionWithLedgerSync prepares sync context before opening a transaction", async () => {
  const events: string[] = [];
  const data = {
    holdingId: "holding-1",
    type: "DIVIDEND" as const,
    quantity: null,
    pricePerUnit: null,
    amount: 5,
    occurredAt: new Date("2026-01-01T00:00:00.000Z"),
    memo: null,
  };

  const txClient = {
    holdingTransaction: {
      create: async () => {
        events.push("create");
        return { id: "tx-1" };
      },
      update: async () => {
        events.push("link");
        return { id: "tx-1" };
      },
    },
  };

  const db = {
    $transaction: async (fn: (tx: typeof txClient) => Promise<unknown>) => {
      events.push("start");
      const result = await fn(txClient);
      events.push("end");
      return result;
    },
  } as unknown as Parameters<typeof createHoldingTransactionWithLedgerSync>[1];

  const sync: Parameters<typeof createHoldingTransactionWithLedgerSync>[2] =
    async (ctx) => {
      events.push("sync");
      assert.equal(ctx.txId, "tx-1");
      assert.equal(ctx.krwRate, 1320);
      return "ledger-1";
    };

  const prepare = async (
    ctx: Parameters<typeof createHoldingTransactionWithLedgerSync>[0]["syncContext"],
    linkToLedger: boolean,
  ) => {
    events.push("prepare");
    assert.equal(linkToLedger, true);
    return { ...ctx, krwRate: 1320 };
  };

  await createHoldingTransactionWithLedgerSync(
    {
      data,
      syncContext: {
        ...baseSyncContext,
        holdingCurrency: "USD",
        type: "DIVIDEND",
        quantity: null,
        pricePerUnit: null,
        amount: 5,
      },
      linkToLedger: true,
    },
    db,
    sync,
    prepare,
  );

  assert.deepEqual(events, ["prepare", "start", "create", "sync", "link", "end"]);
});

test("updateHoldingTransactionWithLedgerSync updates, syncs, and relinks inside one transaction client", async () => {
  const events: string[] = [];
  const updateData = {
    type: "SELL" as const,
    quantity: 1,
    pricePerUnit: 130,
    amount: 130,
    occurredAt: new Date("2026-01-02T00:00:00.000Z"),
    memo: "partial",
  };

  const txClient = {
    holdingTransaction: {
      update: async (args: unknown) => {
        if (events.includes("sync")) {
          events.push("link");
          assert.deepEqual(args, {
            where: { id: "tx-1" },
            data: { ledgerEntryId: null },
          });
        } else {
          events.push("update");
          assert.deepEqual(args, {
            where: { id: "tx-1" },
            data: updateData,
          });
        }
        return { id: "tx-1" };
      },
    },
  };

  const db = {
    $transaction: async (fn: (tx: typeof txClient) => Promise<unknown>) => {
      events.push("start");
      const result = await fn(txClient);
      events.push("end");
      return result;
    },
  } as unknown as Parameters<typeof updateHoldingTransactionWithLedgerSync>[1];

  const sync: Parameters<typeof updateHoldingTransactionWithLedgerSync>[2] =
    async (ctx, link, existingLedgerEntryId, client) => {
      events.push("sync");
      assert.equal(client, txClient);
      assert.equal(ctx.txId, "tx-1");
      assert.equal(link, false);
      assert.equal(existingLedgerEntryId, "ledger-old");
      return null;
    };

  const result = await updateHoldingTransactionWithLedgerSync(
    {
      txId: "tx-1",
      data: updateData,
      syncContext: {
        ...baseSyncContext,
        txId: "tx-1",
        type: "SELL",
        quantity: 1,
        pricePerUnit: 130,
        amount: 130,
        occurredAt: updateData.occurredAt,
        memo: "partial",
      },
      linkToLedger: false,
      existingLedgerEntryId: "ledger-old",
    },
    db,
    sync,
  );

  assert.deepEqual(result, { ledgerEntryId: null });
  assert.deepEqual(events, ["start", "update", "sync", "link", "end"]);
});

test("updateHoldingTransactionWithLedgerSync prepares sync context before opening a transaction", async () => {
  const events: string[] = [];
  const updateData = {
    type: "DIVIDEND" as const,
    quantity: null,
    pricePerUnit: null,
    amount: 7,
    occurredAt: new Date("2026-01-03T00:00:00.000Z"),
    memo: null,
  };

  const txClient = {
    holdingTransaction: {
      update: async () => {
        events.push(events.includes("sync") ? "link" : "update");
        return { id: "tx-1" };
      },
    },
  };

  const db = {
    $transaction: async (fn: (tx: typeof txClient) => Promise<unknown>) => {
      events.push("start");
      const result = await fn(txClient);
      events.push("end");
      return result;
    },
  } as unknown as Parameters<typeof updateHoldingTransactionWithLedgerSync>[1];

  const sync: Parameters<typeof updateHoldingTransactionWithLedgerSync>[2] =
    async (ctx) => {
      events.push("sync");
      assert.equal(ctx.krwRate, 1320);
      return "ledger-2";
    };

  const prepare = async (
    ctx: Parameters<typeof updateHoldingTransactionWithLedgerSync>[0]["syncContext"],
    linkToLedger: boolean,
  ) => {
    events.push("prepare");
    assert.equal(linkToLedger, true);
    return { ...ctx, krwRate: 1320 };
  };

  await updateHoldingTransactionWithLedgerSync(
    {
      txId: "tx-1",
      data: updateData,
      syncContext: {
        ...baseSyncContext,
        txId: "tx-1",
        holdingCurrency: "USD",
        type: "DIVIDEND",
        quantity: null,
        pricePerUnit: null,
        amount: 7,
        occurredAt: updateData.occurredAt,
      },
      linkToLedger: true,
      existingLedgerEntryId: null,
    },
    db,
    sync,
    prepare,
  );

  assert.deepEqual(events, ["prepare", "start", "update", "sync", "link", "end"]);
});
