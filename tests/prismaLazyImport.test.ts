import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("prisma module can be imported before DATABASE_URL is available", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "delete process.env.DATABASE_URL; await import('./app/lib/prisma.ts'); console.log('ok')",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ok/);
});
