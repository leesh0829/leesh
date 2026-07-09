-- 일기장 2차 잠금 해시 (null = 잠금 꺼짐)
ALTER TABLE "User" ADD COLUMN "diaryLockHash" TEXT;
