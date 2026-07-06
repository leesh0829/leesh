import assert from "node:assert/strict";
import test from "node:test";

import { buildOwnedGeneralBoardsQuery } from "../app/lib/boardQueries.ts";

test("buildOwnedGeneralBoardsQuery scopes general boards to the current owner", () => {
  assert.deepEqual(buildOwnedGeneralBoardsQuery("user-1"), {
    where: { type: "GENERAL", ownerId: "user-1" },
    orderBy: { createdAt: "desc" },
    include: { owner: { select: { name: true, email: true } } },
  });
});
