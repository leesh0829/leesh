-- CreateEnum
CREATE TYPE "BudgetScope" AS ENUM ('CATEGORY', 'SUBCATEGORY', 'ACCOUNT');

-- CreateTable
CREATE TABLE "BudgetTarget" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "scope" "BudgetScope" NOT NULL,
    "category" TEXT,
    "subcategory" TEXT,
    "accountId" TEXT,
    "amount" INTEGER NOT NULL,
    "memo" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BudgetTarget_ownerId_enabled_idx" ON "BudgetTarget"("ownerId", "enabled");

-- CreateIndex
CREATE INDEX "BudgetTarget_accountId_idx" ON "BudgetTarget"("accountId");

-- AddForeignKey
ALTER TABLE "BudgetTarget" ADD CONSTRAINT "BudgetTarget_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetTarget" ADD CONSTRAINT "BudgetTarget_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
