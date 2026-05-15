-- CreateEnum
CREATE TYPE "HoldingTransactionType" AS ENUM ('BUY', 'SELL', 'DIVIDEND', 'FEE', 'TAX');

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "memo" TEXT,
    "currentPrice" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Holding_ownerId_idx" ON "Holding"("ownerId");

-- CreateTable
CREATE TABLE "HoldingTransaction" (
    "id" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "type" "HoldingTransactionType" NOT NULL,
    "quantity" DOUBLE PRECISION,
    "pricePerUnit" INTEGER,
    "amount" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "memo" TEXT,
    "ledgerEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HoldingTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HoldingTransaction_ledgerEntryId_key" ON "HoldingTransaction"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "HoldingTransaction_holdingId_occurredAt_idx" ON "HoldingTransaction"("holdingId", "occurredAt");

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldingTransaction" ADD CONSTRAINT "HoldingTransaction_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldingTransaction" ADD CONSTRAINT "HoldingTransaction_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
