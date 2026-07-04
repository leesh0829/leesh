import assert from "node:assert/strict";
import test from "node:test";

import {
  boardSchedulePatchSchema,
  buildBoardScheduleUpdateData,
} from "../app/lib/boardSchedulePayload.ts";

test("boardSchedulePatchSchema rejects string booleans and unknown keys", () => {
  assert.equal(
    boardSchedulePatchSchema.safeParse({
      singleSchedule: "false",
      scheduleStartAt: "2026-01-01T00:00:00.000Z",
    }).success,
    false
  );
  assert.equal(
    boardSchedulePatchSchema.safeParse({
      singleSchedule: false,
      unexpected: true,
    }).success,
    false
  );
});

test("boardSchedulePatchSchema requires start date for enabled single schedule", () => {
  const parsed = boardSchedulePatchSchema.safeParse({
    singleSchedule: true,
    scheduleAllDay: true,
  });

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.equal(parsed.error.issues[0]?.message, "scheduleStartAt required");
  }
});

test("buildBoardScheduleUpdateData clears date fields when schedule is disabled", () => {
  const parsed = boardSchedulePatchSchema.parse({
    singleSchedule: false,
    scheduleStatus: "DONE",
    scheduleStartAt: "2026-01-01T00:00:00.000Z",
    scheduleEndAt: "2026-01-02T00:00:00.000Z",
    scheduleAllDay: true,
  });

  assert.deepEqual(buildBoardScheduleUpdateData(parsed), {
    singleSchedule: false,
    scheduleStatus: "DONE",
    scheduleStartAt: null,
    scheduleEndAt: null,
    scheduleAllDay: false,
  });
});
