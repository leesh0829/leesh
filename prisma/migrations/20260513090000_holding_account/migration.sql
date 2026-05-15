-- 종목별 계좌 지정 (다증권사 대응)
-- isStockAccount 단일 슬롯 제약 제거, Holding이 직접 계좌를 가리키도록

-- 1. 기존 partial unique index 제거
DROP INDEX IF EXISTS "FinancialAccount_ownerId_isStock_unique";

-- 2. isStockAccount 컬럼 제거
ALTER TABLE "FinancialAccount" DROP COLUMN "isStockAccount";

-- 3. Holding.accountId 추가
ALTER TABLE "Holding" ADD COLUMN "accountId" TEXT;

-- 4. 인덱스
CREATE INDEX "Holding_accountId_idx" ON "Holding"("accountId");

-- 5. FK
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
