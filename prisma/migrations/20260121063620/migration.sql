/*
  Warnings:

  - A unique constraint covering the columns `[boardId,slug]` on the table `Post` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "BoardType" ADD VALUE 'HELP';

-- DropIndex
DROP INDEX "Post_slug_key";

-- CreateIndex
CREATE UNIQUE INDEX "Post_boardId_slug_key" ON "Post"("boardId", "slug");
