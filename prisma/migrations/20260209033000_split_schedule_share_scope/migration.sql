-- CreateEnum
CREATE TYPE "ScheduleShareScope" AS ENUM ('CALENDAR', 'TODO');

-- AlterTable
ALTER TABLE "ScheduleShare"
ADD COLUMN "scope" "ScheduleShareScope" NOT NULL DEFAULT 'CALENDAR';

-- DropIndex
DROP INDEX "ScheduleShare_requesterId_ownerId_key";

-- DropIndex
DROP INDEX "ScheduleShare_requesterId_status_idx";

-- DropIndex
DROP INDEX "ScheduleShare_ownerId_status_idx";

-- Backfill: 기존 공유(공통)를 TODO 범위에도 동일하게 복제
INSERT INTO "ScheduleShare" (
  "id",
  "requesterId",
  "ownerId",
  "scope",
  "status",
  "respondedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  "id" || '_todo',
  "requesterId",
  "ownerId",
  'TODO'::"ScheduleShareScope",
  "status",
  "respondedAt",
  "createdAt",
  "updatedAt"
FROM "ScheduleShare";

-- AlterTable
ALTER TABLE "ScheduleShare"
ALTER COLUMN "scope" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleShare_requesterId_ownerId_scope_key" ON "ScheduleShare"("requesterId", "ownerId", "scope");

-- CreateIndex
CREATE INDEX "ScheduleShare_requesterId_scope_status_idx" ON "ScheduleShare"("requesterId", "scope", "status");

-- CreateIndex
CREATE INDEX "ScheduleShare_ownerId_scope_status_idx" ON "ScheduleShare"("ownerId", "scope", "status");
