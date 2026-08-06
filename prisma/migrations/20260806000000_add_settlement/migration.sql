-- CreateEnum
CREATE TYPE "SettlementKind" AS ENUM ('REIMBURSEMENT', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'SETTLED');

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT,
    "kind" "SettlementKind" NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Settlement_ownerId_status_idx" ON "Settlement"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Settlement_ownerId_kind_idx" ON "Settlement"("ownerId", "kind");

-- CreateIndex
CREATE INDEX "Settlement_accountId_idx" ON "Settlement"("accountId");

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
