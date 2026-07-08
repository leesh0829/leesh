import assert from "node:assert/strict";
import test from "node:test";

import {
  DIARY_PW_MIN,
  DIARY_PW_MAX,
  validateDiaryPassword,
  passwordsMatch,
  diaryUnlockPayload,
} from "../app/lib/diaryLock.ts";

test("validateDiaryPassword: rejects too short / too long, accepts in range", () => {
  assert.equal(validateDiaryPassword("a".repeat(DIARY_PW_MIN - 1)).ok, false);
  assert.equal(validateDiaryPassword("a".repeat(DIARY_PW_MAX + 1)).ok, false);
  assert.equal(validateDiaryPassword("a".repeat(DIARY_PW_MIN)).ok, true);
  assert.equal(validateDiaryPassword("a".repeat(DIARY_PW_MAX)).ok, true);
});

test("validateDiaryPassword: rejects non-string", () => {
  assert.equal(validateDiaryPassword(undefined).ok, false);
  assert.equal(validateDiaryPassword(1234).ok, false);
});

test("passwordsMatch: only equal non-empty strings match", () => {
  assert.equal(passwordsMatch("secret", "secret"), true);
  assert.equal(passwordsMatch("secret", "Secret"), false);
  assert.equal(passwordsMatch("", ""), false);
});

test("diaryUnlockPayload: deterministic and formatted as user:fingerprint", () => {
  const a = diaryUnlockPayload("user1", "hashA");
  assert.equal(a, diaryUnlockPayload("user1", "hashA"));
  assert.match(a, /^user1:[0-9a-f]{16}$/);
});

test("diaryUnlockPayload: differs by user and by hash", () => {
  assert.notEqual(diaryUnlockPayload("user1", "hashA"), diaryUnlockPayload("user2", "hashA"));
  assert.notEqual(diaryUnlockPayload("user1", "hashA"), diaryUnlockPayload("user1", "hashB"));
});
