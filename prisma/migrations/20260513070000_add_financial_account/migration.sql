-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CASH', 'CHECKING', 'SAVINGS', 'STOCK', 'CARD', 'CRYPTO', 'OTHER');

-- CreateTable
CREATE TABLE "FinancialAccount" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bankName" TEXT,
    "type" "AccountType" NOT NULL DEFAULT 'CASH',
    "isStockAccount" BOOLEAN NOT NULL DEFAULT false,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialAccount_ownerId_idx" ON "FinancialAccount"("ownerId");

-- Partial unique index: 사용자당 주식 계좌는 최대 1개
CREATE UNIQUE INDEX "FinancialAccount_ownerId_isStock_unique"
  ON "FinancialAccount"("ownerId")
  WHERE "isStockAccount" = true;

-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN "accountId" TEXT;

-- CreateIndex
CREATE INDEX "LedgerEntry_accountId_idx" ON "LedgerEntry"("accountId");

-- AddForeignKey
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
