/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `Post` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "BoardType" AS ENUM ('GENERAL', 'BLOG', 'PORTFOLIO', 'TODO', 'CALENDAR');

-- DropIndex
DROP INDEX "Post_authorId_createdAt_idx";

-- DropIndex
DROP INDEX "Post_boardId_createdAt_idx";

-- AlterTable
ALTER TABLE "Board" ADD COLUMN     "type" "BoardType" NOT NULL DEFAULT 'GENERAL';

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "slug" TEXT,
ALTER COLUMN "contentMd" DROP DEFAULT,
ALTER COLUMN "status" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");
