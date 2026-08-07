-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "settlementKind" "SettlementKind",
ADD COLUMN     "settlementStatus" "SettlementStatus",
ADD COLUMN     "settledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "LedgerEntry_ownerId_settlementKind_idx" ON "LedgerEntry"("ownerId", "settlementKind");

-- DropTable
DROP TABLE "Settlement";
