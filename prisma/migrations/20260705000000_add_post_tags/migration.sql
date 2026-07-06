-- Add free-text tags array for blog posts
ALTER TABLE "Post" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
