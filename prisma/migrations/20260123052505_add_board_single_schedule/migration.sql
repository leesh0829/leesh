-- AlterTable
ALTER TABLE "Board" ADD COLUMN     "scheduleAllDay" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scheduleEndAt" TIMESTAMP(3),
ADD COLUMN     "scheduleStartAt" TIMESTAMP(3),
ADD COLUMN     "scheduleStatus" "PostStatus" NOT NULL DEFAULT 'TODO',
ADD COLUMN     "singleSchedule" BOOLEAN NOT NULL DEFAULT false;
