-- CreateEnum
CREATE TYPE "BlogPostCategory" AS ENUM ('INFO', 'REVIEW', 'DAILY');

-- AlterTable
ALTER TABLE "Post"
ADD COLUMN     "blogCategory" "BlogPostCategory" NOT NULL DEFAULT 'INFO',
ADD COLUMN     "reviewRatingHalf" INTEGER;

-- CreateIndex
CREATE INDEX "Post_blogCategory_reviewRatingHalf_idx" ON "Post"("blogCategory", "reviewRatingHalf");
