-- Add nullable free-text category for Docs posts
ALTER TABLE "Post" ADD COLUMN "docsCategory" TEXT;
