-- CreateEnum
CREATE TYPE "ScheduleShareStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "ScheduleShare" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "ScheduleShareStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleShare_requesterId_ownerId_key" ON "ScheduleShare"("requesterId", "ownerId");

-- CreateIndex
CREATE INDEX "ScheduleShare_requesterId_status_idx" ON "ScheduleShare"("requesterId", "status");

-- CreateIndex
CREATE INDEX "ScheduleShare_ownerId_status_idx" ON "ScheduleShare"("ownerId", "status");

-- AddForeignKey
ALTER TABLE "ScheduleShare" ADD CONSTRAINT "ScheduleShare_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleShare" ADD CONSTRAINT "ScheduleShare_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
